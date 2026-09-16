/**
 * smartSearch — محرك البحث الذكي لشاشة الكاشير.
 *
 * يحل ثلاث مشاكل حقيقية في نقاط البيع العربية:
 *   1. الكاشير يكتب «قلم» والكتالوج يحوي «قَلَم» أو «قلم رصاص» أو أرقامًا عربية.
 *   2. الكاشير يخطئ بحرف واحد فيبقى الشاشة فارغة بلا نتيجة.
 *   3. نتيجتان بنفس الصلة — أيّهما يظهر أولًا؟ نرتّب حسب ما تعلمه النظام من
 *      سلوك البيع الفعلي (الأسرع بيعًا أولًا).
 *
 * التصميم: فهرسة مرة واحدة لكل تغيير في الكتالوج (لا لكل ضغطة مفتاح)، ثم
 * مطابقة خفيفة على فهرس مُطبَّع مسبقًا — آمنة مع كتالوجات 65K+ صنف.
 *
 * ويضيف طبقة «نية المسح» (resolveScanIntent): عند ضغط Enter في حقل البحث،
 * هل هذا باركود؟ رمز صنف؟ نتيجة وحيدة قاطعة؟ فيُضاف الصنف فورًا بلا نقر.
 *
 * منطق نقي بلا DOM وبلا تبعيات خارجية.
 */

import { normalizeArabic } from "@/utils/arabic"
import { fuzzyMatch } from "@/utils/fuzzyMatch"

/** أقصى عدد أصناف يُفحص في المطابقة التقريبية (حماية للأداء). */
export const DEFAULT_FUZZY_SCAN_LIMIT = 4000

/** أقل طول للاستعلام قبل تشغيل المطابقة التقريبية. */
export const MIN_FUZZY_QUERY_LENGTH = 3

/** أقل طول لسلسلة رقمية قبل اعتبارها قراءة باركود من آلة. */
export const MIN_BARCODE_LENGTH = 6

/** أقصى نتائج تُرجَع للقائمة عند استعلام قصير جدًّا. */
const INTENT_LIST_LIMIT = 160

/** حد التشابه المقبول في المطابقة التقريبية. */
const FUZZY_THRESHOLD = 0.7

const TOKEN_SPLITTER = /[\s/,|;:+_\-.[\]()]+/
const DIGITS_ONLY = /^\d+$/

function normalizeText(value) {
	return normalizeArabic(
		typeof value === "string" ? value : String(value ?? ""),
	)
}

function tokenize(text) {
	if (!text) {
		return []
	}

	return text.split(TOKEN_SPLITTER).filter(Boolean)
}

/**
 * فهرسة الكتالوج مرة واحدة — التطبيع العربي مسبقًا.
 * @param {Array<Object>} products
 * @returns {Array<{ product: Object, name: string, code: string, barcode: string, description: string, haystack: string, tokens: string[] }>}
 */
export function buildProductIndex(products) {
	const items = Array.isArray(products) ? products : []

	return items.map((product) => {
		const name = normalizeText(product?.name)
		const code = normalizeText(product?.code)
		const barcode = normalizeText(product?.barcode)
		const description = normalizeText(product?.description)

		const haystack = [name, code, barcode, description]
			.filter(Boolean)
			.join(" ")

		return {
			product,
			name,
			code,
			barcode,
			description,
			haystack,
			tokens: tokenize(haystack),
		}
	})
}

/** درجة الصلة بين استعلام مُطبَّع وسطر مفهرس. */
function scoreEntry(entry, query) {
	if (!query) {
		return 0
	}

	let score = 0

	// الباركود والرمز: مطابقة تامة = أعلى أولوية (سلوك المسح السريع).
	if (entry.barcode && entry.barcode === query) {
		score = Math.max(score, 120)
	}

	// كتابة جزء من الباركود شائعة على الكاشير — تُعامل كمطابقة قوية.
	if (entry.barcode?.includes(query)) {
		score = Math.max(score, 100)
	}

	if (entry.code && entry.code === query) {
		score = Math.max(score, 110)
	}

	if (entry.code?.startsWith(query)) {
		score = Math.max(score, 95)
	}

	if (entry.name.startsWith(query)) {
		score = Math.max(score, 90)
	}

	if (entry.name.includes(query)) {
		score = Math.max(score, 75)
	}

	if (entry.code.includes(query)) {
		score = Math.max(score, 60)
	}

	if (entry.description.includes(query)) {
		score = Math.max(score, 35)
	}

	// «أرز بسمتي» يجب أن يُطابق «بسمتي أرز» مهما كان ترتيب الكلمات.
	if (score === 0) {
		const words = tokenize(query)

		if (
			words.length > 1 &&
			words.every((word) => entry.haystack.includes(word))
		) {
			score = 50
		}
	}

	return score
}

/**
 * بحث ذكي داخل فهرس جاهز.
 *
 * @param {Array<Object>} index ناتج buildProductIndex.
 * @param {string} query نص الكاشير.
 * @param {Object} [options]
 * @param {number} [options.limit=160] أقصى عدد نتائج.
 * @param {(product: Object) => number} [options.popularity] ترجيح تعلّمي (الأكثر بيعًا).
 * @param {boolean} [options.fuzzy=true] تشغيل المطابقة التقريبية عند عدم وجود نتائج.
 * @param {number} [options.fuzzyScanLimit=4000] أقصى أصناف تُفحص تقريبيًا.
 * @returns {{ results: Array<Object>, approximate: boolean, query: string }}
 */
export function searchProductIndex(index, query, options = {}) {
	const entries = Array.isArray(index) ? index : []
	const raw = typeof query === "string" ? query : String(query ?? "")
	const trimmed = raw.trim()

	if (!trimmed) {
		return {
			results: entries.map((entry) => entry.product),
			approximate: false,
			query: "",
		}
	}

	const limit = Math.max(1, Number(options.limit) || 160)
	const popularity =
		typeof options.popularity === "function" ? options.popularity : null

	const boostOf = (entry) => {
		if (!popularity) {
			return 0
		}

		const value = Number(popularity(entry.product))

		return Number.isFinite(value) ? value : 0
	}

	const normalizedQuery = normalizeText(trimmed)
	const scored = []

	for (const entry of entries) {
		const score = scoreEntry(entry, normalizedQuery)

		if (score > 0) {
			scored.push({ entry, score: score + boostOf(entry) })
		}
	}

	if (scored.length) {
		// الفرز مستقر: النتائج متساوية الدرجة تحفظ ترتيب الكتالوج.
		scored.sort((first, second) => second.score - first.score)

		return {
			results: scored.slice(0, limit).map((item) => item.entry.product),
			approximate: false,
			query: trimmed,
		}
	}

	if (
		options.fuzzy === false ||
		normalizedQuery.length < MIN_FUZZY_QUERY_LENGTH
	) {
		return { results: [], approximate: false, query: trimmed }
	}

	const scanLimit = Math.min(
		entries.length,
		Math.max(0, Number(options.fuzzyScanLimit) || DEFAULT_FUZZY_SCAN_LIMIT),
	)

	const approximateHits = []

	for (let position = 0; position < scanLimit; position += 1) {
		const entry = entries[position]

		const matched = entry.tokens.some((token) =>
			fuzzyMatch(normalizedQuery, token, { threshold: FUZZY_THRESHOLD }),
		)

		if (matched) {
			approximateHits.push(entry.product)

			if (approximateHits.length >= limit) {
				break
			}
		}
	}

	return {
		results: approximateHits,
		approximate: approximateHits.length > 0,
		query: trimmed,
	}
}
/* ==========================================================================
 * نية المسح — Scan Intent
 * ======================================================================== */

function addIntent(product, reason) {
	return { action: "add", reason, product, results: [product] }
}

function listIntent(reason, results) {
	return { action: "list", reason, product: null, results: results || [] }
}

function emptyIntent(reason) {
	return { action: "empty", reason, product: null, results: [] }
}

/**
 * قرار «المسح السريع» — ماذا يفعل الكاشير عند ضغط Enter بعد الكتابة/المسح؟
 *
 * ثورة تشغيلية: بدل أن يبحث الكاشير ثم ينقر المنتج ثم يعود لحقل البحث، يكتب
 * أو يمسح الرمز ثم Enter — فيُضاف الصنف ويُفرَّغ الحقل ويبقى المؤشر جاهزًا
 * للصنف التالي (مسح متواصل بلا لمس الشاشة).
 *
 * لا نُضيف تلقائيًا إلا عند وجود «قرار قاطع»:
 *   - باركود مطابق تامًّا ووحيد (سجل الباركود في الكتالوج).
 *   - رمز صنف مطابق تامًّا ووحيد.
 *   - قراءة رقمية (6 أرقام أو أكثر) تطابق جزئيًا سجل باركود واحدًا فقط —
 *     حالة الماسح الذي يقرأ باركودًا مخزّنًا بصيغة أطول.
 *   - نتيجة بحث واحدة لا لبس فيها لاستعلام بطول كافٍ.
 * خلاف ذلك نُعيد القائمة ليختار الكاشير — لا نُغامر بإضافة صنف خاطئ للفاتورة.
 *
 * ملاحظة جوهرية: قرار الإضافة لا يستخدم المطابقة التقريبية إطلاقًا، فصنف
 * خاطئ في الفاتورة أغلى بكثير من نقرة إضافية.
 *
 * @param {Array<Object>} index ناتج buildProductIndex.
 * @param {string} query ما كتبه/مسحه الكاشير.
 * @param {Object} [options]
 * @param {number} [options.minLength=3] أقل طول للاستعلام لقبول قرار «نتيجة وحيدة».
 * @param {(product: Object) => number} [options.popularity] ترجيح تعلّمي.
 * @returns {{ action: "add"|"list"|"empty", reason: string, product: Object|null, results: Array<Object> }}
 */
export function resolveScanIntent(index, query, options = {}) {
	const entries = Array.isArray(index) ? index : []
	const raw = typeof query === "string" ? query : String(query ?? "")
	const trimmed = raw.trim()

	if (!trimmed) {
		return emptyIntent("empty")
	}

	const minLength = Math.max(1, Number(options.minLength) || 3)
	const normalizedQuery = normalizeText(trimmed)

	const search = (limit) =>
		searchProductIndex(entries, trimmed, {
			limit,
			fuzzy: false,
			popularity: options.popularity,
		})

	/*
	 * 1) باركود مطابق تامًّا — قرار قاطع (الماسح الضوئي).
	 *    إن تكرر الباركود لصنفين (غموض بيانات) لا نُغامر: نعرض القائمة.
	 */
	const barcodeMatches = entries.filter(
		(entry) => entry.barcode && entry.barcode === normalizedQuery,
	)

	if (barcodeMatches.length === 1) {
		return addIntent(barcodeMatches[0].product, "barcode")
	}

	if (barcodeMatches.length > 1) {
		return listIntent(
			"multiple",
			barcodeMatches.map((entry) => entry.product),
		)
	}

	/*
	 * 2) رمز صنف مطابق تامًّا — الكاشير يحفظ رموز متجره، فهو قرار قاطع أيضًا،
	 *    وبنفس حماية الغموض أعلاه.
	 */
	const codeMatches = entries.filter(
		(entry) => entry.code && entry.code === normalizedQuery,
	)

	if (codeMatches.length === 1) {
		return addIntent(codeMatches[0].product, "code")
	}

	if (codeMatches.length > 1) {
		return listIntent(
			"multiple",
			codeMatches.map((entry) => entry.product),
		)
	}

	/*
	 * 3) قراءة رقمية طويلة: ماسح يقرأ باركودًا مخزّنًا بصيغة أطول أو أقصر
	 *    (بادئة الشركة/الحشو). نقبلها فقط إذا طابقت سجل باركود واحدًا لا أكثر —
	 *    الالتباس يعني المرور للقائمة.
	 */
	const isScannerReading =
		DIGITS_ONLY.test(normalizedQuery) &&
		normalizedQuery.length >= MIN_BARCODE_LENGTH

	if (isScannerReading) {
		const partialMatches = entries.filter((entry) => {
			if (!entry.barcode) {
				return false
			}

			return (
				entry.barcode.includes(normalizedQuery) ||
				normalizedQuery.includes(entry.barcode)
			)
		})

		if (partialMatches.length === 1) {
			return addIntent(partialMatches[0].product, "barcode")
		}
	}

	// استعلام قصير جدًّا: نعرض ما توفّر ولا نحسم نيابة عن الكاشير.
	if (normalizedQuery.length < minLength) {
		return listIntent("short-query", search(INTENT_LIST_LIMIT).results)
	}

	// 4) نتيجة وحيدة لا لبس فيها — تُضاف فورًا.
	const matches = search(2).results

	if (matches.length === 1) {
		return addIntent(matches[0], "single")
	}

	if (!matches.length) {
		return emptyIntent("no-match")
	}

	return listIntent("multiple", matches)
}

export default searchProductIndex
