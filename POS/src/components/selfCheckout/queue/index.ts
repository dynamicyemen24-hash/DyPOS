/**
 * نظام الطابور — نقطة الدخول العامة.
 *
 * كل ما يخص الطابور في مكان واحد: المجال (القواعد وآلة الحالات)، العقد،
 * البنية التحتية (Dexie)، ومنسّق الاستخدامات. الواجهة تستورد من هنا
 * فقط، فلا تعرف من أين تأتي الأرقام ولا كيف تُقفل.
 */

// المجال
export {
	assertTransition,
	canTransition,
	isActiveInQueue,
	isTerminal,
	nextStatuses,
	statusLabelAr,
} from "./core/domain/state/QueueStateMachine.js"
export {
	compareCandidates,
	isQueueEmpty,
	requireNext,
	selectNext,
	selectRecall,
	waitingTickets,
} from "./core/domain/rules/CallingRules.js"
export {
	isFinished,
	issueTicket,
	occupiesCounter,
	serveDuration,
	transitionTicket,
	waitDuration,
} from "./core/domain/entities/QueueTicket.js"
export {
	compareQueueNumbers,
	createQueueNumber,
	isQueueNumber,
} from "./core/domain/valueObjects/QueueNumber.js"
export {
	assertCanIssue,
	createQueueStatus,
	labelFor,
} from "./core/domain/valueObjects/QueueStatus.js"

// الأحداث
export {
	QueueEventBus,
	queueEventBus,
} from "./core/domain/events/QueueEventBus.js"
export {
	QUEUE_EVENT_TYPES,
	isQueueEvent,
} from "./shared/types/queue-events.types.js"

// الأخطاء
export {
	QUEUE_ERROR_CODES,
	QueueError,
	isQueueError,
	toQueueError,
} from "./shared/errors/QueueError.js"

// العقد
export type {
	CallResult,
	CallTicketCommand,
	IssueTicketCommand,
	QueueRepository,
	QueueSnapshot,
	QueueTicketResult,
} from "./core/application/contracts/QueueRepository.js"

// البنية التحتية
export {
	DexieQueueRepository,
	queueRepository,
} from "./core/infrastructure/storage/QueueStorageAdapter.js"

// الاستخدامات
export {
	QueueOrchestrator,
	queueErrorMessage,
	queueOrchestrator,
} from "./core/application/useCases/QueueOrchestrator.js"

// الواجهة
export { default as useCashierQueue } from "./features/cashier/hooks/useCashierQueue.js"
export { default as QueueDisplay } from "./features/display/components/QueueDisplay.vue"
export {
	VoiceAnnouncer,
	buildText,
	queueVoice,
} from "./features/voice/services/announcement.service.js"

// الأدوات
export {
	formatTicketNumber,
	isValidTicketNumber,
	nextSequence,
	parseTicketSequence,
	ticketValue,
} from "./shared/utils/queue-number.utils.js"
export {
	DEFAULT_DISPLAY_WINDOW,
	REALTIME_STALE_MS,
	TICKET_PREFIX,
	VOICE_MIN_GAP_MS,
} from "./shared/constants/queue.constants.js"
export {
	businessDate,
	formatDuration,
	safeAverage,
} from "./shared/utils/queue-time.utils.js"
