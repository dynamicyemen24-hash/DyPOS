/**
 * Method-router payload adapters — Frappe ⇄ DyPOS shapes.
 *
 * Extracted from `routes/method.js`, which `tests/fileSize.test.js` caps. The
 * rule these implement is *naming*: the POS sends camelCase (`unitPrice`) and
 * the browser/Frappe adapters speak snake_case (`unit_price`, `mode_of_payment`).
 * Each mapper accepts BOTH spellings.
 *
 * That tolerance is deliberate and is why these functions are shared rather
 * than duplicated per handler: a mapper that quietly ignored one spelling would
 * make a line total or a payment tender differ between the REST create path and
 * the method path — the exact "a rule that drifts between paths" failure
 * `lib/money.js#computeLineMinor` was extracted to end.
 *
 * Pure functions only: no DB, no Express, no shared mutable state.
 */

/** Coerce to a finite number, or `fallback`. */
export function toNum(v, fallback = 0) {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse a value that MAY be a JSON string.
 *
 * The POS sends structured params through `dypos-ui call()`, which serialises to
 * JSON; older adapters hand the same fields over as strings. A field can arrive
 * either way, so parsing is attempted and a non-JSON string is returned
 * unchanged rather than dropped — dropping it would turn a malformed payload
 * into a silently empty list.
 */
export function parseMaybeJson(v) {
	if (v == null) return v;
	if (typeof v === 'object') return v;
	if (typeof v === 'string') {
		try {
			return JSON.parse(v);
		} catch {
			return v;
		}
	}
	return v;
}

/** One invoice line → the REST/sale shape used by `createOrFinalizeSale`. */
export function mapInvoiceItemToRest(it) {
	const productId = String(it.item_code || it.productId || it.product_id || '').trim();
	const qty = toNum(it.qty ?? it.quantity, 1);
	const rate = it.rate != null ? toNum(it.rate) : toNum(it.unitPrice);
	const discount = it.discount_amount != null ? toNum(it.discount_amount) : toNum(it.discount);
	const discountPct = toNum(it.discount_percentage);
	const lineGross = qty * rate;
	// An absolute discount wins; a percentage is applied to the gross line. Both
	// are re-clamped inside computeLineMinor, so this only chooses the intent.
	const disc = discount > 0 ? discount : discountPct > 0 ? (lineGross * discountPct) / 100 : 0;
	return {
		productId,
		qty,
		unitPrice: rate,
		discount: Math.round(disc * 100) / 100,
		taxRate: it.tax_rate != null ? toNum(it.tax_rate) : undefined,
		uom: it.uom ? String(it.uom).slice(0, 20) : undefined,
		warehouseId: it.warehouse ? String(it.warehouse).slice(0, 32) : undefined,
		isFreeItem: Boolean(Number(it.is_free_item) || it.isFreeItem) || undefined,
		freeQty: it.free_qty != null ? Math.max(0, Math.floor(toNum(it.free_qty))) : undefined,
	};
}

/**
 * Payment rows → the tender shape.
 *
 * `is_customer_credit` rows are dropped: a credit applied to settle an invoice
 * is not money tendered, and counting it as a payment would show the drawer
 * holding cash the shop never received. The cap of 10 tenders and the
 * non-negative filter mirror the REST path exactly.
 */
export function mapPaymentsFromFrappe(payments) {
	if (!Array.isArray(payments)) return [];
	return payments
		.filter((p) => p && !p.is_customer_credit)
		.map((p) => ({
			method: String(p.mode_of_payment || p.method || 'CASH')
				.toUpperCase()
				.slice(0, 20),
			amount: toNum(p.amount),
			reference: String(p.reference || '').slice(0, 128),
		}))
		.filter((p) => p.amount >= 0)
		.slice(0, 10);
}

/**
 * Invoice row → the Frappe-shaped document the POS renders.
 *
 * Every monetary field is echoed under BOTH names (`total`/`grand_total`,
 * `tax_amount`/`total_taxes_and_charges`, `remaining_amount`/`outstanding_amount`)
 * so a consumer reading either spelling sees the same number. Void and return
 * stamps are spread in only when present — a returned invoice is materially
 * different from a plain one, and omitting the key is how the two get confused.
 */
export function mapInvoiceRowToDoc(inv, items = null, payments = null) {
	const out = {
		name: inv.id,
		id: inv.id,
		invoice_name: inv.id,
		doctype: 'Sales Invoice',
		docstatus: inv.status === 'DRAFT' || inv.status === 'UNPAID' ? 0 : 1,
		status: inv.status,
		number: inv.number,
		invoice_number: inv.number,
		customer: inv.customer_id || 'WALK-IN',
		customer_name: inv.customer_name,
		customer_id: inv.customer_id,
		subtotal: inv.subtotal,
		total: inv.total,
		grand_total: inv.total,
		base_grand_total: inv.total,
		discount_amount: inv.discount_amount,
		total_taxes_and_charges: inv.tax_amount,
		tax_amount: inv.tax_amount,
		paid_amount: inv.paid_amount,
		outstanding_amount: inv.remaining_amount,
		remaining_amount: inv.remaining_amount,
		change_amount: 0,
		currency: inv.currency || 'SAR',
		shift_id: inv.shift_id,
		terminal_id: inv.terminal_id,
		notes: inv.notes || '',
		is_pos: 1,
		update_stock: 1,
		posting_date: String(inv.created_at || '').slice(0, 10),
		creation: inv.created_at,
		modified: inv.updated_at || inv.created_at,
		created_at: inv.created_at,
		// Return/void tracking: distinguishes cancellations from returns.
		...(inv.voided_at ? { voided_at: inv.voided_at, voided_by: inv.voided_by } : {}),
		...(inv.returned_at ? { returned_at: inv.returned_at, returned_by: inv.returned_by } : {}),
	};
	if (items) out.items = items;
	if (payments) out.payments = payments;
	return out;
}

/** Header + children for one invoice, or null when it does not exist. */
export function loadInvoiceFull(db, id) {
	const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
	if (!inv) return null;
	const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(id);
	const pays = db.prepare('SELECT * FROM payments WHERE invoice_id=?').all(id);
	return { inv, items, pays };
}

export default {
	loadInvoiceFull,
	mapInvoiceItemToRest,
	mapInvoiceRowToDoc,
	mapPaymentsFromFrappe,
	parseMaybeJson,
	toNum,
};
