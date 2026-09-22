/**
 * DyPOS Subscription Engine — recurring plans + customer subscriptions + billing runs.
 *
 * Reads: any authenticated role. Writes: ADMIN/MANAGER.
 * Billing run advances every due active subscription and records a real
 * `subscription_billings` row: paid from the customer wallet (auto_renew +
 * sufficient balance → canonical wallet ledger debit) or recorded as 'due'
 * for manual collection. Nothing is silently skipped or faked.
 */
import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { assertTenantScope, assertRecordTenant, resolveTenantFilter } from '../lib/tenant.js';
import { recordTrail } from '../lib/trail.js';
import { emit } from '../lib/webhooks.js';

const router = Router();
const isManager = (req) => ['ADMIN', 'MANAGER'].includes(req.user?.role);

function page(q, def = 50) {
  return {
    limit: Math.min(Math.max(parseInt(q.limit, 10) || def, 1), 200),
    offset: Math.max(parseInt(q.offset, 10) || 0, 0),
  };
}

const today = () => new Date().toISOString().slice(0, 10);

// Upper bound on how many missed periods a single billing run may consolidate
// into one charge (code before a stuck schedule could turn into an absurd
// amount). 1,200 daily periods ≈ 3.3 years — a hard, auditable ceiling.
const MAX_CONSOLIDATED_PERIODS = 1200;

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

/**
 * Validates a PROVIDED tenant (404 when unknown) and returns its id.
 * Unscoped callers (legacy single-tenant, scheduler, ADMIN tooling) get ''.
 */
function tenantScopeOf(req) {
  return resolveTenantFilter(req).tenantId || '';
}

/**
 * Read scope: a scoped caller sees its own tenant rows plus unattributed
 * legacy rows (tenant_id = '') — never another tenant's rows.
 */
function tenantClause(req, alias = '') {
  const tenantId = tenantScopeOf(req);
  if (!tenantId) return { clause: '', params: [] };
  const col = alias ? `${alias}.tenant_id` : 'tenant_id';
  return { clause: ` AND (${col}=? OR ${col}='')`, params: [tenantId] };
}

// ── Plans ──
router.get('/plans', (req, res) => {
  const { limit, offset } = page(req.query, 100);
  const active = req.query.active != null ? String(req.query.active) : null;
  const scope = tenantClause(req);
  let base = `FROM subscription_plans WHERE 1=1${scope.clause}`;
  const params = [...scope.params];
  if (active === '1' || active === '0') { base += ' AND is_active=?'; params.push(Number(active)); }
  const total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
  const rows = db.prepare(`SELECT * ${base} ORDER BY is_active DESC, price LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return res.json({ plans: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

router.post('/plans', (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const name = String(req.body?.name || '').trim().slice(0, 100);
  const price = Number(req.body?.price);
  // Explicitly supplied-but-invalid input is rejected; only an OMITTED interval
  // falls back to the 30-day default (never silently coerce 0/"abc" to 30).
  const rawInterval = req.body?.intervalDays ?? req.body?.interval_days;
  const intervalDays = rawInterval == null || rawInterval === '' ? 30 : Number.parseInt(rawInterval, 10);
  const currency = String(req.body?.currency || 'SAR').toUpperCase().slice(0, 10);
  if (!name) return res.status(400).json({ error: 'اسم الباقة مطلوب' });
  if (!Number.isFinite(price) || !(price > 0) || price > 1_000_000) {
    return res.status(400).json({ error: 'سعر الباقة أكبر من صفر وأقل من 1,000,000' });
  }
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 3650) return res.status(400).json({ error: 'فترة التجديد بين 1 و3650 يومًا' });
  const cur = db.prepare('SELECT code FROM currencies WHERE code=? AND is_active=1').get(currency);
  if (!cur) return res.status(400).json({ error: 'عملة غير معروفة أو موقوفة' });
  const id = uuid();
  db.prepare(`INSERT INTO subscription_plans (id,tenant_id,name,name_ar,price,currency,interval_days,created_by) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, tenantScopeOf(req), name, String(req.body?.nameAr || '').slice(0, 100), Math.round(price * 100) / 100, currency, intervalDays, req.user?.username || 'system');
  req.audit?.('subscription.plan.create', { planId: id, name, price });
  recordTrail(req, { entity: 'SUBSCRIPTION_PLAN', entityId: id, action: 'CREATE', after: { name, price, intervalDays } });
  emit('subscription.plan_created', 'SUBSCRIPTION_PLAN', id, { name, price, currency, intervalDays });
  return res.status(201).json({ id, name, price, currency, interval_days: intervalDays });
});

router.patch('/plans/:id', (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT * FROM subscription_plans WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'الباقة غير موجودة' });
  assertRecordTenant(req, row);
  const sets = [];
  const params = [];
  if (req.body?.name != null) { sets.push('name=?'); params.push(String(req.body.name).trim().slice(0, 100)); }
  if (req.body?.nameAr != null) { sets.push('name_ar=?'); params.push(String(req.body.nameAr).slice(0, 100)); }
  if (req.body?.price != null) {
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || !(price > 0) || price > 1_000_000) return res.status(400).json({ error: 'سعر غير صالح' });
    sets.push('price=?'); params.push(Math.round(price * 100) / 100);
  }
  if (req.body?.intervalDays != null) {
    const days = parseInt(req.body.intervalDays, 10);
    if (days < 1 || days > 3650) return res.status(400).json({ error: 'فترة غير صالحة' });
    sets.push('interval_days=?'); params.push(days);
  }
  if (req.body?.isActive != null) { sets.push('is_active=?'); params.push(req.body.isActive === false ? 0 : 1); }
  if (!sets.length) return res.status(400).json({ error: 'لا توجد حقول للتحديث' });
  sets.push("updated_at=datetime('now')");
  db.prepare(`UPDATE subscription_plans SET ${sets.join(',')} WHERE id=?`).run(...params, id);
  req.audit?.('subscription.plan.update', { planId: id });
  recordTrail(req, { entity: 'SUBSCRIPTION_PLAN', entityId: id, action: 'UPDATE', after: req.body });
  return res.json({ id, updated: sets.length });
});

// ── Customer subscriptions ──
router.get('/', (req, res) => {
  const { limit, offset } = page(req.query, 50);
  const status = req.query.status ? String(req.query.status).slice(0, 20) : '';
  const customerId = req.query.customerId ? String(req.query.customerId).slice(0, 64) : '';
  const scope = tenantClause(req, 's');
  let base = `WHERE 1=1${scope.clause}`;
  const params = [...scope.params];
  if (status) { base += ' AND s.status=?'; params.push(status); }
  if (customerId) { base += ' AND s.customer_id=?'; params.push(customerId); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM customer_subscriptions s ${base}`).get(...params)?.c || 0;
  const rows = db.prepare(`
    SELECT s.*, p.name AS plan_name, p.name_ar AS plan_name_ar, p.price, p.currency, p.interval_days, c.name AS customer_name
    FROM customer_subscriptions s
    JOIN subscription_plans p ON p.id = s.plan_id
    JOIN customers c ON c.id = s.customer_id
    ${base} ORDER BY s.next_billing_date LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return res.json({ subscriptions: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

router.post('/subscribe', (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const customerId = String(req.body?.customerId || '').slice(0, 64);
  const planId = String(req.body?.planId || '').slice(0, 64);
  const autoRenew = req.body?.autoRenew === false ? 0 : 1;
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.startDate || '')) ? String(req.body.startDate) : today();
  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id=? AND is_active=1').get(planId);
  if (!plan) return res.status(404).json({ error: 'الباقة غير موجودة أو موقوفة' });
  try { assertRecordTenant(req, plan); } catch { return res.status(404).json({ error: 'الباقة غير موجودة' }); }
  const customer = db.prepare('SELECT id, tenant_id FROM customers WHERE id=? AND is_active=1').get(customerId);
  if (!customer) return res.status(404).json({ error: 'العميل غير موجود أو موقوف' });
  try { assertRecordTenant(req, customer); } catch { return res.status(404).json({ error: 'العميل غير موجود' }); }
  try { assertTenantScope(req); } catch (e) { return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) }); }
  const dup = db.prepare(`SELECT id FROM customer_subscriptions WHERE customer_id=? AND plan_id=? AND status IN ('active','paused')`).get(customerId, planId);
  if (dup) return res.status(409).json({ error: 'العميل مشترك بالفعل في هذه الباقة', subscriptionId: dup.id });
  const id = uuid();
  db.prepare(`INSERT INTO customer_subscriptions (id,tenant_id,customer_id,plan_id,status,start_date,next_billing_date,auto_renew) VALUES (?,?,?,?,'active',?,?,?)`)
    .run(id, tenantScopeOf(req), customerId, planId, startDate, addDays(startDate, plan.interval_days), autoRenew);
  req.audit?.('subscription.subscribe', { subscriptionId: id, customerId, planId });
  recordTrail(req, { entity: 'SUBSCRIPTION', entityId: id, action: 'CREATE', after: { customerId, planId, startDate } });
  emit('subscription.created', 'SUBSCRIPTION', id, { customerId, planId, startDate });
  return res.status(201).json({ id, customerId, planId, startDate, nextBillingDate: addDays(startDate, plan.interval_days), autoRenew });
});

function transition(req, res, allowedFrom, nextStatus, actionName) {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT * FROM customer_subscriptions WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  try { assertRecordTenant(req, row); } catch { return res.status(404).json({ error: 'الاشتراك غير موجود' }); }
  if (!allowedFrom.includes(row.status)) {
    return res.status(409).json({ error: `لا يمكن تنفيذ الإجراء من الحالة الحالية (${row.status})` });
  }
  db.prepare(`UPDATE customer_subscriptions SET status=?,updated_at=datetime('now') WHERE id=?`).run(nextStatus, id);
  req.audit?.(actionName, { subscriptionId: id, from: row.status, to: nextStatus });
  recordTrail(req, { entity: 'SUBSCRIPTION', entityId: id, action: actionName.toUpperCase(), after: { status: nextStatus } });
  emit('subscription.status_changed', 'SUBSCRIPTION', id, { from: row.status, to: nextStatus });
  return res.json({ id, status: nextStatus });
}

router.post('/:id/pause', (req, res) => transition(req, res, ['active'], 'paused', 'subscription.pause'));
router.post('/:id/resume', (req, res) => transition(req, res, ['paused'], 'active', 'subscription.resume'));
router.post('/:id/cancel', (req, res) => transition(req, res, ['active', 'paused'], 'cancelled', 'subscription.cancel'));

// ── Billing run (ADMIN/MANAGER) ──
// Bills every ACTIVE subscription whose next_billing_date <= date.
// auto_renew + sufficient wallet balance → wallet debit (canonical ledger).
// Otherwise → 'due' billing row (manual collection), subscription stays active.
router.post('/run-billing', (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.date || '')) ? String(req.body.date) : today();
  const scope = tenantClause(req, 's');
  const due = db.prepare(`
    SELECT s.*, p.price, p.currency, p.interval_days, c.wallet_balance
    FROM customer_subscriptions s
    JOIN subscription_plans p ON p.id = s.plan_id
    JOIN customers c ON c.id = s.customer_id
    WHERE s.status='active' AND s.next_billing_date <= ?${scope.clause}`).all(date, ...scope.params);
  const results = [];
  let skipped = 0;
  for (const sub of due) {
    const price = Number(sub.price) || 0;
    if (price <= 0) {
      skipped++;
      continue;
    }
    const balance = Number(sub.wallet_balance) || 0;
    const step = Math.max(1, Number(sub.interval_days) || 30);
    const periodStart = String(sub.next_billing_date).slice(0, 10);
    // Consolidate every period that was already due and roll the schedule past
    // the run date. One run therefore bills one row per subscription: replaying
    // the same run date can never charge again, and the boundary is recorded.
    let nextDate = periodStart;
    let periods = 0;
    while (nextDate <= date && periods < MAX_CONSOLIDATED_PERIODS) {
      nextDate = addDays(nextDate, step);
      periods += 1;
    }
    if (periods < 1) continue; // not actually due (defensive: query said otherwise)
    const amount = Math.round(price * periods * 100) / 100;
    let method = 'due';
    try {
      db.transaction(() => {
        // 1) Period key first: a UNIQUE violation means this period is already
        //    settled — nothing is charged and the whole transaction rolls back.
        db.prepare(`INSERT INTO subscription_billings (tenant_id,subscription_id,customer_id,amount,currency,method,period_start,periods_consolidated) VALUES (?,?,?,?,?,?,?,?)`)
          .run(sub.tenant_id || '', sub.id, sub.customer_id, amount, sub.currency, 'due', periodStart, periods);
        // 2) Wallet auto-pay (canonical ledger) when the balance covers it all.
        if (Number(sub.auto_renew) === 1 && amount > 0 && balance >= amount - 0.005) {
          const bal = Math.round((balance - amount) * 100) / 100;
          db.prepare(`UPDATE customers SET wallet_balance=?,updated_at=datetime('now') WHERE id=?`).run(bal, sub.customer_id);
          db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`)
            .run(uuid(), sub.customer_id, 0, -amount, 'WALLET_DEBIT', 'SUBSCRIPTION', sub.id, 'فوترة اشتراك');
          db.prepare(`INSERT INTO wallet_transactions (id,customer_id,amount,direction,balance_after,reference_type,reference_id,note,created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
            .run(uuid(), sub.customer_id, amount, 'debit', bal, 'SUBSCRIPTION', sub.id, 'فوترة اشتراك', req.user?.username || 'system');
          db.prepare(`UPDATE subscription_billings SET method='wallet' WHERE subscription_id=? AND period_start=?`)
            .run(sub.id, periodStart);
          method = 'wallet';
        }
        db.prepare(`UPDATE customer_subscriptions SET next_billing_date=?, last_billed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
          .run(nextDate, sub.id);
      })();
    } catch (e) {
      if (!/UNIQUE/i.test(String(e.message))) throw e;
      skipped += 1; // already settled period — idempotent replay
      continue;
    }
    results.push({ subscriptionId: sub.id, customerId: sub.customer_id, amount, currency: sub.currency, method, periodStart, periods, nextBillingDate: nextDate });
  }
  if (results.length) {
    req.audit?.('subscription.run_billing', { date, billed: results.length });
    recordTrail(req, { entity: 'SUBSCRIPTION', entityId: 'RUN', action: 'BILLING_RUN', after: { date, billed: results.length } });
    emit('subscription.billing_run', 'SUBSCRIPTION', 'RUN', { date, billed: results.length });
  }
  return res.json({
    date,
    billed: results.length,
    wallet: results.filter((r) => r.method === 'wallet').length,
    due: results.filter((r) => r.method === 'due').length,
    skipped,
    results,
  });
});

// ── Report (real aggregates over subscription tables) ──
router.get('/report', (req, res) => {
  const scope = tenantClause(req, 's');
  const counts = db.prepare(`SELECT s.status, COUNT(*) as c FROM customer_subscriptions s WHERE 1=1${scope.clause} GROUP BY s.status`).all(...scope.params);
  const byStatus = Object.fromEntries(counts.map((r) => [r.status, r.c]));
  const mrrRows = db.prepare(`
    SELECT p.price, p.interval_days FROM customer_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
    WHERE s.status='active'${scope.clause}`).all(...scope.params);
  const mrr = Math.round(mrrRows.reduce((sum, r) => sum + (Number(r.price) || 0) * (30 / Math.max(1, Number(r.interval_days) || 30)), 0) * 100) / 100;
  let dueTotal = 0, dueCount = 0;
  try {
    const bScope = tenantClause(req, 'b');
    const due = db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM subscription_billings b WHERE method='due'${bScope.clause}`).get(...bScope.params);
    dueCount = due?.c || 0; dueTotal = Math.round((Number(due?.t) || 0) * 100) / 100;
  } catch { /* pre-v18 DBs: tables missing */ }
  return res.json({
    byStatus: { active: byStatus.active || 0, paused: byStatus.paused || 0, cancelled: byStatus.cancelled || 0, expired: byStatus.expired || 0 },
    mrr,
    dueBillings: { count: dueCount, total: dueTotal },
  });
});

// ── Billing history for one customer (statement) ──
router.get('/billings/:customerId', (req, res) => {
  const customerId = String(req.params.customerId).slice(0, 64);
  const { limit, offset } = page(req.query, 50);
  // Identity + tenant ownership are checked BEFORE the compute block so a
  // cross-tenant probe is a hard 404, never an empty 200.
  const cust = db.prepare('SELECT id, tenant_id FROM customers WHERE id=?').get(customerId);
  if (!cust) return res.status(404).json({ error: 'العميل غير موجود' });
  assertRecordTenant(req, cust);
  const scope = tenantClause(req, 'b');
  let total = 0, rows = [];
  try {
    total = db.prepare(`SELECT COUNT(*) as c FROM subscription_billings b WHERE b.customer_id=?${scope.clause}`).get(customerId, ...scope.params)?.c || 0;
    rows = db.prepare(`SELECT * FROM subscription_billings b WHERE b.customer_id=?${scope.clause} ORDER BY b.billed_at DESC LIMIT ? OFFSET ?`).all(customerId, ...scope.params, limit, offset);
  } catch { /* pre-v18 DBs: tables missing → empty statement */ }
  return res.json({ billings: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

export default router;


