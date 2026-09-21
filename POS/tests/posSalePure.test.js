import { describe, expect, it } from "vitest"
import {
	buildPaymentBlock,
	buildSaleItems,
	buildSalePayloadPure,
	calcAmountReceived,
	calcChange,
	calcGlobalDiscount,
	calcLineDiscount,
	calcRemaining,
	calcSubtotal,
	calcTax,
	calcTaxable,
	calcTotal,
	formatMoneyValue,
	formatNumber,
	getPopularityBoost,
	normalizePaymentErrorPure,
	normalizeProduct,
	normalizeSaleCustomer,
	roundMoney,
} from "@/utils/posSalePure"

describe("roundMoney (frozen EPSILON-float policy)", () => {
	it("rounds half-up with epsilon guard", () => {
		expect(roundMoney(19.995)).toBe(20)
		expect(roundMoney(2.345)).toBe(2.35)
	})
	it("sanitizes non-finite input to 0", () => {
		expect(roundMoney(Number.NaN)).toBe(0)
		expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0)
		expect(roundMoney("abc")).toBe(0)
		expect(roundMoney(undefined)).toBe(0)
	})
})

describe("formatNumber/formatMoneyValue", () => {
	it("formats Arabic numerals with max 2 decimals", () => {
		expect(formatNumber(0)).toBe("٠")
		expect(formatNumber(1234.5)).toContain("١٬٢٣٤")
	})
	it("appends the caller-bound currency", () => {
		expect(formatMoneyValue(10, "ر.س")).toBe(`${formatNumber(10)} ر.س`)
	})
})

describe("normalizeProduct", () => {
	it("returns null without identity", () => {
		expect(normalizeProduct(null)).toBeNull()
		expect(normalizeProduct(undefined)).toBeNull()
		expect(normalizeProduct({})).toBeNull()
	})
	it("folds catalog shapes with Arabic-first naming", () => {
		expect(
			normalizeProduct({ item_code: "A1", item_name_ar: "قلم", rate: "5.5" }),
		).toMatchObject({ id: "A1", code: "A1", name: "قلم", price: 5.5 })
		expect(normalizeProduct({ name: "x", price: "nan" })).toMatchObject({
			price: 0,
		})
	})
	it("marks disabled strictly and defaults unit/stock", () => {
		expect(normalizeProduct({ id: "1", disabled: 1 }).disabled).toBe(false)
		expect(normalizeProduct({ id: "1", disabled: true }).disabled).toBe(true)
		expect(normalizeProduct({ id: "1" })).toMatchObject({
			unit: "قطعة",
			stock: null,
			barcode: "",
		})
	})
})

describe("totals kernel (verbatim screen math)", () => {
	const cart = [
		{ quantity: 2, unitPrice: 19.99, discount: 0, taxRate: 15 },
		{ quantity: 1, unitPrice: 50, discount: 5, taxRate: 15 },
	]
	it("subtotal/line-discount/tax/total chain", () => {
		expect(calcSubtotal(cart)).toBe(roundMoney(2 * 19.99 + 50))
		expect(calcLineDiscount(cart)).toBe(5)
		const sub = calcSubtotal(cart)
		const glob = calcGlobalDiscount({
			subtotal: sub,
			lineDiscount: 5,
			discountType: "amount",
			discountValue: 10,
		})
		expect(glob).toBe(10)
		const taxable = calcTaxable(sub, 5, glob)
		expect(taxable).toBe(Math.max(0, roundMoney(sub - 5 - glob)))
		expect(calcTotal(taxable, calcTax(cart))).toBe(
			roundMoney(taxable + calcTax(cart)),
		)
	})
	it("percent discount caps at 100 and at net", () => {
		const g = calcGlobalDiscount({
			subtotal: 100,
			lineDiscount: 0,
			discountType: "percent",
			discountValue: 250,
		})
		expect(g).toBe(100)
		expect(
			calcGlobalDiscount({
				subtotal: 100,
				lineDiscount: 0,
				discountType: "percent",
				discountValue: 0,
			}),
		).toBe(0)
		expect(
			calcGlobalDiscount({
				subtotal: 100,
				lineDiscount: 0,
				discountType: "zzz",
				discountValue: 10,
			}),
		).toBe(10)
	})
	it("change/remaining never go negative", () => {
		expect(calcChange(120, 100)).toBe(20)
		expect(calcChange(50, 100)).toBe(0)
		expect(calcRemaining(100, 120)).toBe(0)
		expect(calcRemaining(100, 40)).toBe(60)
		expect(calcAmountReceived("abc")).toBe(0)
		expect(calcAmountReceived("25.5")).toBe(25.5)
	})
})

describe("payload builders", () => {
	it("customer block nulls walk-in, items map exactly", () => {
		expect(normalizeSaleCustomer(null)).toBeNull()
		expect(normalizeSaleCustomer({ name: "زائر" })).toEqual({
			id: "زائر",
			name: "زائر",
		})
		expect(
			buildSaleItems([{ productId: "p", quantity: "2", notes: null }]),
		).toEqual([
			{
				productId: "p",
				code: undefined,
				name: undefined,
				quantity: 2,
				unitPrice: Number.NaN,
				discount: Number.NaN,
				taxRate: Number.NaN,
				notes: "",
			},
		])
	})
	it("full payload assembles clientSequence/pricing/currency/createdAt", () => {
		const p = buildSalePayloadPure({
			clientSequence: "SALE-1",
			customer: { id: "c", name: "n" },
			cart: [],
			pricing: {
				subtotal: 1,
				lineDiscount: 0,
				globalDiscount: 0,
				taxableAmount: 1,
				tax: 0,
				total: 1,
			},
			currency: "ر.س",
			createdAt: "2026-01-01T00:00:00.000Z",
		})
		expect(p).toMatchObject({
			clientSequence: "SALE-1",
			currency: "ر.س",
			createdAt: "2026-01-01T00:00:00.000Z",
		})
		expect(p.customer).toEqual({ id: "c", name: "n" })
		expect(
			buildPaymentBlock({
				method: "cash",
				received: 5,
				change: 0,
				remaining: 0,
			}),
		).toEqual({ method: "cash", received: 5, change: 0, remaining: 0 })
	})
})

describe("normalizePaymentErrorPure", () => {
	it("409/422/offline branches in order", () => {
		expect(normalizePaymentErrorPure({ status: 409 }, true)).toContain("مسبقًا")
		expect(
			normalizePaymentErrorPure({ response: { status: 422 } }, true),
		).toContain("اعتماد")
		expect(normalizePaymentErrorPure(new Error("x"), false)).toContain(
			"الاتصال",
		)
	})
	it("falls back server → error → generic", () => {
		expect(
			normalizePaymentErrorPure(
				{ response: { data: { message: "srv" } } },
				true,
			),
		).toBe("srv")
		expect(normalizePaymentErrorPure(new Error("boom"), true)).toBe("boom")
		expect(normalizePaymentErrorPure({}, true)).toBe("تعذر إتمام عملية الدفع.")
	})
})

describe("getPopularityBoost", () => {
	it("reads map safely with finite guard", () => {
		const m = new Map([
			["a", 3],
			["b", Number.NaN],
		])
		expect(getPopularityBoost(m, { id: "a" })).toBe(3)
		expect(getPopularityBoost(m, { id: "b" })).toBe(0)
		expect(getPopularityBoost(m, { id: "zzz" })).toBe(0)
		expect(getPopularityBoost(null, null)).toBe(0)
	})
})
