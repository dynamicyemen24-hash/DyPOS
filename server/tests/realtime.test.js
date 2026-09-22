/**
 * Realtime SSE hub tests (v1.35.0)
 *
 * Spins the SSE app (registerSseRoutes) on an ephemeral port and drives real
 * HTTP streams with fetch's body reader, asserting:
 *  - 401 without a token
 *  - 200 + SSE headers + live stream with a valid token
 *  - per-tenant delivery (tenant A events reach tenant A only)
 *  - Last-Event-ID replay of buffered events after reconnect (within the ring)
 *  - ring-buffer cap (last 200 per topic)
 *
 * Every connection is closed and the hub timers cleared in after() so the test
 * process exits cleanly under `node --test`.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { registerSseRoutes, emit, resetHub, closeHub } from '../lib/realtime.js';
import { migrate } from '../db/schema.js';
import { generateToken } from '../middleware/auth.js';

const TEN_A = 'tenant-A';
const TEN_B = 'tenant-B';

let server;
let port;

before(async () => {
  migrate();
  const app = express();
  app.use(express.json());
  registerSseRoutes(app);
  server = http.createServer(app);
  server.keepAliveTimeout = 30_000;
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
});

after(async () => {
  closeHub();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  resetHub();
});

const tokenA = generateToken({ id: 'u-a', username: 'alice', role: 'CASHIER', tenant_id: TEN_A });
const tokenB = generateToken({ id: 'u-b', username: 'bob', role: 'CASHIER', tenant_id: TEN_B });

/**
 * Open an SSE stream via fetch, keeping the body reader + controller.
 * @param {{ token?: string, lastEventId?: number, tenant?: string }} opts
 */
async function openSse({ token = null, lastEventId = null, tenant = null } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  if (lastEventId != null) headers['Last-Event-ID'] = String(lastEventId);
  const controller = new AbortController();
  const res = await fetch(`http://localhost:${port}/api/realtime/events`, { headers, signal: controller.signal });
  return { res, controller, reader: res.body.getReader() };
}

async function closeSse(stream) {
  try {
    stream.controller.abort();
  } catch {
    /* already aborted */
  }
  try {
    await stream.reader.cancel();
  } catch {
    /* stream already closed */
  }
}

function controllerAbort(controller) {
  try {
    controller.abort();
  } catch {
    /* ignore */
  }
}

/**
 * Read the stream until `find` appears, or `dataFrames` data-lines for `topic`
 * have been parsed, or the timeout elapses.
 * @returns {Promise<string>} accumulated SSE text
 */
async function drain(stream, { find = null, dataFrames = 0, topic = null, timeoutMs = 4000 } = {}) {
  const decoder = new TextDecoder();
  let acc = '';
  const deadline = Date.now() + timeoutMs;
  const abortTimer = setTimeout(() => controllerAbort(stream.controller), timeoutMs);
  try {
    while (Date.now() < deadline) {
      let chunk;
      try {
        ({ value: chunk } = await stream.reader.read());
      } catch {
        break; // aborted from the timeout side
      }
      if (!chunk) break;
      acc += decoder.decode(chunk, { stream: true });
      if (find && acc.includes(find)) return acc;
      if (dataFrames > 0 && countDataFrames(acc, topic) >= dataFrames) return acc;
    }
  } finally {
    clearTimeout(abortTimer);
  }
  return acc;
}

function countDataFrames(text, topic = null) {
  let n = 0;
  for (const block of text.split(/\n\n/)) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (!topic || parsed.topic === topic) n++;
      } catch {
        /* skip non-JSON keepalive payloads */
      }
    }
  }
  return n;
}

function parseDataLines(text, topic = null) {
  const out = [];
  for (const block of text.split(/\n\n/)) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (!topic || parsed.topic === topic) out.push(parsed);
      } catch {
        /* skip keepalive */
      }
    }
  }
  return out;
}

describe('Realtime SSE', () => {
  it('GET /api/realtime/events returns 401 without a token', async () => {
    const res = await fetch(`http://localhost:${port}/api/realtime/events`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.ok(body.error);
  });

  it('connects with a valid token and streams SSE headers + ready frame', async () => {
    const stream = await openSse({ token: tokenA });
    try {
      assert.strictEqual(stream.res.status, 200);
      assert.match(stream.res.headers.get('content-type'), /text\/event-stream/);
      assert.match(stream.res.headers.get('cache-control'), /no-cache/);
      assert.strictEqual(stream.res.headers.get('x-accel-buffering'), 'no');
      const acc = await drain(stream, { find: ': ready', timeoutMs: 2000 });
      assert.ok(acc.includes(': ready'));
    } finally {
      await closeSse(stream);
    }
  });

  it('delivers an event to the owning tenant and not to another tenant', async () => {
    const a = await openSse({ token: tokenA });
    const b = await openSse({ token: tokenB });
    try {
      await drain(a, { find: ': ready', timeoutMs: 2000 });
      await drain(b, { find: ': ready', timeoutMs: 2000 });

      const emittedId = emit('stock.changed', { tenantId: TEN_A, productId: 'P1', adjustment: 5 });

      const accA = await drain(a, { find: `"id":${emittedId}`, timeoutMs: 3000 });
      const eventsA = parseDataLines(accA, 'stock.changed');
      assert.ok(eventsA.some((e) => e.id === emittedId && e.payload?.productId === 'P1'));

      const accB = await drain(b, { timeoutMs: 500 });
      assert.ok(!accB.includes('"productId":"P1"'), 'tenant B must never receive tenant A events');
    } finally {
      await closeSse(a);
      await closeSse(b);
    }
  });

  it('replays buffered events after a reconnect with Last-Event-ID', async () => {
    const first = await openSse({ token: tokenA });
    await drain(first, { find: ': ready', timeoutMs: 2000 });
    await closeSse(first);

    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push(emit('invoice.created', { tenantId: TEN_A, id: `INV-${i}`, total: 10 + i }));
    }

    const second = await openSse({ token: tokenA, lastEventId: 0 });
    try {
      const acc = await drain(second, { dataFrames: 3, topic: 'invoice.created', timeoutMs: 4000 });
      const received = parseDataLines(acc, 'invoice.created')
        .filter((e) => e.tenantId === TEN_A)
        .map((e) => e.id);
      assert.deepStrictEqual(received, ids, 'all buffered events must be replayed in id order');
    } finally {
      await closeSse(second);
    }
  });

  it('caps replay to the per-topic ring buffer (last 200 delivered)', async () => {
    const first = await openSse({ token: tokenA });
    await drain(first, { find: ': ready', timeoutMs: 2000 });
    await closeSse(first);

    const firstId = emit('stock.changed', { tenantId: TEN_A, productId: 'P-0', adjustment: 0 });
    for (let i = 1; i < 205; i++) {
      emit('stock.changed', { tenantId: TEN_A, productId: `P-${i}`, adjustment: i });
    }

    const reconnected = await openSse({ token: tokenA, lastEventId: 0 });
    try {
      const acc = await drain(reconnected, { dataFrames: 200, topic: 'stock.changed', timeoutMs: 4000 });
      const received = parseDataLines(acc, 'stock.changed');
      assert.strictEqual(received.length, 200);
      // 205 events emitted → the oldest kept event id is firstId + 5
      assert.strictEqual(received[0].id, firstId + 5);
      assert.strictEqual(received[received.length - 1].id, firstId + 204);
    } finally {
      await closeSse(reconnected);
    }
  });
});