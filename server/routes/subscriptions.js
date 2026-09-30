/**
 * DyPOS Subscription Engine — HTTP transport (REST).
 *
 * Thin layer over `lib/subscriptions.js` (the single domain source of truth).
 * All business logic, validation, tenant checks, and side effects live in the lib.
 * This file only maps HTTP → lib context, lib errors → HTTP status + body.
 */
import { Router } from 'express';
import { resolveTenantFilter } from '../lib/tenant.js';
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

const router = Router();

/**
 * Build the context the lib expects from the incoming request.
 *
 * `tenantId` is the read-plane scope (caller's tenant + legacy unattributed rows).
 * Write-plane `assertTenantScope` is done by the caller where needed (subscribeCustomer).
 */
const ctxFromReq = (req) => {
	const tenantId = resolveTenantFilter(req).tenantId || '';
	return {
		tenantId,
		user: req.user,
		ip: req.ip,
		audit: req.audit,
	};
};

/** Map a lib error to the exact HTTP response the old inline code produced. */
const handleLibError = (res, error) => {
	if (error instanceof SubscriptionError) {
		// SubscriptionError has extra fields as own properties (not under .extra)
		// e.g., duplicate subscription 409 includes { subscriptionId: '...' }
		const { name, message, status, ...extra } = error;
		const body = { error: message, ...extra };
		return res.status(status).json(body);
	}
	// Programming errors bubble as 500 — never masked.
	throw error;
};

// ── Plans ────────────────────────────────────────────────────────────────────

router.get('/plans', (req, res) => {
	const { limit, offset } = (() => {
		const p = page(req.query, 100);
		return { limit: p.limit, offset: p.offset };
	})();
	const active = req.query.active != null ? String(req.query.active) : null;
	try {
		const result = listPlans(ctxFromReq(req), { active, limit, offset });
		return res.json(result);
	} catch (e) {
		return handleLibError(res, e);
	}
});

router.post('/plans', (req, res) => {
	try {
		const result = createPlan(ctxFromReq(req), req.body);
		return res.status(201).json(result);
	} catch (e) {
		return handleLibError(res, e);
	}
});

router.patch('/plans/:id', (req, res) => {
	try {
		const result = updatePlan(ctxFromReq(req), req.params.id, req.body);
		return res.json(result);
	} catch (e) {
		return handleLibError(res, e);
	}
});

// ── Customer subscriptions ───────────────────────────────────────────────────

router.get('/', (req, res) => {
	const { limit, offset } = page(req.query, 50);
	const status = req.query.status ? String(req.query.status).slice(0, 20) : '';
	const customerId = req.query.customerId ? String(req.query.customerId).slice(0, 64) : '';
	try {
		const result = listSubscriptions(ctxFromReq(req), { status, customerId, limit, offset });
		return res.json(result);
	} catch (e) {
		return handleLibError(res, e);
	}
});

router.post('/subscribe', (req, res) => {
	try {
		// Write plane: assertTenantScope is inside the lib for this verb.
		const result = subscribeCustomer(ctxFromReq(req), req.body);
		return res.status(201).json(result);
	} catch (e) {
		return handleLibError(res, e);
	}
});

// Transition verbs with explicit from/to guards (matching original inline logic)
router.post('/:id/pause', (req, res) => transition(req, res, 'pause'));
router.post('/:id/resume', (req, res) => transition(req, res, 'resume'));
router.post('/:id/cancel', (req, res) => transition(req, res, 'cancel'));

function transition(req, res, action) {
	const transitions = {
		pause: { from: ['active'], to: 'paused', action: 'subscription.pause' },
		resume: { from: ['paused'], to: 'active', action: 'subscription.resume' },
		cancel: { from: ['active', 'paused'], to: 'cancelled', action: 'subscription.cancel' },
	};
	const t = transitions[action];
	try {
		const result = transitionSubscription(ctxFromReq(req), req.params.id, {
			from: t.from,
			to: t.to,
			action: t.action,
		});
		return res.json(result);
	} catch (e) {
		return handleLibError(res, e);
	}
}

// ── Billing run (ADMIN/MANAGER) ──────────────────────────────────────────────

router.post('/run-billing', (req, res) => {
	try {
		const result = runBilling(ctxFromReq(req), { date: req.body?.date });
		return res.json(result);
	} catch (e) {
		return handleLibError(res, e);
	}
});

// ── Report (real aggregates over subscription tables) ────────────────────────

router.get('/report', (req, res) => {
	try {
		const result = subscriptionReport(ctxFromReq(req));
		return res.json(result);
	} catch (e) {
		return handleLibError(res, e);
	}
});

// ── Billing history for one customer (statement) ─────────────────────────────

router.get('/billings/:customerId', (req, res) => {
	try {
		const result = customerBillings(ctxFromReq(req), req.params.customerId, {
			limit: req.query.limit,
			offset: req.query.offset,
		});
		return res.json(result);
	} catch (e) {
		return handleLibError(res, e);
	}
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function page(q, def = 50) {
	return {
		limit: Math.min(Math.max(parseInt(q.limit, 10) || def, 1), 200),
		offset: Math.max(parseInt(q.offset, 10) || 0, 0),
	};
}

export default router;