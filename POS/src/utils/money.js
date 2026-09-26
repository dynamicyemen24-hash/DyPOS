/**
 * DyPOS Money — exact halala-integer arithmetic (frontend parity with server/lib/money.js).
 *
 * IEEE-754 floats cannot represent most decimals: 0.1 + 0.2 !== 0.3.
 * Rounding only at the END lets error accumulate across 500-line carts.
 * These helpers accumulate in INTEGER minor units (halalas) and convert
 * back once, so every cart total is exact and matches the server bit-for-bit.
 *
 * Professional guarantees:
 * - toMinor/toMajor are the ONLY conversion points (single choke-point).
 * - pctOf rounds half-up in integer space (VAT exact).
 * - All cart math (subtotal/tax/discount/total/change) uses minor units.
 * - Formatting is locale-aware but never feeds back into math.
 *
 * Pure + fully unit-tested. No DOM, no I/O.
 */

/** Major (e.g. 19.99) → minor integer (1999). */
export function toMinor(major) {
	const n = Number(major)
	if (!Number.isFinite(n)) return 0
	return Math.round(n * 100)
}

/** Minor integer (1999) → major (19.99). */
export function toMajor(minor) {
	return Math.round(Number(minor) || 0) / 100
}

/** Round half-up to 2 decimals (single canonical rounding). */
export function r2(n) {
	return toMajor(toMinor(n))
}

/** Percent of a minor amount, rounded half-up to a minor unit. */
export function pctOf(minor, rate) {
	return Math.round((Math.round(Number(minor) || 0) * Number(rate || 0)) / 100)
}

/** Clamp a minor amount into [0, capMinor]. */
export function clampMinor(minor, capMinor) {
	const m = Math.round(Number(minor) || 0)
	const cap = Math.round(Number(capMinor) || 0)
	return Math.max(0, Math.min(m, cap))
}

/** Sum an array of majors exactly (via minor accumulation). */
export function sumExact(majors) {
	let acc = 0
	for (const v of majors || []) acc += toMinor(v)
	return toMajor(acc)
}

/**
 * Compute a full cart summary in minor units — the single algorithm
 * the entire POS must use (cart, payment dialog, receipt, offline queue).
 *
 * @param {Array<{qty:number, unitPrice:number, discount?:number, taxRate?:number}>} lines
 * @param {{discountAmount?:number, couponDiscount?:number, taxInclusive?:boolean}} opts
 * @returns {{subtotal:number, taxTotal:number, discountAmount:number, total:number, lines:Array}}
 */
export function computeCartTotals(lines, opts = {}) {
	const taxInclusive = !!opts.taxInclusive
	let subtotalMinor = 0
	let taxTotalMinor = 0
	const computed = []

	for (const line of lines || []) {
		const qty = Number(line.qty) > 0 ? Number(line.qty) : 0
		const price = Number(line.unitPrice) || 0
		const discountMinor = clampMinor(
			toMinor(line.discount),
			toMinor(qty * price),
		)
		const taxRate = Math.max(0, Math.min(Number(line.taxRate) || 0, 100))
		const lineGrossMinor = toMinor(qty * price) - discountMinor
		let lineNetMinor = lineGrossMinor
		let lineTaxMinor = pctOf(lineGrossMinor, taxRate)
		if (taxInclusive && taxRate > 0) {
			lineNetMinor = Math.round((lineGrossMinor * 100) / (100 + taxRate))
			lineTaxMinor = lineGrossMinor - lineNetMinor
		}
		subtotalMinor += lineNetMinor
		taxTotalMinor += lineTaxMinor
		computed.push({
			...line,
			netMinor: lineNetMinor,
			taxMinor: lineTaxMinor,
			totalMinor: lineNetMinor + lineTaxMinor,
		})
	}

	const grossMinor = subtotalMinor + taxTotalMinor
	const manualMinor = clampMinor(toMinor(opts.discountAmount), grossMinor)
	const couponMinor = clampMinor(
		toMinor(opts.couponDiscount),
		grossMinor - manualMinor,
	)
	const discountMinor = Math.min(manualMinor + couponMinor, grossMinor)
	const totalMinor = grossMinor - discountMinor

	return {
		subtotal: toMajor(subtotalMinor),
		taxTotal: toMajor(taxTotalMinor),
		discountAmount: toMajor(discountMinor),
		total: toMajor(totalMinor),
		subtotalMinor,
		taxTotalMinor,
		discountMinor,
		totalMinor,
		grossMinor,
		lines: computed,
	}
}

/**
 * Split a total into payments with exact change semantics:
 * overpay becomes explicit change, paid/remaining never go negative.
 */
export function applyPayments(total, payments) {
	const totalMinor = toMinor(total)
	let paidMinor = 0
	for (const p of payments || []) paidMinor += toMinor(p.amount)
	const changeMinor = Math.max(0, paidMinor - totalMinor)
	const paidCapped = paidMinor - changeMinor
	const remainingMinor = totalMinor - paidCapped
	return {
		paidAmount: toMajor(paidCapped),
		remainingAmount: toMajor(remainingMinor),
		change: toMajor(changeMinor),
		status:
			remainingMinor <= 1
				? "PAID"
				: remainingMinor >= totalMinor - 1
					? "UNPAID"
					: "PARTIAL",
	}
}

/** Format major for display (Saudi locale default, never used for math). */
export function formatMoney(
	major,
	{ currency = "ر.س", locale = "ar-SA" } = {},
) {
	const n = Number(major) || 0
	try {
		return `${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
	} catch {
		return `${n.toFixed(2)} ${currency}`
	}
}

export default {
	toMinor,
	toMajor,
	r2,
	pctOf,
	clampMinor,
	sumExact,
	computeCartTotals,
	applyPayments,
	formatMoney,
}
