import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { eventMatches, dispatchBatch } from '../lib/webhooks.js';
import { ah } from '../lib/async.js';

const router = Router();
const isAdmin = (req) => req.user?.role === 'ADMIN';
const canRead = (req) => ['ADMIN', 'MANAGER', 'AUDITOR'].includes(req.user?.role);

function validUrl(u) {
  try {
    const p = new URL(String(u));
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch {
    return false;
  }
}

// GET /api/webhooks — list subscriptions (ADMIN/MANAGER/AUDITOR)
router.get('/', (req, res) => {
  if (!canRead(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const rows = db.prepare('SELECT id,url,events,is_active,created_at FROM webhook_subscriptions ORDER BY created_at DESC').all();
  return res.json({ subscriptions: rows.map((r) => ({ ...r, events: JSON.parse(r.events || '[]') })) });
});

// POST /api/webhooks — subscribe {url, events[], secret?} (ADMIN)
router.post('/', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
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

// DELETE /api/webhooks/:id (ADMIN)
router.delete('/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const upd = db.prepare('DELETE FROM webhook_subscriptions WHERE id=?').run(String(req.params.id).slice(0, 64));
  if (!upd.changes) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  req.audit?.('webhook.unsubscribe', { id: req.params.id });
  return res.json({ deleted: true });
});

// PUT /api/webhooks/:id — update url/events (ADMIN)
router.put('/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT id FROM webhook_subscriptions WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  const updates = [];
  const params = [];
  if (req.body?.url !== undefined) {
    if (!validUrl(req.body.url)) return res.status(400).json({ error: 'url يجب أن يكون http(s) صالحًا' });
    updates.push('url=?'); params.push(String(req.body.url).slice(0, 500));
  }
  if (req.body?.events !== undefined) {
    const ev = req.body.events;
    if (!Array.isArray(ev) || !ev.length || ev.length > 20) return res.status(400).json({ error: 'events مصفوفة 1..20' });
    for (const e of ev) {
      if (!/^[a-z_*][a-z0-9_.*]*$/i.test(String(e)) || String(e).length > 64) return res.status(400).json({ error: `حدث غير صالح: ${e}` });
    }
    updates.push('events=?'); params.push(JSON.stringify(ev.map(String)));
  }
  if (!updates.length) return res.status(400).json({ error: 'لا توجد حقول (url|events)' });
  params.push(id);
  db.prepare(`UPDATE webhook_subscriptions SET ${updates.join(',')} WHERE id=?`).run(...params);
  req.audit?.('webhook.update', { id });
  return res.json({ id, updated: true });
});

// POST /api/webhooks/:id/rotate-secret — rotate HMAC secret (ADMIN, old deliveries stay verifiable only for new)
router.post('/:id/rotate-secret', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT id FROM webhook_subscriptions WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  const sec = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE webhook_subscriptions SET secret=? WHERE id=?').run(sec, id);
  req.audit?.('webhook.rotate_secret', { id });
  return res.json({ id, secret_preview: sec.slice(0, 6) + '…', note: 'احفظ السر الجديد — لا يُعرض كاملًا مجددًا' });
});

// PATCH /api/webhooks/:id — toggle active (ADMIN)
router.patch('/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const active = req.body?.isActive !== false ? 1 : 0;
  const upd = db.prepare('UPDATE webhook_subscriptions SET is_active=? WHERE id=?').run(active, String(req.params.id).slice(0, 64));
  if (!upd.changes) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  return res.json({ id: req.params.id, isActive: active === 1 });
});

// GET /api/webhooks/outbox?status=&limit= — delivery queue visibility (ADMIN/MANAGER/AUDITOR)
router.get('/outbox', (req, res) => {
  if (!canRead(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const status = req.query.status ? String(req.query.status).toUpperCase().slice(0, 20) : null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const rows = status
    ? db.prepare('SELECT id,event,entity_type,entity_id,attempts,status,last_error,created_at FROM webhook_outbox WHERE status=? ORDER BY id DESC LIMIT ?').all(status, limit)
    : db.prepare('SELECT id,event,entity_type,entity_id,attempts,status,last_error,created_at FROM webhook_outbox ORDER BY id DESC LIMIT ?').all(limit);
  const agg = db.prepare(`SELECT status,COUNT(*) c FROM webhook_outbox GROUP BY status`).all();
  return res.json({ outbox: rows, summary: Object.fromEntries(agg.map((a) => [a.status, a.c])) });
});

// POST /api/webhooks/outbox/:id/retry — requeue a DEAD/FAILED/PENDING job now (ADMIN)
router.post('/outbox/:id/retry', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const upd = db.prepare(`UPDATE webhook_outbox SET status='PENDING',next_attempt_at=datetime('now') WHERE id=? AND status IN ('DEAD','FAILED','PENDING')`).run(Number(req.params.id) || 0);
  if (!upd.changes) return res.status(404).json({ error: 'المهمة غير موجودة أو مُسلّمة' });
  return res.json({ requeued: true });
});

// POST /api/webhooks/dispatch — trigger one delivery batch now (ADMIN ops)
router.post('/dispatch', ah(async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const r = await dispatchBatch();
  return res.json({ ...r });
}));

// GET /api/webhooks/events — catalog of emittable events (read roles)
router.get('/events', (req, res) => {
  if (!canRead(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  return res.json({
    events: ['invoice.created', 'invoice.paid', 'invoice.returned', 'stock.adjusted', 'stock.transferred', 'product.created', 'product.updated', 'customer.created', 'customer.wallet_adjusted', 'import.completed', 'shift.closed'],
    patterns: ['exact (invoice.paid)', 'prefix (invoice.*)', 'all (*)'],
    signing: 'HMAC-SHA256 over raw body → X-DyPOS-Signature: sha256=<hex>; event → X-DyPOS-Event; id → X-DyPOS-Delivery',
    matcher_preview: eventMatches(JSON.stringify(['invoice.*']), 'invoice.paid'),
  });
});

export default router;
