/**
 * openInvoicesPure — multi-invoice rules for the sale screen.
 *
 * Pure + framework-free: plain inputs → plain outputs, no refs, no I/O,
 * no clock (callers pass `now`). Fully unit-tested.
 *
 * Why this module exists: the sale page held exactly ONE cart, and the
 * "held sales" counter counted events nobody could reopen — a cashier serving
 * two customers at once had to finish (or abandon) the first basket. Open
 * invoices park the whole sale state (lines, customer, discount, tender)
 * under a stable id, so switching never loses a line.
 *
 * Capacity rule: at most MAX_OPEN_INVOICES parked invoices. The cap is a
 * load guard, not a licence tier — a parked invoice holds a stock
 * reservation and a sync payload, so unbounded parking is unbounded memory
 * and unbounded oversell risk on one device.
 */
import {
	calcGlobalDiscount,
	calcLineDiscount,
	calcSubtotal,
	calcTax,
	calcTaxable,
	calcTotal,
} from "@/utils/posSalePure"

/** Load guard: parked invoices hold reservations + payloads per invoice. */
export const MAX_OPEN_INVOICES = 8

/**
 * Blank working state for one invoice (mirrors the sale page refs).
 * @param {string} id stable invoice id (saleSequence)
 * @param {string} label visible tab label, e.g. "فاتورة 1"
 * @param {number} now epoch ms
 */
export function blankInvoiceState(id, label, now = Date.now()) {
	return {
		id: String(id || ""),
		label: String(label || ""),
		createdAt: new Date(now).toISOString(),
		cart: [],
		customer: null,
		discountType: "amount",
		discountValue: 0,
		paymentMethod: "cash",
		paymentAmount: "",
		saleSequence: String(id || ""),
	}
}

/** Smallest free tab number: 1..MAX, so labels stay compact after closes. */
export function nextInvoiceLabel(parked) {
	const used = new Set(
		(parked || []).map((inv) =>
			Number.parseInt(String(inv?.label).replace(/\D/g, ""), 10),
		),
	)
	let n = 1
	while (used.has(n)) n += 1
	return `فاتورة ${n}`
}

/** Money summary of one parked invoice (same math as the live cart). */
export function summarizeInvoice(invoice) {
	const cart = Array.isArray(invoice?.cart) ? invoice.cart : []
	const subtotal = calcSubtotal(cart)
	const lineDiscount = calcLineDiscount(cart)
	const global = calcGlobalDiscount({
		subtotal,
		lineDiscount,
		discountType: invoice?.discountType,
		discountValue: invoice?.discountValue,
	})
	const taxable = calcTaxable(subtotal, lineDiscount, global)
	const tax = calcTax(cart)
	return {
		id: invoice?.id,
		label: invoice?.label,
		lines: cart.length,
		qty: cart.reduce((sum, item) => sum + Number(item?.quantity || 0), 0),
		total: calcTotal(taxable, tax),
		customerName:
			invoice?.customer?.name || invoice?.customer?.customer_name || null,
	}
}

/**
 * Park a snapshot. Same id = update in place (retry/double-tap safe);
 * new id past the cap = refused with reason (never silent loss).
 */
export function parkInvoice(parked, snapshot) {
	const list = Array.isArray(parked) ? [...parked] : []
	if (!snapshot?.id) return { ok: false, reason: "missing_id", list }
	const at = list.findIndex((inv) => String(inv?.id) === String(snapshot.id))
	if (at >= 0) {
		list[at] = { ...snapshot }
		return { ok: true, updated: true, list }
	}
	if (list.length >= MAX_OPEN_INVOICES) {
		return { ok: false, reason: "capacity", list }
	}
	list.push({ ...snapshot })
	return { ok: true, updated: false, list }
}

/** Remove one parked invoice (completed, cancelled, or explicitly closed). */
export function closeInvoice(parked, id) {
	const list = Array.isArray(parked) ? [...parked] : []
	const at = list.findIndex((inv) => String(inv?.id) === String(id))
	if (at < 0) return { ok: false, reason: "not_found", list }
	list.splice(at, 1)
	return { ok: true, list }
}

/** Find a parked invoice by id (null when absent — never throws). */
export function findInvoice(parked, id) {
	if (!Array.isArray(parked) || !id) return null
	return parked.find((inv) => String(inv?.id) === String(id)) || null
}

export default {
	MAX_OPEN_INVOICES,
	blankInvoiceState,
	nextInvoiceLabel,
	summarizeInvoice,
	parkInvoice,
	closeInvoice,
	findInvoice,
}
