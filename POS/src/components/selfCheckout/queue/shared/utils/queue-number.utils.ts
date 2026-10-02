/**
 * أدوات رقم التذكرة — تنسيق ومقارنة بدون منطق عمل.
 *
 * كلFunctions هنا نقية وقابلة للاختبار وحدها؛ المنطق التشغيلي في
 * `core/domain/valueObjects/QueueNumber.ts`.
 */

import { TICKET_PAD, TICKET_PREFIX } from "../constants/queue.constants.js"

/** يرقّي تسلسلًا إلى الصيغة المعروضة (A-001). */
export function formatTicketNumber(
	sequence: number,
	// `string` لا `"A"`: بادئة الخدمة من جدول الخدمات (kiosk/desk/…)،
	// ونوع التوكن `as const` يجعله حرفيًا فيتجرّأ كل بادئة غير A.
	prefix: string = TICKET_PREFIX,
): string {
	const safe = Number.isFinite(sequence) ? Math.max(0, Math.trunc(sequence)) : 0
	return `${prefix}-${String(safe).padStart(TICKET_PAD, "0")}`
}

/** يستخرج الرقم من صيغة التذكرة، أو `null`. */
export function parseTicketSequence(ticket: string): number | null {
	const match = /^[A-Z0-9]{1,4}-(\d{1,8})$/.exec(
		String(ticket ?? "").toUpperCase(),
	)
	if (!match?.[1]) return null
	const value = Number(match[1])
	return Number.isInteger(value) && value > 0 ? value : null
}

/** يستخرج البادئة، أو `null`. */
export function parseTicketPrefix(ticket: string): string | null {
	const match = /^([A-Z0-9]{1,4})-\d{1,8}$/.exec(
		String(ticket ?? "").toUpperCase(),
	)
	return match?.[1] ?? null
}

/** رقم «A-007» ⇐ «7». للمقارنة العددية لا النصية. */
export function ticketValue(ticket: string): number {
	return parseTicketSequence(ticket) ?? Number.MAX_SAFE_INTEGER
}

/** هل التذكرة بصيغة صحيحة؟ */
export function isValidTicketNumber(ticket: string): boolean {
	return parseTicketSequence(ticket) !== null
}

/** الرقم التالي بعد ترقيم هذه التذاكر. */
export function nextSequence(numbers: readonly string[]): number {
	return (
		numbers.reduce(
			(max, ticket) => Math.max(max, parseTicketSequence(ticket) ?? 0),
			0,
		) + 1
	)
}
