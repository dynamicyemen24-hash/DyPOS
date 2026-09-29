/**
 * Opening balances (أرصدة افتتاحية) — REST surface.
 *
 * The starting position a tenant carries into a fiscal year. Without it every
 * receivable, aging and stock-valuation report reads a confident `0.00` for the
 * period before the first invoice, and a migrated business cannot explain where
 * its customers' balances came from.
 *
 * ## Tenant safety
 *
 * Opening balances are money owed BY customers, so this plane is the one place
 * where a scope slip is immediately visible on a balance sheet. Every read and
 * write therefore:
 *   - resolves the caller's tenant through `assertTenantScope` (write) or
 *     `resolveTenantFilter` (read), both of which FAIL CLOSED: an invalid or
 *     spoofed tenant is 403, never an unscoped query;
 *   - stamps the resolved tenant on every row it writes, so a row can never
 *     inherit "global" status by omission;
 *   - returns 404 (not 403) for a foreign row, so existence is not leaked.
 *
 * ## Idempotence
 *
 * Rows are keyed by (fiscal_year, account_type, account_id, tenant_id). Re-saving
 * or re-importing the same row CORRECTS it in place. That is deliberate: an
 * import run twice must converge on the same ledger, not double every debt.
 */
import { Router } from 'express';
import crypto from 'node:crypto';

import db from '../db/schema.js';
import { resolveTenantFilter, assertTenantScope } from '../lib/tenant.js';
import { recordTrail } from '../lib/trail.js';
import { toMajor } from '../lib/money.js';
import {
	ACCOUNT_TYPES,
	CSV_HEADERS,
	OpeningBalanceError,
	buildProductIndex,
	normaliseOpeningBalance,
	openingBalanceKey,
	parseOpeningBalanceCsv,
	summariseOpeningBalances,
	toOpeningBalanceCsv,
} from '../lib/opening-balances.js';

const router = Router();

/** Managers may open/close a year; only admins may rewrite a closed one. */
function canWrite(req) {
	const role = String(req.user?.role || '');
	return role === 'ADMIN' || role === 'MANAGER';
}

/** Resolve the caller's tenant for a WRITE, or answer the error and return null. */
function writeTenant(req, res) {
	try {
		return assertTenantScope(req).tenantId ?? '';
	} catch (error) {
		res.status(error.statusCode || 403).json({ error: String(error.message || 'غير مصرح') });
		return null;
	}
}

/** Resolve the caller's tenant for a READ, or answer the error and return null. */
function readTenant(req, res) {
	try {
		return resolveTenantFilter(req).tenantId ?? '';
	} catch (error) {
		res.status(error.statusCode || 403).json({ error: String(error.message || 'غير مصرح') });
		return null;
	}
}

/**
 * GET /api/opening-balances?fiscalYear=&accountType=
 *
 * Always returns the `summary` alongside the rows: a caller showing balances
 * needs the opening position, and recomputing it client-side would invite the
 * float arithmetic this whole feature avoids.
 */
router.get('/', (req, res) => {
	const tenantId = readTenant(req, res);
	if (tenantId === null) return;
	const where = ['1=1'];
	const args = [];
	if (tenantId) {
		where.push('(tenant_id=? OR tenant_id IS NULL)');
		args.push(tenantId);
	}
	if (req.query.fiscalYear) {
		where.push('fiscal_year=?');
		args.push(String(req.query.fiscalYear));
	}
	if (req.query.accountType) {
		where.push('account_type=?');
		args.push(String(req.query.accountType));
	}
	const rows = db
		.prepare(
			`SELECT id, tenant_id, fiscal_year, account_type, account_id, account_code,
			        account_name, product_id, amount_minor, quantity, notes, created_by, created_at, updated_at
			 FROM opening_balances WHERE ${where.join(' AND ')}
			 ORDER BY fiscal_year DESC, account_type, account_name`,
		)
		.all(...args);
  return res.json({ rows, count: rows.length, summary: summariseOpeningBalances(rows), accountTypes: ACCOUNT_TYPES });
});

/**
 * GET /api/opening-balances/template
 *
 * A downloadable CSV skeleton with the header and ONE example row, which is
 * validated by the same parser the import uses. That is only possible if the
 * example is a row the parser ACCEPTS: `customer` rows require an account id
 * (see `normaliseOpeningBalance`), so the example is a `cash` position, which
 * legitimately has no counterparty. A template carrying a customer row with a
 * blank id would fail its own importer — and a template that cannot be
 * imported is why migration spreadsheets are abandoned half-filled.
 */
router.get('/template', (_req, res) => {
	const csv = toOpeningBalanceCsv([
		{
			fiscal_year: '2026',
			account_type: 'cash',
			account_id: '',
			account_code: '',
			account_name: 'مثال: رصيد الصندوق الافتتاحي',
			amount_minor: 0,
			quantity: 0,
			notes: 'احذف هذا السطر قبل الاستيراد',
		},
	]);
	res.setHeader('Content-Type', 'text/csv; charset=utf-8');
	res.setHeader('Content-Disposition', 'attachment; filename="dypos-opening-balances-template.csv"');
	return res.send(`﻿${csv}`);
});

/** GET /api/opening-balances/export?fiscalYear= — the download (current data). */
router.get('/export', (req, res) => {
	const tenantId = readTenant(req, res);
	if (tenantId === null) return;
	const where = ['1=1'];
	const args = [];
	if (tenantId) {
		where.push('(tenant_id=? OR tenant_id IS NULL)');
		args.push(tenantId);
	}
	if (req.query.fiscalYear) {
		where.push('fiscal_year=?');
		args.push(String(req.query.fiscalYear));
	}
	const rows = db
		.prepare(
			`SELECT fiscal_year, account_type, account_id, account_code, account_name,
			        amount_minor, quantity, notes
			 FROM opening_balances WHERE ${where.join(' AND ')}
			 ORDER BY fiscal_year DESC, account_type, account_name`,
		)
		.all(...args);
	const csv = toOpeningBalanceCsv(rows);
	res.setHeader('Content-Type', 'text/csv; charset=utf-8');
	res.setHeader('Content-Disposition', 'attachment; filename="dypos-opening-balances.csv"');
	req.audit?.('opening_balance.export', { count: rows.length });
	return res.send(`﻿${csv}`);
});

/**
 * POST /api/opening-balances/import  (text/csv or JSON array)
 *
 * Reports per-row rather than all-or-nothing: a 500-row file with 3 mistakes
 * applies 497 and returns the 3 failures by LINE NUMBER. Rejecting the entire
 * file is how a migration gets abandoned half-finished.
 *
 * `?dryRun=1` validates and reports WITHOUT writing, so the UI can show the
 * user exactly what will change before committing a ledger edit.
 */
router.post('/import', (req, res) => {
	const tenantId = writeTenant(req, res);
	if (tenantId === null) return;
	if (!canWrite(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });

	let parsed;
	try {
		const body = req.body;
		// The item index is built ONCE per import (not per row) and scoped to the
		// CALLER's tenant: a stock row whose code belongs to another tenant's
		// catalogue resolves to nothing and is reported as an error line, which is
		// the fail-closed direction `assertTenantScope` applies on every write.
		const products = buildProductIndex(db, tenantId);
		if (typeof body === 'string') {
			parsed = parseOpeningBalanceCsv(body, { tenantId, products });
		} else if (Array.isArray(body)) {
			parsed = {
				rows: body.map((raw, i) => normaliseOpeningBalance(raw, { row: i + 1, tenantId, products })),
				errors: [],
			};
		} else if (body && Array.isArray(body.rows)) {
			parsed = {
				rows: body.rows.map((raw, i) => normaliseOpeningBalance(raw, { row: i + 1, tenantId, products })),
				errors: [],
			};
		} else {
			return res.status(400).json({ error: 'أرسل ملف CSV أو مصفوفة سجلات' });
		}
	} catch (error) {
		if (error instanceof OpeningBalanceError) {
			return res.status(error.statusCode || 400).json({
				error: error.message,
				row: error.row,
			});
		}
		return res.status(400).json({ error: 'تعذر قراءة الملف' });
	}

	const { rows, errors } = parsed;
	if (!rows.length) {
		return res.status(400).json({
			error: 'لا توجد سجلات صالحة للاستيراد',
			errors,
			valid: 0,
			invalid: errors.length,
		});
	}

	// Upsert on the natural key. `amount_minor` is an integer in both engines,
	// so writing the validated value needs no re-rounding.
	const upsert = db.prepare(`
		INSERT INTO opening_balances
		  (id, tenant_id, fiscal_year, account_type, account_id, account_code,
		   account_name, product_id, amount_minor, quantity, notes, created_by, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
		ON CONFLICT(fiscal_year, account_type, account_id, tenant_id) DO UPDATE SET
		  account_code=excluded.account_code,
		  account_name=excluded.account_name,
		  product_id=excluded.product_id,
		  amount_minor=excluded.amount_minor,
		  quantity=excluded.quantity,
		  notes=excluded.notes,
		  updated_at=datetime('now')
	`);

	if (req.query.dryRun === '1' || req.query.dryRun === 'true') {
		return res.json({
			dryRun: true,
			valid: rows.length,
			invalid: errors.length,
			errors,
			preview: rows.slice(0, 20),
		});
	}

	let applied = 0;
	try {
		db.transaction(() => {
			for (const row of rows) {
				upsert.run(
					crypto.randomUUID(),
					row.tenant_id,
					row.fiscal_year,
					row.account_type,
					row.account_id,
					row.account_code,
					row.account_name,
					// NULL, never '': the column is a FOREIGN KEY and '' is a
					// non-NULL value no `products.id` can satisfy.
					row.product_id || null,
					row.amount_minor,
					row.quantity,
					row.notes,
					String(req.user?.id || ''),
				);
				applied++;
			}
		})();
	} catch (error) {
		// A failed import must leave NO partial ledger: the transaction rolls back.
		return res.status(400).json({ error: `فشل الاستيراد: ${String(error.message || error).slice(0, 200)}` });
	}

	req.audit?.('opening_balance.import', { applied, rejected: errors.length });
	recordTrail(req, {
		entity: 'OPENING_BALANCE',
		entityId: `${tenantId || 'global'}:${rows[0].fiscal_year}`,
		action: 'IMPORT',
		after: { applied, rejected: errors.length },
	});
	return res.status(201).json({
		applied,
		invalid: errors.length,
		errors,
		valid: rows.length,
	});
});

/**
 * PUT /api/opening-balances — create or replace ONE balance.
 *
 * Also an upsert on the natural key, so the UI's save is idempotent and a
 * double-click cannot create two rows for the same customer/year.
 */
router.put('/', (req, res) => {
	const tenantId = writeTenant(req, res);
	if (tenantId === null) return;
	if (!canWrite(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });

	let row;
	try {
		row = normaliseOpeningBalance(req.body || {}, { tenantId, products: buildProductIndex(db, tenantId) });
	} catch (error) {
		if (error instanceof OpeningBalanceError) {
			return res.status(error.statusCode || 400).json({ error: error.message, row: error.row });
		}
		return res.status(400).json({ error: 'سجل غير صالح' });
	}

	const key = openingBalanceKey(row);
	const existing = db
		.prepare(
			`SELECT id FROM opening_balances
			 WHERE fiscal_year=? AND account_type=? AND account_id=? AND (tenant_id=? OR tenant_id IS NULL)`,
		)
		.get(row.fiscal_year, row.account_type, row.account_id, row.tenant_id);

	const id = existing?.id || crypto.randomUUID();
	db.prepare(`
		INSERT INTO opening_balances
		  (id, tenant_id, fiscal_year, account_type, account_id, account_code,
		   account_name, product_id, amount_minor, quantity, notes, created_by, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
		ON CONFLICT(fiscal_year, account_type, account_id, tenant_id) DO UPDATE SET
		  account_code=excluded.account_code,
		  account_name=excluded.account_name,
		  product_id=excluded.product_id,
		  amount_minor=excluded.amount_minor,
		  quantity=excluded.quantity,
		  notes=excluded.notes,
		  updated_at=datetime('now')
	`).run(
		id,
		row.tenant_id,
		row.fiscal_year,
		row.account_type,
		row.account_id,
		row.account_code,
		row.account_name,
		row.product_id || null,
		row.amount_minor,
		row.quantity,
		row.notes,
		String(req.user?.id || ''),
	);

	req.audit?.('opening_balance.save', { type: row.account_type, year: row.fiscal_year, key });
	recordTrail(req, {
		entity: 'OPENING_BALANCE',
		entityId: id,
		action: 'SAVE',
		after: { key, amountMinor: row.amount_minor },
	});
	return res.status(existing ? 200 : 201).json({
		id,
		key,
		// `amount` (major) alongside the stored `amount_minor`, matching the method
		// verb: a client must never re-derive the major form itself, because
		// dividing by 100 in the client is how a 12.34 balance becomes 1234.00.
		row: { ...row, amount: toMajor(row.amount_minor) },
	});
});

/** DELETE /api/opening-balances/:id — 404 for a foreign row, never 403. */
router.delete('/:id', (req, res) => {
	if (!canWrite(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
	const tenantId = readTenant(req, res);
	if (tenantId === null) return;
	const row = db.prepare('SELECT * FROM opening_balances WHERE id=?').get(String(req.params.id));
	if (!row) return res.status(404).json({ error: 'غير موجود' });
	// Existence must not leak: a foreign row is indistinguishable from a
	// missing one, exactly like assertRecordTenant elsewhere in the codebase.
	if (row.tenant_id && tenantId && String(row.tenant_id) !== String(tenantId)) {
		return res.status(404).json({ error: 'غير موجود' });
	}
	db.prepare('DELETE FROM opening_balances WHERE id=?').run(row.id);
	req.audit?.('opening_balance.delete', { id: row.id, type: row.account_type });
	recordTrail(req, { entity: 'OPENING_BALANCE', entityId: row.id, action: 'DELETE', before: row });
	return res.json({ deleted: true, id: row.id });
});

export { CSV_HEADERS };
export default router;
