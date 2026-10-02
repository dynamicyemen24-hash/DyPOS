/**
 * منسّق الطابور — نقطة الدخول الوحيدة لكل عملية نداء.
 *
 * كل شاشة وكل كاشير يستدعي هذه الطبقة، فلا يوجد مسار ثانٍ يكتب في
 * الطابور. هذا ما يجعل «مصدر حقيقة واحدًا» جملة قابلة للتحقق بدل أن
 * تكون نية: لو كان في مسار ينادي المستودع مباشرة، لكان لا بد من
 * القاعدة مرتين، وأحدهما ينساها.
 *
 * ما يفعله المنسّق: يقرأ القرار من المستودع (الذريّ) → يبني حدثًا مُرمَّزًا
 * بالنسخة → ينشره على الناقل فتتحدّث كل الشاشات → يحوّل الفشل إلى خطأ
 * عربي مفهوم. ولا يحسب: كل حساب في المجال.
 */

import { sessionUser } from "@/data/session"
import { logger } from "@/utils/logger"

import {
	QUEUE_ERROR_CODES,
	QueueError,
	toQueueError,
} from "../../../shared/errors/QueueError.js"
import { businessDate } from "../../../shared/utils/queue-time.utils.js"
import {
	counterClosed,
	counterOpened,
	ticketCalled,
	ticketCompleted,
	ticketCreated,
	ticketRecalled,
	ticketServing,
	ticketSkipped,
	ticketTransferred,
} from "../../domain/events/QueueEvents.js"
import { queueEventBus } from "../../domain/events/QueueEventBus.js"
import {
	serveDuration,
	waitDuration,
} from "../../domain/entities/QueueTicket.js"
import { queueRepository } from "../../infrastructure/storage/QueueStorageAdapter.js"
import type {
	CallTicketCommand,
	IssueTicketCommand,
	QueueRepository,
	QueueSnapshot,
	QueueTicketResult,
} from "../contracts/QueueRepository.js"
import type {
	QueueCounter,
	QueueSession,
	QueueStatistics,
	QueueTicket,
} from "../../../shared/types/queue.types.js"

const log = logger.create("QueueOrchestrator")

/** مستأجر افتراضي عند غياب جلسة — يُثبَّت عند ربط السيرفر. */
const LOCAL_TENANT = "local"

export class QueueOrchestrator {
	private readonly repo: QueueRepository
	/** نسخة الأحداث محليًا — تطابق ما في `queue_events`. */
	private version = 0

	constructor(repo: QueueRepository = queueRepository) {
		this.repo = repo
	}

	/** معرّف الجهاز/المصدر — يُكتب في كل حدث لأغراض التتبّع. */
	private get origin(): string {
		return sessionUser() ?? "kiosk"
	}

	private nextVersion(): number {
		this.version += 1
		return this.version
	}

	// -----------------------------------------------------------------
	// القراءة
	// -----------------------------------------------------------------

	/** لقطة كاملة. لا ترمي: «لا جلسة» حالة طبيعية قبل أول فتح. */
	async snapshot(tenantId = LOCAL_TENANT): Promise<QueueSnapshot> {
		const snap = await this.repo.getSnapshot(tenantId)
		if (snap.version > this.version) this.version = snap.version
		return snap
	}

	/**
	 * الإحصاءات **محسوبة من اللقطة** — لا تُخزَّن ولا تُحدَّث يدويًا.
	 * رقم مخزَّن لا مصدر له هو بالضبط «قائمة فارغة ليست قياسًا».
	 */
	statistics(
		tickets: readonly QueueTicket[],
		counters: readonly QueueCounter[],
	): QueueStatistics {
		const now = Date.now()
		const count = (status: QueueTicket["status"]): number =>
			tickets.filter((t) => t.status === status).length
		const done = tickets.filter(
			(t) => t.status === "COMPLETED" && t.completedAt !== undefined,
		)
		const waitTotal = done.reduce((sum, t) => sum + waitDuration(t, now), 0)
		const serveTotal = done.reduce((sum, t) => sum + serveDuration(t, now), 0)
		const waiting = tickets.filter(
			(t) => t.status === "WAITING" || t.status === "SKIPPED",
		)

		return {
			waiting: waiting.length,
			serving: count("SERVING"),
			completed: count("COMPLETED"),
			skipped: count("SKIPPED"),
			transferred: count("TRANSFERRED"),
			cancelled: count("CANCELLED"),
			total: tickets.length,
			averageWaitMs: done.length ? waitTotal / done.length : 0,
			averageServeMs: done.length ? serveTotal / done.length : 0,
			longestWaitMs: waiting.reduce(
				(max, t) => Math.max(max, waitDuration(t, now)),
				0,
			),
			busyCounters: counters.filter((c) => c.currentTicketId !== undefined)
				.length,
			totalCounters: counters.length,
		}
	}

	// -----------------------------------------------------------------
	// الجلسة والكاونترات
	// -----------------------------------------------------------------

	async openSession(tenantId = LOCAL_TENANT): Promise<QueueSession> {
		return this.repo.openSession(tenantId, businessDate())
	}

	async openCounter(
		tenantId: string,
		counterId: string,
	): Promise<QueueCounter> {
		const counter = await this.repo.openCounter(tenantId, counterId)
		await this.publish(
			counterOpened(this.nextVersion(), this.env(counter.sessionId), {
				counterId: counter.id,
				counterName: counter.name,
			}),
		)
		return counter
	}

	async closeCounter(
		tenantId: string,
		counterId: string,
	): Promise<QueueCounter> {
		const counter = await this.repo.closeCounter(tenantId, counterId)
		await this.publish(
			counterClosed(this.nextVersion(), this.env(counter.sessionId), {
				counterId: counter.id,
				counterName: counter.name,
				servedCount: counter.servedCount,
			}),
		)
		return counter
	}

	// -----------------------------------------------------------------
	// التذاكر
	// -----------------------------------------------------------------

	async issueTicket(command: IssueTicketCommand): Promise<QueueTicket> {
		try {
			const ticket = await this.repo.issueTicket(command)
			await this.publish(
				ticketCreated(this.nextVersion(), this.env(ticket.sessionId), {
					ticketId: ticket.id,
					ticketNumber: ticket.number,
					serviceId: ticket.serviceId,
					priority: ticket.priority,
				}),
			)
			return ticket
		} catch (error) {
			throw toQueueError(error, QUEUE_ERROR_CODES.VALIDATION)
		}
	}

	/** ينادي التالية ذرّياً. الفشل (مشغول/فارغ) يصل الكاشير بالعربية. */
	async callNext(tenantId: string, counterId: string): Promise<QueueTicket> {
		try {
			const result = await this.repo.callNext(tenantId, counterId, Date.now())
			await this.publish(
				ticketCalled(this.nextVersion(), this.env(result.ticket.sessionId), {
					ticketId: result.ticket.id,
					ticketNumber: result.ticket.number,
					counterId: result.counter.id,
					counterName: result.counter.name,
				}),
			)
			return result.ticket
		} catch (error) {
			throw toQueueError(error, QUEUE_ERROR_CODES.RACE_CONFLICT)
		}
	}

	/** تذكّر تذكرة لهذا الكاونتر. */
	async recallTicket(
		tenantId: string,
		counterId: string,
		ticketId: string,
	): Promise<QueueTicket> {
		const command: CallTicketCommand = {
			tenantId,
			counterId,
			ticketId,
			now: Date.now(),
		}
		try {
			const result = await this.repo.callTicket(command)
			await this.publish(
				ticketRecalled(this.nextVersion(), this.env(result.ticket.sessionId), {
					ticketId: result.ticket.id,
					ticketNumber: result.ticket.number,
					counterId: result.counter.id,
					counterName: result.counter.name,
					attempt: result.ticket.callCount,
				}),
			)
			return result.ticket
		} catch (error) {
			throw toQueueError(error, QUEUE_ERROR_CODES.RACE_CONFLICT)
		}
	}

	async skipTicket(tenantId: string, counterId: string): Promise<QueueTicket> {
		try {
			const result: QueueTicketResult = await this.repo.skipTicket(
				tenantId,
				counterId,
				Date.now(),
			)
			await this.publish(
				ticketSkipped(this.nextVersion(), this.env(result.ticket.sessionId), {
					ticketId: result.ticket.id,
					ticketNumber: result.ticket.number,
					counterId,
					reason: "did-not-appear",
				}),
			)
			return result.ticket
		} catch (error) {
			throw toQueueError(error, QUEUE_ERROR_CODES.INVALID_TRANSITION)
		}
	}

	async startServing(
		tenantId: string,
		counterId: string,
	): Promise<QueueTicket> {
		try {
			const ticket = await this.repo.startServing(
				tenantId,
				counterId,
				Date.now(),
			)
			await this.publish(
				ticketServing(this.nextVersion(), this.env(ticket.sessionId), {
					ticketId: ticket.id,
					ticketNumber: ticket.number,
					counterId,
				}),
			)
			return ticket
		} catch (error) {
			throw toQueueError(error, QUEUE_ERROR_CODES.INVALID_TRANSITION)
		}
	}

	async completeTicket(
		tenantId: string,
		counterId: string,
	): Promise<QueueTicket> {
		const now = Date.now()
		try {
			const ticket = await this.repo.completeTicket(tenantId, counterId, now)
			// القياس يُلتقط من الطوابع المحفوظة على التذكرة نفسها، بعد
			// انتهاء المعاملة — لا من ساعة الجدار التي قد تنزلق.
			await this.publish(
				ticketCompleted(this.nextVersion(), this.env(ticket.sessionId), {
					ticketId: ticket.id,
					ticketNumber: ticket.number,
					counterId,
					waitMs: waitDuration(ticket, now),
					serveMs: serveDuration(ticket, now),
				}),
			)
			return ticket
		} catch (error) {
			throw toQueueError(error, QUEUE_ERROR_CODES.INVALID_TRANSITION)
		}
	}

	async transferTicket(
		tenantId: string,
		fromCounterId: string,
		toCounterId: string,
	): Promise<QueueTicket> {
		try {
			const ticket = await this.repo.transferTicket(
				tenantId,
				fromCounterId,
				toCounterId,
				Date.now(),
			)
			await this.publish(
				ticketTransferred(this.nextVersion(), this.env(ticket.sessionId), {
					ticketId: ticket.id,
					ticketNumber: ticket.number,
					fromCounterId,
					toCounterId,
					reason: "operator",
				}),
			)
			return ticket
		} catch (error) {
			throw toQueueError(error, QUEUE_ERROR_CODES.RACE_CONFLICT)
		}
	}

	// -----------------------------------------------------------------
	// داخلي
	// -----------------------------------------------------------------

	private env(sessionId: string): { sessionId: string; origin: string } {
		return { sessionId, origin: this.origin }
	}

	/**
	 * ينشر الحدث؛ فشل النشر **لا يُسقط العملية الأصلية**.
	 * الفاتورة أُصدرت فعليًا في المخزن — إخفاؤها بسبب شاشة العميل
	 * ([[QueueDisplay]]) معطوبة خطأ أخطر من شاشة متأخرة.
	 */
	private async publish(
		event: Parameters<typeof queueEventBus.emit>[0],
	): Promise<void> {
		try {
			await queueEventBus.emit(event)
		} catch (error) {
			log.warn("queue event publish failed", { type: event.type, error })
		}
	}

	/** آخر نسخة مرئية — للمزامنة والتشخيص. */
	get lastVersion(): number {
		return this.version
	}
}

/** المنسّق المشترك. */
export const queueOrchestrator = new QueueOrchestrator()

/** يحوّل أي خطأ إلى رسالة عربية للكاشير. */
export function queueErrorMessage(error: unknown): string {
	if (error instanceof QueueError) return error.message
	return "تعذّر تنفيذ العملية في نظام الطوابير"
}

export default queueOrchestrator
