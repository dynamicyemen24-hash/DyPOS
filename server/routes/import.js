import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { requireRole } from '../middleware/auth.js';
import { parseCsv } from '../lib/csv.js';
import { assertTenantScope } from '../lib/tenant.js';
import { normalizeLegacyInvoice, parseLegacyInvoicesCsv } from '../lib/legacy-invoices.js';
import { commitLegacyInvoices } from '../lib/legacy-invoice-commit.js';

const router = Router();
router.use(requireRole('ADMIN', 'MANAGER'));

const MAX_ROWS = 2000;

function num(v, def = 0) {
	const n = Number(v);
	return Number.isFinite(n) ? n : def;
}
function str(v, max) {
	return String(v ?? '')
		.trim()
		.slice(0, max);
}

/** Normalize body → row objects (JSON array or CSV text). */
function readRows(req) {
	const ct = String(req.headers['content-type'] || '');
	if (ct.includes('text/csv') || typeof req.body === 'string') {
		if (!req.body || !String(req.body).trim()) throw Object.assign(new Error('ملف CSV فارغ'), { statusCode: 400 });
		return parseCsv(String(req.body), { maxRows: MAX_ROWS }).rows;
	}
	if (!Array.isArray(req.body)) throw Object.assign(new Error('أرسل مصفوفة JSON أو text/csv'), { statusCode: 400 });
	if (!req.body.length) throw Object.assign(new Error('لا توجد صفوف'), { statusCode: 400 });
	if (req.body.length > MAX_ROWS) throw Object.assign(new Error(`تجاوز الحد (${MAX_ROWS} صف)`), { statusCode: 400 });
	return req.body;
}

function normRow(r) {
	// Accept both API names (unitPrice) and CSV headers (unit_price)
	const o = {};
	for (const [k, v] of Object.entries(r)) o[k] = typeof v === 'string' ? v.trim() : v;
	return {
		code: str(o.code, 64),
		name: str(o.name, 200),
		nameAr: str(o.nameAr || o.name_ar, 200),
		barcode: str(o.barcode, 64),
		unitPrice: o.unitPrice ?? o.unit_price,
		cost: o.cost ?? 0,
		taxRate: o.taxRate ?? o.tax_rate ?? 15,
		uom: str(o.uom || 'Unit', 20),
		category: str(o.category, 64),
		brand: str(o.brand, 64),
		phone: str(o.phone, 32),
		email: str(o.email, 128),
		taxNumber: str(o.taxNumber || o.tax_number, 64),
		loyaltyTier: str(o.loyaltyTier || o.loyalty_tier || 'BRONZE', 20),
		creditLimit: o.creditLimit ?? o.credit_limit ?? 0,
		productCode: str(o.productCode || o.product_code, 64),
		productId: str(o.productId || o.product_id, 64),
		warehouseId: str(o.warehouseId || o.warehouse_id || 'W-01', 32),
		qty: o.qty ?? 0,
		id: str(o.id, 64),
	};
}

const validators = {
	products: (r) => {
		const e = [];
		if (!r.code) e.push('code مطلوب');
		if (!r.name) e.push('name مطلوب');
		if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) e.push('email غير صالح');
		if (num(r.unitPrice) < 0 || num(r.unitPrice) > 1_000_000) e.push('unitPrice خارج الحد');
		if (num(r.taxRate) < 0 || num(r.taxRate) > 100) e.push('taxRate خارج الحد');
		return e;
	},
	customers: (r) => {
		const e = [];
		if (!r.name) e.push('name مطلوب');
		if (r.phone && !/^[+\d][\d\s-]{5,30}$/.test(r.phone)) e.push('phone غير صالح');
		if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) e.push('email غير صالح');
		return e;
	},
	stock: (r) => {
		const e = [];
		if (!r.productCode && !r.productId) e.push('productCode أو productId مطلوب');
		if (!Number.isFinite(Number(r.qty)) || Math.abs(Number(r.qty)) > 1_000_000) e.push('qty غير صالحة');
		return e;
	},
	/**
	 * A legacy invoice is validated by `lib/legacy-invoices.js`, not here.
	 *
	 * The reason is structural: its rules are the money rule and the
	 * header-vs-lines reconciliation, both of which need the parsed lines. A
	 * field check over a flattened row would pass a file whose totals disagree
	 * with its lines — the exact corruption this import exists to prevent — and
	 * would be a second implementation of the tax rule free to drift. The entry
	 * is here only so the entity is recognised and reaches its own validator.
	 */
	legacyInvoices: () => [],
};

/**
 * Persistent writes are stamped with the caller's tenant (assertTenantScope
 * validates existence + the cross-tenant spoof guard). A scoped import can never
 * overwrite another tenant's records: same-code products / same-phone customers
 * owned by another tenant fail with 403/404 instead of mutating them.
 */
function commit(entity, rows, tenantId) {
	return db.transaction(() => {
		let created = 0;
		let updated = 0;
		if (entity === 'products') {
			/*
			 * The upsert target MUST match a real unique index.
			 *
			 * v36 narrowed uniqueness from `code` to `(tenant_id, code)`, and SQLite
			 * resolves `ON CONFLICT(target)` against the index columns EXACTLY — a
			 * target of `code` alone no longer matches anything, so every product
			 * import died with «ON CONFLICT clause does not match any PRIMARY KEY or
			 * UNIQUE constraint» (400). The upsert was written against the schema as
			 * it was before the migration, so the schema change and the query it
			 * belonged to had to move together.
			 *
			 * NULL tenants need their own branch: SQLite treats NULLs as DISTINCT
			 * inside a unique index, so `ON CONFLICT(tenant_id, code)` can never fire
			 * for an unbound (legacy) user — an upsert would silently insert a second
			 * row instead of updating. Those callers take the explicit SELECT-then-
			 * UPDATE path, which keeps the documented legacy passthrough honest
			 * instead of relying on an index that cannot apply.
			 */
			const insert =
				db.prepare(`INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,category,brand,is_active,tenant_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)`);

			const setCols = `name=excluded.name,name_ar=excluded.name_ar,barcode=excluded.barcode,
				unit_price=excluded.unit_price,cost=excluded.cost,tax_rate=excluded.tax_rate,
				uom=excluded.uom,category=excluded.category,brand=excluded.brand,
				is_active=1,tenant_id=excluded.tenant_id,updated_at=datetime('now')`;

			const upsertScoped = db.prepare(
				`INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,category,brand,is_active,tenant_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(tenant_id,code) DO UPDATE SET ${setCols}`,
			);

			// Scoped by tenant: an unscoped `WHERE code=?` would report another
			// tenant's product as "existing" and then mutate it (invariant 1).
			const existedScoped = db.prepare('SELECT id FROM products WHERE code=? AND tenant_id=?');
			const existedLegacy = db.prepare('SELECT id, tenant_id FROM products WHERE code=? AND tenant_id IS NULL');
			const updateById = db.prepare(
				`UPDATE products SET code=?,name=?,name_ar=?,barcode=?,unit_price=?,cost=?,
					tax_rate=?,uom=?,category=?,brand=?,is_active=1,updated_at=datetime('now')
				 WHERE id=?`,
			);

			for (const r of rows) {
				const args = [
					r.code,
					r.name,
					r.nameAr || '',
					r.barcode || null,
					num(r.unitPrice),
					num(r.cost),
					num(r.taxRate, 15),
					r.uom,
					r.category || '',
					r.brand || '',
				];

				if (!tenantId) {
					// Unbound/legacy caller: no scoped index applies, so the match is
					// resolved explicitly and written by id.
					const hit = existedLegacy.get(r.code);
					if (hit) {
						updateById.run(...args, hit.id);
						updated++;
					} else {
						insert.run(uuid(), ...args, null);
						created++;
					}
					continue;
				}

				if (!existedScoped.get(r.code, tenantId)) created++;
				else updated++;
				upsertScoped.run(uuid(), ...args, tenantId);
			}
		} else if (entity === 'customers') {
			const byId = db.prepare('SELECT id, tenant_id FROM customers WHERE id=?');
			const byPhone = db.prepare(
				'SELECT id, tenant_id FROM customers WHERE phone=? AND phone IS NOT NULL AND phone<>""',
			);
			const ins = db.prepare(
				'INSERT INTO customers (id,name,phone,email,tax_number,loyalty_tier,credit_limit,tenant_id) VALUES (?,?,?,?,?,?,?,?)',
			);
			const upd = db.prepare(
				`UPDATE customers SET name=?,phone=?,email=?,tax_number=?,loyalty_tier=?,credit_limit=?,tenant_id=COALESCE(tenant_id,?),updated_at=datetime('now') WHERE id=?`,
			);
			for (const r of rows) {
				const hit = (r.id && byId.get(r.id)) || (r.phone && byPhone.get(r.phone));
				if (hit) {
					if (tenantId && hit.tenant_id && String(hit.tenant_id) !== tenantId) {
						throw Object.assign(new Error('العميل مملوك لمستأجر آخر'), { statusCode: 403 });
					}
					upd.run(
						r.name,
						r.phone || null,
						r.email || null,
						r.taxNumber || null,
						r.loyaltyTier,
						Math.max(0, num(r.creditLimit)),
						tenantId,
						hit.id,
					);
					updated++;
				} else {
					ins.run(
						uuid(),
						r.name,
						r.phone || null,
						r.email || null,
						r.taxNumber || null,
						r.loyaltyTier,
						Math.max(0, num(r.creditLimit)),
						tenantId,
					);
					created++;
				}
			}
		} else if (entity === 'stock') {
			// Both lookups are tenant-scoped. The code lookup used to be global, so with
			// two tenants owning the same product code a stock import could resolve
			// to another tenant's product and then post quantities onto it — the
			// check that followed ran on the resolved row, so the foreign product
			// answered it and the import silently succeeded against the wrong
			// catalog (invariant 1).
			const byCode = db.prepare('SELECT id, tenant_id FROM products WHERE code=? AND tenant_id=?');
			const byCodeLegacy = db.prepare('SELECT id, tenant_id FROM products WHERE code=? AND tenant_id IS NULL');
			const byId = db.prepare('SELECT id, tenant_id FROM products WHERE id=?');
			const ensureWh = db.prepare('INSERT OR IGNORE INTO warehouses (id,name,tenant_id) VALUES (?,?,?)');
			const wrow = db.prepare('SELECT tenant_id FROM warehouses WHERE id=?');
			const set = db.prepare(
				`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=excluded.qty,updated_at=datetime('now')`,
			);
			for (const r of rows) {
				// Resolve BY ID first (an id is already tenant-scoped by the caller),
				// then by code WITHIN this tenant's catalog.
				const byCodeHit = r.productCode
					? tenantId
						? byCode.get(r.productCode, tenantId) || byCodeLegacy.get(r.productCode)
						: byCodeLegacy.get(r.productCode)
					: null;
				const prod = (r.productId && byId.get(r.productId)) || byCodeHit;
				if (!prod) throw new Error(`صنف غير موجود: ${r.productCode || r.productId}`);
				if (tenantId && prod.tenant_id && String(prod.tenant_id) !== tenantId) {
					throw Object.assign(new Error(`صنف غير موجود: ${r.productCode || r.productId}`), {
						statusCode: 404,
					});
				}
				const pid = r.productId && byId.get(r.productId) ? r.productId : prod.id;
				const wh = wrow.get(r.warehouseId);
				if (wh && tenantId && wh.tenant_id && String(wh.tenant_id) !== tenantId) {
					throw Object.assign(new Error('المستودع مملوك لمستأجر آخر'), { statusCode: 403 });
				}
				ensureWh.run(r.warehouseId, r.warehouseId, tenantId);
				set.run(pid, r.warehouseId, Number(r.qty));
				updated++;
			}
		} else if (entity === 'legacyInvoices') {
			/*
			 * Legacy invoices are NOT flat rows, so they arrive pre-normalized from
			 * `lib/legacy-invoices.js` (which owns the money rule and the
			 * reconciliation check) and are written by the dedicated commit module.
			 * They are dispatched by the route BEFORE this generic path, because
			 * the generic `normRow` would flatten the `lines` array away.
			 */
			const result = commitLegacyInvoices(rows, tenantId);
			created += result.created;
			updated += result.skipped;
		}
		return { created, updated };
	})();
}

/**
 * Answer a legacy-invoice import.
 *
 * Split out of the route because the audit + outbox tail is identical to the
 * generic path and copying it would be the drift this file already suffers from.
 *
 * ## Nothing is written when anything failed
 *
 * A migration that writes the 4000 good rows and silently drops the bad 100
 * leaves a ledger the operator believes is complete. So any parse error refuses
 * the WHOLE file and names the offending rows — the operator fixes the source
 * and re-runs. Re-running is safe: the commit is idempotent by invoice number.
 */
function finishLegacyImport(req, res, invoices, errors, dryRun, tenantId) {
	if (errors.length) {
		return res.status(400).json({
			error: `تحقق فاشل في ${errors.length} صفًا — لم يُكتب شيء`,
			errors: errors.slice(0, 20),
			invoices: invoices.length,
		});
	}
	if (!invoices.length) {
		return res.status(400).json({ error: 'لا توجد فواتير صالحة في الملف — لم يُكتب شيء' });
	}
	if (dryRun) {
		return res.json({
			dryRun: true,
			entity: 'legacyInvoices',
			invoices: invoices.length,
			valid: true,
			// The recomputed figures, so an operator can compare against the file
			// BEFORE committing — a migration is not a thing to eyeball after.
			totals: {
				subtotal: invoices.reduce((s, i) => s + i.subtotal, 0),
				tax: invoices.reduce((s, i) => s + i.taxAmount, 0),
				total: invoices.reduce((s, i) => s + i.total, 0),
			},
		});
	}

	try {
		const result = commitLegacyInvoices(invoices, tenantId);
		req.audit?.('import.commit', { entity: 'legacyInvoices', ...result });
		try {
			db.prepare('INSERT INTO webhook_outbox (event,entity_type,payload) VALUES (?,?,?)').run(
				'import.completed',
				'LEGACYINVOICES',
				JSON.stringify({ entity: 'legacyInvoices', ...result }),
			);
		} catch {
			/* outbox best-effort */
		}
		return res.status(201).json({ entity: 'legacyInvoices', ...result });
	} catch (e) {
		return res.status(e.statusCode || 400).json({ error: String(e.message || '').slice(0, 300) });
	}
}

// POST /api/import/:entity?dryRun=1 — JSON array or text/csv
router.post('/:entity', (req, res) => {
	const entity = req.params.entity;
	if (!validators[entity]) return res.status(404).json({ error: 'كيان غير مدعوم', supported: Object.keys(validators) });

	const dryRun = String(req.query.dryRun || '') === '1' || String(req.query.dryRun || '').toLowerCase() === 'true';
	let scopeTenant = null;
	try {
		scopeTenant = assertTenantScope(req)?.tenantId || req.user?.tenantId || null;
	} catch (e) {
		return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
	}

	/*
	 * Legacy invoices take their own path, BEFORE `readRows`/`normRow`.
	 *
	 * The generic importer expects one flat row per entity. An invoice is a
	 * header plus N lines: `normRow` keeps only known scalar keys, so it would
	 * DROP the `lines` array entirely and the import would report success having
	 * written nothing — the silent half-success this feature cannot afford. The
	 * parser also returns per-row errors rather than throwing, because one bad
	 * line in a 5000-row migration should not discard the other 4999.
	 */
	if (entity === 'legacyInvoices') {
		let text;
		try {
			const ct = String(req.headers['content-type'] || '');
			if (ct.includes('text/csv') || typeof req.body === 'string') {
				text = String(req.body ?? '');
				if (!text.trim()) throw Object.assign(new Error('ملف CSV فارغ'), { statusCode: 400 });
			} else if (Array.isArray(req.body)) {
				// JSON callers get the same rules without the CSV grouping step.
				const parsed = [];
				const failures = [];
				req.body.forEach((row, i) => {
					try {
						parsed.push(normalizeLegacyInvoice(row, i + 1));
					} catch (e) {
						failures.push({ row: i + 1, error: String(e.message).slice(0, 200) });
					}
				});
				return finishLegacyImport(req, res, parsed, failures, dryRun, scopeTenant);
			} else {
				throw Object.assign(new Error('أرسل مصفوفة JSON أو text/csv'), { statusCode: 400 });
			}
		} catch (e) {
			return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
		}

		const { invoices, errors } = parseLegacyInvoicesCsv(text);
		return finishLegacyImport(req, res, invoices, errors, dryRun, scopeTenant);
	}

	let raw;
	try {
		raw = readRows(req);
	} catch (e) {
		return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
	}
	const rows = raw.map(normRow);
	const errors = [];
	rows.forEach((r, i) => {
		const e = validators[entity](r);
		if (e.length) errors.push({ row: i + 1, errors: e });
	});
	if (errors.length) {
		return res.status(400).json({
			error: `تحقق فاشل في ${errors.length} صفًا — لم يُكتب شيء`,
			errors: errors.slice(0, 20),
		});
	}
	if (dryRun) return res.json({ dryRun: true, entity, rows: rows.length, valid: true });
	try {
		const result = commit(entity, rows, scopeTenant);
		req.audit?.('import.commit', { entity, ...result });
		try {
			db.prepare('INSERT INTO webhook_outbox (event,entity_type,payload) VALUES (?,?,?)').run(
				'import.completed',
				entity.toUpperCase(),
				JSON.stringify({ entity, ...result }),
			);
		} catch {
			/* outbox best-effort */
		}
		return res.status(201).json({ entity, rows: rows.length, ...result });
	} catch (e) {
		return res.status(e.statusCode || 400).json({ error: String(e.message || '').slice(0, 300) });
	}
});

export default router;
