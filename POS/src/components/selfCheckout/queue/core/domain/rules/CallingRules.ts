/**
 * قواعد اختيار «التذكرة التالية» — قرار نداءي صريح قابل للاختبار.
 *
 * هذا **أهم قرار** في نظام الطابور: من يُنادى الآن. هو منفصل عن
 * الكاونتر (من سيخدم) وعن الواجهة، لأنه سؤال ترتيب لا سؤال واجهة.
 *
 * خوارزمية الاختيار (مقيسة لا مخمّنة):
 *  1. **الأولوية أولاً**: URGENT قبل HIGH قبل NORMAL. تذكرة عاجلة خلف
 *     عشرين عادية معنى أن تنال حقها.
 *  2. **ثم الأقدم_first**: داخل نفس الأولوية، الأقدم إصدارًا. هذا FIFO
 *     العادل — الترقيم وحده يكفي، فلا حاجة لعمود وقت إضافي.
 *  3. **ثم التخصص**: كاونتر مخصَّص لخدمة لا ينادي ما عداها (اختياري).
 */

import {
	QUEUE_ERROR_CODES,
	QueueError,
} from "../../../shared/errors/QueueError.js"
import { parseTicketSequence } from "../../../shared/utils/queue-number.utils.js"
import type {
	QueuePriority,
	QueueTicket,
} from "../../../shared/types/queue.types.js"

/** رتبة الأولوية — أصغر = أعلى. */
const PRIORITY_RANK: Readonly<Record<QueuePriority, number>> = Object.freeze({
	URGENT: 0,
	HIGH: 1,
	NORMAL: 2,
})

/** ترتيب تنازلي بالأولوية ثم الأقدم. */
export function compareCandidates(a: QueueTicket, b: QueueTicket): number {
	const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
	if (byPriority !== 0) return byPriority
	// issuedAt ثم sequence: issuedAt يكافئ، وsequence يكسر التعادل
	// تزامنيًا (تذكرتان أُصدرتا في نفس المللي ثانية).
	if (a.issuedAt !== b.issuedAt) return a.issuedAt - b.issuedAt
	return a.sequence - b.sequence
}

/** المرشّحون: من ينتظر أو أُعيد للانتظار بعد التخطي. */
export function waitingTickets(tickets: readonly QueueTicket[]): QueueTicket[] {
	return tickets
		.filter(
			(ticket) => ticket.status === "WAITING" || ticket.status === "SKIPPED",
		)
		.sort(compareCandidates)
}

/**
 * يختار التذكرة التالية.
 *
 * @returns التذكرة المختارة، أو `null` عند فراغ الطابور.
 */
export function selectNext(
	tickets: readonly QueueTicket[],
	serviceId?: string,
): QueueTicket | null {
	const candidates = waitingTickets(
		serviceId ? tickets.filter((t) => t.serviceId === serviceId) : tickets,
	)
	return candidates[0] ?? null
}

/** تذكّر: يعيد تذكرة مُتخطّاة أو منسيّة للواجهة. */
export function selectRecall(
	tickets: readonly QueueTicket[],
	counterId: string,
): QueueTicket | null {
	// الأقرب وقتًا أولًا: آخر تذكرة نُظر فيها هذا الكاونتر ولم تبدأ
	// خدمتها. الترتيب بالوقت لا بالرقم — الزبون يتذكر «نُودي قبل قليل».
	return (
		tickets
			.filter(
				(t) =>
					t.counterId === counterId &&
					(t.status === "CALLED" ||
						t.status === "RECALLED" ||
						t.status === "SKIPPED"),
			)
			.sort((a, b) => (b.calledAt ?? 0) - (a.calledAt ?? 0))[0] ?? null
	)
}

/**
 * هل الكاونتر حرّ؟
 * @throws {QueueError} `COUNTER_BUSY` إن كان مشغولاً.
 */
export function assertCounterFree(currentTicketId: string | undefined): void {
	if (currentTicketId !== undefined && currentTicketId !== null) {
		throw new QueueError(
			QUEUE_ERROR_CODES.COUNTER_BUSY,
			"الكاونتر مشغول بتذكرة أخرى — أنهِها أو انقلها أولًا",
		)
	}
}

/**
 * هل يمكن استدعاء تذكرة الآن؟
 * @throws {QueueError} عند التعارض.
 */
export function assertCanCall(ticket: QueueTicket, counterId: string): void {
	if (ticket.status !== "WAITING" && ticket.status !== "SKIPPED") {
		throw new QueueError(
			QUEUE_ERROR_CODES.INVALID_TRANSITION,
			`التذكرة ${ticket.number} ليست في الانتظار`,
			{ ticketNumber: ticket.number, from: ticket.status },
		)
	}
	if (!counterId) {
		throw new QueueError(QUEUE_ERROR_CODES.VALIDATION, "الكاونتر مطلوب للنداء")
	}
}

/**
 * يختار التالية ويتحقق من وجودها.
 * @throws {QueueError} `QUEUE_EMPTY` عند الفراغ.
 */
export function requireNext(
	tickets: readonly QueueTicket[],
	serviceId?: string,
): QueueTicket {
	const next = selectNext(tickets, serviceId)
	if (!next) {
		throw new QueueError(
			QUEUE_ERROR_CODES.QUEUE_EMPTY,
			"لا يوجد منتظرون في الطابور",
		)
	}
	return next
}

/** هل الطابور فارغ من المنتظرين؟ */
export function isQueueEmpty(tickets: readonly QueueTicket[]): boolean {
	return waitingTickets(tickets).length === 0
}

/** رقم تسلسلي صالح للتذكرة (يُستخدم في الفرز). */
export function ticketOrder(ticket: QueueTicket): number {
	return parseTicketSequence(ticket.number) ?? ticket.sequence
}
