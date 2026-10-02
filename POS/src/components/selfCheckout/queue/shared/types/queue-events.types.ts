/**
 * أحداث الطابور — عقد الأحداث.
 *
 * كل تغيير في الطابور **يجب** أن يمرّ كحدث: إصدار تذكرة، نداء، تذكّر،
 * إنهاء. هذا ما يجعل شاشة العميل والنداء الصوتي ولوحة التحكم تشتقّ
 * حالتها من مصدر واحد بدل أن تحتفظ كل واحدة بنسخة.
 *
 * كل حدث يحمل `version` (ترتيب صارم) و`id` (إزالة التكرار) و`at`. بدون
 * `version` يستحيل كشف حدث متأخر وصل بعد حدث أحدث — وهذا بالتحديد ما
 * يجعل شاشتين تعرضان رقمين مختلفين بعد انقطاع.
 */

import type { QueueStatus } from "./queue.types.js"

/** أسماء الأحداث — تُستخدم في السجل وفي الشاشات. */
export const QUEUE_EVENT_TYPES = Object.freeze({
	TICKET_CREATED: "TICKET_CREATED",
	TICKET_CALLED: "TICKET_CALLED",
	TICKET_RECALLED: "TICKET_RECALLED",
	TICKET_SERVING: "TICKET_SERVING",
	TICKET_SKIPPED: "TICKET_SKIPPED",
	TICKET_COMPLETED: "TICKET_COMPLETED",
	TICKET_TRANSFERRED: "TICKET_TRANSFERRED",
	TICKET_CANCELLED: "TICKET_CANCELLED",
	COUNTER_OPENED: "COUNTER_OPENED",
	COUNTER_CLOSED: "COUNTER_CLOSED",
	SESSION_OPENED: "SESSION_OPENED",
	SESSION_CLOSED: "SESSION_CLOSED",
	QUEUE_UPDATED: "QUEUE_UPDATED",
} as const)

export type QueueEventType =
	(typeof QUEUE_EVENT_TYPES)[keyof typeof QUEUE_EVENT_TYPES]

/** الحمولة المشتركة لكل حدث. */
interface QueueEventBase {
	/** معرّف فريد — يُستعمل لإزالة التكرار. */
	readonly id: string
	/** ترتيب صارم متصاعد. */
	readonly version: number
	/** وقت الحدوث (ms). */
	readonly at: number
	/** معرّف الجلسة. */
	readonly sessionId: string
	/** معرّف الجهاز/المصدر — للالتقاط التدريجي للتحديثات. */
	readonly origin: string
}

export interface TicketCreatedEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.TICKET_CREATED
	readonly ticketId: string
	readonly ticketNumber: string
	readonly serviceId: string
	readonly priority: string
}

export interface TicketCalledEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.TICKET_CALLED
	readonly ticketId: string
	readonly ticketNumber: string
	readonly counterId: string
	readonly counterName: string
}

export interface TicketRecalledEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.TICKET_RECALLED
	readonly ticketId: string
	readonly ticketNumber: string
	readonly counterId: string
	readonly counterName: string
	readonly attempt: number
}

export interface TicketServingEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.TICKET_SERVING
	readonly ticketId: string
	readonly ticketNumber: string
	readonly counterId: string
}

export interface TicketSkippedEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.TICKET_SKIPPED
	readonly ticketId: string
	readonly ticketNumber: string
	readonly counterId: string
	readonly reason: string
}

export interface TicketCompletedEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.TICKET_COMPLETED
	readonly ticketId: string
	readonly ticketNumber: string
	readonly counterId: string
	readonly waitMs: number
	readonly serveMs: number
}

export interface TicketTransferredEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.TICKET_TRANSFERRED
	readonly ticketId: string
	readonly ticketNumber: string
	readonly fromCounterId: string
	readonly toCounterId: string
	readonly reason: string
}

export interface TicketCancelledEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.TICKET_CANCELLED
	readonly ticketId: string
	readonly ticketNumber: string
	readonly reason: string
}

export interface CounterOpenedEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.COUNTER_OPENED
	readonly counterId: string
	readonly counterName: string
}

export interface CounterClosedEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.COUNTER_CLOSED
	readonly counterId: string
	readonly counterName: string
	readonly servedCount: number
}

export interface SessionOpenedEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.SESSION_OPENED
	readonly businessDate: string
}

export interface SessionClosedEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.SESSION_CLOSED
	readonly completed: number
	readonly skipped: number
}

export interface QueueUpdatedEvent extends QueueEventBase {
	readonly type: typeof QUEUE_EVENT_TYPES.QUEUE_UPDATED
	readonly reason: string
}

/** اتحاد كل الأحداث — يُستهلك في `switch` بعد تضييق النوع. */
export type QueueEvent =
	| TicketCreatedEvent
	| TicketCalledEvent
	| TicketRecalledEvent
	| TicketServingEvent
	| TicketSkippedEvent
	| TicketCompletedEvent
	| TicketTransferredEvent
	| TicketCancelledEvent
	| CounterOpenedEvent
	| CounterClosedEvent
	| SessionOpenedEvent
	| SessionClosedEvent
	| QueueUpdatedEvent

/** حارس نوع: هل القيمة حدث طابور؟ */
export function isQueueEvent(value: unknown): value is QueueEvent {
	if (typeof value !== "object" || value === null) return false
	const candidate = value as { type?: unknown; id?: unknown }
	return (
		typeof candidate.type === "string" &&
		typeof candidate.id === "string" &&
		Object.values(QUEUE_EVENT_TYPES).includes(candidate.type as QueueEventType)
	)
}

/** هل الحدث يشير إلى انتقال حالة فعلية (يحتاج ترتيبًا صارمًا)؟ */
export function isTransitionEvent(
	event: QueueEvent,
): event is Extract<
	QueueEvent,
	{ type: `${QueueStatus}` | "TICKET_TRANSFERRED" | "TICKET_CANCELLED" }
> {
	return event.type !== QUEUE_EVENT_TYPES.QUEUE_UPDATED
}
