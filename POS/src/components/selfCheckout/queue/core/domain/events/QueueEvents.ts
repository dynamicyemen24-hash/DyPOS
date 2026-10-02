/**
 * مصانع أحداث الطابور — كل حدث يُبنى من هنا.
 *
 * لماذا مصانع لا كائنات حرفية: الحدث يحمل `version` متصاعدًا و`id` فريدًا
 * و`at`. لو بَنَت الواجهة `{type:"TICKET_CALLED", …}` بنفسها لأمكن نسخ
 * ناقص (بلا `version`) ينكسر الترتيب بعد إعادة التشغيل بصمت. المصنع
 * يجعل الحقول الإلزامية غير قابلة للنسيان.
 */

import { generateUUID } from "@/utils/offline/uuid"

import type {
	QueueEvent,
	QueueEventType,
} from "../../../shared/types/queue-events.types.js"

/** يرفع العدّاد ويعيد القيمة الجديدة. */
export function nextVersion(current: number): number {
	return Number.isFinite(current) ? current + 1 : 1
}

/** يبني حدثًا مكتمل الأغلفة (المتطلّبات غير قابلة للنسيان). */
export function makeEvent<T extends QueueEventType>(
	type: T,
	version: number,
	payload: Omit<
		Extract<QueueEvent, { type: T }>,
		"type" | "id" | "version" | "at"
	> & {
		at?: number
	},
): Extract<QueueEvent, { type: T }> {
	return {
		...(payload as object),
		type,
		id: generateUUID(),
		version,
		at: payload.at ?? Date.now(),
	} as Extract<QueueEvent, { type: T }>
}

/** حقول الأغلفة المشتركة المطلوبة في كل حدث. */
export interface EventEnvelope {
	readonly sessionId: string
	readonly origin: string
}

/** Ticket-issued event. */
export function ticketCreated(
	version: number,
	env: EventEnvelope,
	data: {
		ticketId: string
		ticketNumber: string
		serviceId: string
		priority: string
	},
): QueueEvent {
	return makeEvent("TICKET_CREATED", version, { ...env, ...data })
}

/** Ticket-called event. */
export function ticketCalled(
	version: number,
	env: EventEnvelope,
	data: {
		ticketId: string
		ticketNumber: string
		counterId: string
		counterName: string
	},
): QueueEvent {
	return makeEvent("TICKET_CALLED", version, { ...env, ...data })
}

/** Ticket-recalled event (includes the attempt number for de-dup display). */
export function ticketRecalled(
	version: number,
	env: EventEnvelope,
	data: {
		ticketId: string
		ticketNumber: string
		counterId: string
		counterName: string
		attempt: number
	},
): QueueEvent {
	return makeEvent("TICKET_RECALLED", version, { ...env, ...data })
}

/** Ticket-serving event. */
export function ticketServing(
	version: number,
	env: EventEnvelope,
	data: { ticketId: string; ticketNumber: string; counterId: string },
): QueueEvent {
	return makeEvent("TICKET_SERVING", version, { ...env, ...data })
}

/** Ticket-completed event (carries the measured durations). */
export function ticketCompleted(
	version: number,
	env: EventEnvelope,
	data: {
		ticketId: string
		ticketNumber: string
		counterId: string
		waitMs: number
		serveMs: number
	},
): QueueEvent {
	return makeEvent("TICKET_COMPLETED", version, { ...env, ...data })
}

/** Ticket-skipped event. */
export function ticketSkipped(
	version: number,
	env: EventEnvelope,
	data: {
		ticketId: string
		ticketNumber: string
		counterId: string
		reason: string
	},
): QueueEvent {
	return makeEvent("TICKET_SKIPPED", version, { ...env, ...data })
}

/** Ticket-transferred event. */
export function ticketTransferred(
	version: number,
	env: EventEnvelope,
	data: {
		ticketId: string
		ticketNumber: string
		fromCounterId: string
		toCounterId: string
		reason: string
	},
): QueueEvent {
	return makeEvent("TICKET_TRANSFERRED", version, { ...env, ...data })
}

/** Counter-opened event. */
export function counterOpened(
	version: number,
	env: EventEnvelope,
	data: { counterId: string; counterName: string },
): QueueEvent {
	return makeEvent("COUNTER_OPENED", version, { ...env, ...data })
}

/** Counter-closed event. */
export function counterClosed(
	version: number,
	env: EventEnvelope,
	data: { counterId: string; counterName: string; servedCount: number },
): QueueEvent {
	return makeEvent("COUNTER_CLOSED", version, { ...env, ...data })
}

/** Generic queue-refresh event (UI sync without a state change). */
export function queueUpdated(
	version: number,
	env: EventEnvelope,
	reason: string,
): QueueEvent {
	return makeEvent("QUEUE_UPDATED", version, { ...env, reason })
}
