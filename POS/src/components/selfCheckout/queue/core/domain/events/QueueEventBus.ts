/**
 * ناقل أحداث الطابور — نقطة النشر الوحيدة لكل تغيير.
 *
 * لماذا ناقل خاص بدل `EventTarget` أصلي: نحتاج ثلاث ضمانات لا يوفّرها
 * الأصلي ولا يمكن retrofitting إليها بعد الإطلاق:
 *
 *  1. **إزالة التكرار بمعرّف الحدث** (dedupe). الإعادة بعد انقطاع الشبكة
 *     تُسلّم نفس الحدث مرتين؛ المعالج الذي نفّذ «إنهاء التذكرة» مرتين
 *     يحرر الكاونتر مرتين ويضاعف `served_count`.
 *  2. **ترتيب صارم بـversion**. حدث قديم (v=10) يصل بعد حدث أحدث (v=12)
 *     فيُهمل. بدون هذا تعرض شاشتان رقمين مختلفين بعد استرجاع.
 *  3. **عزل خطأ معالج**: معالج شاشة العميل يرمي استثناء ولا يجوز أن
 *     يوقف نداءً صوتيًا أو تحديث لوحة التحكم.
 *
 * الناقل **بلا حالة ظاهرية**: هو آلية توصيل فقط. مصدر الحقيقة هو
 * `QueueRepository`.
 */

import type { QueueEvent } from "../../../shared/types/queue-events.types.js"
import { logger } from "@/utils/logger"

const log = logger.create("QueueEventBus")

/** معالج حدث. خطاؤه معزول ولا يوقف بقية المعالجين. */
export type QueueEventHandler = (event: QueueEvent) => void | Promise<void>

/** دالة لإلغاء الاشتراك. */
export type Unsubscribe = () => void

/** حجم نافذة إزالة التكرار. */
const DEDUPE_WINDOW = 512

export class QueueEventBus {
	private readonly handlers = new Map<string, Set<QueueEventHandler>>()
	/** معرّفات الأحداث المعالَجة، بترتيب الوصول. */
	private readonly seen = new Set<string>()
	/** أعلى نسخة مرئية. كل ما دونها يُهمل. */
	private highestVersion = 0
	/** عدد الأحداث المُهملة (مقياس صحة، يظهر في المراقبة). */
	private droppedCount = 0

	/** يشترك في حدث واحد. */
	on(type: QueueEvent["type"], handler: QueueEventHandler): Unsubscribe {
		const set = this.handlers.get(type) ?? new Set<QueueEventHandler>()
		set.add(handler)
		this.handlers.set(type, set)
		return () => {
			set.delete(handler)
		}
	}

	/** يشترك في كل الأحداث. */
	onAny(handler: QueueEventHandler): Unsubscribe {
		return this.on("*" as QueueEvent["type"], handler)
	}

	/**
	 * ينشر حدثًا.
	 *
	 * @returns `false` إن كان مكررًا أو متأخرًا (لا يُسلَّم لأحد).
	 */
	async emit(event: QueueEvent): Promise<boolean> {
		if (!this.shouldDeliver(event)) {
			this.droppedCount += 1
			return false
		}

		this.remember(event.id)
		if (event.version > this.highestVersion) this.highestVersion = event.version

		// لقطة المعالجين: لو اشترك معالج أو ألغى أثناء النشر، لا نعدّل
		// المجموعة أثناء تكرارها.
		const direct = [...(this.handlers.get(event.type) ?? [])]
		const all = [...(this.handlers.get("*" as QueueEvent["type"]) ?? [])]

		await this.dispatchAll(direct, event)
		await this.dispatchAll(all, event)
		return true
	}

	/** يفحص: هل يُسلَّم هذا الحدث؟ */
	private shouldDeliver(event: QueueEvent): boolean {
		if (this.seen.has(event.id)) return false
		if (event.version <= this.highestVersion) return false
		return true
	}

	private async dispatchAll(
		handlers: readonly QueueEventHandler[],
		event: QueueEvent,
	): Promise<void> {
		for (const handler of handlers) {
			try {
				await handler(event)
			} catch (error) {
				// عزل: معلق واحد لا يُسقط البقية ولا النداء الصوتي.
				log.error("queue handler failed", { type: event.type, error })
			}
		}
	}

	private remember(id: string): void {
		this.seen.add(id)
		if (this.seen.size <= DEDUPE_WINDOW) return
		// إسقاط الأقدم للحفاظ على الذاكرة محدودة في وردية طويلة.
		const oldest = this.seen.values().next()
		if (oldest.done !== true) this.seen.delete(oldest.value)
	}

	/** أعلى نسخة عولجت — تُستخدم في المزامنة بعد انقطاع. */
	get version(): number {
		return this.highestVersion
	}

	/** إحصاء المُهمَل (مكرر/متأخر) — مقياس صحة. */
	get dropped(): number {
		return this.droppedCount
	}

	/** هل الجهاز متزامنة مع النسخة المحلية؟ */
	isSynced(deviceVersion: number): boolean {
		return this.highestVersion === deviceVersion
	}
	/**
	 * تتبنّى أعلى نسخة معروفة من جهاز آخر — تُستخدم بعد المزامنة
	 * لتفادي إعادة تسليم ما عولج أصلًا.
	 */

	adoptVersion(version: number): void {
		if (Number.isFinite(version) && version > this.highestVersion) {
			this.highestVersion = version
		}
	}

	/** يزيل كل الاشتراكات — يُستدعى عند إغلاق المكوّن. */
	clear(): void {
		this.handlers.clear()
	}
}

/** الناقل المشترك — مصدر واحد في التطبيق كله. */
export const queueEventBus = new QueueEventBus()

export default queueEventBus
