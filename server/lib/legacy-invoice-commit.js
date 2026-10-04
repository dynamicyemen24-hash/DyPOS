/**
 * Legacy-invoice import commit — the WRITES, separated from the route.
 *
 * ## Why this is not in `routes/import.js`
 *
 * That route is the generic importer: products, customers, stock — one flat row
 * each. A legacy invoice is not a flat row. It is a header plus N lines whose
 * money must reconcile, written as two tables, tenant-stamped, marked as
 * migrated, and re-runnable without duplicating a single invoice number. Growing
 * that inside the router is the exact growth the file-size ratchet exists to
 * stop, and this is the volume that triggers it.
 *
 * ## The three guarantees
 *
 *  1. **Tenant fail-closed** (invariant 1). Every row is stamped with the
 *     caller's tenant and the number lookup is scoped to it. A foreign invoice
 *     number returns 404 rather than being overwritten — an import must never
 *     be a cross-tenant write primitive.
 *  2. **Idempotent by invoice number.** Re-running a migration must not double
 *     the history. A number already present for this tenant is SKIPPED and
 *     counted, so a half-finished import can be re-run safely.
 *  3. **One transaction.** All invoices commit together or none do. A migration
 *     that half-applies leaves a ledger nobody can reconcile, and the operator
 *     has no way to know which half landed.
 *
 * Stock is deliberately NOT touched: the lines carry the historical names and
 * prices as recorded, and re-deriving stock movement from them would post
 * quantities into a period that has already closed. Opening balances
 * (`lib/opening-balances.js`) are the correct way to set a stock position.
 */
import { v4 as uuid } from 'uuid';

import db from '../db/schema.js';
import { LEGACY_NOTE_PREFIX } from './legacy-invoices.js';

/**
 * Write normalized legacy invoices.
 *
 * @param {Array} invoices from `normalizeLegacyInvoice`
 * @param {string|null} tenantId the caller's scope, or null for single-tenant
 * @returns {{created:number, skipped:number, items:number}}
 */
export function commitLegacyInvoices(invoices, tenantId) {
	if (!Array.isArray(invoices) || invoices.length === 0) {
		return { created: 0, skipped: 0, items: 0 };
	}

	const insertInvoice = db.prepare(`
		INSERT INTO invoices (
			id, number, customer_id, customer_name, branch_id, terminal_id,
			subtotal, tax_amount, discount_amount, total,
			paid_amount, remaining_amount, status, notes, created_at, updated_at, tenant_id
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime(?),datetime(?),?)
	`);

	const insertItem = db.prepare(`
		INSERT INTO invoice_items (
			id, invoice_id, product_name, qty, unit_price, discount, tax_rate, tax_amount, total
		) VALUES (?,?,?,?,?,?,?,?,?)
	`);

	// Scoped by tenant as well as number: without the tenant column a global
	// match would make shop B's import report shop A's invoice as a conflict.
	const existing = tenantId
		? db.prepare('SELECT id FROM invoices WHERE number=? AND tenant_id=?')
		: db.prepare('SELECT id FROM invoices WHERE number=?');

	return db.transaction(() => {
		let created = 0;
		let skipped = 0;
		let items = 0;

		for (const inv of invoices) {
			const clash = tenantId ? existing.get(inv.number, tenantId) : existing.get(inv.number);
			if (clash) {
				skipped++;
				continue;
			}

			const invoiceId = uuid();
			// `created_at` is the BACK-DATED invoice date, not the import date: a
			// migrated invoice belongs to the period it was issued in, or every
			// period report for the migration year reads wrong.
			insertInvoice.run(
				invoiceId,
				inv.number,
				inv.customerId || null,
				inv.customerName || 'عميل نقدي',
				inv.branchId || null,
				inv.terminalId || null,
				inv.subtotal,
				inv.taxAmount,
				inv.discountAmount,
				inv.total,
				inv.paidAmount,
				inv.remainingAmount,
				inv.status,
				inv.notes || LEGACY_NOTE_PREFIX,
				inv.date,
				inv.date,
				tenantId,
			);

			for (const line of inv.lines) {
				insertItem.run(
					uuid(),
					invoiceId,
					line.productName,
					line.qty,
					line.unitPrice,
					line.discount,
					line.taxRate,
					line.taxAmount,
					line.total,
				);
				items++;
			}
			created++;
		}

		return { created, skipped, items };
	})();
}

export default { commitLegacyInvoices };
