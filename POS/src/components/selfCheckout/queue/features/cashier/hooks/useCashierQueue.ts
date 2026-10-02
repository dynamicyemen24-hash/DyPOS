/**
 * useCashierQueue — الحالة التفاعلية للكاشير من زاوية الطابور.
 *
 * هذا **ال composable الوحيد** الذي تقرأ منه الواجهات. كل حالة الطابور
 * مشتقة من لقطة واحدة من `QueueOrchestrator`، وتُحدَّث بحدث واحد. لا
 * تحتفظ أي شاشة بنسخة خاصة من التذاكر — هذا هو المعنى العملي لـ«مصدر
 * حقيقة واحد».
 *
 * نمط الاشتراك: `on` من الناقل يعيد دالة إلغاء، و`onScopeDispose` يستدعيها
 * تلقائيًا. بدون ذلك يبقى كل معلق بعد إغلاق الشاشة، وتتراكم الاشتراكات
 * في وردية طويلة حتى تتوقف تحديثات الشاشة.
 */

import { computed, onScopeDispose, ref, shallowRef } from "vue"

import { isQueueError } from "../../../shared/errors/QueueError.js"
import { queueEventBus } from "../../../core/domain/events/QueueEventBus.js"
import {
	queueErrorMessage,
	queueOrchestrator,
} from "../../../core/application/useCases/QueueOrchestrator.js"
import type { QueueSnapshot } from "../../../core/application/contracts/QueueRepository.js"
import { safeAverage } from "../../../shared/utils/queue-time.utils.js"
import { waitingTickets } from "../../../core/domain/rules/CallingRules.js"
import { queueVoice } from "../../voice/services/announcement.service.js"
import type {
	QueueCounter,
	QueueService,
	QueueStatistics,
	QueueTicket,
	VoiceLocale,
} from "../../../shared/types/queue.types.js"

/** المعرّف المستأجر — يثبَّت عند ربط السيرفر. */
const TENANT = "local"

export interface CashierOptions {
	readonly tenantId?: string
	readonly counterId?: string
	readonly locale?: VoiceLocale
	/** إيقاف النداء الصوتي (شاشة صامتة في مكتب). */
	readonly silent?: boolean
}

export function useCashierQueue(options: CashierOptions = {}) {
	const tenantId = options.tenantId ?? TENANT
	const counterId = options.counterId ?? ""
	const locale = options.locale ?? "ar"

	const snapshot = shallowRef<QueueSnapshot | null>(null)
	const loading = ref(false)
	const busy = ref(false)
	const error = ref("")

	const tickets = computed<readonly QueueTicket[]>(
		() => snapshot.value?.tickets ?? [],
	)
	const counters = computed<readonly QueueCounter[]>(
		() => snapshot.value?.counters ?? [],
	)
	const services = computed<readonly QueueService[]>(
		() => snapshot.value?.services ?? [],
	)
	const waiting = computed(() => waitingTickets(tickets.value))
	const counter = computed<QueueCounter | null>(
		() => counters.value.find((c) => c.id === counterId) ?? null,
	)
	/** التذكرة التي يخدمها هذا الكاونتر الآن. */
	const currentTicket = computed<QueueTicket | null>(
		() =>
			tickets.value.find((t) => t.id === counter.value?.currentTicketId) ??
			null,
	)
	const statistics = computed<QueueStatistics>(() =>
		queueOrchestrator.statistics(tickets.value, counters.value),
	)
	const averageWaitMs = computed(() =>
		Math.round(
			safeAverage(statistics.value.averageWaitMs, statistics.value.completed),
		),
	)

	/** يحدّث اللقطة من المستودع (بعد كل تغيير، وعند التركيب). */
	async function refresh(): Promise<void> {
		loading.value = true
		try {
			snapshot.value = await queueOrchestrator.snapshot(tenantId)
			error.value = ""
		} catch (cause) {
			// لقطة مفقودة ليست «الطابور فارغ»: نقول ذلك صراحةً.
			error.value = queueErrorMessage(cause)
		} finally {
			loading.value = false
		}
	}

	/** يغلّف عملية: يمنع الضغط المزدوج ويعرض الخطأ بالعربية. */
	async function run<T>(operation: () => Promise<T>): Promise<T | null> {
		if (busy.value) return null
		busy.value = true
		try {
			const result = await operation()
			error.value = ""
			return result
		} catch (cause) {
			error.value = queueErrorMessage(cause)
			// تعارض تزامن: الحالة على الشاشة أقدم من المخزن.
			if (isQueueError(cause) && cause.code === "QUEUE_RACE_CONFLICT") {
				await refresh()
			}
			return null
		} finally {
			busy.value = false
		}
	}

	// -----------------------------------------------------------------
	// العمليات التشغيلية
	// -----------------------------------------------------------------

	/** ينادي «التذكرة التالية» وينطق رقمها. */
	async function callNext(): Promise<QueueTicket | null> {
		if (!counterId) {
			error.value = "لم يُحدَّد الكاونتر بعد"
			return null
		}
		const ticket = await run(() =>
			queueOrchestrator.callNext(tenantId, counterId),
		)
		if (ticket && !options.silent) {
			queueVoice.speak({
				kind: "call",
				ticketNumber: ticket.number,
				counterName: ticket.counterName ?? counter.value?.name ?? "",
				locale,
			})
		}
		return ticket
	}

	/** تذكّر تذكرة محددة. */
	async function recall(ticketId: string): Promise<QueueTicket | null> {
		const ticket = await run(() =>
			queueOrchestrator.recallTicket(tenantId, counterId, ticketId),
		)
		if (ticket && !options.silent) {
			queueVoice.speak({
				kind: "recall",
				ticketNumber: ticket.number,
				counterName: ticket.counterName ?? "",
				locale,
			})
		}
		return ticket
	}

	/** تخطّي التذكرة الحالية وإعادتها للانتظار. */
	async function skip(): Promise<QueueTicket | null> {
		const ticket = await run(() =>
			queueOrchestrator.skipTicket(tenantId, counterId),
		)
		if (ticket && !options.silent) {
			queueVoice.speak({
				kind: "skip",
				ticketNumber: ticket.number,
				counterName: counter.value?.name ?? "",
				locale,
			})
		}
		return ticket
	}

	/** بدء خدمة التذكرة الحالية. */
	async function startServing(): Promise<QueueTicket | null> {
		return run(() => queueOrchestrator.startServing(tenantId, counterId))
	}

	/** إنهاء الخدمة وتحرير الكاونتر. */
	async function complete(): Promise<QueueTicket | null> {
		const ticket = await run(() =>
			queueOrchestrator.completeTicket(tenantId, counterId),
		)
		if (ticket && !options.silent) {
			queueVoice.speak({
				kind: "complete",
				ticketNumber: ticket.number,
				counterName: counter.value?.name ?? "",
				locale,
			})
		}
		return ticket
	}

	/** نقل التذكرة لكاونتر آخر. */
	async function transfer(toCounterId: string): Promise<QueueTicket | null> {
		return run(() =>
			queueOrchestrator.transferTicket(tenantId, counterId, toCounterId),
		)
	}

	/** يصدر تذكرة للزبون. */
	async function issueTicket(
		serviceId: string,
		priority: "NORMAL" | "HIGH" | "URGENT" = "NORMAL",
	): Promise<QueueTicket | null> {
		const sessionId = snapshot.value?.session?.id
		if (!sessionId) {
			error.value = "لا توجد جلسة طابور مفتوحة"
			return null
		}
		return run(() =>
			queueOrchestrator.issueTicket({
				tenantId,
				sessionId,
				serviceId,
				priority,
			}),
		)
	}

	/** يفتح جلسة اليوم إن لم تكن مفتوحة. */
	async function ensureSession() {
		return run(() => queueOrchestrator.openSession(tenantId))
	}

	// -----------------------------------------------------------------
	// التفاعل التلقائي
	// -----------------------------------------------------------------

	// أي حدث طابور → لقطة واحدة. اللقطة أرخص وأصح من إعادة اشتقاق
	// الحالة محليًا: المصدر واحد، فلا ينحرف العرض عن المخزن.
	const unsubscribe = queueEventBus.onAny(() => {
		void refresh()
	})
	onScopeDispose(() => {
		unsubscribe()
		queueVoice.cancel()
	})

	return {
		// حالة
		loading,
		busy,
		error,
		snapshot,
		// مشتقات
		tickets,
		counters,
		services,
		waiting,
		counter,
		currentTicket,
		statistics,
		averageWaitMs,
		// إجراءات
		refresh,
		ensureSession,
		issueTicket,
		callNext,
		recall,
		skip,
		startServing,
		complete,
		transfer,
	}
}

export default useCashierQueue
