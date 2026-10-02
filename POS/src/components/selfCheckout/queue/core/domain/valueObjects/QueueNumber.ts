/**
 * رقم التذكرة — value object مُغلَّف.
 *
 * لماذا value object: رقم التذكرة يظهر في الشاشة والنداء الصوتي والإيصال
 * والبلاغ. لو كان `string` عاديًا لأمكن تمرير `""` أو رقم مكرر أو رقم
 * بصيغة `A-1` في نص. هنا يُبنى مرة واحدة ويُتحقق منه عند المدخل.
 *
 * الصيغة: `{prefix}-{sequence}` مثل `A-001`. لا يوجد رقم صفري (محجوز لـ«لا
 * تذكرة») ولا رقم أكبر من `MAX_TICKET_NUMBER`.
 */

import {
	MAX_TICKET_NUMBER,
	TICKET_PAD,
} from "../../../shared/constants/queue.constants.js"
import {
	QUEUE_ERROR_CODES,
	QueueError,
} from "../../../shared/errors/QueueError.js"

/** رقم تذكرة صالح. */
export interface QueueNumber {
	readonly prefix: string
	readonly sequence: number
	/** الصيغة المعروضة. */
	readonly value: string
}

/** يبني رقم تذكرة مع التحقق. */
export function createQueueNumber(
	prefix: string,
	sequence: number,
): QueueNumber {
	const cleanPrefix = normalizePrefix(prefix)
	if (!Number.isInteger(sequence) || sequence < 1) {
		throw new QueueError(
			QUEUE_ERROR_CODES.VALIDATION,
			"رقم التذكرة يجب أن يكون رقمًا صحيحًا أكبر من صفر",
			{ from: String(sequence) },
		)
	}
	if (sequence > MAX_TICKET_NUMBER) {
		throw new QueueError(
			QUEUE_ERROR_CODES.VALIDATION,
			"تجاوز رقم التذكرة الحدّ المسموح",
			{ to: String(sequence) },
		)
	}
	const padded = String(sequence).padStart(TICKET_PAD, "0")
	return { prefix: cleanPrefix, sequence, value: `${cleanPrefix}-${padded}` }
}

/** ينظّف بادئة الخدمة (A-Z0-9، حتى 4 خانات). */
export function normalizePrefix(prefix: string): string {
	const cleaned = String(prefix ?? "")
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, "")
		.slice(0, 4)
	if (!cleaned) {
		throw new QueueError(
			QUEUE_ERROR_CODES.VALIDATION,
			"بادئة رقم التذكرة مطلوبة",
		)
	}
	return cleaned
}

/** يستخرج الرقم الرقمي من `A-007` → `7`. */
export function sequenceFromNumber(number: string): number | null {
	const match = /^([A-Z0-9]{1,4})-(\d{1,8})$/.exec(
		String(number ?? "").toUpperCase(),
	)
	if (!match?.[2]) return null
	const value = Number(match[2])
	return Number.isInteger(value) && value > 0 ? value : null
}

/** يستخرج البادئة من `A-007` → `A`. */
export function prefixFromNumber(number: string): string | null {
	const match = /^([A-Z0-9]{1,4})-(\d{1,8})$/.exec(
		String(number ?? "").toUpperCase(),
	)
	return match?.[1] ?? null
}

/** هل القيمة رقم تذكرة صالح؟ */
export function isQueueNumber(value: unknown): boolean {
	return sequenceFromNumber(String(value ?? "")) !== null
}

/**
 * يقارن رقمين حسب **الرقم** لا الصيغة النصية.
 * بدونها يرتّب `A-10` قبل `A-9` لأن «1» < «9» نصيًا.
 */
export function compareQueueNumbers(a: string, b: string): number {
	const left = sequenceFromNumber(a) ?? 0
	const right = sequenceFromNumber(b) ?? 0
	return left - right
}
