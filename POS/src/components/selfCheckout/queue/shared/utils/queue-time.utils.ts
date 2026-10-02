/**
 * أدوات الوقت — حساب مدد الانتظار والخدمة.
 *
 * لماذا ملف منفصل: متوسط الانتظار يظهر في لوحة التحكم، وقياسه بطريقة
 * مختلفة في كل مكان يعني رقمين مختلفين لنفس الطابور. هنا دالة واحدة.
 * كل الدوال بالمللي ثانية (نفس وحدة الحالة).
 */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export { SECOND, MINUTE, HOUR, DAY }

/** مدّة بالمللي ثانية ⇐ نص عربي مقروءة (5 د). */
export function formatDuration(ms: number): string {
	const value = Number(ms)
	if (!Number.isFinite(value) || value < 0) return "—"
	if (value < MINUTE) return `${Math.round(value / SECOND)} ث`
	if (value < HOUR) return `${Math.floor(value / MINUTE)} د`
	return `${Math.floor(value / HOUR)} س ${Math.floor((value % HOUR) / MINUTE)} د`
}

/** التاريخ بصيغة النطاق اليومي (yyyymmdd) — مفتاح جلسة الطابور. */
export function businessDate(at: Date = new Date()): string {
	const y = at.getFullYear()
	const m = String(at.getMonth() + 1).padStart(2, "0")
	const d = String(at.getDate()).padStart(2, "0")
	return `${y}${m}${d}`
}

/** التاريخ بصيغة ISO وللتسجيل (YYYY-MM-DD) للعرض. */
export function isoDate(at: Date = new Date()): string {
	const y = at.getFullYear()
	const m = String(at.getMonth() + 1).padStart(2, "0")
	const d = String(at.getDate()).padStart(2, "0")
	return `${y}-${m}-${d}`
}

/** الوقت بصيغة HH:MM:ss. */
export function clockTime(at: Date = new Date()): string {
	return [at.getHours(), at.getMinutes(), at.getSeconds()]
		.map((part) => String(part).padStart(2, "0"))
		.join(":")
}

/** الوقت النسبي («قبل 5 د») لآخر النداءات. */
export function relativeTime(from: number, now: number = Date.now()): string {
	const delta = now - from
	if (delta < SECOND) return "الآن"
	if (delta < MINUTE) return `قبل ${Math.floor(delta / SECOND)} ث`
	if (delta < HOUR) return `قبل ${Math.floor(delta / MINUTE)} د`
	return `قبل ${Math.floor(delta / HOUR)} س`
}

/** المتوسط الآمن (لا يقسم على صفر ولا يعيد NaN). */
export function safeAverage(total: number, count: number): number {
	if (!Number.isFinite(total) || !Number.isInteger(count) || count <= 0)
		return 0
	return total / count
}
