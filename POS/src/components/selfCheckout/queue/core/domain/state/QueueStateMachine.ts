/**
 * آلة حالات التذكرة —每隔 القاعدة الوحيدة المسموحة للانتقال.
 *
 * لماذا لا نتحقق في كل مكان: الانتقال غير الصحيح ليس خطأ برمجي بل خطأ
 * تشغيلي (كاشير ضغط «إنهاء» مرتين، أو نداء تذكرة قيد الخدمة). التحقق
 * الموزّع يعني أن أحدهم نسي الفحص. هنا جدول واحد، ووأمر الاستدعاء يمرّ بها.
 *
 * `RECALLED → CALLED` هو مسار «تذكّر»: التذكرة تعود للانتظار ثم تُنادى
 * من جديد بدل القفز مباشرة إلى CALLED، لأن شاشة العميل تعرض «المنتظرون»
 * separately عن «الذي يُخدم الآن».
 */

import {
	QUEUE_ERROR_CODES,
	QueueError,
} from "../../../shared/errors/QueueError.js"
import type { QueueStatus } from "../../../shared/types/queue.types.js"

/** الانتقالات المسموح بها. */
const ALLOWED_TRANSITIONS: Readonly<
	Record<QueueStatus, readonly QueueStatus[]>
> = Object.freeze({
	WAITING: ["CALLED", "CANCELLED"],
	// `TRANSFERRED` is reachable from CALLED as well as from SERVING: a
	// transfer means "this customer was called at counter 1, send them to
	// counter 2", so the ticket is usually still CALLED when the cashier
	// presses the button. Without this edge the transfer failed on the most
	// common path it exists for, and the state machine was the reason.
	CALLED: [
		"SERVING",
		"RECALLED",
		"SKIPPED",
		"COMPLETED",
		"TRANSFERRED",
		"CANCELLED",
	],
	RECALLED: ["CALLED", "SKIPPED", "CANCELLED"],
	SERVING: ["COMPLETED", "TRANSFERRED", "SKIPPED", "CANCELLED"],
	SKIPPED: ["CALLED", "CANCELLED"],
	TRANSFERRED: ["CALLED", "COMPLETED", "CANCELLED"],
	COMPLETED: [],
	CANCELLED: [],
})

/** الحالات النهائية — لا مخرج منها. */
export const TERMINAL_STATUSES: ReadonlySet<QueueStatus> = Object.freeze(
	new Set<QueueStatus>(["COMPLETED", "CANCELLED"]),
)

/** هل الانتقال مسموح؟ */
export function canTransition(from: QueueStatus, to: QueueStatus): boolean {
	const allowed = ALLOWED_TRANSITIONS[from] ?? []
	return allowed.includes(to)
}

/** كل الحالات التي يمكنendoza إليها من حالة. */
export function nextStatuses(from: QueueStatus): readonly QueueStatus[] {
	return ALLOWED_TRANSITIONS[from] ?? []
}

/**
 * يتحقق من الانتقال ويرمي إن كان غير مسموح.
 *
 * @throws {QueueError} بـ `QUEUE_INVALID_TRANSITION`.
 */
export function assertTransition(
	from: QueueStatus,
	to: QueueStatus,
	context: { ticketNumber?: string; counterId?: string } = {},
): void {
	if (canTransition(from, to)) return
	throw new QueueError(
		QUEUE_ERROR_CODES.INVALID_TRANSITION,
		`لا يمكن نقل التذكرة من «${statusLabelAr(from)}» إلى «${statusLabelAr(to)}»`,
		{
			from,
			to,
			ticketNumber: context.ticketNumber,
			counterId: context.counterId,
		},
	)
}

/** هل الحالة نهائية؟ */
export function isTerminal(status: QueueStatus): boolean {
	return TERMINAL_STATUSES.has(status)
}

/**
 * هل ما زالت التذكرة داخل الطابور (تُذكر في «الانتظار» أو تحتاج نداءً)؟
 * `SKIPPED` داخلية: ظهرت، فعادت للانتظار (`WAITING`) أو أُلغيت.
 */
export function isActiveInQueue(status: QueueStatus): boolean {
	return status === "WAITING" || status === "SKIPPED"
}

/** تسميات عربية للعرض. */
const LABELS: Readonly<Record<QueueStatus, string>> = Object.freeze({
	WAITING: "في الانتظار",
	CALLED: "تم النداء",
	RECALLED: "مُذكَّرة",
	SKIPPED: "متخطاة",
	SERVING: "قيد الخدمة",
	COMPLETED: "مكتملة",
	TRANSFERRED: "منقولة",
	CANCELLED: "ملغاة",
})

/** التسمية العربية للحالة. */
export function statusLabelAr(status: QueueStatus): string {
	return LABELS[status] ?? status
}
