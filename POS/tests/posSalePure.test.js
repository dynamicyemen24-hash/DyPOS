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
	newSaleSequence,
	resolveSaleCustomer,
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
	it("formats canonical Latin digits at the configured precision", () => {
		// v1.38 contract: LATIN digits in every UI language (machine-parseable
		// accounting figures) + the configured currency precision — the old
		// `Intl("ar-SA")` Arabic-Indic output diverged from receipts/reports.
		expect(formatNumber(0)).toBe("0.00")
		expect(formatNumber(1234.5)).toContain("1,234")
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
			price: null,
			priceMissing: true,
		})
		expect(normalizeProduct({ name: "x" })).toMatchObject({
			price: null,
			priceMissing: true,
		})
		expect(normalizeProduct({ name: "x", price: 0 })).toMatchObject({
			price: 0,
			priceMissing: false,
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
	/**
	 * The verb that makes a message actionable rather than a dead end.
	 *
	 * Two shapes count: an IMPERATIVE ("راجع الإيصال") and a REASSURANCE that
	 * states what will happen next ("ستُرسل تلقائيًا"). A cashier who is told
	 * the sale is safe and will sync has an action too — "carry on serving" —
	 * which is exactly what the offline branch needs to say.
	 */
	const ACTION = /(راجع|أعد|تأكد|توجّه|تواصل|افتح|اضغط|اختر|ستُرسل|سيتم|عند عودة)/

	it("409/422/offline branches in order", () => {
		expect(normalizePaymentErrorPure({ status: 409 }, true)).toContain("عولجت")
		expect(
			normalizePaymentErrorPure({ response: { status: 422 } }, true),
		).toContain("اعتماد")
		expect(normalizePaymentErrorPure(new Error("x"), false)).toContain(
			"الاتصال",
		)
	})

	/**
	 * The contract that matters: every failure tells the cashier what to do.
	 *
	 * Asserted as a PROPERTY, not as exact copy, so rewording the Arabic does
	 * not break the build while losing the action does.
	 */
	it("every failure names a next action", () => {
		const cases = [
			[{ status: 409 }, true],
			[{ response: { status: 422 } }, true],
			[new Error("network"), false],
			[{}, true],
		]
		for (const [error, online] of cases) {
			const message = normalizePaymentErrorPure(error, online)
			expect(message.length).toBeGreaterThan(0)
			expect(message, `no recovery action in: ${message}`).toMatch(ACTION)
		}
	})

	/**
	 * The offline sentence must NOT tell the cashier the sale was lost.
	 *
	 * AGENTS.md invariant 8: the sale is already in IndexedDB. Telling a
	 * cashier "the operation was not applied" during a network blip is what
	 * produces double-charged customers — they re-ring the sale.
	 */
	it("offline reassures that the sale is saved on the device", () => {
		const message = normalizePaymentErrorPure(new Error("down"), false)
		expect(message).toMatch(/حُفظت/)
		expect(message).toMatch(/الجهاز/)
		// And it must not claim the money was lost.
		expect(message).not.toMatch(/لم يتم اعتماد/)
		expect(message).not.toMatch(/لم يُسجّل/)
	})

	it("falls back server → error → generic", () => {
		// A server message is still preferred verbatim — the branch order is
		// unchanged, only the fallback copy gained a recovery line.
		expect(
			normalizePaymentErrorPure(
				{ response: { data: { message: "srv" } } },
				true,
			),
		).toBe("srv")
		expect(normalizePaymentErrorPure(new Error("boom"), true)).toBe("boom")
		expect(normalizePaymentErrorPure({}, true)).toMatch(ACTION)
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

describe("newSaleSequence", () => {
	it("is deterministic for the same inputs", () => {
		expect(newSaleSequence(1000, "abcdef12")).toBe(
			newSaleSequence(1000, "abcdef12"),
		)
		expect(newSaleSequence(1000, "abcdef12")).toBe("SALE-1000-ABCDEF12")
	})
	it("never collides within the same millisecond", () => {
		// crypto-shaped salts (like the UUIDs the page passes): 8 chars of
		// entropy each, so 200 same-millisecond sales stay distinct.
		const keys = new Set(
			Array.from({ length: 200 }, (_, i) =>
				newSaleSequence(1000, `${i}-f47ac10b58cc4372a5670e02b2c3d479`),
			),
		)
		expect(keys.size).toBe(200)
	})
	it("differs across timestamps", () => {
		expect(newSaleSequence(1000, "s")).not.toBe(newSaleSequence(1001, "s"))
	})
	it("mints unique crypto-strong keys by default", () => {
		const a = newSaleSequence()
		const b = newSaleSequence()
		expect(a).toMatch(/^SALE-\d+-[0-9A-Z]{8}$/)
		expect(b).toMatch(/^SALE-\d+-[0-9A-Z]{8}$/)
		expect(a).not.toBe(b)
	})
})

describe("resolveSaleCustomer", () => {
	it("variable mode uses the cashier pick (null = walk-in)", () => {
		expect(
			resolveSaleCustomer({
				mode: "variable",
				selected: { id: "C1", name: "عميل" },
			}),
		).toEqual({ id: "C1", name: "عميل" })
		expect(resolveSaleCustomer({ mode: "variable", selected: null })).toBeNull()
	})
	it("pinned mode ignores the pick and books the fixed account", () => {
		expect(
			resolveSaleCustomer({
				mode: "pinned",
				pinned: "  شركة النور  ",
				selected: { id: "C9", name: "آخر" },
			}),
		).toEqual({ id: "شركة النور", name: "شركة النور", pinned: true })
	})
	it("pinned mode with empty value falls back to walk-in, never blocks", () => {
		expect(resolveSaleCustomer({ mode: "pinned", pinned: "  " })).toEqual({
			id: "Walk-in Customer",
			name: "Walk-in Customer",
			pinned: true,
		})
	})
	it("unknown mode behaves as variable (fail-open to current behavior)", () => {
		expect(
			resolveSaleCustomer({ selected: { id: "C1", name: "عميل" } }),
		).toEqual({ id: "C1", name: "عميل" })
	})
})
