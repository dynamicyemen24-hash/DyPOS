/**
 * DyPOS in-process event bus (v1.35.0) — tiny synchronous pub/sub keyed by topic.
 *
 * Scope: internal wiring ONLY. The SSE hub (lib/realtime.js) publishes every
 * realtime event through this bus so in-process consumers (cache invalidation,
 * resilience hooks, the ring-buffer writer) can subscribe without coupling to
 * HTTP plumbing. This module intentionally holds NO retained history — replay
 * belongs to the per-topic ring buffer owned by lib/realtime.js.
 *
 * Import-safe / hot-reload safe: module-level state is a plain Map, there are
 * no top-level side effects, and a reloaded module simply starts with an empty
 * listener table (old handles unsubscribe themselves on GC).
 */

const listeners = new Map();

/**
 * Subscribe a handler to a topic.
 * @param {string} topic - Topic name, e.g. 'invoice.created'.
 * @param {(payload: any, topic: string) => void} handler
 * @returns {() => boolean} Unsubscribe function.
 */
export function subscribe(topic, handler) {
  if (typeof handler !== 'function') {
    throw new TypeError('events.subscribe: handler must be a function');
  }
  let set = listeners.get(topic);
  if (!set) {
    set = new Set();
    listeners.set(topic, set);
  }
  set.add(handler);
  return () => unsubscribe(topic, handler);
}

/**
 * Remove a previously-subscribed handler.
 * @param {string} topic
 * @param {(payload: any, topic: string) => void} handler
 * @returns {boolean} True when the handler was actually removed.
 */
export function unsubscribe(topic, handler) {
  const set = listeners.get(topic);
  if (!set) return false;
  const removed = set.delete(handler);
  if (set.size === 0) listeners.delete(topic);
  return removed;
}

/**
 * Publish a payload to every handler of a topic. Handler exceptions are
 * swallowed so one bad subscriber can never break a business write path.
 * @param {string} topic
 * @param {any} payload
 * @returns {number} Number of handlers that received the payload.
 */
export function emit(topic, payload) {
  const set = listeners.get(topic);
  if (!set || set.size === 0) return 0;
  let delivered = 0;
  for (const handler of Array.from(set)) {
    try {
      handler(payload, topic);
      delivered++;
    } catch {
      /* a subscriber error must never propagate into a sale/invoice path */
    }
  }
  return delivered;
}

/**
 * Number of live handlers for a topic (diagnostics).
 * @param {string} topic
 * @returns {number}
 */
export function listenerCount(topic) {
  return listeners.get(topic)?.size ?? 0;
}

export default { subscribe, unsubscribe, emit, listenerCount };