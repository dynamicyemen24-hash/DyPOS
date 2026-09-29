/**
 * Subscriptions — method-router verbs.
 *
 * Registered into `routes/method.js` so the POS (which uses the method bridge
 * exclusively per AGENTS.md invariant 9) can reach the engine. The domain logic
 * lives in `lib/subscriptions.js` and is shared with the REST layer — no
 * re-implementation, no drift.
 */
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { resolveTenantFilter, assertTenantScope } from '../lib/tenant.js';
import { recordTrail } from '../lib/trail.js';
import { emit } from '../lib/webhooks.js';
import {
	SubscriptionError,
	listPlans,
	createPlan,
	updatePlan,
	listSubscriptions,
	subscribeCustomer,
	transitionSubscription,
	runBilling,
	subscriptionReport,
	customerBillings,
} from '../lib/subscriptions.js';

/** Arabic user-facing strings live here so every verb speaks identically. */
const MESSAGES = {
	unauthorized: 'غير مصرح — تسجيل الدخول مطلوب',
	forbidden: 'صلاحية غير كافية',
	invalidTenant: 'نطاق المستأجر غير صالح',
};

/**
 * Register the subscription verbs on the method router.
 *
 * @param {(path: string, handler: Function) => void} def the router's registrar
 * @param {(req: any) => boolean} requireUser auth guard reused from the router
 */
export function registerSubscriptionVerbs(def, requireUser) {
	const canWrite = (req) => {
		const role = String(req?.user?.role || '');
		return role === 'ADMIN' || role === 'MANAGER';
	};

	/**
	 * Answer an error the way the rest of the router does.
	 *
	 * Mirrors `methodError` in `routes/method.js`: the HTTP status is part of
	 * the contract. Answering a refused tenant with `res.json(...)` and no
	 * status returns **200** with an error body, which every client that checks
	 * the status code reads as a successful — and empty — result. A silently
	 * empty balance sheet is exactly the failure this feature exists to prevent,
	 * so the refusal must be loud on both planes: the status AND the body.
	 */
	const methodError = (res, status, excType, message, extra = {}) =>
		res.status(status).json({ exc_type: excType, _error_message: message, message, ...extra });

	/** Read-plane tenant resolution; answers the error and returns null on refusal. */
	const readTenant = (req, res) => {
		try {
			return resolveTenantFilter(req).tenantId ?? '';
		} catch (error) {
			methodError(res, error?.statusCode || 403, 'PermissionError', error?.message || MESSAGES.invalidTenant);
			return null;
		}
	};

	/** Write-plane tenant resolution — `assertTenantScope` FAILS CLOSED. */
	const writeTenant = (req, res) => {
		try {
			return assertTenantScope(req).tenantId ?? '';
		} catch (error) {
			methodError(res, error?.statusCode || 403, 'PermissionError', error?.message || MESSAGES.invalidTenant);
			return null;
		}
	};

	/** Build the lib context from the method-router request object. */
	const ctxFromReq = (req, tenantId) => ({
		tenantId,
		user: req?.user,
		ip: req?.ip,
		audit: req?.audit,
	});

	// ── Plans ────────────────────────────────────────────────────────────────

	def('DyPOS.api.subscriptions.get_subscription_plans', (params, req, res) => {
		if (!requireUser(req, res)) return;
		const tenantId = readTenant(req, res);
		if (tenantId === null) return;
		try {
			const result = listPlans(ctxFromReq(req, tenantId), {
				active: params.active ?? params.active_filter,
				limit: params.limit,
				offset: params.offset,
			});
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});

	def('DyPOS.api.subscriptions.create_subscription_plan', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!canWrite(req)) {
			return methodError(res, 403, 'PermissionError', MESSAGES.forbidden);
		}
		const tenantId = writeTenant(req, res);
		if (tenantId === null) return;
		try {
			const result = createPlan(ctxFromReq(req, tenantId), params);
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});

	def('DyPOS.api.subscriptions.update_subscription_plan', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!canWrite(req)) {
			return methodError(res, 403, 'PermissionError', MESSAGES.forbidden);
		}
		const tenantId = writeTenant(req, res);
		if (tenantId === null) return;
		const id = String(params.id || params.name || '').slice(0, 64);
		if (!id) return methodError(res, 400, 'ValidationError', 'المعرّف مطلوب');
		try {
			const result = updatePlan(ctxFromReq(req, tenantId), id, params);
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});

	// ── Customer subscriptions ────────────────────────────────────────────────

	def('DyPOS.api.subscriptions.get_subscriptions', (params, req, res) => {
		if (!requireUser(req, res)) return;
		const tenantId = readTenant(req, res);
		if (tenantId === null) return;
		try {
			const result = listSubscriptions(ctxFromReq(req, tenantId), {
				status: params.status,
				customerId: params.customerId ?? params.customer_id,
				limit: params.limit,
				offset: params.offset,
			});
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});

	def('DyPOS.api.subscriptions.subscribe_customer', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!canWrite(req)) {
			return methodError(res, 403, 'PermissionError', MESSAGES.forbidden);
		}
		const tenantId = writeTenant(req, res);
		if (tenantId === null) return;
		try {
			const result = subscribeCustomer(ctxFromReq(req, tenantId), params);
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});

	def('DyPOS.api.subscriptions.pause_subscription', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!canWrite(req)) {
			return methodError(res, 403, 'PermissionError', MESSAGES.forbidden);
		}
		const tenantId = writeTenant(req, res);
		if (tenantId === null) return;
		const id = String(params.id || params.name || '').slice(0, 64);
		if (!id) return methodError(res, 400, 'ValidationError', 'المعرّف مطلوب');
		try {
			const result = transitionSubscription(ctxFromReq(req, tenantId), id, {
				from: ['active'],
				to: 'paused',
				action: 'subscription.pause',
			});
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});

	def('DyPOS.api.subscriptions.resume_subscription', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!canWrite(req)) {
			return methodError(res, 403, 'PermissionError', MESSAGES.forbidden);
		}
		const tenantId = writeTenant(req, res);
		if (tenantId === null) return;
		const id = String(params.id || params.name || '').slice(0, 64);
		if (!id) return methodError(res, 400, 'ValidationError', 'المعرّف مطلوب');
		try {
			const result = transitionSubscription(ctxFromReq(req, tenantId), id, {
				from: ['paused'],
				to: 'active',
				action: 'subscription.resume',
			});
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});

	def('DyPOS.api.subscriptions.cancel_subscription', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!canWrite(req)) {
			return methodError(res, 403, 'PermissionError', MESSAGES.forbidden);
		}
		const tenantId = writeTenant(req, res);
		if (tenantId === null) return;
		const id = String(params.id || params.name || '').slice(0, 64);
		if (!id) return methodError(res, 400, 'ValidationError', 'المعرّف مطلوب');
		try {
			const result = transitionSubscription(ctxFromReq(req, tenantId), id, {
				from: ['active', 'paused'],
				to: 'cancelled',
				action: 'subscription.cancel',
			});
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});

	// ── Billing run (ADMIN/MANAGER) ──────────────────────────────────────────

	def('DyPOS.api.subscriptions.run_billing', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!canWrite(req)) {
			return methodError(res, 403, 'PermissionError', MESSAGES.forbidden);
		}
		const tenantId = writeTenant(req, res);
		if (tenantId === null) return;
		try {
			const result = runBilling(ctxFromReq(req, tenantId), { date: params.date });
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});

	// ── Report + statement ───────────────────────────────────────────────────

	def('DyPOS.api.subscriptions.get_subscription_report', (params, req, res) => {
		if (!requireUser(req, res)) return;
		const tenantId = readTenant(req, res);
		if (tenantId === null) return;
		try {
			const result = subscriptionReport(ctxFromReq(req, tenantId));
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});

def('DyPOS.api.subscriptions.get_customer_billings', (params, req, res) => {
	if (!requireUser(req, res)) return;
	const tenantId = readTenant(req, res);
	if (tenantId === null) return;
	const customerId = String((params.customerId ?? params.customer_id) || '').slice(0, 64);
		if (!customerId) return methodError(res, 400, 'ValidationError', 'معرف العميل مطلوب');
		try {
			const result = customerBillings(ctxFromReq(req, tenantId), customerId, {
				limit: params.limit,
				offset: params.offset,
			});
			return res.json({ message: result });
		} catch (error) {
			if (error instanceof SubscriptionError) {
				return methodError(res, error.status, 'ValidationError', error.message, error.extra);
			}
			throw error;
		}
	});
}

export default registerSubscriptionVerbs;