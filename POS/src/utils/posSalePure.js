/**
 * posSalePure — نواة البيع النقية المستخرجة حرفيًا من `pages/POSSale.vue`.
 *
 * Contract (frozen behavior, zero-risk extraction):
 * - Every function is pure: plain inputs → plain outputs, no refs, no I/O,
 *   no `new Date()` (callers pass `createdAt` explicitly).
 * - `roundMoney` keeps the screen's historical EPSILON-float rounding ON PURPOSE.
 *   It deliberately differs from `utils/money.js` (halala-integer half-up):
 *   unifying the two rounding policies is a separate, audited migration —
 *   see `computeCartTotals`. Do NOT "fix" the rounding here.
 * - `formatMoneyValue` needs `currency` as a parameter (the screen binds
 *   `props.currency` at its thin wrapper).
 *
 * Pure + framework-free. Fully unit-tested in `tests/posSalePure.test.js`.
 */

/** Historical screen rounding: EPSILON float, 2 decimals. FROZEN. */
export function roundMoney(value) {
	const number = Number(value)
	if (!Number.isFinite(number)) {
		return 0
	}
	return Math.round((number + Number.EPSILON) * 100) / 100
}

/** Arabic number display (ar-SA, max 2 fraction digits). FROZEN. */
export function formatNumber(value) {
	return new Intl.NumberFormat("ar-SA", {
		maximumFractionDigits: 2,
	}).format(Number(value || 0))
}

/** Money display with explicit currency (caller binds `props.currency`). */
export function formatMoneyValue(value, currency) {
	return `${formatNumber(value)} ${currency}`
}

/**
 * Normalize any catalog shape into the sale product contract.
 * Verbatim from POSSale (null-safe id/name/price fallbacks).
 */
export function normalizeProduct(product) {
	if (!product) {
		return null
	}
	const id = product.id ?? product.name ?? product.item_code ?? product.code
	if (!id) {
		return null
	}
	const price = Number(
		product.price ?? product.rate ?? product.standard_rate ?? 0,
	)
	return {
		id,
		code: product.code ?? product.item_code ?? id,
		name:
			product.name_ar ??
			product.item_name_ar ??
			product.item_name ??
			product.name ??
			"منتج",
		description: product.description_ar ?? product.description ?? "",
		price: Number.isFinite(price) ? price : 0,
		image: product.image ?? product.image_url ?? null,
		barcode: product.barcode ?? product.bar_code ?? "",
		stock: product.stock ?? product.actual_qty ?? null,
		unit: product.unit ?? product.stock_uom ?? "قطعة",
		disabled: product.disabled === true,
	}
}

/** Sum of qty×price over cart lines. */
export function calcSubtotal(items) {
	return roundMoney(
		(items || []).reduce(
			(total, item) =>
				total + Number(item.quantity || 0) * Number(item.unitPrice || 0),
			0,
		),
	)
}

/** Sum of per-line discounts. */
export function calcLineDiscount(items) {
	return roundMoney(
		(items || []).reduce(
			(total, item) => total + Number(item.discount || 0),
			0,
		),
	)
}

/**
 * Global discount (percent capped at 100, amount capped at net).
 * Verbatim branches: non-positive → 0.
 */
export function calcGlobalDiscount({
	subtotal,
	lineDiscount,
	discountType,
	discountValue,
}) {
	const value = Number(discountValue || 0)
	if (value <= 0) {
		return 0
	}
	if (discountType === "percent") {
		return roundMoney(
			Math.min(
				subtotal - lineDiscount,
				(subtotal * Math.min(value, 100)) / 100,
			),
		)
	}
	return roundMoney(Math.min(subtotal - lineDiscount, value))
}

/** Taxable base, floored at zero. */
export function calcTaxable(subtotal, lineDiscount, globalDiscount) {
	return Math.max(0, roundMoney(subtotal - lineDiscount - globalDiscount))
}

/** Per-line tax accumulation ((qty×price−discount)×rate/100). */
export function calcTax(items) {
	return roundMoney(
		(items || []).reduce((total, item) => {
			const quantity = Number(item.quantity || 0)
			const unitPrice = Number(item.unitPrice || 0)
			const itemDiscount = Number(item.discount || 0)
			const itemBase = Math.max(0, quantity * unitPrice - itemDiscount)
			const rate = Number(item.taxRate || 0)
			return total + (itemBase * rate) / 100
		}, 0),
	)
}

/** Grand total. */
export function calcTotal(taxable, tax) {
	return roundMoney(taxable + tax)
}

/** Cash tendered, sanitized. */
export function calcAmountReceived(paymentAmount) {
	const amount = Number(paymentAmount || 0)
	return Number.isFinite(amount) ? roundMoney(amount) : 0
}

/** Change owed (never negative). */
export function calcChange(received, total) {
	return roundMoney(Math.max(0, received - total))
}

/** Remainder owed (never negative). */
export function calcRemaining(total, received) {
	return roundMoney(Math.max(0, total - received))
}

/** Customer block of the sale payload (null for walk-in). */
export function normalizeSaleCustomer(customer) {
	return customer
		? {
				id: customer.id ?? customer.name,
				name: customer.name ?? customer.customer_name,
			}
		: null
}

/** Cart lines → payload items. */
export function buildSaleItems(cart) {
	return (cart || []).map((item) => ({
		productId: item.productId,
		code: item.code,
		name: item.name,
		quantity: Number(item.quantity),
		unitPrice: Number(item.unitPrice),
		discount: Number(item.discount),
		taxRate: Number(item.taxRate),
		notes: item.notes || "",
	}))
}

/** Pricing block passthrough (values precomputed by calc*). */
export function buildSalePricing({
	subtotal,
	lineDiscount,
	globalDiscount,
	taxableAmount,
	tax,
	total,
}) {
	return {
		subtotal,
		lineDiscount,
		globalDiscount,
		taxableAmount,
		tax,
		total,
	}
}

/** Full sale payload (createdAt injected — no clock inside). */
export function buildSalePayloadPure({
	clientSequence,
	customer,
	cart,
	pricing,
	currency,
	createdAt,
}) {
	return {
		clientSequence,
		customer: normalizeSaleCustomer(customer),
		items: buildSaleItems(cart),
		pricing: buildSalePricing(pricing),
		currency,
		createdAt,
	}
}

/** Payment block attached at confirm-time. */
export function buildPaymentBlock({ method, received, change, remaining }) {
	return {
		method,
		received,
		change,
		remaining,
	}
}

/**
 * Map backend/transport failures to Arabic cashier messages.
 * Verbatim branches: 409 → duplicate, 422 → invalid, offline → no connection,
 * else server message → error message → generic fallback.
 */
export function normalizePaymentErrorPure(error, isOnline) {
	const status = error?.status || error?.response?.status
	if (status === 409) {
		return "تمت معالجة عملية البيع مسبقًا أو تغيرت حالتها."
	}
	if (status === 422) {
		return "تعذر اعتماد بيانات عملية البيع."
	}
	if (!isOnline) {
		return "الاتصال غير متاح. لم يتم اعتماد العملية."
	}
	return (
		error?.response?.data?.message ||
		error?.message ||
		"تعذر إتمام عملية الدفع."
	)
}

/** Popularity boost lookup shared by exact + scan-intent ranking. */
export function getPopularityBoost(boostMap, product) {
	const boost = boostMap?.get(String(product?.id))
	return Number.isFinite(boost) ? boost : 0
}
