/**
 * أخطاء الطابور — نوع واحد يحمل رمزًا قابلًا للآلة ورسالة عربية.
 *
 * لماذا لا نرمي `Error` عاديًا: الواجهة تعرض «رقم 42 ذهب。网络 منقطع،
 * أعد المحاولة» ولإثبات ذلك يجب أن تعرف *لماذا* فشل النداء. الرمز
 * (`code`) هو ما تستهلكه الشاشة؛ الرسالة عربية دائمة (AGENTS.md 7).
 */

/** رموز أخطاء الطابور — مستقرة عبر الإصدارات (تُستهلك في الواجهة والسجل). */
export const QUEUE_ERROR_CODES = Object.freeze({
	/** محاولة انتقال حالة غير مسموح بها. */
	INVALID_TRANSITION: "QUEUE_INVALID_TRANSITION",
	/** تذكرة غير موجودة. */
	TICKET_NOT_FOUND: "QUEUE_TICKET_NOT_FOUND",
	/** رقم تذكرة مكرر في نفس الجلسة. */
	DUPLICATE_TICKET: "QUEUE_DUPLICATE_TICKET",
	/** لا يوجد منتظر لاستدعائه. */
	QUEUE_EMPTY: "QUEUE_EMPTY",
	/** الكاونتر مشغول بتذكرة أخرى. */
	COUNTER_BUSY: "QUEUE_COUNTER_BUSY",
	/** كاونتر مغلق. */
	COUNTER_CLOSED: "QUEUE_COUNTER_CLOSED",
	/** جلسة الطابور مغلقة. */
	SESSION_CLOSED: "QUEUE_SESSION_CLOSED",
	/** لا جلسة نشطة. */
	NO_ACTIVE_SESSION: "QUEUE_NO_ACTIVE_SESSION",
	/** فشل 경쟁 ذرّي (استُدعيت تذكرة بالتوازي). */
	RACE_CONFLICT: "QUEUE_RACE_CONFLICT",
	/** مزود الصوت غير متاح. */
	VOICE_UNAVAILABLE: "QUEUE_VOICE_UNAVAILABLE",
	/** مصدر البيانات غير متاح. */
	STORAGE_UNAVAILABLE: "QUEUE_STORAGE_UNAVAILABLE",
	/** مُدخل غير صالح. */
	VALIDATION: "QUEUE_VALIDATION",
	/** لا صلاحية. */
	FORBIDDEN: "QUEUE_FORBIDDEN",
	/** خطأ غير مصنّف. */
	UNKNOWN: "QUEUE_UNKNOWN",
} as const)

export type QueueErrorCode =
	(typeof QUEUE_ERROR_CODES)[keyof typeof QUEUE_ERROR_CODES]

/** تفاصيل إضافية آمنة للتسجيل (بدون أسرار). */
export interface QueueErrorDetails {
	readonly ticketNumber?: string
	readonly counterId?: string
	readonly from?: string
	readonly to?: string
	readonly cause?: string
	readonly [key: string]: string | number | boolean | undefined
}

/** خطأ الطابور الوحيد في النظام. */
export class QueueError extends Error {
	readonly code: QueueErrorCode
	readonly details: QueueErrorDetails

	constructor(
		code: QueueErrorCode,
		messageAr: string,
		details: QueueErrorDetails = {},
	) {
		super(messageAr)
		this.name = "QueueError"
		this.code = code
		this.details = details
	}

	/** هل هذا الخطأ يستحق إعادة المحاولة (عابر) أم لا (حتمي). */
	get retryable(): boolean {
		return (
			this.code === QUEUE_ERROR_CODES.STORAGE_UNAVAILABLE ||
			this.code === QUEUE_ERROR_CODES.RACE_CONFLICT ||
			this.code === QUEUE_ERROR_CODES.VOICE_UNAVAILABLE
		)
	}

	/** هل هو تعارض تزامن (يستدعي إعادة القراءة لا إعادة الإرسال). */
	get isConflict(): boolean {
		return this.code === QUEUE_ERROR_CODES.RACE_CONFLICT
	}
}

/** يحوّل أي خطأ إلى `QueueError` بلا فقد السبب. */
export function toQueueError(
	cause: unknown,
	fallbackCode: QueueErrorCode = QUEUE_ERROR_CODES.UNKNOWN,
): QueueError {
	if (cause instanceof QueueError) return cause
	const message = cause instanceof Error ? cause.message : String(cause ?? "")
	const wrapped = new QueueError(
		fallbackCode,
		"حدث خطأ غير متوقع في نظام الطوابير",
		{
			cause: message,
		},
	)
	wrapped.stack = cause instanceof Error ? cause.stack : wrapped.stack
	return wrapped
}

/** هل القيمة خطأ طابور (وليس أي خطأ)؟ */
export function isQueueError(value: unknown): value is QueueError {
	return value instanceof QueueError
}
