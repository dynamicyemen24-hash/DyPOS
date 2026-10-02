/**
 * مستودع الطابور — التنفيذ فوق Dexie (local-first).
 *
 * لماذا Dexie لا HTTP: الكشك يعمل بلا شبكة. تذكرة تُصدر أمام الزبون لا
 * تنتظر رديًا. المزامنة طبقة فوق هذا المستودع، لا شرط لعمله.
 *
 * **العقد الذرّي** هو جوهر هذا الملف: `callNext` تنفَّذ داخل معاملة
 * Dexie واحدة. عمليتا كاشير متزامنتان لا تستطيعان أخذ نفس التذكرة: واحدة
 * تفوز، الأخرى ترى الحالة الجديدة وتُرمى بـ `COUNTER_BUSY`. هذا يمنع
 * أسوأ خطأ في نظام طابور: نداء تذكرة واحدة لكاونترين.
 */

import db from "@/services/db"
import { generateUUID } from "@/utils/offline/uuid"
import { logger } from "@/utils/logger"

import {
	QUEUE_ERROR_CODES,
	QueueError,
	toQueueError,
} from "../../../shared/errors/QueueError.js"
import { businessDate as todayFor } from "../../../shared/utils/queue-time.utils.js"
import { formatTicketNumber } from "../../../shared/utils/queue-number.utils.js"
import { waitingTickets } from "../../domain/rules/CallingRules.js"
import {
	issueTicket as buildTicket,
	transitionTicket,
} from "../../domain/entities/QueueTicket.js"
import type {
	CallResult,
	CallTicketCommand,
	IssueTicketCommand,
	QueueRepository,
	QueueSnapshot,
	QueueTicketResult,
} from "../../application/contracts/QueueRepository.js"
import type {
	QueueCall,
	QueueCounter,
	QueueService,
	QueueSession,
	QueueTicket,
} from "../../../shared/types/queue.types.js"
const log = logger.create("QueueStorage")

/** شكل الصف في Dexie. */
type Row = Record<string, unknown>

const toCounter = (row: Row): QueueCounter =>
	Object.freeze({
		id: String(row.id),
		name: String(row.name),
		status: row.status as QueueCounter["status"],
		serviceId: (row.serviceId as string | undefined) ?? undefined,
		currentTicketId: (row.currentTicketId as string | undefined) ?? undefined,
		sessionId: String(row.sessionId),
		openedAt: (row.openedAt as number | undefined) ?? undefined,
		closedAt: (row.closedAt as number | undefined) ?? undefined,
		servedCount: Number(row.servedCount ?? 0),
		totalServeMs: Number(row.totalServeMs ?? 0),
		updatedAt: Number(row.updatedAt ?? 0),
	})

const toTicket = (row: Row): QueueTicket =>
	Object.freeze({
		id: String(row.id),
		number: String(row.number),
		sequence: Number(row.sequence),
		serviceId: String(row.serviceId),
		serviceName: String(row.serviceName),
		status: row.status as QueueTicket["status"],
		priority: (row.priority as QueueTicket["priority"]) ?? "NORMAL",
		issuedAt: Number(row.issuedAt ?? 0),
		firstCalledAt: (row.firstCalledAt as number | undefined) ?? undefined,
		calledAt: (row.calledAt as number | undefined) ?? undefined,
		servingAt: (row.servingAt as number | undefined) ?? undefined,
		completedAt: (row.completedAt as number | undefined) ?? undefined,
		counterId: (row.counterId as string | undefined) ?? undefined,
		counterName: (row.counterName as string | undefined) ?? undefined,
		mobile: (row.mobile as string | undefined) ?? undefined,
		note: (row.note as string | undefined) ?? undefined,
		sessionId: String(row.sessionId),
		callCount: Number(row.callCount ?? 0),
		updatedAt: Number(row.updatedAt ?? 0),
	})

export class DexieQueueRepository implements QueueRepository {
	/** أعلى نسخة حدث — عدّاد محلي متصاعد. */
	private version = 0

	/** يرفع العدّاد ويعيد النسخة الجديدة. */
	private nextVersion(): number {
		this.version += 1
		return this.version
	}

	// -----------------------------------------------------------------
	// القراءة
	// -----------------------------------------------------------------

	async getSnapshot(
		tenantId: string,
		sessionId?: string,
	): Promise<QueueSnapshot> {
		const session = await this.currentSession(tenantId, sessionId)
		if (!session) {
			return {
				session: null,
				tickets: [],
				counters: [],
				services: await this.listServices(tenantId),
				calls: [],
				version: this.version,
			}
		}
		return {
			session,
			tickets: await this.listTickets(tenantId, session.id),
			counters: await this.listCounters(tenantId, session.id),
			services: await this.listServices(tenantId),
			calls: await this.listRecentCalls(tenantId, 20),
			version: this.version,
		}
	}

	async listTickets(
		tenantId: string,
		sessionId: string,
	): Promise<QueueTicket[]> {
		const rows = await db.queueTickets
			.where("sessionId")
			.equals(sessionId)
			.toArray()
		return rows.filter((row) => row.tenantId === tenantId).map(toTicket)
	}

	async listCounters(
		tenantId: string,
		sessionId: string,
	): Promise<QueueCounter[]> {
		const rows = await db.queueCounters
			.where("sessionId")
			.equals(sessionId)
			.toArray()
		return rows.filter((row) => row.tenantId === tenantId).map(toCounter)
	}

	async listServices(tenantId: string): Promise<QueueService[]> {
		const rows = await db.queueServices
			.where("tenantId")
			.equals(tenantId)
			.toArray()
		return rows
			.filter((row) => Number(row.active ?? 1) === 1)
			.sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
			.map((row) => ({
				id: String(row.id),
				code: String(row.code),
				name: String(row.name),
				nameEn: String(row.nameEn ?? row.name),
				prefix: String(row.prefix ?? "A"),
				active: Number(row.active ?? 1) === 1,
				colorToken: String(row.colorToken ?? "primary"),
				sortOrder: Number(row.sortOrder ?? 0),
			}))
	}

	async getTicket(
		tenantId: string,
		ticketId: string,
	): Promise<QueueTicket | null> {
		const row = await db.queueTickets.get(ticketId)
		// fail-closed: صف لمستأجر آخر = غير موجود، لا «مقروء».
		if (!row || row.tenantId !== tenantId) return null
		return toTicket(row)
	}

	async getCounter(
		tenantId: string,
		counterId: string,
	): Promise<QueueCounter | null> {
		const row = await db.queueCounters.get(counterId)
		if (!row || row.tenantId !== tenantId) return null
		return toCounter(row)
	}

	async listRecentCalls(tenantId: string, limit: number): Promise<QueueCall[]> {
		const rows = await db.queueCalls
			.orderBy("at")
			.reverse()
			.limit(limit)
			.toArray()
		return rows
			.filter((row) => row.tenantId === tenantId)
			.map((row) => ({
				id: String(row.id),
				ticketId: String(row.ticketId),
				ticketNumber: String(row.ticketNumber),
				counterId: String(row.counterId),
				counterName: String(row.counterName),
				kind: row.kind as QueueCall["kind"],
				at: Number(row.at ?? 0),
				toCounterId: (row.toCounterId as string | undefined) ?? undefined,
			}))
	}

	async getVersion(): Promise<number> {
		return this.version
	}

	/**
	 * الجلسة الحالية: المفتوحة لليوم، أو المُمرَّرة صراحةً.
	 * تُرجع `null` لا ترمي — «لا جلسة» حالة تشغيلية طبيعية قبل أول فتح.
	 */
	private async currentSession(
		tenantId: string,
		sessionId?: string,
	): Promise<QueueSession | null> {
		if (sessionId) {
			const row = await db.queueSessions.get(sessionId)
			if (!row || row.tenantId !== tenantId) return null
			return this.toSession(row)
		}
		const rows = await db.queueSessions
			.where("[tenantId+businessDate]")
			.equals([tenantId, todayFor()])
			.toArray()
		const open = rows.find((row) => row.status === "OPEN")
		const row = open ?? rows[0]
		return row ? this.toSession(row) : null
	}

	private toSession(row: Row): QueueSession {
		return Object.freeze({
			id: String(row.id),
			businessDate: String(row.businessDate),
			status: row.status as QueueSession["status"],
			numberingStrategy:
				(row.numberingStrategy as QueueSession["numberingStrategy"]) ??
				"sequential",
			lastSequence: Number(row.lastSequence ?? 0),
			currency: String(row.currency ?? "SAR"),
			openedAt: Number(row.openedAt ?? 0),
			closedAt: (row.closedAt as number | undefined) ?? undefined,
			updatedAt: Number(row.updatedAt ?? 0),
		})
	}

	async openSession(
		tenantId: string,
		businessDate: string,
	): Promise<QueueSession> {
		const existing = await db.queueSessions
			.where("[tenantId+businessDate]")
			.equals([tenantId, businessDate])
			.first()
		// إعادة الفتح تُعيد نفس الجلسة (تصفير العدّاد يُرفض عمدًا: الرقم
		// المكرر أمام الزبون أسوأ من عدّاد يبدأ من 800).
		if (existing) {
			await db.queueSessions.update(String(existing.id), {
				status: "OPEN",
				closedAt: undefined,
				updatedAt: Date.now(),
			})
			return this.toSession({ ...existing, status: "OPEN" })
		}
		const now = Date.now()
		const row = {
			id: generateUUID(),
			tenantId,
			businessDate,
			status: "OPEN",
			numberingStrategy: "sequential",
			lastSequence: 0,
			currency: "SAR",
			openedAt: now,
			updatedAt: now,
		}
		await db.queueSessions.add(row)
		return this.toSession(row)
	}

	async closeSession(
		tenantId: string,
		sessionId: string,
	): Promise<QueueSession> {
		const row = await db.queueSessions.get(sessionId)
		if (!row || row.tenantId !== tenantId) {
			throw new QueueError(
				QUEUE_ERROR_CODES.SESSION_CLOSED,
				"جلسة الطابور غير موجودة",
			)
		}
		const now = Date.now()
		await db.queueSessions.update(sessionId, {
			status: "CLOSED",
			closedAt: now,
			updatedAt: now,
		})
		return this.toSession({
			...row,
			status: "CLOSED",
			closedAt: now,
			updatedAt: now,
		})
	}

	async createCounter(
		tenantId: string,
		sessionId: string,
		input: { name: string; serviceId?: string },
	): Promise<QueueCounter> {
		if (!input?.name?.trim()) {
			throw new QueueError(QUEUE_ERROR_CODES.VALIDATION, "اسم الكاونتر مطلوب")
		}
		const now = Date.now()
		const row = {
			id: generateUUID(),
			tenantId,
			name: input.name.trim(),
			status: "CLOSED",
			serviceId: input.serviceId,
			sessionId,
			servedCount: 0,
			totalServeMs: 0,
			updatedAt: now,
		}
		await db.queueCounters.add(row)
		return toCounter(row)
	}

	async openCounter(
		tenantId: string,
		counterId: string,
	): Promise<QueueCounter> {
		const row = await db.queueCounters.get(counterId)
		if (!row || row.tenantId !== tenantId) {
			throw new QueueError(
				QUEUE_ERROR_CODES.COUNTER_CLOSED,
				"الكاونتر غير موجود",
			)
		}
		const now = Date.now()
		await db.queueCounters.update(counterId, {
			status: "OPEN",
			openedAt: now,
			updatedAt: now,
		})
		return toCounter({ ...row, status: "OPEN", openedAt: now, updatedAt: now })
	}

	async closeCounter(
		tenantId: string,
		counterId: string,
	): Promise<QueueCounter> {
		const row = await db.queueCounters.get(counterId)
		if (!row || row.tenantId !== tenantId) {
			throw new QueueError(
				QUEUE_ERROR_CODES.COUNTER_CLOSED,
				"الكاونتر غير موجود",
			)
		}
		// لا تُغلق نافذة تحمل تذكرة قيد الخدمة: يُضطر الكاشير للعودة.
		// يُجبَر على إنهاء الخدمة أو نقلها — قرار صريح لا ضمني.
		if (row.currentTicketId) {
			throw new QueueError(
				QUEUE_ERROR_CODES.COUNTER_BUSY,
				"لا يمكن إغلاق كاونتر مشغول — أنهِ الخدمة أو انقل التذكرة",
				{ counterId },
			)
		}
		const now = Date.now()
		await db.queueCounters.update(counterId, {
			status: "CLOSED",
			closedAt: now,
			updatedAt: now,
		})
		return toCounter({
			...row,
			status: "CLOSED",
			closedAt: now,
			updatedAt: now,
		})
	}

	async eventsSince(
		tenantId: string,
		version: number,
	): Promise<readonly QueueSnapshot[]> {
		const rows = await db.queueEvents
			.where("version")
			.above(version)
			.sortBy("version")
		const mine = rows.filter((row) => row.tenantId === tenantId)
		// `Promise.all` ثم `await`: `map(() => this.getSnapshot())` وحدها
		// تُعيد مصفوفة وعود لا لقطات — خطأ صامت لا يكشفه TypeScript
		// لأن النوع المُصرَّح Promise يمرّ.
		return Promise.all(mine.map(() => this.getSnapshot(tenantId)))
	}

	// -----------------------------------------------------------------
	// إصدار التذاكر
	// -----------------------------------------------------------------

	/**
	 * يصدر تذكرة برقم **ذرّي**.
	 *
	 * العدّاد مخزَّن في صف الجلسة ويُقرأ داخل نفس معاملة الكتابة. لو
	 * أُخذ العدّاد خارج المعاملة لأمكن لنافذتين أن تقرأا 41 وتكتبا A-041
	 * مرتين — وهو خطأ يذهب للزبون ولا يُكتشف إلا بشكوى.
	 */
	async issueTicket(command: IssueTicketCommand): Promise<QueueTicket> {
		const { tenantId, sessionId, serviceId } = command
		const service = await db.queueServices.get(serviceId)
		if (!service || service.tenantId !== tenantId) {
			throw new QueueError(
				QUEUE_ERROR_CODES.VALIDATION,
				"الخدمة غير موجودة أو غير متاحة لهذا المستأجر",
			)
		}

		const now = Date.now()
		// `queueEvents` is IN the transaction on purpose: the append-only log is
		// what a lagging device replays after an outage, so a ticket whose
		// event row is missing (or an event for a ticket that never landed)
		// makes the replay disagree with the table it is supposed to
		// reconstruct. Dexie refuses a table outside the transaction scope, and
		// writing it outside would silently break exactly that guarantee.
		return db.transaction(
			"rw",
			db.queueSessions,
			db.queueTickets,
			db.queueEvents,
			async () => {
				const session = await db.queueSessions.get(sessionId)
				if (!session || session.tenantId !== tenantId) {
					throw new QueueError(
						QUEUE_ERROR_CODES.NO_ACTIVE_SESSION,
						"جلسة الطابور غير موجودة",
					)
				}
				if (session.status !== "OPEN") {
					throw new QueueError(
						QUEUE_ERROR_CODES.SESSION_CLOSED,
						"جلسة الطابور مغلقة — لا يمكن إصدار تذاكر",
					)
				}
				const sequence = Number(session.lastSequence ?? 0) + 1
				await db.queueSessions.update(sessionId, {
					lastSequence: sequence,
					updatedAt: now,
				})

				const ticket = buildTicket({
					id: generateUUID(),
					number: formatTicketNumber(sequence, String(service.prefix ?? "A")),
					sequence,
					serviceId,
					serviceName: String(service.name),
					sessionId,
					priority: command.priority,
					mobile: command.mobile,
					note: command.note,
					now,
				})
				await db.queueTickets.add({ ...ticket, tenantId })
				await this.recordEvent(
					tenantId,
					sessionId,
					"TICKET_CREATED",
					{
						ticketId: ticket.id,
						ticketNumber: ticket.number,
						serviceId,
					},
					now,
				)
				return ticket
			},
		)
	}

	// -----------------------------------------------------------------
	// العمليات الذرّية
	// -----------------------------------------------------------------

	/**
	 * ينادي «التذكرة التالية» لكاونتر — عملية واحدة لا قراءتان.
	 *
	 * الترتيب داخل المعاملة مقيس لا اعتباطي:
	 *   1. اقرأ الكاونتر وتأكد أنه حرّ ومفتوح  (المتزامن سيحصل على 1)
	 *   2. اقرأ المرشحين واختر             (المتزامن سيحصل على 1)
	 *   3. اكتب التذكرة CALLED               (المتزامن ينتظر القفل)
	 *   4. اكتب current_ticket_id في الكاونتر  ← الفهرس الجزئي يمنع التكرار
	 *   5. سجّل النداء
	 *
	 * الخطوات 1-2 **قبل** أي كتابة: لو كتبنا أولًا لأمكن اختيار تذكرة ثم
	 * اكتشاف أن الكاونتر مشغول، فتضيع التذكرة من الطابور momentarily.
	 */
	async callNext(
		tenantId: string,
		counterId: string,
		now: number,
	): Promise<CallResult> {
		try {
			return await db.transaction(
				"rw",
				db.queueCounters,
				db.queueTickets,
				db.queueCalls,
				async () => {
					const counterRow = await db.queueCounters.get(counterId)
					if (!counterRow || counterRow.tenantId !== tenantId) {
						throw new QueueError(
							QUEUE_ERROR_CODES.COUNTER_CLOSED,
							"الكاونتر غير موجود",
							{ counterId },
						)
					}
					if (counterRow.currentTicketId) {
						throw new QueueError(
							QUEUE_ERROR_CODES.COUNTER_BUSY,
							"الكاونتر مشغول بتذكرة أخرى — أنهِها أو انقلها أولًا",
							{ counterId },
						)
					}
					if (counterRow.status !== "OPEN") {
						throw new QueueError(
							QUEUE_ERROR_CODES.COUNTER_CLOSED,
							"الكاونتر مغلق — افتحه قبل النداء",
							{ counterId },
						)
					}

					// كاونتر متخصص لا ينادي خدمات غير خدمته: الترشيح
					// قبل القاعدة لا بعدها، وإلا رأى مرشحين ثم رُفضوا.
					const serviceId = counterRow.serviceId
						? String(counterRow.serviceId)
						: undefined
					const all = (
						await db.queueTickets
							.where("sessionId")
							.equals(String(counterRow.sessionId))
							.toArray()
					)
						.filter((row) => row.tenantId === tenantId)
						.map(toTicket)
					const candidates = waitingTickets(
						serviceId ? all.filter((t) => t.serviceId === serviceId) : all,
					)
					const next = candidates[0]
					if (!next) {
						throw new QueueError(
							QUEUE_ERROR_CODES.QUEUE_EMPTY,
							"لا يوجد منتظرون في الطابور",
							{ counterId },
						)
					}

					const called = transitionTicket(next, "CALLED", now, {
						counterId,
						counterName: String(counterRow.name),
					})
					await db.queueTickets.update(called.id, { ...called, tenantId })
					await db.queueCounters.update(counterId, {
						currentTicketId: called.id,
						updatedAt: now,
					})
					const call = this.recordCall(
						tenantId,
						called,
						String(counterRow.id),
						String(counterRow.name),
						"CALL",
						now,
					)
					return {
						ticket: called,
						counter: toCounter({
							...counterRow,
							currentTicketId: called.id,
							updatedAt: now,
						}),
						call,
					}
				},
			)
		} catch (error) {
			// قيد Dexie على الفهرس الجزئي يظهر كـ ConstraintError. نترجمه
			// إلى خطأ نطاق مفهوم بدل «خطأ قاعدة بيانات» أمام الكاشير.
			log.warn("queue call-next conflicted", { counterId })
			throw toQueueError(error, QUEUE_ERROR_CODES.RACE_CONFLICT)
		}
	}

	/** ينادي تذكرة محدّدة (تذكّر) — نفس ذرّية `callNext`. */
	async callTicket(command: CallTicketCommand): Promise<CallResult> {
		const { tenantId, counterId, ticketId, now } = command
		try {
			return await db.transaction(
				"rw",
				db.queueCounters,
				db.queueTickets,
				db.queueCalls,
				async () => {
					const counterRow = await db.queueCounters.get(counterId)
					if (!counterRow || counterRow.tenantId !== tenantId) {
						throw new QueueError(
							QUEUE_ERROR_CODES.COUNTER_CLOSED,
							"الكاونتر غير موجود",
							{ counterId },
						)
					}
					if (counterRow.currentTicketId) {
						throw new QueueError(
							QUEUE_ERROR_CODES.COUNTER_BUSY,
							"الكاونتر مشغول بتذكرة أخرى",
							{ counterId },
						)
					}
					const ticketRow = await db.queueTickets.get(ticketId)
					if (!ticketRow || ticketRow.tenantId !== tenantId) {
						throw new QueueError(
							QUEUE_ERROR_CODES.TICKET_NOT_FOUND,
							"التذكرة غير موجودة",
							{ ticketNumber: ticketId },
						)
					}
					const ticket = toTicket(ticketRow)
					const called = transitionTicket(ticket, "CALLED", now, {
						counterId,
						counterName: String(counterRow.name),
					})
					await db.queueTickets.update(called.id, { ...called, tenantId })
					await db.queueCounters.update(counterId, {
						currentTicketId: called.id,
						updatedAt: now,
					})
					return {
						ticket: called,
						counter: toCounter({
							...counterRow,
							currentTicketId: called.id,
							updatedAt: now,
						}),
						call: this.recordCall(
							tenantId,
							called,
							counterId,
							String(counterRow.name),
							ticket.callCount > 0 ? "RECALL" : "CALL",
							now,
						),
					}
				},
			)
		} catch (error) {
			throw toQueueError(error, QUEUE_ERROR_CODES.RACE_CONFLICT)
		}
	}

	/**
	 * يتخطّى تذكرة الكاونتر ويعيدها للانتظار، ويحرّر الكاونتر.
	 * يُستدعى عندما لا يحضر الزبون أو يخطئ رقمه.
	 */
	async skipTicket(
		tenantId: string,
		counterId: string,
		now: number,
	): Promise<QueueTicketResult> {
		const { ticket, call } = await this.detachCounter(
			tenantId,
			counterId,
			now,
			"SKIPPED",
			"SKIP",
		)
		return { ticket, call }
	}

	/** يبدأ خدمة التذكرة الحالية. */
	async startServing(
		tenantId: string,
		counterId: string,
		now: number,
	): Promise<QueueTicket> {
		const ticket = await this.mutateCurrent(tenantId, counterId, now, "SERVING")
		return ticket
	}

	/**
	 * ينهي الخدمة ويحرّر الكاونتر ويزيد عدّاد الأداء.
	 * محرّر الكاونتر شرط: كاونتر يحتفظ بتذكرة مكتملة لا يخدم أحدًا بعدها.
	 */
	async completeTicket(
		tenantId: string,
		counterId: string,
		now: number,
	): Promise<QueueTicket> {
		return db.transaction("rw", db.queueCounters, db.queueTickets, async () => {
			const counterRow = await db.queueCounters.get(counterId)
			if (!counterRow || counterRow.tenantId !== tenantId) {
				throw new QueueError(
					QUEUE_ERROR_CODES.COUNTER_CLOSED,
					"الكاونتر غير موجود",
				)
			}
			const ticketRow = counterRow.currentTicketId
				? await db.queueTickets.get(String(counterRow.currentTicketId))
				: null
			if (!ticketRow || ticketRow.tenantId !== tenantId) {
				throw new QueueError(
					QUEUE_ERROR_CODES.TICKET_NOT_FOUND,
					"لا توجد تذكرة على هذا الكاونتر",
				)
			}
			const ticket = toTicket(ticketRow)
			const done = transitionTicket(ticket, "COMPLETED", now)
			await db.queueTickets.update(done.id, { ...done, tenantId })

			// قياس أداء الكاونتر: يُحتسب من بدء الخدمة لا من النداء.
			const serveMs = done.servingAt ? Math.max(0, now - done.servingAt) : 0
			await db.queueCounters.update(counterId, {
				currentTicketId: undefined,
				servedCount: Number(counterRow.servedCount ?? 0) + 1,
				totalServeMs: Number(counterRow.totalServeMs ?? 0) + serveMs,
				updatedAt: now,
			})
			return done
		})
	}

	/** ينقل التذكرة لكاونتر آخر ذرّياً. */
	async transferTicket(
		tenantId: string,
		fromCounterId: string,
		toCounterId: string,
		now: number,
	): Promise<QueueTicket> {
		if (fromCounterId === toCounterId) {
			throw new QueueError(
				QUEUE_ERROR_CODES.VALIDATION,
				"لا يمكن النقل إلى الكاونتر نفسه",
			)
		}
		return db.transaction("rw", db.queueCounters, db.queueTickets, async () => {
			const [fromRow, toRow] = await Promise.all([
				db.queueCounters.get(fromCounterId),
				db.queueCounters.get(toCounterId),
			])
			if (!fromRow || fromRow.tenantId !== tenantId) {
				throw new QueueError(
					QUEUE_ERROR_CODES.COUNTER_CLOSED,
					"الكاونتر المُصدر غير موجود",
				)
			}
			if (!toRow || toRow.tenantId !== tenantId) {
				throw new QueueError(
					QUEUE_ERROR_CODES.COUNTER_CLOSED,
					"الكاونتر المستقبِل غير موجود",
				)
			}
			if (toRow.currentTicketId) {
				throw new QueueError(
					QUEUE_ERROR_CODES.COUNTER_BUSY,
					"الكاونتر المستقبِل مشغول",
					{ counterId: toCounterId },
				)
			}
			const ticketRow = fromRow.currentTicketId
				? await db.queueTickets.get(String(fromRow.currentTicketId))
				: null
			if (!ticketRow || ticketRow.tenantId !== tenantId) {
				throw new QueueError(
					QUEUE_ERROR_CODES.TICKET_NOT_FOUND,
					"لا توجد تذكرة على الكاونتر المُصدر",
				)
			}
			const moved = transitionTicket(toTicket(ticketRow), "TRANSFERRED", now, {
				counterId: toCounterId,
				counterName: String(toRow.name),
			})
			await db.queueTickets.update(moved.id, { ...moved, tenantId })
			await db.queueCounters.update(fromCounterId, {
				currentTicketId: undefined,
				updatedAt: now,
			})
			await db.queueCounters.update(toCounterId, {
				currentTicketId: moved.id,
				updatedAt: now,
			})
			return moved
		})
	}

	// -----------------------------------------------------------------
	// مساعدات خاصة
	// -----------------------------------------------------------------

	/**
	 * يسجّل حدثًا في `queue_events` (append-only).
	 *
	 * الجدول أساس المزامنة بعد انقطاع: أرقام النسخ تجعل الجهاز
	 * المتأخر يعرف ما فاتته بلا الاعتماد على طابع زمني محلي هارب.
	 */
	private async recordEvent(
		tenantId: string,
		sessionId: string,
		type: string,
		payload: Record<string, unknown>,
		now: number,
	): Promise<void> {
		const version = this.nextVersion()
		await db.queueEvents.add({
			id: generateUUID(),
			tenantId,
			sessionId,
			type,
			version,
			payload: JSON.stringify(payload),
			at: now,
		})
	}

	/** يسجّل نداءً في السجل (append-only). */
	private recordCall(
		tenantId: string,
		ticket: QueueTicket,
		counterId: string,
		counterName: string,
		kind: QueueCall["kind"],
		now: number,
	): QueueCall {
		const call: QueueCall = {
			id: generateUUID(),
			ticketId: ticket.id,
			ticketNumber: ticket.number,
			counterId,
			counterName,
			kind,
			at: now,
		}
		void db.queueCalls.add({ ...call, tenantId })
		return call
	}

	/** ينقل تذكرة الكاونتر إلى حالة تُحرّر الكاونتر (تخطٍ/إلغاء). */
	private async detachCounter(
		tenantId: string,
		counterId: string,
		now: number,
		status: QueueTicket["status"],
		kind: QueueCall["kind"],
	): Promise<{ ticket: QueueTicket; call: QueueCall }> {
		return db.transaction(
			"rw",
			db.queueCounters,
			db.queueTickets,
			db.queueCalls,
			async () => {
				const counterRow = await db.queueCounters.get(counterId)
				if (!counterRow || counterRow.tenantId !== tenantId) {
					throw new QueueError(
						QUEUE_ERROR_CODES.COUNTER_CLOSED,
						"الكاونتر غير موجود",
					)
				}
				const ticketRow = counterRow.currentTicketId
					? await db.queueTickets.get(String(counterRow.currentTicketId))
					: null
				if (!ticketRow || ticketRow.tenantId !== tenantId) {
					throw new QueueError(
						QUEUE_ERROR_CODES.TICKET_NOT_FOUND,
						"لا توجد تذكرة على هذا الكاونتر",
					)
				}
				const ticket = transitionTicket(toTicket(ticketRow), status, now, {
					// `undefined` لا `null`: الفهرس الجزئي يجاهل NULL، فلو
					// تركنا null لبقي الكاونتر «مشغولًا» إلى الأبد.
					counterId: undefined,
					counterName: undefined,
				})
				await db.queueTickets.update(ticket.id, { ...ticket, tenantId })
				await db.queueCounters.update(counterId, {
					currentTicketId: undefined,
					updatedAt: now,
				})
				return {
					ticket,
					call: this.recordCall(
						tenantId,
						ticket,
						counterId,
						String(counterRow.name),
						kind,
						now,
					),
				}
			},
		)
	}

	/** ينقل تذكرة الكاونتر إلى حالة تُبقيه مشغولاً (بدء الخدمة). */
	private async mutateCurrent(
		tenantId: string,
		counterId: string,
		now: number,
		status: QueueTicket["status"],
	): Promise<QueueTicket> {
		return db.transaction("rw", db.queueCounters, db.queueTickets, async () => {
			const counterRow = await db.queueCounters.get(counterId)
			if (!counterRow || counterRow.tenantId !== tenantId) {
				throw new QueueError(
					QUEUE_ERROR_CODES.COUNTER_CLOSED,
					"الكاونتر غير موجود",
				)
			}
			const ticketRow = counterRow.currentTicketId
				? await db.queueTickets.get(String(counterRow.currentTicketId))
				: null
			if (!ticketRow || ticketRow.tenantId !== tenantId) {
				throw new QueueError(
					QUEUE_ERROR_CODES.TICKET_NOT_FOUND,
					"لا توجد تذكرة على هذا الكاونتر",
				)
			}
			const ticket = transitionTicket(toTicket(ticketRow), status, now)
			await db.queueTickets.update(ticket.id, { ...ticket, tenantId })
			await db.queueCounters.update(counterId, { updatedAt: now })
			return ticket
		})
	}
}

/** المستودع المشترك — مصدر واحد في التطبيق. */
export const queueRepository: QueueRepository = new DexieQueueRepository()

export default queueRepository
