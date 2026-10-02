/**
 * حالة الطابور — value object.
 *
 * الحالة ليست `string` حرة: «فارغة / نعم / مستحيلة» ليست ثلاث حالات، بل
 * حالة واحدة (`WAITING`) بأسباب مختلفة. خلطها في نص واحد يجعل كل
 * استعلام «هل هناك منتظر؟» يحتاج تمييز السبب — وهذا بالضبط ما يُنتج
 * شاشة تعرض «لا يوجد» بينما الطابور ممتلئ.
 */

import {
	QUEUE_ERROR_CODES,
	QueueError,
} from "../../../shared/errors/QueueError.js"
import type { QueueStatus } from "../../../shared/types/queue.types.js"

/** حالة الطابور المعروضة للمستخدم. */
export interface QueueStatusVO {
	readonly status: QueueStatus
	/** هل يوجد منتظر قابل للنداء الآن. */
	readonly hasWaiting: boolean
	/** هل يوجد تذكرة قيد الخدمة. */
	readonly hasServing: boolean
	/** هل يمكن إصدار تذكرة جديدة. */
	readonly acceptsTickets: boolean
	/** وصف عربي قصير للشاشة. */
	readonly labelAr: string
}

/** يبني لقطة الحالة من القيم الفعلية. */
export function createQueueStatus(
	status: QueueStatus,
	waitingCount: number,
	servingCount: number,
	acceptsTickets: boolean,
): QueueStatusVO {
	const hasWaiting = waitingCount > 0
	const hasServing = servingCount > 0
	return {
		status,
		hasWaiting,
		hasServing,
		// `status` هنا حالة **الجلسة** (OPEN/CLOSED) وليس حالة التذكرة؛
		// اسم الحقل في العقد هو `acceptsTickets` أصلًا.
		acceptsTickets: acceptsTickets,
		labelAr: labelFor(hasWaiting, hasServing),
	}
}

/** وصف عربي للحالة الظاهرة. */
export function labelFor(hasWaiting: boolean, hasServing: boolean): string {
	if (hasServing && hasWaiting) return "يوجد خدمة وانتظار"
	if (hasServing) return "قيد الخدمة"
	if (hasWaiting) return "في الانتظار"
	return "الطابور فارغ"
}

/**
 * يطلب تذكرة جديدة أو يرفض ذلك بشرح.
 * @throws {QueueError} `QUEUE_EMPTY` أو `QUEUE_SESSION_CLOSED`.
 */
export function assertCanIssue(
	acceptsTickets: boolean,
	waitingCount: number,
): void {
	if (!acceptsTickets) {
		throw new QueueError(
			QUEUE_ERROR_CODES.SESSION_CLOSED,
			"جلسة الطابور مغلقة — لا يمكن إصدار تذاكر جديدة",
		)
	}
	if (waitingCount < 0) {
		throw new QueueError(QUEUE_ERROR_CODES.VALIDATION, "عدد المنتظرين غير صالح")
	}
}
