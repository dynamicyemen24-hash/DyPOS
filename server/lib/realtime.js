/**
 * DyPOS realtime SSE hub (v1.35.0) — replaces pull polling for live
 * stock / sync / error awareness.
 *
 * Design summary
 * --------------
 * - Per-tenant EventSource connections: a client's tenant is resolved from the
 *   `X-Tenant-Id` header, falling back to the JWT's `tenantId`. Connections
 *   only ever receive events whose `payload.tenantId` matches theirs exactly
 *   (null matches null = legacy single-tenant mode). Cross-tenant events can
 *   never leak.
 * - Keep-alive heartbeat every 15s (`: ping` comment frames).
 * - Per-connection pending queue: frames are enqueued and drained respecting
 *   socket backpressure (`res.write` returning false → wait for `drain`), so
 *   ordering is preserved and slow clients never drop events in-process.
 * - Last-Event-ID replay: each emitted event increments a global monotonic id
 *   and is appended to an in-memory RING BUFFER of the last N events **per
 *   topic** (N = 200). On (re)connect the server parses `Last-Event-ID` (header)
 *   or `lastEventId` (query) and replays every buffered event for the client's
 *   tenant with `id > lastEventId`, in global order. Persistence of the log is
 *   intentionally NOT required for this campaign (single-process origin); a
 *   durable outbox is the responsibility of lib/webhooks.js.
 * - Dead-connection pruning every 30s (safety net for sockets that miss the
 *   `close` event); clients are also removed eagerly on response `close`.
 * - `registerSseRoutes(app)` mounts the router behind authMiddleware and starts
 *   the timers exactly once. With live-cluster scale-out the ring buffer is
 *   per-process by design (see emit() note below); multi-instance fan-out is a
 *   documented Tier-2 follow-up.
 * - `closeHub()` clears timers + connections so tests (`node --test`) exit
 *   cleanly. Timers are also `.unref()`d so an unhooked process can exit.
 */

import { authMiddleware } from '../middleware/auth.js';
import realtimeRouter, { setSseHandler } from '../routes/realtime.js';
import * as bus from './events.js';
import { trackRealtimeConnection } from '../middleware/metrics.js';

export const RING_SIZE_PER_TOPIC = 200;
const HEARTBEAT_MS = 15_000;
const PRUNE_MS = 30_000;

/** @type {import('express').Router} */
let _mounted = false;

// ---------------------------------------------------------------------------
// Connection registry
// ---------------------------------------------------------------------------
const connections = new Map(); // conn.id -> { id, tenantId, res, closed }
let connSeq = 0;

// ---------------------------------------------------------------------------
// Event log (in-memory ring, per topic) + monotonic ids
// ---------------------------------------------------------------------------
const ringByTopic = new Map(); // topic -> Array<event> (FIFO, size <= RING_SIZE_PER_TOPIC)
let eventSeq = 0;

/**
 * Normalize a payload's tenant routing key. Everything else on the event is
 * carried verbatim to subscribers.
 * @param {any} payload
 * @returns {string|null}
 */
function tenantKeyOf(payload) {
  const raw = payload && typeof payload === 'object' ? payload.tenantId : null;
  return raw == null ? null : String(raw);
}

/**
 * Resolve the tenant scoping a client connection:
 * explicit X-Tenant-Id header first, then the JWT claim (same precedence the
 * REST layer uses in lib/tenant.js). Never throws.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function resolveTenant(req) {
  const hdr = String(req.headers['x-tenant-id'] || '').trim();
  if (hdr) return hdr;
  return req.user?.tenantId != null ? String(req.user.tenantId) : null;
}

function frameFor(event) {
  const data = JSON.stringify({
    id: event.id,
    topic: event.topic,
    tenantId: event.tenantId,
    at: event.at,
    payload: event.payload,
  });
  return `id: ${event.id}\ndata: ${data}\n\n`;
}

/**
 * Enqueue a frame on a connection and attempt a drain. The queue guarantees a
 * client never loses an in-flight event when the socket is momentarily
 * backed up.
 * @param {{ res: import('node:http').ServerResponse, closed: boolean, queue: string[], draining: boolean }} conn
 * @param {string} frame
 */
function pushToConnection(conn, frame) {
  if (conn.closed) return;
  conn.queue.push(frame);
  drainConnection(conn);
}

function drainConnection(conn) {
  if (conn.draining || conn.closed) return;
  conn.draining = true;
  let lastWrite = true;
  try {
    while (conn.queue.length > 0 && !conn.closed) {
      const frame = conn.queue[0];
      try {
        // res.write() enqueues the bytes even when it returns false (backpressure
        // signal), so the frame is always shifted after the call — leaving it queued
        // would re-send it on the next drain and duplicate frames. We only STOP when
        // the socket says "slow down", resuming on the socket's 'drain' event.
        lastWrite = conn.res.write(frame);
      } catch {
        closeConnection(conn);
        return;
      }
      conn.queue.shift();
      if (!lastWrite) break;
    }
  } finally {
    conn.draining = false;
  }
  if (!lastWrite && conn.queue.length > 0 && !conn.closed) {
    conn.res.once('drain', () => drainConnection(conn));
  }
}

function appendToRing(event) {
  const list = ringByTopic.get(event.topic);
  if (list) {
    list.push(event);
    if (list.length > RING_SIZE_PER_TOPIC) list.splice(0, list.length - RING_SIZE_PER_TOPIC);
  } else {
    ringByTopic.set(event.topic, [event]);
  }
}

/**
 * Deliver a single event to every matching open connection.
 * @param {object} event - { id, topic, tenantId, at, payload }
 */
function fanOut(event) {
  for (const conn of connections.values()) {
    if (conn.closed || conn.tenantId !== event.tenantId) continue;
    pushToConnection(conn, frameFor(event));
  }
}

/**
 * Replay buffered events newer than `lastEventId` that belong to the
 * connection's tenant, in global (id) order. Trusts `lastEventId` only when it
 * is a non-negative integer; anything else means "start from the beginning of
 * the buffer" — a client asking for more than the buffer can hold implicitly
 * misses older events (documented: the ring holds the last 200 per topic).
 * @param {object} conn
 * @param {any} lastIdRaw
 */
function replayBuffer(conn, lastIdRaw) {
  const lastId = Number.isInteger(Number(lastIdRaw)) && Number(lastIdRaw) >= 0 ? Number(lastIdRaw) : 0;
  const candidates = [];
  for (const list of ringByTopic.values()) {
    for (const ev of list) {
      if (ev.tenantId === conn.tenantId && ev.id > lastId) candidates.push(ev);
    }
  }
  candidates.sort((a, b) => a.id - b.id);
  for (const ev of candidates) pushToConnection(conn, frameFor(ev));
}

function closeConnection(conn) {
  if (conn.closed) return;
  conn.closed = true;
  connections.delete(conn.id);
  try {
    trackRealtimeConnection(-1);
  } catch {
    /* metrics must never break sockets */
  }
  try {
    conn.res.removeAllListeners('close');
    conn.res.removeAllListeners('error');
    if (!conn.res.writableEnded) conn.res.end();
  } catch {
    /* socket already gone */
  }
}

/**
 * SSE connection handler installed into routes/realtime.js.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function addClient(req, res) {
  // SSE headers must be set before any middleware above can flush a buffer.
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const conn = {
    id: `conn-${++connSeq}`,
    tenantId: resolveTenant(req),
    res,
    queue: [],
    draining: false,
    closed: false,
  };

  // Immediate comment frame so proxies (and client `onopen`) see a live stream.
  try {
    res.write(': ready\n\n');
  } catch {
    return; // socket already dead — nothing to register
  }

  connections.set(conn.id, conn);
  try {
    trackRealtimeConnection(1);
  } catch {
    /* metrics must never break sockets */
  }
  res.on('close', () => closeConnection(conn));
  res.on('error', () => closeConnection(conn));

  // Last-Event-ID replay: header (native EventSource reconnects) or explicit
  // query param (our own reconnect backoff uses the query form).
  const lastId = req.headers['last-event-id'] ?? req.query.lastEventId;
  if (lastId != null && lastId !== '') {
    try {
      replayBuffer(conn, String(lastId));
    } catch {
      /* replay must never kill the stream */
    }
  }
}

// ---------------------------------------------------------------------------
// Heartbeat + pruning
// ---------------------------------------------------------------------------
let heartbeatTimer = null;
let pruneTimer = null;

function heartbeatAll() {
  for (const conn of connections.values()) {
    if (conn.closed) continue;
    try {
      conn.res.write(': ping\n\n');
    } catch {
      closeConnection(conn);
    }
  }
}

function pruneDead() {
  for (const conn of connections.values()) {
    const socket = conn.res.socket;
    if (conn.res.writableEnded || conn.res.destroyed || !socket || socket.destroyed) {
      closeConnection(conn);
    }
  }
}

function startTimers() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(heartbeatAll, HEARTBEAT_MS);
  pruneTimer = setInterval(pruneDead, PRUNE_MS);
  if (heartbeatTimer.unref) heartbeatTimer.unref();
  if (pruneTimer.unref) pruneTimer.unref();
}

function stopTimers() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (pruneTimer) clearInterval(pruneTimer);
  heartbeatTimer = null;
  pruneTimer = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Mount the realtime routes on an Express app.
 * Mounting applies authMiddleware (401 without token) and starts heartbeats +
 * the 30s prune job exactly once.
 * @param {import('express').Express} app
 * @returns {import('express').Express} the same app (chainable)
 */
export function registerSseRoutes(app) {
  if (_mounted) return app;
  setSseHandler(addClient);
  app.use('/api/realtime', authMiddleware, realtimeRouter);
  startTimers();
  _mounted = true;
  return app;
}

/**
 * Publish a realtime event.
 *
 * @param {string} topic - e.g. 'invoice.created' | 'invoice.paid' | 'stock.changed'.
 * @param {object} payload - MUST carry `tenantId` (string|null) as its routing
 *   key; every other field is forwarded verbatim. The full event record is
 *   also emitted on the in-process bus (lib/events.js) as
 *   `{ id, topic, tenantId, at, payload }`.
 * @returns {number} the global event id assigned (0 if the payload is not an
 *   object — callers with that shape are using the wrong API).
 */
export function emit(topic, payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const event = {
    id: ++eventSeq,
    topic: String(topic),
    tenantId: tenantKeyOf(payload),
    at: new Date().toISOString(),
    payload,
  };
  appendToRing(event);
  fanOut(event);
  try {
    bus.emit(event.topic, event);
  } catch {
    /* bus delivery is best-effort */
  }
  return event.id;
}

/**
 * Reset ring buffer, connections and the id sequence. Used by tests between
 * cases; also safe as a hot-reload hook.
 */
export function resetHub() {
  for (const conn of connections.values()) closeConnection(conn);
  connections.clear();
  ringByTopic.clear();
  eventSeq = 0;
  connSeq = 0;
}

/**
 * Stop timers and close every open stream. Tests MUST call this in `after()`
 * so `node --test` exits without forced shutdown.
 */
export function closeHub() {
  stopTimers();
  resetHub();
  _mounted = false;
}

export default { registerSseRoutes, emit, closeHub, resetHub };