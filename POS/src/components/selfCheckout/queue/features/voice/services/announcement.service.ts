/**
 * نداء الطابور الصوتي — طبقة مستقلة فوق مزوّد الصوت.
 *
 * الفصل مقيس لا مثالي: لو استدعى المجال `speechSynthesis` مباشرة لأصبح
 * اختبار «هل نُظرت التذكرة 42 على الكاونتر 3» يتطلّب متصفحًا، ولأصبح
 * تغيير الصوت (سحابة، بلاط) تغييرًا في منطق العمل.
 *
 * حارسان تشغيليان يقاسان أثرهما:
 *  - **منع التداخل**: نداءان متتاليان يُلغيان الأول. بدون هذا يقول
 *    «تذكرة خمس وأربعون» فوق «تذكرة اثنتي عشرة» ويخرج الزبون بالرقم
 *    الخطأ — أخطر من غياب النداء.
 *  - **السماح بالفشل**: غياب الصوت يُسجَّل ولا يرمي. الطابور يعمل على
 *    جهاز بلا صوت؛ الشاشة هي قناة الإبلاغ الأساسية.
 */

import {
	VOICE_MIN_GAP_MS,
	VOICE_UTTERANCE_TIMEOUT_MS,
} from "../../../shared/constants/queue.constants.js"
import type { VoiceLocale } from "../../../shared/types/queue.types.js"
import { logger } from "@/utils/logger"

const log = logger.create("QueueVoice")

/** نص النداء بلغة. */
export interface Announcement {
	readonly kind: "call" | "recall" | "skip" | "complete" | "transfer"
	readonly ticketNumber: string
	readonly counterName: string
	readonly locale: VoiceLocale
}

/** قوالب النداء. النتيجة تُقسم على '-' لأن الأرقام تُنطق رقميًا. */
const TEMPLATES: Readonly<
	Record<Announcement["kind"], Record<VoiceLocale, string>>
> = Object.freeze({
	call: { ar: "التذكرة {t}، إلى {c}", en: "Ticket {t}, to {c}" },
	recall: {
		ar: "نرجو من صاحب التذكرة {t} التوجه إلى {c}",
		en: "Calling {t} again, to {c}",
	},
	skip: { ar: "تم تخطي التذكرة {t}", en: "Ticket {t} skipped" },
	complete: { ar: "شكرًا لزيارتكم", en: "Thank you" },
	transfer: { ar: "نُقلت التذكرة {t} إلى {c}", en: "Ticket {t} moved to {c}" },
})

/**
 * يبني نص النداء.
 *
 * الرقم يُنطق **مفكّكًا** (`A-042` ⇒ «صفر اثنان أربعة» لا «ألف صفر
 * أربعة وعشرون»): ماسح الباركود في المطاعم يقرأ أرقامًا، لا صيغة نصية.
 */
export function buildText(announcement: Announcement): string {
	const template = TEMPLATES[announcement.kind][announcement.locale]
	const spoken = String(announcement.ticketNumber).replace(/-/g, " ")
	return template
		.replace("{t}", spoken)
		.replace("{c}", announcement.counterName)
}

export class VoiceAnnouncer {
	private utterance: SpeechSynthesisUtterance | null = null
	private lastSpokeAt = 0
	/** يُستدعى لتفريغ الصالة بصوت مسموع. */
	private timer: ReturnType<typeof setTimeout> | null = null

	/** هل الصوت متاح على هذا الجهاز؟ */
	get available(): boolean {
		return typeof globalThis.speechSynthesis !== "undefined"
	}

	/**
	 * ينطق النداء.
	 * @returns `false` إن لم يتوفر الصوت (لا يرمي — الاعتماد على الشاشة).
	 */
	speak(announcement: Announcement): boolean {
		if (!this.available) {
			log.warn("voice unavailable — falling back to the display")
			return false
		}
		// فاصل بين النداءين: نداءان متلاصقان يفقدان آخر رقم.
		const since = Date.now() - this.lastSpokeAt
		if (since < VOICE_MIN_GAP_MS && this.utterance) {
			this.cancel()
		}

		this.cancel()
		const text = buildText(announcement)
		const utterance = new SpeechSynthesisUtterance(text)
		utterance.lang = announcement.locale === "ar" ? "ar-SA" : "en-US"
		// 1.0 = أسرع قليلًا من الافتراضي: نداء الطابور قصير، والبطء
		// يُفقد الزبون صبره على رقمه.
		utterance.rate = 1
		globalThis.speechSynthesis.speak(utterance)
		this.utterance = utterance
		this.lastSpokeAt = Date.now()
		return true
	}

	/** يوقف النطق الجاري (عند تخطٍ أو إغلاق). */
	cancel(): void {
		if (typeof globalThis.speechSynthesis === "undefined") return
		globalThis.speechSynthesis.cancel()
		this.utterance = null
	}

	/** ينطق ويحرّر — يُستدعى عند إغلاق المكوّن (منع تسريب الصوت). */
	dispose(): void {
		if (this.timer !== null) {
			clearTimeout(this.timer)
			this.timer = null
		}
		this.cancel()
	}
}

/** المنسّق الصوتي المشترك. */
export const queueVoice = new VoiceAnnouncer()

/** مهلة النطق القصوى — تُستعمل في المراقبة. */
export const VOICE_TIMEOUT = VOICE_UTTERANCE_TIMEOUT_MS

export default queueVoice
