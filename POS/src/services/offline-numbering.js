/**
 * OfflineNumbering — ترقيم فواتير أوفلاين منظم وذريّ.
 *
 * عند انقطاع الشبكة لا يمكن جلب رقم تسلسلي من الخادم، فنولّد أرقامًا
 * محلية منظمة ومتفردة:  POS-{الفرع}-{الطرفية}-{yyyymmdd}-{تسلسل}
 * مثال: POS-RYD-T03-20260915-00042
 * التسلسل يومي وذري عبر معاملة Dexie، والخادم يعيد التعيين عند المزامنة.
 */

import db from "./db.js"

export const SEQUENCE_PREFIX = "offlineInvoiceSeq"
export const SEQUENCE_PAD = 5

/**
 * مفتاح عداد التسلسل ليوم معين (kind يسمح بعدادات لكل نوع مستند).
 * @param {string} yyyymmdd
 * @param {string} [kind] - نوع المستند (invoice | delivery | request ...).
 * @returns {string}
 */
export function sequenceKey(yyyymmdd, kind = "offlineInvoiceSeq") {
	return `${kind}:${yyyymmdd}`
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
	const clean = (value, fallback) =>
		String(value || fallback || "")
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, "")
			.slice(0, 8)
	const p = clean(prefix, "POS") || "POS"
	const b = clean(branch, "BR") || "BR"
	const t = clean(terminal, "T1") || "T1"
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
	branch = "BR",
	terminal = "T1",
	date = new Date(),
	store = db,
	kind = "offlineInvoiceSeq",
	prefix = "POS",
} = {}) {
	const yyyymmdd = toYyyymmdd(date)
	const key = sequenceKey(yyyymmdd, kind)

	const seq = await store.transaction("rw", store.settings, async () => {
		const row = await store.settings.get(key)
		const next = (Number(row?.value) || 0) + 1
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
 * @param {string} yyyymmdd
 * @param {Object} [store]
 * @param {string} [kind]
 * @returns {Promise<number>}
 */
export async function peekSequence(yyyymmdd, store = db, kind = "offlineInvoiceSeq") {
	const row = await store.settings.get(sequenceKey(yyyymmdd, kind))
	return Number(row?.value) || 0
}

export default {
	SEQUENCE_PREFIX,
	SEQUENCE_PAD,
	sequenceKey,
	toYyyymmdd,
	formatOfflineInvoiceNumber,
	nextOfflineInvoiceNumber,
	peekSequence,
}
