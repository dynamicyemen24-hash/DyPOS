/**
 * DyPOS Subscription Engine — domain logic (خPlans، subscriptions، billing runs).
 *
 * ## Why this module exists
 *
 * The engine used to live inline in `routes/subscriptions.js`, which made it
 * reachable from exactly ONE transport: REST. The POS, however, runs on the
 * method-router bridge (`VITE_DYPOS_BACKEND=method`, tried first by
 * `adapters/index.js`), and every subscription export in
 * `adapters/method/api.js` was `notSupported(...)`. The whole feature was
 * therefore dead in the POS — a screen wired to those functions would render
 * buttons that throw on click, which is precisely the "dead contract" failure
 * AGENTS.md forbids.
 *
 * So the domain is extracted here and BOTH transports call it. Invariant 3's
 * spirit — one implementation, never a re-implementation — applied to a second
 * surface: a rule that exists twice is a rule that will disagree.
 *
 * ## Errors
 *
 * Every refusal is a `SubscriptionError` carrying the HTTP `status` the REST
 * layer used to return AND the Arabic message. Both transports translate it
 * without re-deciding: REST → `res.status(e.status)`, method verb →
 * `exc_type` + the same status. A validation rule can therefore never drift
 * between the two.
 *
 * ## Tenant
 *
 * The caller's tenant is RESOLVED BY THE CALLER and arrives as `ctx.tenantId`
 * (`''` for an unscoped legacy/scheduler caller). Reads see the caller's rows
 * plus unattributed legacy rows — never another tenant's.
 */
import { v4 as uuid } from 'uuid';

import db from '../db/schema.js';
import { recordTrail } from './trail.js';
import { emit } from './webhooks.js';

/** A refusal with the status both transports must answer. */
export class SubscriptionError extends Error {
	constructor(message, status = 400, extra = {}) {
		super(message);
		this.name = 'SubscriptionError';
		this.status = status;
		Object.assign(this, extra);
	}
}

/**
 * Upper bound on how many missed periods a single billing run may consolidate
 * into one charge (code before a stuck schedule could turn into an absurd
 * amount). 1,200 daily periods ≈ 3.3 years — a hard, auditable ceiling.
 */
export const MAX_CONSOLIDATED_PERIODS = 1200;

export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(isoDate, days) {
	const d = new Date(`${isoDate}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + Number(days));
	return d.toISOString().slice(0, 10);
}

/**
 * Page window shared by every list verb.
 *
 * `limit` is clamped to 200 and `offset` floored at 0 so a hostile
 * `?limit=100000` cannot ask the database for the whole table.
 */
export function pageOf(q = {}, def = 50) {
	return {
		limit: Math.min(Math.max(Number.parseInt(q.limit, 10) || def, 1), 200),
		offset: Math.max(Number.parseInt(q.offset, 10) || 0, 0),
	};
}

/**
 * Read-plane tenant clause.
 *
 * `(tenant_id=? OR tenant_id='')` — the caller's rows plus unattributed legacy
 * rows. NOT `IS NULL`: the column is `NOT NULL DEFAULT ''`, so a NULL check
 * would silently drop every legacy row from every list.
 */
export const tenantClauseFor = (tenantId, alias = '') => {
	if (!tenantId) return { clause: '', params: [] };
	const col = alias ? `${alias}.tenant_id` : 'tenant_id';
	return { clause: ` AND (${col}=? OR ${col}='')`, params: [tenantId] };
};

/**
 * Cross-tenant IDOR guard, mirroring `assertRecordTenant`.
 *
 * A legacy row (no tenant) is visible to all; an unscoped caller sees all; a
 * MISMATCH IS 404, not 403, so existence never leaks.
 */
const assertRowTenant = (row, tenantId) => {
	if (!row) return;
	const recTenant = row.tenant_id ? String(row.tenant_id) : null;
	if (!recTenant || !tenantId) return;
	if (String(tenantId) !== recTenant) throw new SubscriptionError('غير موجود', 404);
};

const isManagerCtx = (ctx) => ['ADMIN', 'MANAGER'].includes(String(ctx?.user?.role || ''));

/** Writes are ADMIN/MANAGER only. Enforced here so no caller can forget. */
function assertManager(ctx) {
	if (!isManagerCtx(ctx)) throw new SubscriptionError('صلاحية غير كافية', 403);
}

/** `recordTrail` needs a `req`-shaped object; a ctx is that shape. */
const trailCtx = (ctx) => ({ user: ctx?.user, ip: ctx?.ip });

// ── Plans ────────────────────────────────────────────────────────────────────

export function listPlans(ctx, { active, limit = 100, offset = 0 } = {}) {
	const scope = tenantClauseFor(ctx.tenantId);
	let base = `FROM subscription_plans WHERE 1=1${scope.clause}`;
	const params = [...scope.params];
	if (active === '1' || active === '0') {
		base += ' AND is_active=?';
		params.push(Number(active));
	}
	const total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
	const rows = db
		.prepare(`SELECT * ${base} ORDER BY is_active DESC, price LIMIT ? OFFSET ?`)
		.all(...params, limit, offset);
	return { plans: rows, total, limit, offset, hasMore: offset + rows.length < total };
}

export function createPlan(ctx, body = {}) {
	assertManager(ctx);
	const name = String(body?.name || '')
		.trim()
		.slice(0, 100);
	const price = Number(body?.price);
	// Explicitly supplied-but-invalid input is rejected; only an OMITTED interval
	// falls back to the 30-day default (never silently coerce 0/"abc" to 30).
	const rawInterval = body?.intervalDays ?? body?.interval_days;
	const intervalDays = rawInterval == null || rawInterval === '' ? 30 : Number.parseInt(rawInterval, 10);
	const currency = String(body?.currency || 'SAR')
		.toUpperCase()
		.slice(0, 10);
	if (!name) throw new SubscriptionError('اسم الباقة مطلوب', 400);
	if (!Number.isFinite(price) || !(price > 0) || price > 1_000_000) {
		throw new SubscriptionError('سعر الباقة أكبر من صفر وأقل من 1,000,000', 400);
	}
	if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 3650) {
		throw new SubscriptionError('فترة التجديد بين 1 و3650 يومًا', 400);
	}
	const cur = db.prepare('SELECT code FROM currencies WHERE code=? AND is_active=1').get(currency);
	if (!cur) throw new SubscriptionError('عملة غير معروفة أو موقوفة', 400);

	const id = uuid();
	db.prepare(
		'INSERT INTO subscription_plans (id,tenant_id,name,name_ar,price,currency,interval_days,created_by) VALUES (?,?,?,?,?,?,?,?)',
	).run(
		id,
		ctx.tenantId || '',
		name,
		String(body?.nameAr || '').slice(0, 100),
		Math.round(price * 100) / 100,
		currency,
		intervalDays,
		ctx?.user?.username || 'system',
	);
	ctx?.audit?.('subscription.plan.create', { planId: id, name, price });
	recordTrail(trailCtx(ctx), {
		entity: 'SUBSCRIPTION_PLAN',
		entityId: id,
		action: 'CREATE',
		after: { name, price, intervalDays },
	});
	emit('subscription.plan_created', 'SUBSCRIPTION_PLAN', id, {
		name,
		price,
		currency,
		intervalDays,
	});
	return { id, name, price, currency, interval_days: intervalDays };
}

export function updatePlan(ctx, id, body = {}) {
	assertManager(ctx);
	const planId = String(id).slice(0, 64);
	const row = db.prepare('SELECT * FROM subscription_plans WHERE id=?').get(planId);
	if (!row) throw new SubscriptionError('الباقة غير موجودة', 404);
	assertRowTenant(row, ctx.tenantId);

	const sets = [];
	const params = [];
	if (body?.name != null) {
		sets.push('name=?');
		params.push(String(body.name).trim().slice(0, 100));
	}
	if (body?.nameAr != null) {
		sets.push('name_ar=?');
		params.push(String(body.nameAr).slice(0, 100));
	}
	if (body?.price != null) {
		const price = Number(body.price);
		if (!Number.isFinite(price) || !(price > 0) || price > 1_000_000) {
			throw new SubscriptionError('سعر غير صالح', 400);
		}
		sets.push('price=?');
		params.push(Math.round(price * 100) / 100);
	}
	if (body?.intervalDays != null) {
		const days = Number.parseInt(body.intervalDays, 10);
		if (!(days >= 1 && days <= 3650)) throw new SubscriptionError('فترة غير صالحة', 400);
		sets.push('interval_days=?');
		params.push(days);
	}
	if (body?.isActive != null) {
		sets.push('is_active=?');
		params.push(body.isActive === false ? 0 : 1);
	}
	if (!sets.length) throw new SubscriptionError('لا توجد حقول للتحديث', 400);

	sets.push("updated_at=datetime('now')");
	db.prepare(`UPDATE subscription_plans SET ${sets.join(',')} WHERE id=?`).run(...params, planId);
	ctx?.audit?.('subscription.plan.update', { planId });
	recordTrail(trailCtx(ctx), {
		entity: 'SUBSCRIPTION_PLAN',
		entityId: planId,
		action: 'UPDATE',
		after: body,
	});
	return { id: planId, updated: sets.length };
}

// ── Customer subscriptions ───────────────────────────────────────────────────

export function listSubscriptions(ctx, { status = '', customerId = '', limit = 50, offset = 0 } = {}) {
	const scope = tenantClauseFor(ctx.tenantId, 's');
	let base = `WHERE 1=1${scope.clause}`;
	const params = [...scope.params];
	if (status) {
		base += ' AND s.status=?';
		params.push(String(status).slice(0, 20));
	}
	if (customerId) {
		base += ' AND s.customer_id=?';
		params.push(String(customerId).slice(0, 64));
	}
	const total = db.prepare(`SELECT COUNT(*) as c FROM customer_subscriptions s ${base}`).get(...params)?.c || 0;
	const rows = db
		.prepare(
			`SELECT s.*, p.name AS plan_name, p.name_ar AS plan_name_ar, p.price, p.currency, p.interval_days, c.name AS customer_name
			 FROM customer_subscriptions s
			 JOIN subscription_plans p ON p.id = s.plan_id
			 JOIN customers c ON c.id = s.customer_id
			 ${base} ORDER BY s.next_billing_date LIMIT ? OFFSET ?`,
		)
		.all(...params, limit, offset);
	return { subscriptions: rows, total, limit, offset, hasMore: offset + rows.length < total };
}

export function subscribeCustomer(ctx, body = {}) {
	assertManager(ctx);
	const customerId = String(body?.customerId || '').slice(0, 64);
	const planId = String(body?.planId || '').slice(0, 64);
	const autoRenew = body?.autoRenew === false ? 0 : 1;
	const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.startDate || '')) ? String(body.startDate) : today();

	const plan = db.prepare('SELECT * FROM subscription_plans WHERE id=? AND is_active=1').get(planId);
	if (!plan) throw new SubscriptionError('الباقة غير موجودة أو موقوفة', 404);
	// A foreign plan must read as "not found", never as "forbidden".
	try {
		assertRowTenant(plan, ctx.tenantId);
	} catch {
		throw new SubscriptionError('الباقة غير موجودة', 404);
	}

	const customer = db.prepare('SELECT id, tenant_id FROM customers WHERE id=? AND is_active=1').get(customerId);
	if (!customer) throw new SubscriptionError('العميل غير موجود أو موقوف', 404);
	try {
		assertRowTenant(customer, ctx.tenantId);
	} catch {
		throw new SubscriptionError('العميل غير موجود', 404);
	}

	const dup = db
		.prepare(
			`SELECT id FROM customer_subscriptions WHERE customer_id=? AND plan_id=? AND status IN ('active','paused')`,
		)
		.get(customerId, planId);
	if (dup) {
		throw new SubscriptionError('العميل مشترك بالفعل في هذه الباقة', 409, {
			subscriptionId: dup.id,
		});
	}

	const id = uuid();
	const nextBillingDate = addDays(startDate, plan.interval_days);
	db.prepare(
		`INSERT INTO customer_subscriptions (id,tenant_id,customer_id,plan_id,status,start_date,next_billing_date,auto_renew) VALUES (?,?,?,?,'active',?,?,?)`,
	).run(id, ctx.tenantId || '', customerId, planId, startDate, nextBillingDate, autoRenew);
	ctx?.audit?.('subscription.subscribe', { subscriptionId: id, customerId, planId });
	recordTrail(trailCtx(ctx), {
		entity: 'SUBSCRIPTION',
		entityId: id,
		action: 'CREATE',
		after: { customerId, planId, startDate },
	});
	emit('subscription.created', 'SUBSCRIPTION', id, { customerId, planId, startDate });
	return { id, customerId, planId, startDate, nextBillingDate, autoRenew };
}

/**
 * A guarded status change.
 *
 * The `allowedFrom` list is the whole point: cancelling an already-cancelled
 * subscription is a 409, not a silent success, so a double-tap on the button
 * cannot rewrite history.
 */
export function transitionSubscription(ctx, id, { from = [], to, action = 'subscription.update' } = {}) {
	assertManager(ctx);
	const subId = String(id).slice(0, 64);
	const row = db.prepare('SELECT * FROM customer_subscriptions WHERE id=?').get(subId);
	if (!row) throw new SubscriptionError('الاشتراك غير موجود', 404);
	try {
		assertRowTenant(row, ctx.tenantId);
	} catch {
		throw new SubscriptionError('الاشتراك غير موجود', 404);
	}
	if (!from.includes(row.status)) {
		throw new SubscriptionError(`لا يمكن تنفيذ الإجراء من الحالة الحالية (${row.status})`, 409);
	}
	db.prepare(`UPDATE customer_subscriptions SET status=?,updated_at=datetime('now') WHERE id=?`).run(to, subId);
	ctx?.audit?.(action, { subscriptionId: subId, from: row.status, to });
	recordTrail(trailCtx(ctx), {
		entity: 'SUBSCRIPTION',
		entityId: subId,
		action: action.toUpperCase(),
		after: { status: to },
	});
	emit('subscription.status_changed', 'SUBSCRIPTION', subId, { from: row.status, to });
	return { id: subId, status: to };
}

/**
 * Billing run — bills every ACTIVE subscription whose next_billing_date <= date.
 *
 * auto_renew + sufficient wallet balance → wallet debit (canonical ledger).
 * Otherwise → a 'due' billing row for manual collection and the subscription
 * STAYS active. Nothing is silently skipped or faked.
 *
 * Idempotency is structural, not checked: every period is INSERTed under a
 * UNIQUE (subscription_id, period_start) index, so replaying a run date rolls
 * the transaction back and counts the row as `skipped` instead of charging
 * twice.
 */
export function runBilling(ctx, body = {}) {
	assertManager(ctx);
	const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.date || '')) ? String(body.date) : today();
	const scope = tenantClauseFor(ctx.tenantId, 's');
	const due = db
		.prepare(
			`SELECT s.*, p.price, p.currency, p.interval_days, c.wallet_balance
			 FROM customer_subscriptions s
			 JOIN subscription_plans p ON p.id = s.plan_id
			 JOIN customers c ON c.id = s.customer_id
			 WHERE s.status='active' AND s.next_billing_date <= ?${scope.clause}`,
		)
		.all(date, ...scope.params);

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
		// Consolidate every period that was already due and roll the schedule
		// past the run date, so one run bills one row per subscription and
		// replaying the same run date can never charge again.
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
				// 1) Period key first: a UNIQUE violation means this period is
				//    already settled — nothing is charged, transaction rolls back.
				db.prepare(
					'INSERT INTO subscription_billings (tenant_id,subscription_id,customer_id,amount,currency,method,period_start,periods_consolidated) VALUES (?,?,?,?,?,?,?,?)',
				).run(sub.tenant_id || '', sub.id, sub.customer_id, amount, sub.currency, 'due', periodStart, periods);
				// 2) Wallet auto-pay (canonical ledger) when the balance covers it all.
				if (Number(sub.auto_renew) === 1 && amount > 0 && balance >= amount - 0.005) {
					const bal = Math.round((balance - amount) * 100) / 100;
					db.prepare(`UPDATE customers SET wallet_balance=?,updated_at=datetime('now') WHERE id=?`).run(
						bal,
						sub.customer_id,
					);
					db.prepare(
						'INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)',
					).run(uuid(), sub.customer_id, 0, -amount, 'WALLET_DEBIT', 'SUBSCRIPTION', sub.id, 'فوترة اشتراك');
					db.prepare(
						'INSERT INTO wallet_transactions (id,customer_id,amount,direction,balance_after,reference_type,reference_id,note,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
					).run(
						uuid(),
						sub.customer_id,
						amount,
						'debit',
						bal,
						'SUBSCRIPTION',
						sub.id,
						'فوترة اشتراك',
						ctx?.user?.username || 'system',
					);
					db.prepare(`UPDATE subscription_billings SET method='wallet' WHERE subscription_id=? AND period_start=?`).run(
						sub.id,
						periodStart,
					);
					method = 'wallet';
				}
				db.prepare(
					`UPDATE customer_subscriptions SET next_billing_date=?, last_billed_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
				).run(nextDate, sub.id);
			})();
		} catch (error) {
			if (!/UNIQUE/i.test(String(error?.message))) throw error;
			skipped += 1; // already settled period — idempotent replay
			continue;
		}
		results.push({
			subscriptionId: sub.id,
			customerId: sub.customer_id,
			amount,
			currency: sub.currency,
			method,
			periodStart,
			periods,
			nextBillingDate: nextDate,
		});
	}

	if (results.length) {
		ctx?.audit?.('subscription.run_billing', { date, billed: results.length });
		recordTrail(trailCtx(ctx), {
			entity: 'SUBSCRIPTION',
			entityId: 'RUN',
			action: 'BILLING_RUN',
			after: { date, billed: results.length },
		});
		emit('subscription.billing_run', 'SUBSCRIPTION', 'RUN', { date, billed: results.length });
	}
	return {
		date,
		billed: results.length,
		wallet: results.filter((r) => r.method === 'wallet').length,
		due: results.filter((r) => r.method === 'due').length,
		skipped,
		results,
	};
}

// ── Report + statement ───────────────────────────────────────────────────────

/** Real aggregates over the subscription tables — never a counted placeholder. */
export function subscriptionReport(ctx) {
	const scope = tenantClauseFor(ctx.tenantId, 's');
	const counts = db
		.prepare(`SELECT s.status, COUNT(*) as c FROM customer_subscriptions s WHERE 1=1${scope.clause} GROUP BY s.status`)
		.all(...scope.params);
	const byStatus = Object.fromEntries(counts.map((r) => [r.status, r.c]));
	const mrrRows = db
		.prepare(
			`SELECT p.price, p.interval_days FROM customer_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
			 WHERE s.status='active'${scope.clause}`,
		)
		.all(...scope.params);
	const mrr =
		Math.round(
			mrrRows.reduce((sum, r) => sum + (Number(r.price) || 0) * (30 / Math.max(1, Number(r.interval_days) || 30)), 0) *
				100,
		) / 100;
	let dueTotal = 0;
	let dueCount = 0;
	try {
		const bScope = tenantClauseFor(ctx.tenantId, 'b');
		const due = db
			.prepare(
				`SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM subscription_billings b WHERE method='due'${bScope.clause}`,
			)
			.get(...bScope.params);
		dueCount = due?.c || 0;
		dueTotal = Math.round((Number(due?.t) || 0) * 100) / 100;
	} catch {
		/* pre-v18 DBs: tables missing */
	}
	return {
		byStatus: {
			active: byStatus.active || 0,
			paused: byStatus.paused || 0,
			cancelled: byStatus.cancelled || 0,
			expired: byStatus.expired || 0,
		},
		mrr,
		dueBillings: { count: dueCount, total: dueTotal },
	};
}

/** Billing statement for one customer. */
export function customerBillings(ctx, customerIdRaw, { limit = 50, offset = 0 } = {}) {
	const customerId = String(customerIdRaw).slice(0, 64);
	// Identity + tenant ownership are checked BEFORE the compute block so a
	// cross-tenant probe is a hard 404, never an empty 200.
	const cust = db.prepare('SELECT id, tenant_id FROM customers WHERE id=?').get(customerId);
	if (!cust) throw new SubscriptionError('العميل غير موجود', 404);
	assertRowTenant(cust, ctx.tenantId);

	const scope = tenantClauseFor(ctx.tenantId, 'b');
	let total = 0;
	let rows = [];
	try {
		total =
			db
				.prepare(`SELECT COUNT(*) as c FROM subscription_billings b WHERE b.customer_id=?${scope.clause}`)
				.get(customerId, ...scope.params)?.c || 0;
		rows = db
			.prepare(
				`SELECT * FROM subscription_billings b WHERE b.customer_id=?${scope.clause} ORDER BY b.billed_at DESC LIMIT ? OFFSET ?`,
			)
			.all(customerId, ...scope.params, limit, offset);
	} catch {
		/* pre-v18 DBs: tables missing → empty statement */
	}
	return { billings: rows, total, limit, offset, hasMore: offset + rows.length < total };
}
