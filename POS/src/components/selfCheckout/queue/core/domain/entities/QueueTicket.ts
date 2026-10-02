/**
 * كيان التذكرة — منطق كيان نقي.
 *
 * كيان (Entity) لا مُعامل (Value Object): له **هوية** (id) تكمل الكيان
 * حتى لو تغيّر كل شيء آخر. التذكرة A-001 التي تنتقل من انتظار إلى خدمة
 * هي نفس الكيان.
 *
 * قاعدة التصميم: الكيان **لا يكتب ولا يقرأ**. دواله تبني نسخة جديدة
 * وتعيدها. هذا يجعل كل انتقال قابلًا للاختبار بلا قاعدة بيانات، ويجعل
 * التراجع (rollback) في معاملة DB مطابقًا تمامًا لما تراه الواجهة.
 */

import type {
	QueuePriority,
	QueueStatus,
	QueueTicket,
} from "../../../shared/types/queue.types.js"
import { assertTransition } from "../state/QueueStateMachine.js"

/** مُدخل إصدار تذكرة. */
export interface IssueTicketInput {
	readonly id: string
	readonly number: string
	readonly sequence: number
	readonly serviceId: string
	readonly serviceName: string
	readonly sessionId: string
	readonly priority?: QueuePriority
	readonly mobile?: string
	readonly note?: string
	readonly now: number
}

/** إصدار تذكرة جديدة في حالة `WAITING`. */
export function issueTicket(input: IssueTicketInput): QueueTicket {
	return Object.freeze({
		id: input.id,
		number: input.number,
		sequence: input.sequence,
		serviceId: input.serviceId,
		serviceName: input.serviceName,
		status: "WAITING",
		priority: input.priority ?? "NORMAL",
		issuedAt: input.now,
		callCount: 0,
		mobile: input.mobile,
		note: input.note,
		sessionId: input.sessionId,
		updatedAt: input.now,
	})
}

/**
 * ينقل التذكرة لحالة جديدة بعد التحقق من المسار.
 * @throws {QueueError} عند انتقال غير مسموح.
 */
export function transitionTicket(
	ticket: QueueTicket,
	to: QueueStatus,
	now: number,
	patch: Partial<Pick<QueueTicket, "counterId" | "counterName">> = {},
): QueueTicket {
	assertTransition(ticket.status, to, {
		ticketNumber: ticket.number,
		counterId: patch.counterId,
	})

	const next: QueueTicket = {
		...ticket,
		...patch,
		status: to,
		updatedAt: now,
	}

	// الطوابع الزمنية تُضبط هنا لا في المستدعي: لو ضبطها الكاشير ونُسي
	// يترك القياس فارغًا، وهو ما يفسد متوسط الانتظار بصمت. `Partial`
	// لا يكفي لأن حقول `QueueTicket` للقراءة فقط، فنسخة المسودة تُبنى
	// بنوع قابل للتعديل ثم تُجمَّد عند الإخراج.
	const stamps: {
		[key in
			| "calledAt"
			| "firstCalledAt"
			| "callCount"
			| "servingAt"
			| "completedAt"]?: number
	} = {}
	if (to === "CALLED") {
		stamps.calledAt = now
		stamps.firstCalledAt = ticket.firstCalledAt ?? now
		stamps.callCount = ticket.callCount + 1
	}
	if (to === "SERVING") stamps.servingAt = now
	if (to === "COMPLETED") stamps.completedAt = now

	return Object.freeze({ ...next, ...stamps })
}

/** مدّة الانتظار (ms) — من الإصدار إلى أول نداء. */
export function waitDuration(ticket: QueueTicket, now: number): number {
	if (ticket.firstCalledAt !== undefined) {
		return Math.max(0, ticket.firstCalledAt - ticket.issuedAt)
	}
	return Math.max(0, now - ticket.issuedAt)
}

/** مدّة الخدمة (ms) — من بدء الخدمة إلى الإنهاء. */
export function serveDuration(ticket: QueueTicket, now: number): number {
	if (ticket.servingAt === undefined) return 0
	const end = ticket.completedAt ?? now
	return Math.max(0, end - ticket.servingAt)
}

/**
 * يحرّ الكاونتر من تذكرته.
 *
 * **مهم**: نُعيد `undefined` صراحةً (لا `null` ولا ترك الحقل). الفهرس
 * الجزئي `WHERE current_ticket_id IS NOT NULL` في قاعدة البيانات يعني
 * أن `null` يبقى «مشغولًا» — خطأOperational يصعب اكتشافه لاحقًا.
 */
export function releaseCounter(ticket: QueueTicket): Partial<QueueTicket> {
	if (ticket.counterId === undefined) return {}
	return { counterId: undefined, counterName: undefined }
}

/** هل ما زالت التذكرة تحتاج كاونتر (قيد النداء أو الخدمة)؟ */
export function occupiesCounter(status: QueueStatus): boolean {
	return status === "CALLED" || status === "SERVING" || status === "RECALLED"
}

/** هل التذكرة نهائية (لا بعدها نداء)؟ */
export function isFinished(ticket: QueueTicket): boolean {
	return ticket.status === "COMPLETED" || ticket.status === "CANCELLED"
}
