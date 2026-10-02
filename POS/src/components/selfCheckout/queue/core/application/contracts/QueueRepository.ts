/**
 * عقد مستودع الطابور — كل I/O يمرّ من هنا.
 *
 * التطبيق (use cases) لا يعرف Dexie ولا HTTP ولا أي وسيط. هذا هو الحد
 * الذي يجعل استبدال التخزين لاحقًا ممكنًا بلا لمس منطق العمل، وهو ما
 * يجعل اختبار «نداء التالي» يُنفَّذ على مستودع في الذاكرة بلا قاعدة
 * بيانات.
 *
 * **العقد الذرّي (الأهم)**: `callNext` ليست قراءة+كتابة منفصلتين. هي
 * عملية واحدة تنفّذ داخل معاملة واحدة. هذا ما يمنع استدعاء نفس التذكرة
 * من كاشيرين في اللحظة نفسها — وهي أشيع ثغرة في أنظمة الطوابير.
 */

import type {
	QueueCall,
	QueueCounter,
	QueueService,
	QueueSession,
	QueueTicket,
} from "../../../shared/types/queue.types.js"

/** مُدخل إصدار تذكرة. */
export interface IssueTicketCommand {
	readonly tenantId: string
	readonly sessionId: string
	readonly serviceId: string
	readonly priority?: "NORMAL" | "HIGH" | "URGENT"
	readonly mobile?: string
	readonly note?: string
}

/** مُدخل نداء تذكرة لكاونتر. */
export interface CallTicketCommand {
	readonly tenantId: string
	readonly counterId: string
	readonly ticketId: string
	readonly now: number
}

/** نتيجة عملية النداء الذرّية. */
export interface CallResult {
	readonly ticket: QueueTicket
	readonly counter: QueueCounter
	readonly call: QueueCall
}

/** نتيجة تخطي/نقل — التذكرة فقط (الكاونتر يُحرَّر). */
export interface QueueTicketResult {
	readonly ticket: QueueTicket
	readonly call: QueueCall
}

/** مُدخل تذكّر. */
export interface RecallTicketCommand {
	readonly tenantId: string
	readonly counterId: string
	readonly now: number
}

/** لقطة كاملة لقراءة الواجهات. */
export interface QueueSnapshot {
	readonly session: QueueSession | null
	readonly tickets: readonly QueueTicket[]
	readonly counters: readonly QueueCounter[]
	readonly services: readonly QueueService[]
	readonly calls: readonly QueueCall[]
	/** أعلى نسخة معروفة — للمزامنة. */
	readonly version: number
}

/** مستودع الطابور — الواجهة الوحيدة للبيانات. */
export interface QueueRepository {
	// -------------------------------------------------------------
	// القراءة
	// -------------------------------------------------------------
	/** لقطة كاملة للجلسة الحالية. */
	getSnapshot(tenantId: string, sessionId?: string): Promise<QueueSnapshot>
	/** التذاكر بترتيب النداء. */
	listTickets(tenantId: string, sessionId: string): Promise<QueueTicket[]>
	/** الكاونترات. */
	listCounters(tenantId: string, sessionId: string): Promise<QueueCounter[]>
	/** الخدمات النشطة. */
	listServices(tenantId: string): Promise<QueueService[]>
	/** تذكرة بمعرّفها، أو `null`. */
	getTicket(tenantId: string, ticketId: string): Promise<QueueTicket | null>
	/** كاونتر بمعرّفه، أو `null`. */
	getCounter(tenantId: string, counterId: string): Promise<QueueCounter | null>
	/** آخر النداءات (للشاشة ولوحة التحكم). */
	listRecentCalls(tenantId: string, limit: number): Promise<QueueCall[]>
	/** أعلى نسخة حدث (للمزامنة بعد انقطاع). */
	getVersion(tenantId: string): Promise<number>

	// -------------------------------------------------------------
	// الكتابة
	// -------------------------------------------------------------
	/** يفتح جلسة (أو يعيد فتح جلسة اليوم). */
	openSession(tenantId: string, businessDate: string): Promise<QueueSession>
	/** يغلق الجلسة. */
	closeSession(tenantId: string, sessionId: string): Promise<QueueSession>
	/** يصدر تذكرة برقم ذرّي. */
	issueTicket(command: IssueTicketCommand): Promise<QueueTicket>
	/** ينشئ كاونتر. */
	createCounter(
		tenantId: string,
		sessionId: string,
		input: { name: string; serviceId?: string },
	): Promise<QueueCounter>
	/** يفتح كاونتر. */
	openCounter(tenantId: string, counterId: string): Promise<QueueCounter>
	/** يغلق كاونتر. */
	closeCounter(tenantId: string, counterId: string): Promise<QueueCounter>

	// -------------------------------------------------------------
	// العمليات الذرّية
	// -------------------------------------------------------------
	/** ينادي التذكرة التالية ذرّياً. يرمي عند الفراغ أو شغل الكاونتر. */
	callNext(
		tenantId: string,
		counterId: string,
		now: number,
	): Promise<CallResult>
	/** ينادي تذكرة محدّدة (تذكّر). */
	callTicket(command: CallTicketCommand): Promise<CallResult>
	/** يعيد تذكرة للانتظار. */
	skipTicket(
		tenantId: string,
		counterId: string,
		now: number,
	): Promise<QueueTicketResult>
	/** يبدأ الخدمة. */
	startServing(
		tenantId: string,
		counterId: string,
		now: number,
	): Promise<QueueTicket>
	/** ينهي الخدمة ويحرّر الكاونتر. */
	completeTicket(
		tenantId: string,
		counterId: string,
		now: number,
	): Promise<QueueTicket>
	/** ينقل التذكرة لكاونتر آخر. */
	transferTicket(
		tenantId: string,
		fromCounterId: string,
		toCounterId: string,
		now: number,
	): Promise<QueueTicket>

	// -------------------------------------------------------------
	// المراقبة
	// -------------------------------------------------------------
	/** أحداث بعد نسخة (للتزامن). */
	eventsSince(
		tenantId: string,
		version: number,
	): Promise<readonly QueueSnapshot[]>
}
