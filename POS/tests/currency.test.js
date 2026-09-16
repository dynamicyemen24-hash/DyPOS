/**
 * جناح اختبارات منطق المال — DyPOS World-Class Quality
 * يغطي utils/currency.js: التقريب (Banker/Commercial المطابق لـ frappe)،
 * التنسيق، الأمان من القيم الفاسدة — قلب أي نقطة بيع لا يُمس بلا حماية.
 */
import { describe, expect, it, beforeEach } from "vitest"

import {
	initPrecision,
	getPrecision,
	formatCurrency,
	formatCurrencyNumber,
	formatCurrencySafe,
	getCurrencySymbol,
	round2,
	roundCurrency,
	roundFloat,
} from "@/utils/currency"

describe("initPrecision / getPrecision", () => {
	it("يعيد القيم الافتراضية الآمنة قبل التهيئة", () => {
		const p = getPrecision()
		expect(p.currency).toBe(2)
		expect(p.rounding_method).toBe("Banker's Rounding")
	})

	it("يستوعب التهيئة الجزئية دون كسر البقية", () => {
		initPrecision({ currency: 3 })
		expect(getPrecision().currency).toBe(3)
		expect(getPrecision().float).toBe(3) // بقى افتراضيًا
		initPrecision({ currency: 2 })
	})

	it("يتجاهل التهيئة الفارغة بأمان", () => {
		expect(() => initPrecision(null)).not.toThrow()
		expect(() => initPrecision(undefined)).not.toThrow()
	})
})

describe("التقريب المصرفي (Banker's Rounding) — مطابق لـ frappe", () => {
	beforeEach(() => initPrecision({ rounding_method: "Banker's Rounding" }))

	it("تعادل .5 عند منزلة التقريب يقرب لأقرب زوج", () => {
		// 2.125 / 0.125 / 1.625 قيم ثنائية-تمثيلة بالضبط — تعادل حقيقي عند منزلتين
		expect(round2(2.125)).toBe(2.12)
		expect(round2(0.125)).toBe(0.12)
		expect(round2(1.625)).toBe(1.62)
		expect(round2(3.375)).toBe(3.38) // 337.5 → زوج 338
	})

	it("القيم العادية تقرب طبيعيًا", () => {
		expect(round2(1.234)).toBe(1.23)
		expect(round2(1.236)).toBe(1.24)
		expect(round2(10.005)).toBe(10) // .5 → زوج
	})

	it("يدعم السالب", () => {
		expect(round2(-2.125)).toBe(-2.12)
		expect(round2(-2.126)).toBe(-2.13)
	})

	it("يعامل الصفر والقيم الفاسدة", () => {
		expect(round2(0)).toBe(0)
		expect(round2(Number.NaN)).toBe(0)
	})
})

describe("التقريب التجاري (Commercial Rounding) — .5 بعيدًا عن الصفر", () => {
	beforeEach(() => initPrecision({ rounding_method: "Commercial Rounding" }))

	it("تعادل .5 عند منزلة التقريب يقرب للأعلى دائمًا", () => {
		expect(round2(2.125)).toBe(2.13)
		expect(round2(3.375)).toBe(3.38)
	})

	it("السالب يقرب بعيدًا عن الصفر", () => {
		expect(round2(-2.125)).toBe(-2.13)
	})
})

describe("دقة العملة والطفو من إعدادات النظام", () => {
	it("roundCurrency يحترم دقة العملة المضبوطة", () => {
		initPrecision({ currency: 3, rounding_method: "Commercial Rounding" })
		// 2.0625 تمثيله ثنائي تام — تعادل .5 حقيقي عند 3 منازل
		expect(roundCurrency(2.0625)).toBe(2.063)
		initPrecision({ currency: 2 })
	})

	it("roundFloat يحترم دقة الطفو المضبوطة", () => {
		initPrecision({ float: 3, rounding_method: "Banker's Rounding" })
		// 2062.5 → زوج 2062
		expect(roundFloat(2.0625)).toBe(2.062)
		initPrecision({ float: 3 })
	})
})

describe("formatCurrency — الرمز والسالب والقيم الفاسدة", () => {
	it("يضيف رمز العملة", () => {
		const out = formatCurrency(1234.5)
		expect(out).toContain("ر.س")
		// أرقام لاتينية مع فاصلة عشرية — نتحقق من الأرقام فقط لتفادي اختلاف المحددات
		expect(out.replace(/[^\d.]/g, "").replace(/^0+/, "")).toContain("1234.50")
	})

	it("يحافظ على إشارة السالب", () => {
		const out = formatCurrency(-50)
		expect(out.startsWith("-")).toBe(true)
	})

	it("يرجع نصًا فارغًا للقيم غير الرقمية (سلوك توثيقي)", () => {
		expect(formatCurrency("abc")).toBe("")
		expect(formatCurrency(Number.NaN)).toBe("")
	})
})

describe("formatCurrencyNumber — أرقام بلا رمز", () => {
	it("يستخدم دقة النظام", () => {
		initPrecision({ currency: 2 })
		const out = formatCurrencyNumber(1234.5)
		expect(out.replace(/[^\d.]/g, "")).toBe("1234.50")
	})

	it("يحل القيم الفاسدة إلى 0.00", () => {
		expect(formatCurrencyNumber(Number.NaN)).toBe("0.00")
	})
})

describe("formatCurrencySafe — خط الدفاع أمام القيم الفاسدة", () => {
	beforeEach(() =>
		initPrecision({ currency: 2, rounding_method: "Banker's Rounding" }),
	)

	it("null و undefined و NaN تُعامل كصفر — لا فراغات على الشاشة أبدًا", () => {
		for (const bad of [null, undefined, "abc", Number.NaN]) {
			const out = formatCurrencySafe(bad)
			expect(out).toContain("ر.س")
			expect(out).toContain("0.00")
		}
	})

	it("يقبل السلاسل الرقمية من الـ API", () => {
		const out = formatCurrencySafe("1234.5")
		expect(out.replace(/[^\d.]/g, "")).toContain("1234.50")
	})

	it("يقبل الأعداد الطبيعية", () => {
		const out = formatCurrencySafe(99.99)
		expect(out).toContain("99.99")
	})
})

describe("getCurrencySymbol — جدول الرموز والاكتشاف الديناميكي", () => {
	it("يعرف رموز الخليج والعالم", () => {
		expect(getCurrencySymbol("SAR")).toBe("ر.س")
		expect(getCurrencySymbol("USD")).toBe("$")
		expect(getCurrencySymbol("AED")).toBe("د.إ")
		expect(getCurrencySymbol("KWD")).toBe("د.ك")
	})

	it("يرجع رمز العملة الافتراضي عند غياب الكود", () => {
		expect(typeof getCurrencySymbol("")).toBe("string")
		expect(getCurrencySymbol("").length).toBeGreaterThan(0)
	})

	it("يتعامل مع عملات غير معروفة دون انفجار", () => {
		expect(getCurrencySymbol("XYZ_UNKNOWN")).toBe("XYZ_UNKNOWN")
	})
})
