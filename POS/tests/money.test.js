import { describe, expect, it } from "vitest"
import {
	applyPayments,
	clampMinor,
	computeCartTotals,
	pctOf,
	r2,
	sumExact,
	toMajor,
	toMinor,
} from "@/utils/money"

describe("money exact (halala-integer)", () => {
	it("eliminates IEEE drift: 0.1+0.2 === 0.3", () => {
		expect(toMinor(0.1) + toMinor(0.2)).toBe(toMinor(0.3))
		expect(sumExact([0.1, 0.2])).toBe(0.3)
	})

	it("converts major<->minor exactly", () => {
		expect(toMinor(19.99)).toBe(1999)
		expect(toMajor(1999)).toBe(19.99)
		expect(toMinor("abc")).toBe(0)
	})

	it("r2 is the single canonical rounding", () => {
		expect(r2(19.995)).toBe(20)
		expect(r2(19.994)).toBe(19.99)
	})

	it("pctOf computes VAT half-up in integer space", () => {
		expect(pctOf(1999, 15)).toBe(300) // 15% of 19.99
		expect(pctOf(100, 15)).toBe(15)
	})

	it("clampMinor bounds into [0,cap]", () => {
		expect(clampMinor(500, 300)).toBe(300)
		expect(clampMinor(-5, 300)).toBe(0)
	})

	it("computeCartTotals matches server algorithm bit-for-bit", () => {
		const t = computeCartTotals(
			[
				{ qty: 2, unitPrice: 19.99, discount: 0, taxRate: 15 },
				{ qty: 1, unitPrice: 50, discount: 5, taxRate: 15 },
			],
			{ discountAmount: 0 },
		)
		// line1: 39.98 net, tax 6.00 (3998*15%=599.7→600); line2: 45 net, tax 6.75
		expect(t.subtotal).toBeCloseTo(84.98, 2)
		expect(t.taxTotal).toBeCloseTo(12.75, 2)
		expect(t.total).toBeCloseTo(97.73, 2)
		expect(t.totalMinor).toBe(toMinor(t.total))
	})

	it("computeCartTotals supports tax-inclusive back-out exactly", () => {
		const t = computeCartTotals([{ qty: 1, unitPrice: 115, taxRate: 15 }], {
			taxInclusive: true,
		})
		expect(t.total).toBe(115)
		expect(t.subtotal + t.taxTotal).toBeCloseTo(115, 2)
	})

	it("applyPayments clamps overpay into explicit change", () => {
		const s = applyPayments(100, [{ amount: 120 }])
		expect(s.paidAmount).toBe(100)
		expect(s.remainingAmount).toBe(0)
		expect(s.change).toBe(20)
		expect(s.status).toBe("PAID")
	})

	it("applyPayments detects PARTIAL", () => {
		const s = applyPayments(100, [{ amount: 40 }])
		expect(s.status).toBe("PARTIAL")
		expect(s.remainingAmount).toBe(60)
	})
})
