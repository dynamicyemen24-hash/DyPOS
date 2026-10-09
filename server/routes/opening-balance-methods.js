/**
 * Opening balances — method-router verbs.
 *
 * Registered into `routes/method.js` rather than written inline so the 4,001-line
 * method router does not grow: AGENTS.md invariant 11 caps that file, and a new
 * feature belongs in a module the cap will never object to.
 *
 * ## Why the POS needs verbs and not just REST
 *
 * Invariant 9 forbids desk globals, and the POS reaches the server exclusively
 * through `methodClient`. A screen that wanted to read opening balances with
 * `fetch('/api/opening-balances')` would bypass the provenance contract
 * (`server | local | unavailable`) that every dashboard depends on — and would
 * silently break offline, which invariant 8 forbids.
 *
 * ## Money
 *
 * Amounts are INTEGER MINOR UNITS everywhere on this path. `amount` (major) is
 * accepted from a human-facing form and converted once, here; `amount_minor` is
 * returned untouched so the client formats with the same `toMajor` rule.
 */
import crypto from 'node:crypto';

import db from '../db/schema.js';
import { toMinor, toMajor } from '../lib/money.js';
import { resolveTenantFilter, assertTenantScope } from '../lib/tenant.js';
import { recordTrail } from '../lib/trail.js';
import {
	ACCOUNT_TYPES,
	ACCOUNT_TYPE_LABELS,
	OpeningBalanceError,
	buildProductIndex,
	normaliseOpeningBalance,
	openingBalanceKey,
	parseOpeningBalanceCsv,
	summariseOpeningBalances,
	toOpeningBalanceCsv,
} from '../lib/opening-balances.js';

/** Arabic user-facing strings live here so every verb speaks identically. */
const MESSAGES = {
	unauthorized: 'غير مصرح — تسجيل الدخول مطلوب',
	forbidden: 'صلاحية غير كافية',
	invalidTenant: 'نطاق المستأجر غير صالح',
};

/**
 * Register the opening-balance verbs on the method router.
 *
 * @param {(path: string, handler: Function) => void} def the router's registrar
 * @param {(req: any) => boolean} requireUser auth guard reused from the router
 */
export function registerOpeningBalanceVerbs(def, requireUser) {
	const canWrite = (req) => {
		const role = String(req?.user?.role || '');
		return role === 'ADMIN' || role === 'MANAGER';
	};

	/**
	 * Answer an error the way the rest of the router does.
	 *
	 * Mirrors `methodError` in `routes/method.js`: the HTTP status is part of the
	 * contract. Answering a refused tenant with `res.json(...)` and no status
	 * returns **200** with an error body, which every client that checks the
	 * status code reads as a successful — and empty — result. A silently empty
	 * balance sheet is exactly the failure this feature exists to prevent, so the
	 * refusal must be loud on both planes: the status AND the body.
	 */
	const methodError = (res, status, excType, message) =>
		res.status(status).json({ exc_type: excType, _error_message: message, message });

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

	const selectRows = (tenantId, { fiscalYear = '', accountType = '', includeVoided = false } = {}) => {
		const where = ['1=1'];
		const args = [];
		if (tenantId) {
			where.push('(tenant_id=? OR tenant_id IS NULL)');
			args.push(tenantId);
		}
		if (fiscalYear) {
			where.push('fiscal_year=?');
			args.push(String(fiscalYear));
		}
		if (accountType) {
			where.push('account_type=?');
			args.push(String(accountType));
		}
		// Voided rows leave every default read surface; supervisors opt back
		// in explicitly (the REST plane mirrors this with ?includeVoided=1).
		if (!includeVoided) {
			where.push("status='POSTED'");
		}
		return db
			.prepare(
				`SELECT id, tenant_id, fiscal_year, account_type, account_id, account_code,
				        account_name, product_id, amount_minor, quantity, notes, created_at, updated_at,
				        status, voided_at, voided_by, void_reason
				 FROM opening_balances WHERE ${where.join(' AND ')}
				 ORDER BY fiscal_year DESC, account_type, account_name`,
			)
			.all(...args);
	};

	/**
	 * The upsert, prepared LAZILY on first use.
	 *
	 * Preparing it at module scope would run `db.prepare` while `routes/method.js`
	 * is still being imported — which happens BEFORE `migrate()` has created the
	 * table, so every test that imports the app would die with
	 * "no such table: opening_balances". The statement is cached after the first
	 * call, so this costs one lookup, not one per row.
	 */
	let upsertStmt = null;
	const upsert = (...args) => {
		if (!upsertStmt) {
			upsertStmt = db.prepare(`
		INSERT INTO opening_balances
		  (id, tenant_id, fiscal_year, account_type, account_id, account_code,
		   account_name, product_id, amount_minor, quantity, notes, created_by, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
		ON CONFLICT(fiscal_year, account_type, account_id, account_code, tenant_id) DO UPDATE SET
		  account_code=excluded.account_code,
		  account_name=excluded.account_name,
		  product_id=excluded.product_id,
		  amount_minor=excluded.amount_minor,
		  quantity=excluded.quantity,
		  notes=excluded.notes,
		  status='POSTED',
		  voided_at=NULL,
		  voided_by=NULL,
		  void_reason=NULL,
		  updated_at=datetime('now')
	  `);
		}
		return upsertStmt.run(...args);
	};

	/** List balances, with the opening position summarised for the header strip. */
	def('DyPOS.api.opening_balances.get_opening_balances', (params, req, res) => {
		if (!requireUser(req, res)) return;
		const tenantId = readTenant(req, res);
		if (tenantId === null) return;
		const rows = selectRows(tenantId, {
			fiscalYear: params.fiscalYear || params.fiscal_year || '',
			accountType: params.accountType || params.account_type || '',
			includeVoided: ['1', 'true', 'yes'].includes(
				String(params.includeVoided ?? params.include_voided ?? '').toLowerCase(),
			),
		});
		return res.json({
			message: {
				rows: rows.map((r) => ({ ...r, amount: toMajor(r.amount_minor) })),
				count: rows.length,
				summary: summariseOpeningBalances(rows),
				accountTypes: ACCOUNT_TYPES,
				accountTypeLabels: ACCOUNT_TYPE_LABELS,
			},
		});
	});

	/**
	 * Save one balance.
	 *
	 * Accepts `amount` (major units, from a form) OR `amount_minor` (already
	 * converted, from the grid). Mixing them silently is the classic 100×
	 * ledger error, so `normaliseOpeningBalance` picks exactly one.
	 */
	def('DyPOS.api.opening_balances.save_opening_balance', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!canWrite(req)) {
			return methodError(res, 403, 'PermissionError', MESSAGES.forbidden);
		}
		const tenantId = writeTenant(req, res);
		if (tenantId === null) return;

		let row;
		try {
			// The form sends major units; convert here, once.
			//
			// A BLANK amount must be left for the validator to reject. `Number('')`
			// is 0, so converting unconditionally would turn an empty form field
			// into a real 0.00 opening balance — the "confident zero" this whole
			// feature exists to eliminate. `parseAmountMinor` deliberately refuses
			// blanks; this line must not hand it a number before it gets the chance.
			const payload = { ...params };
			const major = payload.amount;
			const blank = major === undefined || major === null || String(major).trim() === '';
			if (!blank && payload.amountMinor === undefined) {
				payload.amountMinor = toMinor(Number(major));
			}
			delete payload.amount;
			row = normaliseOpeningBalance(payload, {
				tenantId,
				products: buildProductIndex(db, tenantId),
			});
		} catch (error) {
			if (error instanceof OpeningBalanceError) {
				return res.json({
					exc_type: 'ValidationError',
					_error_message: error.message,
					message: error.message,
					row: error.row,
				});
			}
			return res.json({
				exc_type: 'ValidationError',
				_error_message: 'سجل غير صالح',
				message: 'سجل غير صالح',
			});
		}

		const key = openingBalanceKey(row);
		const existing = db
			.prepare(
				`SELECT id FROM opening_balances
				 WHERE fiscal_year=? AND account_type=? AND account_id=? AND (tenant_id=? OR tenant_id IS NULL)`,
			)
			.get(row.fiscal_year, row.account_type, row.account_id, row.tenant_id);
		const id = existing?.id || crypto.randomUUID();

		db.transaction(() => {
			upsert(
				id,
				row.tenant_id,
				row.fiscal_year,
				row.account_type,
				row.account_id,
				row.account_code,
				row.account_name,
				// NULL, never '': the column is a FOREIGN KEY and '' is a non-NULL
				// value no `products.id` can satisfy.
				row.product_id || null,
				row.amount_minor,
				row.quantity,
				row.notes,
				String(req.user?.id || ''),
			);
		})();

		req.audit?.('opening_balance.save', { type: row.account_type, year: row.fiscal_year, key });
		return res.json({
			message: {
				id,
				key,
				created: !existing,
				row: { ...row, amount: toMajor(row.amount_minor) },
			},
		});
	});

	/**
	 * Void one balance — retire, never destroy.
	 *
	 * An opening position is the baseline every later figure is measured
	 * against, so the row stays with status='VOIDED' + who/when/why. Lists read
	 * POSTED by default; supervisors keep the register through includeVoided
	 * and the audit trail. A foreign row answers 404 (NotFoundError), never
	 * 403: existence must not leak, which is the same rule assertRecordTenant
	 * applies everywhere else.
	 */
	def('DyPOS.api.opening_balances.delete_opening_balance', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!canWrite(req)) {
			return methodError(res, 403, 'PermissionError', MESSAGES.forbidden);
		}
		const id = String(params.id || params.name || params.account_id || '').trim();
		if (!id) {
			return methodError(res, 400, 'ValidationError', 'المعرّف مطلوب');
		}
		const row = db.prepare('SELECT * FROM opening_balances WHERE id=?').get(id);
		if (!row) {
			return methodError(res, 404, 'NotFoundError', 'غير موجود');
		}
		try {
			const { tenantId } = resolveTenantFilter(req);
			if (row.tenant_id && tenantId && String(row.tenant_id) !== String(tenantId)) {
				return methodError(res, 404, 'NotFoundError', 'غير موجود');
			}
		} catch (error) {
			return methodError(res, error?.statusCode || 403, 'PermissionError', error?.message || MESSAGES.invalidTenant);
		}
		if (row.status === 'VOIDED') return res.json({ message: { deleted: true, id } });
		const reason = String(params.reason || '')
			.trim()
			.slice(0, 500);
		db.prepare(
			"UPDATE opening_balances SET status='VOIDED',voided_at=datetime('now'),voided_by=?,void_reason=?,updated_at=datetime('now') WHERE id=?",
		).run(String(req.user?.username || ''), reason, id);
		req.audit?.('opening_balance.delete', { id, type: row.account_type });
		recordTrail(req, { entity: 'OPENING_BALANCE', entityId: id, action: 'VOID', before: row });
		return res.json({ message: { deleted: true, id } });
	});

	/**
	 * Import balances from a CSV body.
	 *
	 * Reports per row instead of all-or-nothing: a file with three mistakes
	 * applies the rest and returns those three by LINE NUMBER. A dry run
	 * validates with no write, so the UI can show what will change first.
	 */
	def('DyPOS.api.opening_balances.import_opening_balances', (params, req, res) => {
		if (!requireUser(req, res)) return;
		if (!canWrite(req)) {
			return methodError(res, 403, 'PermissionError', MESSAGES.forbidden);
		}
		const tenantId = writeTenant(req, res);
		if (tenantId === null) return;

		let parsed;
		try {
			const source = params.csv ?? params.data ?? params.content ?? '';
			// One tenant-scoped item index per import: a stock row is linked to its
			// item, and a code that is missing (or belongs to another tenant) is
			// reported by LINE NUMBER instead of importing an unlinked movement.
			const products = buildProductIndex(db, tenantId);
			parsed = Array.isArray(params.rows)
				? {
						rows: params.rows.map((r, i) => normaliseOpeningBalance(r, { row: i + 1, tenantId, products })),
						errors: [],
					}
				: parseOpeningBalanceCsv(source, { tenantId, products });
		} catch (error) {
			if (error instanceof OpeningBalanceError) {
				return res.json({
					exc_type: 'ValidationError',
					_error_message: error.message,
					message: error.message,
					row: error.row,
				});
			}
			return res.json({
				exc_type: 'ValidationError',
				_error_message: 'تعذر قراءة الملف',
				message: 'تعذر قراءة الملف',
			});
		}

		const { rows, errors } = parsed;
		if (!rows.length) {
			return res.json({
				exc_type: 'ValidationError',
				_error_message: 'لا توجد سجلات صالحة للاستيراد',
				message: { valid: 0, invalid: errors.length, errors },
			});
		}

		if (params.dryRun === 1 || params.dryRun === '1' || params.dryRun === true) {
			return res.json({
				message: {
					dryRun: true,
					valid: rows.length,
					invalid: errors.length,
					errors,
					preview: rows.slice(0, 20).map((r) => ({ ...r, amount: toMajor(r.amount_minor) })),
				},
			});
		}

		let applied = 0;
		try {
			db.transaction(() => {
				for (const row of rows) {
					upsert(
						crypto.randomUUID(),
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
					applied++;
				}
			})();
		} catch (error) {
			return res.json({
				exc_type: 'ValidationError',
				_error_message: `فشل الاستيراد: ${String(error?.message || error).slice(0, 200)}`,
				message: 'فشل الاستيراد',
			});
		}

		req.audit?.('opening_balance.import', { applied, rejected: errors.length });
		return res.json({ message: { applied, invalid: errors.length, errors, valid: rows.length } });
	});

	/**
	 * Export the current balances as CSV.
	 *
	 * Returns the CSV as a STRING rather than setting a download header: this is
	 * a method verb, so the POS receives text and triggers the browser download
	 * itself. Amounts are written in MAJOR units — a file exporting halalas would
	 * be re-imported 100× too large.
	 */
	def('DyPOS.api.opening_balances.export_opening_balances', (params, req, res) => {
		if (!requireUser(req, res)) return;
		const tenantId = readTenant(req, res);
		if (tenantId === null) return;
		const rows = selectRows(tenantId, {
			fiscalYear: params.fiscalYear || params.fiscal_year || '',
			accountType: params.accountType || params.account_type || '',
		});
		req.audit?.('opening_balance.export', { count: rows.length });
		return res.json({
			message: {
				csv: toOpeningBalanceCsv(rows),
				count: rows.length,
				filename: 'dypos-opening-balances.csv',
			},
		});
	});

	/**
	 * The blank template an importer starts from.
	 *
	 * It round-trips through the SAME parser the import uses, so a file that
	 * validates against the template cannot fail on import for a formatting
	 * reason — the difference between a template people use and one they abandon.
	 */
	def('DyPOS.api.opening_balances.opening_balance_template', (_params, req, res) => {
		if (!requireUser(req, res)) return;
		return res.json({
			message: {
				csv: toOpeningBalanceCsv([
					{
						fiscal_year: '2026',
						// A `cash` row, not `customer`: customer balances REQUIRE an
						// account id, so a customer example would fail the very parser
						// the template promises the file will satisfy.
						account_type: 'cash',
						account_id: '',
						account_code: '',
						account_name: 'مثال: رصيد الصندوق الافتتاحي',
						amount_minor: 0,
						quantity: 0,
						notes: 'احذف هذا السطر قبل الاستيراد',
					},
				]),
				filename: 'dypos-opening-balances-template.csv',
				accountTypes: ACCOUNT_TYPES,
				accountTypeLabels: ACCOUNT_TYPE_LABELS,
			},
		});
	});
}

export default registerOpeningBalanceVerbs;
