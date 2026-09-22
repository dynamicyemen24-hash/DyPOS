/**
 * DyPOS Webhooks — integration plane for ANY external system (ERP, WMS, BI...).
 * Outbox pattern: business code enqueues (in-transaction, never blocks sales);
 * a background dispatcher delivers with HMAC-signed POSTs + capped retries.
 *
 * Events: invoice.created, invoice.paid, stock.adjusted, product.created,
 *         product.updated, customer.created, import.completed, shift.closed
 */
import crypto from 'crypto';
import db from '../db/schema.js';

const MAX_ATTEMPTS = 8;
const BATCH = 50;

export function eventMatches(subEventsJson, event) {
  let list;
  try {
    list = JSON.parse(subEventsJson || '[]');
    if (!Array.isArray(list)) list = [];
  } catch {
    return false;
  }
  return list.some((p) => {
    const pat = String(p).trim();
    if (pat === '*' || pat === event) return true;
    if (pat.endsWith('.*')) return event.startsWith(pat.slice(0, -1));
    return false;
  });
}

/** Best-effort enqueue — must NEVER throw into business transactions. */
export function emit(event, entityType = '', entityId = '', data = {}) {
  try {
    const subs = db.prepare("SELECT events FROM webhook_subscriptions WHERE is_active=1").all();
    if (!subs.some((s) => eventMatches(s.events, event))) return 0; // no listeners → keep outbox clean
    const payload = JSON.stringify({ event, entity_type: entityType, entity_id: entityId, at: new Date().toISOString(), data });
    db.prepare(`INSERT INTO webhook_outbox (event,entity_type,entity_id,payload) VALUES (?,?,?,?)`)
      .run(event, entityType, String(entityId), payload);
    return 1;
  } catch {
    return 0;
  }
}

function sign(secret, rawBody) {
  if (!secret) return null;
  return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function backoff(attempts) {
  const secs = Math.min(30 * 2 ** Math.max(0, attempts - 1), 3600);
  return `datetime('now','+${secs} seconds')`;
}

/** Deliver one batch. DB writes stay sequential (SQLite single-writer);
 *  subscriber POSTs run in parallel per job so one slow ERP never blocks others. */
export async function dispatchBatch() {
  const due = db.prepare(`SELECT * FROM webhook_outbox WHERE status='PENDING' AND next_attempt_at<=datetime('now') ORDER BY id ASC LIMIT ?`).all(BATCH);
  if (!due.length) return { delivered: 0, failed: 0 };
  let delivered = 0, failed = 0;
  for (const job of due) {
    const subs = db.prepare('SELECT * FROM webhook_subscriptions WHERE is_active=1').all()
      .filter((s) => eventMatches(s.events, job.event));
    if (!subs.length) {
      db.prepare(`UPDATE webhook_outbox SET status='SKIPPED',last_error='no active subscribers' WHERE id=?`).run(job.id);
      continue;
    }
    // Parallel fan-out (bounded by subscriber count, typically <10). Each fetch
    // has its own 8s timeout — a hung subscriber no longer head-of-line blocks.
    const attempts = await Promise.allSettled(subs.map(async (sub) => {
      const sig = sign(sub.secret, job.payload);
      const r = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DyPOS-Event': job.event,
          'X-DyPOS-Delivery': String(job.id),
          ...(sig ? { 'X-DyPOS-Signature': sig } : {}),
        },
        body: job.payload,
        signal: AbortSignal.timeout(8000),
      });
      if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status} from ${sub.url.slice(0, 80)}`);
      return true;
    }));
    const okAny = attempts.some((a) => a.status === 'fulfilled');
    const lastErr = okAny ? '' : String(attempts.find((a) => a.status === 'rejected')?.reason?.message || 'delivery failed').slice(0, 300);
    const nextCount = Number(job.attempts) + 1;
    if (okAny) {
      db.prepare(`UPDATE webhook_outbox SET status='DELIVERED',attempts=? WHERE id=?`).run(nextCount, job.id);
      delivered++;
    } else if (nextCount >= MAX_ATTEMPTS) {
      db.prepare(`UPDATE webhook_outbox SET status='DEAD',attempts=?,last_error=? WHERE id=?`).run(nextCount, lastErr.slice(0, 300), job.id);
      failed++;
    } else {
      db.prepare(`UPDATE webhook_outbox SET attempts=?,next_attempt_at=${backoff(nextCount)},last_error=? WHERE id=?`).run(nextCount, lastErr.slice(0, 300), job.id);
      failed++;
    }
  }

  // Periodic janitor: clean completed/dead outbox entries older than 7 days
  try {
    db.prepare(`DELETE FROM webhook_outbox WHERE status IN ('DELIVERED','SKIPPED','DEAD') AND created_at < datetime('now', '-7 days')`).run();
  } catch {
    // Non-blocking janitor
  }

  return { delivered, failed };
}

let timer = null;
// Leader lease (C4): only the process holding `dispatcher_lock` delivers the
// outbox. Each tick tries to acquire/renew a 20s lease (tick is 10s); holders
// keep it via the owner match, expired leases are stolen. A process that does
// not hold the lease skips silently — no duplicate deliveries when several
// processes open the same SQLite file (multi-instance origin, forked workers,
// stale primary overlapping a fresh deploy).
const LEASE_SECONDS = 20;
const DISPATCHER_OWNER = `dypos-dispatcher-${process.pid}`;
function tryAcquireLeadership() {
  try {
    const r = db.prepare(
      `UPDATE dispatcher_lock SET owner=?, lease_until=datetime('now', ?), updated_at=datetime('now')
       WHERE id=1 AND (lease_until IS NULL OR lease_until <= datetime('now') OR owner=?)`
    ).run(DISPATCHER_OWNER, `+${LEASE_SECONDS} seconds`, DISPATCHER_OWNER);
    return r.changes === 1;
  } catch {
    return false; // dispatcher_lock missing (pre-v12 DB, migrate pending) → never dispatch blind
  }
}
/** Disabled in tests (NODE_ENV=test) and when DYPOS_WEBHOOKS=0. */
export function startDispatcher() {
  if (process.env.NODE_ENV === 'test' || process.env.DYPOS_WEBHOOKS === '0' || timer) return timer;
  timer = setInterval(() => {
    if (!tryAcquireLeadership()) return;
    dispatchBatch().catch(() => { /* dispatcher never throws */ });
  }, 10000);
  if (timer.unref) timer.unref();
  return timer;
}

export default { emit, eventMatches, dispatchBatch, startDispatcher };
