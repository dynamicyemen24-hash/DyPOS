/**
 * Subscription engine regression tests (schema v18).
 *
 * Scope: plan master data (ADMIN/MANAGER only), customer subscriptions with
 * pause/resume/cancel transitions, wallet auto-pay billing runs, tenant
 * isolation on every read/write, and — most importantly — no double billing:
 * a second run for the same date must never charge twice, and the wallet
 * ledger must stay canonical.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

import { app } from '../server.js';
import db from '../db/schema.js';

let server, port, admin, cashier, tenantA, tenantB, custA, custB;
const A = { 'X-Tenant-Id': '' };

async function req(method, path, body, tok, extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers, body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const au = 'subadmin_' + Date.now();
  await req('POST', '/api/auth/register', { username: au, password: 'Pass1234', fullName: 'Sub Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: au, password: 'Pass1234' })).body.token;

  const cu = 'subcash_' + Date.now();
  await req('POST', '/api/auth/register', { username: cu, password: 'Pass1234', fullName: 'Sub Cash' });
  cashier = (await req('POST', '/api/auth/login', { username: cu, password: 'Pass1234' })).body.token;

  tenantA = (await req('POST', '/api/tenants', { name: 'Sub A' }, admin)).body.id;
  tenantB = (await req('POST', '/api/tenants', { name: 'Sub B' }, admin)).body.id;
  A['X-Tenant-Id'] = tenantA;
  custA = (await req('POST', '/api/customers', { name: 'Subscriber A' }, admin, A)).body.id;
  custB = (await req('POST', '/api/customers', { name: 'Subscriber B' }, admin, { 'X-Tenant-Id': tenantB })).body.id;
});

after(() => server.close());

describe('Subscription plans (master data)', () => {
  it('CASHIER cannot create a plan; ADMIN can; invalid inputs are 400', async () => {
    const forbidden = await req('POST', '/api/subscriptions/plans', { name: 'X', price: 10 }, cashier);
    assert.strictEqual(forbidden.status, 403);

    const noName = await req('POST', '/api/subscriptions/plans', { price: 10 }, admin, A);
    assert.strictEqual(noName.status, 400);

    const zero = await req('POST', '/api/subscriptions/plans', { name: 'Zero', price: 0 }, admin, A);
    assert.strictEqual(zero.status, 400);

    const huge = await req('POST', '/api/subscriptions/plans', { name: 'Huge', price: 2_000_000 }, admin, A);
    assert.strictEqual(huge.status, 400);

    const badCur = await req('POST', '/api/subscriptions/plans', { name: 'Cur', price: 10, currency: 'INVALID' }, admin, A);
    assert.strictEqual(badCur.status, 400);

    const badInterval = await req('POST', '/api/subscriptions/plans', { name: 'Int', price: 10, intervalDays: 0 }, admin, A);
    assert.strictEqual(badInterval.status, 400);
  });

  it('creates a plan, lists it, and patches price/interval with audit trail', async () => {
    const created = await req('POST', '/api/subscriptions/plans',
      { name: 'Gold Box', nameAr: 'الصندوق الذهبي', price: 100, intervalDays: 30 }, admin, A);
    assert.strictEqual(created.status, 201);
    assert.strictEqual(created.body.currency, 'SAR');

    const list = await req('GET', '/api/subscriptions/plans?active=1', null, admin, A);
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.plans.some((p) => p.id === created.body.id), 'plan visible in the list');

    const patched = await req('PATCH', `/api/subscriptions/plans/${created.body.id}`, { price: 120, intervalDays: 15 }, admin, A);
    assert.strictEqual(patched.status, 200);
    const row = db.prepare('SELECT price, interval_days FROM subscription_plans WHERE id=?').get(created.body.id);
    assert.strictEqual(Number(row.price), 120);
    assert.strictEqual(Number(row.interval_days), 15);

    const trail = db.prepare("SELECT COUNT(*) AS c FROM audit_trail WHERE entity_type='SUBSCRIPTION_PLAN' AND entity_id=?").get(created.body.id);
    assert.ok(trail.c >= 2, 'create + update are on the audit trail');
  });
});
describe('Customer subscriptions lifecycle', () => {
  let planId, subId;

  it('subscribes a customer and computes the next billing date', async () => {
    const plan = await req('POST', '/api/subscriptions/plans', { name: 'Monthly', price: 50, intervalDays: 30 }, admin, A);
    planId = plan.body.id;
    const sub = await req('POST', '/api/subscriptions/subscribe',
      { customerId: custA, planId, startDate: '2030-01-01' }, admin, A);
    assert.strictEqual(sub.status, 201);
    assert.strictEqual(sub.body.nextBillingDate, '2030-01-31');
    subId = sub.body.id;
  });

  it('rejects duplicate active subscription (409) and unknown ids (404)', async () => {
    const dup = await req('POST', '/api/subscriptions/subscribe', { customerId: custA, planId }, admin, A);
    assert.strictEqual(dup.status, 409);
    assert.strictEqual(dup.body.subscriptionId, subId);

    const badPlan = await req('POST', '/api/subscriptions/subscribe', { customerId: custA, planId: 'nope' }, admin, A);
    assert.strictEqual(badPlan.status, 404);

    const badCust = await req('POST', '/api/subscriptions/subscribe', { customerId: 'nope', planId }, admin, A);
    assert.strictEqual(badCust.status, 404);
  });

  it('pause → resume → cancel, and invalid transitions are 409', async () => {
    const pause = await req('POST', `/api/subscriptions/${subId}/pause`, {}, admin, A);
    assert.strictEqual(pause.status, 200);
    const pauseAgain = await req('POST', `/api/subscriptions/${subId}/pause`, {}, admin, A);
    assert.strictEqual(pauseAgain.status, 409);
    const resume = await req('POST', `/api/subscriptions/${subId}/resume`, {}, admin, A);
    assert.strictEqual(resume.status, 200);
    assert.strictEqual(resume.body.status, 'active');
    const resumeAgain = await req('POST', `/api/subscriptions/${subId}/resume`, {}, admin, A);
    assert.strictEqual(resumeAgain.status, 409);
    const cancel = await req('POST', `/api/subscriptions/${subId}/cancel`, {}, admin, A);
    assert.strictEqual(cancel.status, 200);
    const cancelAgain = await req('POST', `/api/subscriptions/${subId}/cancel`, {}, admin, A);
    assert.strictEqual(cancelAgain.status, 409);
  });

  it('CASHIER can read but cannot mutate', async () => {
    const read = await req('GET', '/api/subscriptions', null, cashier, A);
    assert.strictEqual(read.status, 200);
    const denied = await req('POST', `/api/subscriptions/${subId}/pause`, {}, cashier, A);
    assert.strictEqual(denied.status, 403);
  });
});
describe('Billing run (wallet auto-pay + due collection)', () => {
  let paidSub, dueSub;

  it('prepares an overdue paid subscription, an unpaid one and a cancelled one', async () => {
    const p = await req('POST', '/api/subscriptions/plans', { name: 'Recurring 100', price: 100, intervalDays: 30 }, admin, A);
    const planId = p.body.id;

    // next_billing_date = 2026-05-31 → exactly one period due at the 2026-06-01 run
    paidSub = (await req('POST', '/api/subscriptions/subscribe',
      { customerId: custA, planId, startDate: '2026-05-01' }, admin, A)).body.id;
    const credit = await req('POST', `/api/customers/${custA}/wallet`, { amount: 500, direction: 'credit' }, admin, A);
    assert.strictEqual(credit.status, 200);
    assert.strictEqual(Number(credit.body.walletBalance), 500);

    const poor = await req('POST', '/api/customers', { name: 'Poor Subscriber' }, admin, A);
    dueSub = (await req('POST', '/api/subscriptions/subscribe',
      { customerId: poor.body.id, planId, startDate: '2026-05-01' }, admin, A)).body.id;

    const other = await req('POST', '/api/customers', { name: 'Cancelled Subscriber' }, admin, A);
    const cancelled = (await req('POST', '/api/subscriptions/subscribe',
      { customerId: other.body.id, planId, startDate: '2026-05-01' }, admin, A)).body.id;
    await req('POST', `/api/subscriptions/${cancelled}/cancel`, {}, admin, A);
  });

  it('CASHIER cannot run billing', async () => {
    const r = await req('POST', '/api/subscriptions/run-billing', {}, cashier, A);
    assert.strictEqual(r.status, 403);
  });

  it('charges the wallet, writes the canonical ledger, and records the billing', async () => {
    const run = await req('POST', '/api/subscriptions/run-billing', { date: '2026-06-01' }, admin, A);
    assert.strictEqual(run.status, 200);
    assert.strictEqual(run.body.billed, 2, 'only the two overdue active subscriptions are billed');

    const paid = run.body.results.find((r) => r.subscriptionId === paidSub);
    assert.strictEqual(paid.method, 'wallet');
    assert.strictEqual(paid.amount, 100, 'one period at the plan price');
    assert.strictEqual(paid.periods, 1);
    assert.strictEqual(paid.periodStart, '2026-05-31');
    assert.ok(paid.nextBillingDate > '2026-06-01', 'schedule always rolls past the run date');

    const bal = db.prepare('SELECT wallet_balance FROM customers WHERE id=?').get(custA);
    assert.strictEqual(Number(bal.wallet_balance), 400, 'wallet debited exactly once');

    const ledger = db.prepare("SELECT direction, balance_after FROM wallet_transactions WHERE customer_id=? AND reference_type='SUBSCRIPTION'").all(custA);
    assert.strictEqual(ledger.length, 1, 'one canonical ledger row');
    assert.strictEqual(ledger[0].direction, 'debit');
    assert.strictEqual(Number(ledger[0].balance_after), 400);

    const bill = db.prepare('SELECT method, amount, periods_consolidated, period_start FROM subscription_billings WHERE subscription_id=?').get(paidSub);
    assert.strictEqual(bill.method, 'wallet');
    assert.strictEqual(Number(bill.amount), 100);
    assert.strictEqual(Number(bill.periods_consolidated), 1);
    assert.strictEqual(bill.period_start, '2026-05-31');

    const due = run.body.results.find((r) => r.subscriptionId === dueSub);
    assert.strictEqual(due.method, 'due', 'insufficient balance → due, never a silent skip');
  });

  it('a long-stale schedule is consolidated into ONE charge (never N charges)', async () => {
    const p = await req('POST', '/api/subscriptions/plans', { name: 'Stale', price: 10, intervalDays: 30 }, admin, A);
    const c = await req('POST', '/api/customers', { name: 'Stale Subscriber' }, admin, A);
    await req('POST', `/api/customers/${c.body.id}/wallet`, { amount: 100, direction: 'credit' }, admin, A);
    const sub = await req('POST', '/api/subscriptions/subscribe',
      { customerId: c.body.id, planId: p.body.id, startDate: '2000-01-01' }, admin, A);

    const run = await req('POST', '/api/subscriptions/run-billing', { date: '2026-06-01' }, admin, A);
    const line = run.body.results.find((r) => r.subscriptionId === sub.body.id);
    assert.ok(line.periods > 300, 'every missed period is accounted for');
    assert.strictEqual(line.amount, Math.round(10 * line.periods * 100) / 100, 'amount covers all consolidated periods');
    assert.ok(line.nextBillingDate > '2026-06-01', 'rolled past the run date');
    const rows = db.prepare('SELECT COUNT(*) AS c FROM subscription_billings WHERE subscription_id=?').get(sub.body.id);
    assert.strictEqual(rows.c, 1, 'exactly one billing row for the whole catch-up');
    const bal = db.prepare('SELECT wallet_balance FROM customers WHERE id=?').get(c.body.id);
    assert.strictEqual(Number(bal.wallet_balance), 100, 'wallet left alone when it cannot cover the total');
  });

  it('charges a single period at real price and debits the wallet once', async () => {
    const p = await req('POST', '/api/subscriptions/plans', { name: 'Single period', price: 40, intervalDays: 30 }, admin, A);
    const c = await req('POST', '/api/customers', { name: 'Single Subscriber' }, admin, A);
    await req('POST', `/api/customers/${c.body.id}/wallet`, { amount: 100, direction: 'credit' }, admin, A);
    // due exactly one period before the run date
    const sub = await req('POST', '/api/subscriptions/subscribe',
      { customerId: c.body.id, planId: p.body.id, startDate: '2026-05-01' }, admin, A);
    assert.strictEqual(sub.body.nextBillingDate, '2026-05-31');

    const run = await req('POST', '/api/subscriptions/run-billing', { date: '2026-06-01' }, admin, A);
    const line = run.body.results.find((r) => r.subscriptionId === sub.body.id);
    assert.strictEqual(line.method, 'wallet');
    assert.strictEqual(line.periods, 1);
    assert.strictEqual(line.amount, 40);
    const bal = db.prepare('SELECT wallet_balance FROM customers WHERE id=?').get(c.body.id);
    assert.strictEqual(Number(bal.wallet_balance), 60, 'wallet debited exactly once');
  });

  it('NEVER bills twice: replaying the same run date is a no-op', async () => {
    const before = db.prepare('SELECT COUNT(*) AS c FROM subscription_billings').get().c;
    const balBefore = db.prepare('SELECT wallet_balance FROM customers WHERE id=?').get(custA).wallet_balance;
    const replay = await req('POST', '/api/subscriptions/run-billing', { date: '2026-06-01' }, admin, A);
    assert.strictEqual(replay.status, 200);
    assert.strictEqual(replay.body.billed, 0, 'no subscription is due twice at the same date');
    const after = db.prepare('SELECT COUNT(*) AS c FROM subscription_billings').get().c;
    assert.strictEqual(after, before, 'billing rows unchanged');
    const balAfter = db.prepare('SELECT wallet_balance FROM customers WHERE id=?').get(custA).wallet_balance;
    assert.strictEqual(Number(balAfter), Number(balBefore), 'wallet untouched on replay');
  });

  it('the database itself rejects a duplicated billing period', async () => {
    const row = db.prepare('SELECT subscription_id, period_start FROM subscription_billings LIMIT 1').get();
    assert.throws(() => {
      db.prepare(`INSERT INTO subscription_billings (subscription_id,customer_id,amount,currency,method,period_start) VALUES (?,?,?,?,'due',?)`)
        .run(row.subscription_id, custA, 1, 'SAR', row.period_start);
    }, /UNIQUE/i, 'UNIQUE(subscription_id, period_start) blocks a double charge');
  });

  it('auto_renew=0 keeps the charge as due even with enough balance', async () => {
    const p = await req('POST', '/api/subscriptions/plans', { name: 'Manual renew', price: 100, intervalDays: 30 }, admin, A);
    const c = await req('POST', '/api/customers', { name: 'Manual Subscriber' }, admin, A);
    await req('POST', `/api/customers/${c.body.id}/wallet`, { amount: 500, direction: 'credit' }, admin, A);
    const sub = await req('POST', '/api/subscriptions/subscribe',
      { customerId: c.body.id, planId: p.body.id, startDate: '2000-01-01', autoRenew: false }, admin, A);
    assert.strictEqual(sub.body.autoRenew, 0);
    const run = await req('POST', '/api/subscriptions/run-billing', { date: '2026-06-01' }, admin, A);
    const line = run.body.results.find((r) => r.subscriptionId === sub.body.id);
    assert.strictEqual(line.method, 'due');
    const bal = db.prepare('SELECT wallet_balance FROM customers WHERE id=?').get(c.body.id);
    assert.strictEqual(Number(bal.wallet_balance), 500, 'wallet untouched without auto-renew');
  });
});
describe('Subscription reporting', () => {
  it('report aggregates status counts, MRR and due billings', async () => {
    const r = await req('GET', '/api/subscriptions/report', null, admin, A);
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.byStatus.active >= 2, 'active subscriptions counted');
    assert.ok(r.body.byStatus.cancelled >= 1, 'cancelled subscriptions counted');
    assert.ok(r.body.mrr > 0, 'MRR is a real aggregate over active plans');
    assert.ok(r.body.dueBillings.count >= 2 && r.body.dueBillings.total > 0, 'uncollected dues are visible');
  });

  it('customer statement returns the billing history', async () => {
    const r = await req('GET', `/api/subscriptions/billings/${custA}`, null, admin, A);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.total, 1);
    assert.strictEqual(r.body.billings[0].method, 'wallet');
  });
});

describe('Subscription tenant isolation', () => {
  let planA, subA;

  it('a tenant sees only its own plans and subscriptions', async () => {
    planA = (await req('POST', '/api/subscriptions/plans', { name: 'Tenant A Plan', price: 10 }, admin, A)).body.id;
    subA = (await req('POST', '/api/subscriptions/subscribe',
      { customerId: custA, planId: planA, startDate: '2030-01-01' }, admin, A)).body.id;

    const scopedB = await req('GET', '/api/subscriptions?limit=200', null, admin, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(scopedB.status, 200);
    assert.ok(!scopedB.body.subscriptions.some((s) => s.id === subA), 'tenant B cannot see tenant A subscription');

    const plansB = await req('GET', '/api/subscriptions/plans?limit=200', null, admin, { 'X-Tenant-Id': tenantB });
    assert.ok(!plansB.body.plans.some((p) => p.id === planA), 'tenant B cannot see tenant A plan');

    const scopedA = await req('GET', '/api/subscriptions?limit=200', null, admin, A);
    assert.ok(scopedA.body.subscriptions.some((s) => s.id === subA), 'tenant A sees its own subscription');
  });

  it('cross-tenant writes and statements are hard 404s', async () => {
    const crossPatch = await req('PATCH', `/api/subscriptions/plans/${planA}`, { price: 1 }, admin, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(crossPatch.status, 404);
    const price = db.prepare('SELECT price FROM subscription_plans WHERE id=?').get(planA);
    assert.strictEqual(Number(price.price), 10, 'tenant A plan untouched by tenant B');

    const crossPause = await req('POST', `/api/subscriptions/${subA}/pause`, {}, admin, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(crossPause.status, 404);

    const crossStatement = await req('GET', `/api/subscriptions/billings/${custA}`, null, admin, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(crossStatement.status, 404);

    const crossSubscribe = await req('POST', '/api/subscriptions/subscribe',
      { customerId: custB, planId: planA }, admin, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(crossSubscribe.status, 404, 'cannot attach another tenant plan to my customer');
  });

  it('a billing run scoped to one tenant never touches another tenant', async () => {
    const c = await req('POST', '/api/customers', { name: 'Due In A' }, admin, A);
    await req('POST', `/api/customers/${c.body.id}/wallet`, { amount: 50, direction: 'credit' }, admin, A);
    const plan = await req('POST', '/api/subscriptions/plans', { name: 'Cheap', price: 10 }, admin, A);
    await req('POST', '/api/subscriptions/subscribe', { customerId: c.body.id, planId: plan.body.id, startDate: '2000-01-01' }, admin, A);

    const scopedRun = await req('POST', '/api/subscriptions/run-billing', { date: '2026-06-01' }, admin, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(scopedRun.status, 200);
    assert.strictEqual(scopedRun.body.billed, 0, 'nothing billed for tenant B');

    const bal = db.prepare('SELECT wallet_balance FROM customers WHERE id=?').get(c.body.id);
    assert.strictEqual(Number(bal.wallet_balance), 50, 'tenant A wallet untouched by a tenant B run');
  });

  it('unknown tenant id is 404 on both reads and writes', async () => {
    const read = await req('GET', '/api/subscriptions', null, admin, { 'X-Tenant-Id': 'no-such-tenant' });
    assert.strictEqual(read.status, 404);
    const write = await req('POST', '/api/subscriptions/plans', { name: 'Ghost', price: 5 }, admin, { 'X-Tenant-Id': 'no-such-tenant' });
    assert.strictEqual(write.status, 404);
  });
});