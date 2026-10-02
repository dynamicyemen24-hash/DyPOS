/**
 * الأنواع المُعلَنة لنظام الطابور — مصدر واحد (canonical).
 *
 * هذه الأنواع هي العقد بين الطبقات: الـ UI لا يعرف الـ infrastructure،
 * والـ domain لا يعرف Vue. أي نوع مكرر في طبقة أخرى هو نوع ثانٍ
 * ينحرف — لذلك لا يُعرَّف `QueueTicket` إلا هنا.
 */

/** حالة التذكرة في دورة حياتها. */
export type QueueStatus =
	| "WAITING"
	| "CALLED"
	| "RECALLED"
	| "SKIPPED"
	| "SERVING"
	| "COMPLETED"
	| "TRANSFERRED"
	| "CANCELLED"

/** حالة الكاونتر (نافذة خدمة). */
export type CounterStatus = "CLOSED" | "OPEN" | "SUSPENDED"

/** أولوية التذكرة. أصغر رقم = أعلى أولوية. */
export type QueuePriority = "NORMAL" | "HIGH" | "URGENT"

/** لغة النداء الصوتي. */
export type VoiceLocale = "ar" | "en"

/** حالة الاتصال اللحظي. */
export type RealtimeStatus =
	| "DISCONNECTED"
	| "CONNECTING"
	| "CONNECTED"
	| "STALE"
	| "RECOVERING"

/** أفضلية الترقيم. */
export type QueueNumberingStrategy = "sequential" | "daily-reset"

/** تذكرة في الطابور. */
export interface QueueTicket {
	readonly id: string
	/** الرقم المعروض للزبون (A-001) — فريد داخل الجلسة. */
	readonly number: string
	/** الرقم الرقمي (1) — للفرز والمقارنة. */
	readonly sequence: number
	readonly serviceId: string
	readonly serviceName: string
	readonly status: QueueStatus
	readonly priority: QueuePriority
	/** تاريخ إصدار التذكرة (ms). */
	readonly issuedAt: number
	/** أول وقت نُظر فيها. */
	readonly firstCalledAt?: number
	readonly calledAt?: number
	readonly servingAt?: number
	readonly completedAt?: number
	/** الكاونتر الذي يخدمها حاليًا. */
	readonly counterId?: string
	readonly counterName?: string
	/** الجوال — لطريقة استدعاء غير مرئية. */
	readonly mobile?: string
	readonly note?: string
	/** معرّف الجلسة التي أُصدرت فيها. */
	readonly sessionId: string
	/** عدد مرات النداء — يحدّ التذكّر المتكرر. */
	readonly callCount: number
	readonly updatedAt: number
}

/** نافذة خدمة (كاونتر). */
export interface QueueCounter {
	readonly id: string
	readonly name: string
	readonly status: CounterStatus
	/** الخدمة التي يتخصص بها؛ `undefined` = يخدم الكل. */
	readonly serviceId?: string
	/** التذكرة التي يخدمها الآن. */
	readonly currentTicketId?: string
	readonly sessionId: string
	readonly openedAt?: number
	readonly closedAt?: number
	/** عدد التذاكر المنجزة — لمؤشرات الأداء. */
	readonly servedCount: number
	/** إجمالي مدة الخدمة (ms) — لحساب المتوسط. */
	readonly totalServeMs: number
	readonly updatedAt: number
}

/** نوع خدمة (كاشير، استقبال، دعم…). */
export interface QueueService {
	readonly id: string
	readonly code: string
	readonly name: string
	readonly nameEn: string
	/** بادئة رقم التذكرة لهذه الخدمة. */
	readonly prefix: string
	readonly active: boolean
	/** لون العرض — رمز اسم لون دلالي لا قيمة حرفية. */
	readonly colorToken: string
	readonly sortOrder: number
}

/** جلسة طابور (وردية تشغيلية). */
export interface QueueSession {
	readonly id: string
	/** التاريخ بصيغة yyyymmdd — النطاق اليومي للترقيم. */
	readonly businessDate: string
	readonly status: "OPEN" | "CLOSED"
	readonly numberingStrategy: QueueNumberingStrategy
	/** آخر رقم أصدرته الجلسة. */
	readonly lastSequence: number
	readonly currency: string
	readonly openedAt: number
	readonly closedAt?: number
	readonly updatedAt: number
}

/** سجل نداء (للتدقيق ولشاشة «آخر النداءات»). */
export interface QueueCall {
	readonly id: string
	readonly ticketId: string
	readonly ticketNumber: string
	readonly counterId: string
	readonly counterName: string
	readonly kind: "CALL" | "RECALL" | "SKIP" | "TRANSFER"
	readonly at: number
	/** من كاونتر إلى كاونتر (للنقل فقط). */
	readonly toCounterId?: string
}

/** لقطة الحالة الكاملة — ما تقرأ منه كل الواجهات. */
export interface QueueState {
	readonly session: QueueSession | null
	readonly tickets: readonly QueueTicket[]
	readonly counters: readonly QueueCounter[]
	readonly services: readonly QueueService[]
	readonly calls: readonly QueueCall[]
	readonly version: number
	readonly updatedAt: number
}

/** مُدخلات الإحصاء (للوحة التحكم). */
export interface QueueStatistics {
	readonly waiting: number
	readonly serving: number
	readonly completed: number
	readonly skipped: number
	readonly transferred: number
	readonly cancelled: number
	readonly total: number
	/** متوسط الانتظار (ms) للمنتهين. */
	readonly averageWaitMs: number
	/** متوسط الخدمة (ms) للمنتهين. */
	readonly averageServeMs: number
	/** أطول انتظار حالي (ms). */
	readonly longestWaitMs: number
	/** كاونتر مشغول الآن. */
	readonly busyCounters: number
	readonly totalCounters: number
}

/** حالة الكاونتر كما تعرضها الشاشة. */
export interface CounterStatusView {
	readonly id: string
	readonly name: string
	readonly status: CounterStatus
	readonly currentTicketNumber?: string
	readonly servedCount: number
	readonly averageServeMs: number
}
