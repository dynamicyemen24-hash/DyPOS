/**
 * DyPOS daily Z report — GET /api/invoices/reports/daily.
 *
 * Extracted from routes/invoices.js so the sale file keeps shrinking under its
 * ratchet cap: one endpoint, one module, no shared mutable state.
 *
 * Tenant isolation is enforced here, not in the caller: a tenant-bound user
 * sees only their own tenant's aggregates (spoofed/unknown tenant → 403/404
 * via resolveTenantFilter, never an unscoped cross-tenant total).
 */
import { Router } from 'express';
import db from '../db/schema.js';
import { dayRange } from '../lib/dates.js';
import { resolveTenantFilter } from '../lib/tenant.js';
import { ah, mapErrorStatus } from '../lib/async.js';

const router = Router();

// MUST mount before routes/invoices.js (its /:id would swallow "reports").
router.get(
	'/reports/daily',
	ah(async (req, res) => {
		const raw = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return res.status(400).json({ error: 'صيغة التاريخ غير صالحة (YYYY-MM-DD)' });
		const terminalId = req.query.terminal ? String(req.query.terminal).slice(0, 32) : null;
		let scopeTenant = null;
		try {
			scopeTenant = resolveTenantFilter(req).tenantId || req.user?.tenantId || null;
		} catch (e) {
			return res.status(mapErrorStatus(e)).json({ error: String(e.message).slice(0, 200) });
		}
		// Sargable range (index-seek on idx_invoices_created, not a date() full scan).
		const { from, to } = dayRange(raw);
		let sql = `SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as gross_sales, COALESCE(SUM(CASE WHEN status='RETURNED' THEN total ELSE 0 END),0) as refunds, COALESCE(SUM(discount_amount),0) as discounts, COALESCE(SUM(tax_amount),0) as tax_amount, COALESCE(SUM(paid_amount),0) as net_sales FROM invoices WHERE created_at>=? AND created_at<? AND status NOT IN ('EXPIRED')`;
		const params = [from, to];
		if (scopeTenant) {
			sql += ' AND tenant_id=?';
			params.push(scopeTenant);
		}
		if (terminalId) {
			sql += ' AND terminal_id=?';
			params.push(terminalId);
		}
		const stats = db.prepare(sql).get(...params);
		const payMethods = db
			.prepare(
				`SELECT p.method, COALESCE(SUM(p.amount),0) as total FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.created_at>=? AND i.created_at<? AND i.status NOT IN ('EXPIRED')${scopeTenant ? ' AND i.tenant_id=?' : ''} ${terminalId ? 'AND i.terminal_id=?' : ''} GROUP BY p.method`,
			)
			.all(
				...(scopeTenant || terminalId
					? [from, to, ...(scopeTenant ? [scopeTenant] : []), ...(terminalId ? [terminalId] : [])]
					: [from, to]),
			);
		return res.json({
			date: raw,
			...stats,
			payment_methods: Object.fromEntries(payMethods.map((p) => [p.method, p.total])),
		});
	}),
);

export default router;
