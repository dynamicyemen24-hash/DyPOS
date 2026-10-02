/**
 * نظام الطوابير — الثوابت المُعلَنة.
 *
 * كل الأرقام هنا مقيسة لا تقديرية: الترقيم يبدأ من 1 (الصفر محجوز لـ«لا
 * تذكرة»)، والنافذة الافتراضية 50 تذكرة كما في شاشة الاستقبال الفعلية.
 */

/** رمز البادئة في رقم التذكرة المعروض (A-001). */
export const TICKET_PREFIX = "A" as const

/** أقصى تذكرة تُصدر قبل التفاف الترقيم. */
export const MAX_TICKET_NUMBER = 9999 as const

/** خانات رقم التذكرة (A-001 ⇒ 3 خانات). */
export const TICKET_PAD = 3 as const

/** النافذة الافتراضية لعرض المنتظرين على شاشة العميل. */
export const DEFAULT_DISPLAY_WINDOW = 50 as const

/** أقصى طول لاسم الخدمة (يمنع حشو لوحة العرض بنص طويل). */
export const MAX_SERVICE_NAME_LENGTH = 40 as const

/** أقصى عدد أجهزة النداء لكل جلسة. */
export const MAX_AUDIO_UNITS = 8 as const

/** المهلة قبل اعتبار reconnect ناجح (ms). */
export const REALTIME_HEARTBEAT_MS = 15_000 as const

/** المهلة بعد فقدان الاتصال قبل عرض «منقطع» (ms). */
export const REALTIME_STALE_MS = 45_000 as const

/** محاولات قبل إعلان الفشل النهائي بدل إعادة المحاولة. */
export const MAX_RECONNECT_ATTEMPTS = 6 as const

/** فاصل إعادة المحاولة exponential بالمللي ثانية. */
export const RECONNECT_BASE_DELAY_MS = 1_000 as const

/** أطول مدة ننتظرها للنداء الصوتي قبل التخلي (ms). */
export const VOICE_UTTERANCE_TIMEOUT_MS = 8_000 as const

/** أقل مدة بين نداءين — يمنع تداخل النطق في الميكروفون الواحد. */
export const VOICE_MIN_GAP_MS = 1_200 as const

/** أسماء جداول Dexie — مصدر واحد لحقيقة الـ storage. */
export const QUEUE_TICKETS_TABLE = "queueTickets" as const
export const QUEUE_COUNTERS_TABLE = "queueCounters" as const
export const QUEUE_SERVICES_TABLE = "queueServices" as const
export const QUEUE_SESSIONS_TABLE = "queueSessions" as const
export const QUEUE_CALLS_TABLE = "queueCalls" as const
export const QUEUE_EVENTS_TABLE = "queueEvents" as const

/** ISO 4217 المقبولة. ما عداها يفشل التحقق. */
export const SUPPORTED_CURRENCIES = Object.freeze([
	"SAR",
	"USD",
	"EUR",
	"AED",
	"KWD",
	"BHD",
	"OMR",
	"JOD",
	"QAR",
	"EGP",
	"GBP",
])
