import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { requireRole } from '../middleware/auth.js';
import { eventMatches, dispatchBatch } from '../lib/webhooks.js';

const router = Router();
router.use(requireRole('ADMIN'));

function validUrl(u) {
  try {
    const p = new URL(String(u));
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch {
    return false;
  }
}

// GET /api/webhooks — list subscriptions
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id,url,events,is_active,created_at FROM webhook_subscriptions ORDER BY created_at DESC').all();
  return res.json({ subscriptions: rows.map((r) => ({ ...r, events: JSON.parse(r.events || '[]') })) });
});

// POST /api/webhooks — subscribe {url, events[], secret?}
router.post('/', (req, res) => {
  const { url, events = ['*'], secret = '' } = req.body || {};
  if (!validUrl(url)) return res.status(400).json({ error: 'url يجب أن يكون http(s) صالحًا' });
  if (!Array.isArray(events) || !events.length || events.length > 20) {
    return res.status(400).json({ error: 'events مصفوفة 1..20 (مثال: ["invoice.*"])' });
  }
  for (const e of events) {
    if (!/^[a-z_*][a-z0-9_.*]*$/i.test(String(e)) || String(e).length > 64) {
      return res.status(400).json({ error: `حدث غير صالح: ${e}` });
    }
  }
  const id = uuid();
  const sec = String(secret).slice(0, 128) || crypto.randomBytes(24).toString('hex');
  db.prepare(`INSERT INTO webhook_subscriptions (id,url,events,secret) VALUES (?,?,?,?)`)
    .run(id, String(url).slice(0, 500), JSON.stringify(events.map(String)), sec);
  req.audit?.('webhook.subscribe', { id, url: String(url).slice(0, 120) });
  // Never echo the secret back in full
  return res.status(201).json({ id, url, events, secret_preview: sec.slice(0, 6) + '…' });
});

// DELETE /api/webhooks/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM webhook_subscriptions WHERE id=?').run(String(req.params.id).slice(0, 64));
  req.audit?.('webhook.unsubscribe', { id: req.params.id });
  return res.json({ deleted: true });
});

// PATCH /api/webhooks/:id — toggle active
router.patch('/:id', (req, res) => {
  const active = req.body?.isActive !== false ? 1 : 0;
  db.prepare('UPDATE webhook_subscriptions SET is_active=? WHERE id=?').run(active, String(req.params.id).slice(0, 64));
  return res.json({ id: req.params.id, isActive: active === 1 });
});

// GET /api/webhooks/outbox?status=&limit= — delivery queue visibility
router.get('/outbox', (req, res) => {
  const status = req.query.status ? String(req.query.status).toUpperCase().slice(0, 20) : null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const rows = status
    ? db.prepare('SELECT id,event,entity_type,entity_id,attempts,status,last_error,created_at FROM webhook_outbox WHERE status=? ORDER BY id DESC LIMIT ?').all(status, limit)
    : db.prepare('SELECT id,event,entity_type,entity_id,attempts,status,last_error,created_at FROM webhook_outbox ORDER BY id DESC LIMIT ?').all(limit);
  const agg = db.prepare(`SELECT status,COUNT(*) c FROM webhook_outbox GROUP BY status`).all();
  return res.json({ outbox: rows, summary: Object.fromEntries(agg.map((a) => [a.status, a.c])) });
});

// POST /api/webhooks/outbox/:id/retry — requeue a DEAD/failed job now
router.post('/outbox/:id/retry', (req, res) => {
  const upd = db.prepare(`UPDATE webhook_outbox SET status='PENDING',next_attempt_at=datetime('now') WHERE id=? AND status IN ('DEAD','PENDING')`).run(Number(req.params.id) || 0);
  if (!upd.changes) return res.status(404).json({ error: 'المهمة غير موجودة أو مُسلّمة' });
  return res.json({ requeued: true });
});

// POST /api/webhooks/dispatch — trigger one delivery batch now (ops)
router.post('/dispatch', async (req, res) => {
  const r = await dispatchBatch();
  return res.json({ ...r });
});

// GET /api/webhooks/events — catalog of emittable events
router.get('/events', (req, res) => {
  return res.json({
    events: ['invoice.created', 'invoice.paid', 'stock.adjusted', 'product.created', 'product.updated', 'customer.created', 'import.completed', 'shift.closed'],
    patterns: ['exact (invoice.paid)', 'prefix (invoice.*)', 'all (*)'],
    signing: 'HMAC-SHA256 over raw body → X-DyPOS-Signature: sha256=<hex>; event → X-DyPOS-Event; id → X-DyPOS-Delivery',
    matcher_preview: eventMatches(JSON.stringify(['invoice.*']), 'invoice.paid'),
  });
});

export default router;
