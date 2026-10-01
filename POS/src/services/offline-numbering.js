/**
 * OfflineNumbering — ترقيم فواتير أوفلاين منظم وذريّ.
 *
 * عند انقطاع الشبكة لا يمكن جلب رقم تسلسلي من الخادم، فنولّد أرقامًا
 * محلية منظمة ومتفردة:  POS-{الفرع}-{الطرفية}-{yyyymmdd}-{تسلسل}
 * مثال: POS-RYD-T03-20260915-00042
 *
 * العداد **مستقل لكل نقطة بيع** (فرع + طرفية + يوم): تبديل الفروع على
 * نفس الجهاز لا يمزج التسلسلات، ولا تنتظر أي نقطة عدّادًا مشتركًا.
 * ولأن الجهاز قد يكون سلّم أرقامًا بالصيغة القديمة (عداد عام بالتاريخ
 * فقط) قبل هذا التغيير، يُزرع العداد الجديد من قيمة العداد القديمة عند
 * أول استخدام — فلا يعيد أي رقم سبق إصداره أبدًا (الفجوات مقبولة،
 * التكرار ممنوع). التسلسل اليومي وذري عبر معاملة Dexie، والخادم يعيد
 * التعيين عند المزامنة.
 */

import db from "./db.js"

export const SEQUENCE_PREFIX = "offlineInvoiceSeq"
export const SEQUENCE_PAD = 5

/** النطاق الافتراضي — يطابق القيم الافتراضية في nextOfflineInvoiceNumber. */
export const DEFAULT_SCOPE = Object.freeze({ branch: "BR", terminal: "T1" })

/**
 * تنظيف رمز الفرع/الطرفية إلى أحرف آمنة `[A-Z0-9]` (حتى 8).
 * @param {*} value
 * @param {string} fallback
 * @returns {string}
 */
export function cleanScopeToken(value, fallback) {
	return (
		String(value || fallback || "")
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "")
			.slice(0, 8) || String(fallback || "")
	)
}

/**
 * مفتاح عداد التسلسل ليوم معين (kind يسمح بعدادات لكل نوع مستند).
 * هذا هو المفتاح القديم العام (بالتاريخ فقط) — يُستعمل للتوارث عند أول
 * استخدام لنطاق جديد، ولمعدات التوافق.
 * @param {string} yyyymmdd
 * @param {string} [kind] - نوع المستند (invoice | delivery | request ...).
 * @returns {string}
 */
export function sequenceKey(yyyymmdd, kind = "offlineInvoiceSeq") {
	return `${kind}:${yyyymmdd}`
}

/**
 * مفتاح عداد مستقل **لكل نقطة بيع**: فرع + طرفية + يوم.
 * @param {string} yyyymmdd
 * @param {{branch?: string, terminal?: string}} [scope]
 * @param {string} [kind]
 * @returns {string}
 */
export function scopedSequenceKey(
	yyyymmdd,
	scope = DEFAULT_SCOPE,
	kind = "offlineInvoiceSeq",
) {
	const b = cleanScopeToken(scope?.branch, DEFAULT_SCOPE.branch)
	const t = cleanScopeToken(scope?.terminal, DEFAULT_SCOPE.terminal)
	return `${kind}:${b}:${t}:${yyyymmdd}`
}

/**
 * تنسيق تاريخ بترتيب yyyymmdd.
 * @param {Date} date
 * @returns {string}
 */
export function toYyyymmdd(date) {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, "0")
	const d = String(date.getDate()).padStart(2, "0")
	return `${y}${m}${d}`
}

/**
 * بناء رقم مستند أوفلاين من مكوناته.
 * @param {Object} opts
 * @param {string} opts.branch
 * @param {string} opts.terminal
 * @param {string} opts.yyyymmdd
 * @param {number} opts.seq
 * @param {string} [opts.prefix] - بادئة المستند (افتراضي POS).
 * @returns {string}
 */
export function formatOfflineInvoiceNumber({
	branch,
	terminal,
	yyyymmdd,
	seq,
	prefix = "POS",
}) {
	const p = cleanScopeToken(prefix, "POS")
	const b = cleanScopeToken(branch, "BR")
	const t = cleanScopeToken(terminal, "T1")
	const s = String(seq).padStart(SEQUENCE_PAD, "0")
	return `${p}-${b}-${t}-${yyyymmdd}-${s}`
}

/**
 * توليد الرقم التالي ذريًا (آمن مع عدة تبويبات/مستخدمين على نفس الطرفية).
 * @param {Object} [opts]
 * @param {string} [opts.branch] - رمز الفرع.
 * @param {string} [opts.terminal] - رمز الطرفية.
 * @param {Date} [opts.date]
 * @param {Object} [opts.store]
 * @param {string} [opts.kind] - نوع المستند: invoice | delivery | request.
 * @param {string} [opts.prefix] - بادئة مخصصة (افتراضي POS).
 * @returns {Promise<{invoiceNumber: string, seq: number, yyyymmdd: string}>}
 */
export async function nextOfflineInvoiceNumber({
	branch = DEFAULT_SCOPE.branch,
	terminal = DEFAULT_SCOPE.terminal,
	date = new Date(),
	store = db,
	kind = "offlineInvoiceSeq",
	prefix = "POS",
} = {}) {
	const yyyymmdd = toYyyymmdd(date)
	const scope = { branch, terminal }
	const key = scopedSequenceKey(yyyymmdd, scope, kind)
	const legacyKey = sequenceKey(yyyymmdd, kind)

	const seq = await store.transaction("rw", store.settings, async () => {
		const row = await store.settings.get(key)
		if (row) {
			const next = (Number(row.value) || 0) + 1
			await store.settings.put({ key, value: next })
			return next
		}
		// أول استخدام لهذا النطاق اليوم: ورِّث عداد الجهاز القديم
		// (عام بالتاريخ) حتى لا يُعاد رقم سبق إصداره على هذا الجهاز.
		const legacy = await store.settings.get(legacyKey)
		const next = (Number(legacy?.value) || 0) + 1
		await store.settings.put({ key, value: next })
		return next
	})

	return {
		invoiceNumber: formatOfflineInvoiceNumber({
			branch,
			terminal,
			yyyymmdd,
			seq,
			prefix,
		}),
		seq,
		yyyymmdd,
	}
}

/**
 * آخر تسلسل مستخدم ليوم معين (للتقارير والتشخيص).
 * يقرأ العداد المستقل للنطاق الممرَّ، مع التراجع للعداد القديم العام.
 * @param {string} yyyymmdd
 * @param {Object} [store]
 * @param {string} [kind]
 * @param {{branch?: string, terminal?: string}} [scope]
 * @returns {Promise<number>}
 */
export async function peekSequence(
	yyyymmdd,
	store = db,
	kind = "offlineInvoiceSeq",
	scope = DEFAULT_SCOPE,
) {
	const scoped = await store.settings.get(
		scopedSequenceKey(yyyymmdd, scope, kind),
	)
	if (scoped) return Number(scoped.value) || 0
	const legacy = await store.settings.get(sequenceKey(yyyymmdd, kind))
	return Number(legacy?.value) || 0
}

export default {
	SEQUENCE_PREFIX,
	SEQUENCE_PAD,
	DEFAULT_SCOPE,
	cleanScopeToken,
	sequenceKey,
	scopedSequenceKey,
	toYyyymmdd,
	formatOfflineInvoiceNumber,
	nextOfflineInvoiceNumber,
	peekSequence,
}
