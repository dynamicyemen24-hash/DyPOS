import { describe, expect, it } from "vitest"

import {
	buildProductIndex,
	resolveScanIntent,
	searchProductIndex,
} from "@/utils/smartSearch"

// =============================================================================
// Fixtures
// =============================================================================

function catalogOf(products) {
	return products.map((product) => ({
		id: product.id,
		name: product.name,
		code: product.code || "",
		barcode: product.barcode || "",
		description: product.description || "",
		price: 10,
	}))
}

const CATALOG = catalogOf([
	{ id: "1", name: "أرز بسمتي", code: "RICE-01", barcode: "6281000" },
	{ id: "2", name: "زيت زيتون", code: "OIL-02", barcode: "6282000" },
	{ id: "3", name: "شاي أخضر", code: "TEA-03", barcode: "6283000" },
	{
		id: "4",
		name: "بسكويت بالشوكولاتة",
		code: "BSC-04",
		description: "حلويات",
	},
	{ id: "5", name: "عصير برتقال", code: "JUS-05", barcode: "1000" },
])

const INDEX = buildProductIndex(CATALOG)

function ids(result) {
	return result.results.map((product) => product.id)
}

describe("buildProductIndex", () => {
	it("يطبّع النص العربي (همزات وتشكيل)", () => {
		const [entry] = buildProductIndex([
			{ id: "a", name: "قَلَم رَصاص", code: "P-٠١" },
		])

		expect(entry.name).toBe("قلم رصاص")
		expect(entry.code).toBe("p-01")
		expect(entry.tokens).toContain("رصاص")
	})

	it("يبني فهرسًا متسامحًا مع مدخلات ناقصة", () => {
		const index = buildProductIndex([
			{ id: "a" },
			null,
			{ id: "b", name: "خبز" },
		])

		expect(index.length).toBe(3)
		expect(index[0].haystack).toBe("")
		expect(index[2].haystack).toBe("خبز")
	})

	it("يعيد مصفوفة فارغة لمدخل غير صالح", () => {
		expect(buildProductIndex(null)).toEqual([])
	})
})

describe("searchProductIndex", () => {
	it("يعيد كل المنتجات عند استعلام فارغ", () => {
		const result = searchProductIndex(INDEX, "   ")

		expect(result.results.length).toBe(CATALOG.length)
		expect(result.approximate).toBe(false)
	})

	it("يعطي الباركود المطابق تامًّا الأولوية المطلقة", () => {
		const result = searchProductIndex(INDEX, "6283000")

		expect(result.approximate).toBe(false)
		expect(ids(result)[0]).toBe("3")
	})

	it("يرتّب رمز الصنف المطابق تامًّا أولًا", () => {
		const result = searchProductIndex(INDEX, "RICE-01")

		expect(ids(result)[0]).toBe("1")
	})

	it("يسبّق بداية الاسم على الاحتواء", () => {
		const result = searchProductIndex(INDEX, "شاي")

		expect(ids(result)[0]).toBe("3")
	})

	it("يتسامح مع ترتيب الكلمات في الاستعلام", () => {
		const result = searchProductIndex(INDEX, "بسمتي أرز")

		expect(result.approximate).toBe(false)
		expect(ids(result)).toContain("1")
	})

	it("يطابق الأرقام العربية الهندية", () => {
		const result = searchProductIndex(INDEX, "١٠٠٠")

		expect(ids(result)[0]).toBe("5")
	})

	it("يرفع ترتيب الصنف الأسرع بيعًا عند تعادل الصلة", () => {
		const result = searchProductIndex(INDEX, "شاي أخضر", {
			popularity: (product) => (product.id === "5" ? 0 : 0),
		})

		expect(ids(result)[0]).toBe("3")

		const boosted = searchProductIndex(INDEX, "628", {
			popularity: (product) => (product.id === "2" ? 50 : 0),
		})

		// "628" يطابق ثلاثة باركودات بنفس الدرجة — الأكثر بيعًا يتقدم.
		expect(ids(boosted)[0]).toBe("2")
	})

	it("يتراجع إلى المطابقة التقريبية عند الخطأ الإملائي", () => {
		const result = searchProductIndex(INDEX, "بسكوت")

		expect(result.approximate).toBe(true)
		expect(ids(result)).toContain("4")
	})

	it("لا يشغّل المطابقة التقريبية للاستعلامات القصيرة", () => {
		const result = searchProductIndex(INDEX, "زة")

		expect(result.results).toEqual([])
		expect(result.approximate).toBe(false)
	})

	it("يمكن تعطيل المطابقة التقريبية صراحةً", () => {
		const result = searchProductIndex(INDEX, "بسكوت", { fuzzy: false })

		expect(result.results).toEqual([])
		expect(result.approximate).toBe(false)
	})

	it("يحترم حد النتائج وحد الفحص التقريبي", () => {
		expect(searchProductIndex(INDEX, "6", { limit: 2 }).results.length).toBe(2)
		expect(
			searchProductIndex(INDEX, "بسكوت", { fuzzyScanLimit: 1 }).results,
		).toEqual([])
	})

	it("آمن مع مدخلات غير صالحة", () => {
		expect(searchProductIndex(null, "قلم").results).toEqual([])
		expect(searchProductIndex(INDEX, null).results.length).toBe(CATALOG.length)
		expect(searchProductIndex(INDEX, "لا يوجد إطلاقًا").results).toEqual([])
	})
})

describe("resolveScanIntent", () => {
	it("يُضيف فورًا عند باركود مطابق تامًّا", () => {
		const intent = resolveScanIntent(INDEX, "6283000")

		expect(intent.action).toBe("add")
		expect(intent.reason).toBe("barcode")
		expect(intent.product.id).toBe("3")
		expect(intent.results).toEqual([intent.product])
	})

	it("يقبل الباركود المكتوب بالأرقام العربية الهندية", () => {
		expect(resolveScanIntent(INDEX, "٦٢٨٣٠٠٠").product.id).toBe("3")
		expect(resolveScanIntent(INDEX, "٢٨٢٠٠٠").product.id).toBe("2")
		expect(resolveScanIntent(INDEX, "٢٨٣٠٠٠").product.id).toBe("3")
	})

	it("يُضيف فورًا عند رمز صنف مطابق تامًّا", () => {
		const intent = resolveScanIntent(INDEX, "oil-02")

		expect(intent.action).toBe("add")
		expect(intent.reason).toBe("code")
		expect(intent.product.id).toBe("2")

		expect(resolveScanIntent(INDEX, "RICE-01").product.id).toBe("1")
		expect(resolveScanIntent(INDEX, "jus-05").product.id).toBe("5")
	})

	it("يعتبر القراءة الرقمية الطويلة الوحيدة باركودًا", () => {
		const scannerIndex = buildProductIndex([
			{ id: "a", name: "صنف أ", barcode: "6281000" },
			{ id: "b", name: "صنف ب", barcode: "7702000" },
		])

		// الماسح يقرأ باركودًا مخزّنًا بصيغة أطول (بادئة بلد/حشو).
		const intent = resolveScanIntent(scannerIndex, "06281000125")

		expect(intent.action).toBe("add")
		expect(intent.reason).toBe("barcode")
		expect(intent.product.id).toBe("a")
	})

	it("يعتبر الرمز الرقمي الطويل المطابق تامًّا رمز صنف", () => {
		const digitIndex = buildProductIndex([
			{ id: "x", name: "صنف بلا باركود", code: "000123456" },
		])

		const intent = resolveScanIntent(digitIndex, "000123456")

		expect(intent.action).toBe("add")
		expect(intent.reason).toBe("code")
	})

	it("يضيف عند وجود نتيجة دقيقة وحيدة", () => {
		const intent = resolveScanIntent(INDEX, "برتقال")

		expect(intent.action).toBe("add")
		expect(intent.reason).toBe("single")
		expect(intent.product.id).toBe("5")

		const explicit = resolveScanIntent(INDEX, "شاي أخضر", { minLength: 3 })

		expect(explicit.action).toBe("add")
		expect(explicit.reason).toBe("single")
		expect(explicit.product.id).toBe("3")
	})

	it("لا يحسم عند أكثر من مطابقة — يُعيد القائمة للكاشير", () => {
		const intent = resolveScanIntent(INDEX, "628")

		expect(intent.action).toBe("list")
		expect(intent.reason).toBe("multiple")
		expect(intent.product).toBeNull()
		expect(intent.results.length).toBeGreaterThan(1)
	})

	it("لا يحسم عند وجود التباس بالاسم", () => {
		const ambiguous = buildProductIndex([
			{ id: "a", name: "عصير برتقال" },
			{ id: "b", name: "عصير تفاح" },
		])

		const intent = resolveScanIntent(ambiguous, "عصير", { minLength: 3 })

		expect(intent.action).toBe("list")
		expect(intent.reason).toBe("multiple")
		expect(intent.product).toBeNull()
		expect(intent.results.length).toBe(2)
	})

	it("لا يضيف عند تكرار الباركود لصنفين مختلفين (غموض البيانات)", () => {
		const ambiguous = buildProductIndex([
			{ id: "a", name: "صنف أ", barcode: "999" },
			{ id: "b", name: "صنف ب", barcode: "999" },
		])

		const intent = resolveScanIntent(ambiguous, "999")

		expect(intent.action).toBe("list")
		expect(intent.reason).toBe("multiple")
		expect(intent.product).toBeNull()
		expect(intent.results.length).toBe(2)
	})

	it("لا يضيف للاستعلامات القصيرة حتى لو كانت النتيجة وحيدة", () => {
		const short = resolveScanIntent(INDEX, "زي")

		expect(short.action).toBe("list")
		expect(short.reason).toBe("short-query")
		expect(short.product).toBeNull()
		expect(short.results.length).toBe(1)

		expect(resolveScanIntent(INDEX, "شا").reason).toBe("short-query")
		expect(resolveScanIntent(INDEX, "شا").action).toBe("list")
	})

	it("يحترم عتبة minLength المخصّصة", () => {
		expect(resolveScanIntent(INDEX, "زي", { minLength: 2 }).action).toBe("add")

		expect(resolveScanIntent(INDEX, "زي", { minLength: 1 }).action).toBe("add")

		const strict = resolveScanIntent(INDEX, "عصير", { minLength: 6 })

		expect(strict.action).toBe("list")
		expect(strict.reason).toBe("short-query")
	})

	it("يُرجع empty للاستعلام الفارغ أو بلا مطابقة", () => {
		expect(resolveScanIntent(INDEX, "   ").reason).toBe("empty")

		const missing = resolveScanIntent(INDEX, "منتج غير موجود إطلاقًا")

		expect(missing.action).toBe("empty")
		expect(missing.reason).toBe("no-match")
		expect(missing.results).toEqual([])

		expect(resolveScanIntent(INDEX, "٩٩٩٩٩٩٩").reason).toBe("no-match")
	})

	it("لا يعتمد على المطابقة التقريبية في قرار الإضافة", () => {
		// «بسكوت» خطأ إملائي — لا يجوز إضافة صنف بالخطأ تلقائيًا.
		const intent = resolveScanIntent(INDEX, "بسكوت")

		expect(intent.action).toBe("empty")
		expect(intent.reason).toBe("no-match")
		expect(intent.product).toBeNull()
	})

	it("يمرّر الترجيح التعلّمي بلا تغيير في قرار الحسم", () => {
		const intent = resolveScanIntent(INDEX, "برتقال", { popularity: () => 0 })

		expect(intent.action).toBe("add")
		expect(intent.product.id).toBe("5")

		const partial = resolveScanIntent(INDEX, "628", {
			popularity: (product) => (product.id === "1" ? 40 : 0),
		})

		// «628» ليس باركودًا كاملًا لأي صنف، والمرشحون أكثر من واحد.
		expect(partial.action).toBe("list")
	})

	it("آمن مع فهرس أو استعلام غير صالح", () => {
		expect(resolveScanIntent(null, "6283000").action).toBe("empty")
		expect(resolveScanIntent(INDEX, null).action).toBe("empty")
		expect(resolveScanIntent(INDEX, null).reason).toBe("empty")
		expect(resolveScanIntent(INDEX, 6283000).action).toBe("add")
		expect(resolveScanIntent(null, "قلم").action).toBe("empty")
	})
})
