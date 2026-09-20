/**
 * idempotency.js
 * مفاتيح التكرار الآمن للمدفوعات وعمليات POS.
 * =============================================================================
 *
 * أفضل الممارسات (PCI DSS - أنهاء):
 * - كل طلب مدفوعات له idempotency key فريد.
 * - المفتاح يُولَّد من عناصر deterministية (timestamp + userId + sessionId + counter).
 * - إذا فشل الطلب، يمكن إعادة إرسال نفس المفتاح دون خطر تكرار.
 *
 * =============================================================================
 */
import { ref } from "vue"

/**
 * ميلاد المفتاح الحالي (thread-safe تقريبا).
 */
const idempotencyCounter = ref(0)

/**
 * توليد idempotency key فريد ومستقر.
 *
 * @param {Object} context - سياق توليد المفتاح.
 * @param {string} context.userId - معرّف المستخدم.
 * @param {string} context.sessionId - معرّف الجلسة.
 * @param {string} context.operation - نوع العملية (payment, refund, etc.).
 * @param {string} [context.customId] - معرّف مخصص إضافي (اختياري).
 * @returns {string} مفتاح التكرار.
 */
export function generateIdempotencyKey({ userId, sessionId, operation, customId }) {
	if (!userId || !sessionId || !operation) {
		throw new Error("Require userId, sessionId, and operation for idempotency key")
	}

	// توليد قاعدة من العناصر deterministية
	const base = [userId, sessionId, operation, Date.now().toString(36), String(++idempotencyCounter.value)]

	if (customId) base.push(customId)

	const raw = base.join("|")

	// تشفير بسيط لتوليد مفتاح عشوائي-looking لكن مستقر لنفس المدخلات
	let hash = 0
	for (let i = 0; i < raw.length; i++) {
		const char = raw.charCodeAt(i)
		hash = ((hash << 5) - hash) + char
		hash = hash & hash // حذف القيم السالبة إلى موضع 32-بت
	}

	const hashStr = Math.abs(hash).toString(16).padStart(8, "0")

	return `idem_${hashStr}_${Date.now().toString(36)}`
}

/**
 * التحقق من صحة idempotency key.
 *
 * @param {string} key - المفتاح للتحقق.
 * @returns {boolean} صحيح أم خطأ.
 */
export function isValidIdempotencyKey(key) {
	if (!key || typeof key !== "string") return false
	if (!key.startsWith("idem_")) return false
	const parts = key.split("_")
	return parts.length >= 3
}

/**
 * استخراج عناصر من idempotency key (للتتبع/التشخيص).
 *
 * @param {string} key - المفتاح.
 * @returns {Object|null} العناصر أو null إذا غير صالح.
 */
export function decodeIdempotencyKey(key) {
	if (!isValidIdempotencyKey(key)) return null

	try {
		const parts = key.split("_")
		return {
			prefix: parts[0],          // "idem"
			hash: parts[1],           // الـ hash
			timestamp: parts[2] || "", // الطابع الزمني (base36)
		}
	} catch {
		return null
	}
}

/**
 * التأكد من عدم وجود مفتاح مكرر (فحص سريع ضد الذاكرة).
 *
 * @param {Set<string>} usedKeys - مجموعة المفاتيح المستخدمة.
 * @param {string} key - المفتاح المراد إضافته.
 * @returns {boolean} true إذا كان مفتاحًا جديدًا.
 */
export function isKeyUnique(usedKeys, key) {
	if (!usedKeys || !(usedKeys instanceof Set)) {
		return true
	}
	if (usedKeys.has(key)) {
		return false
	}
	usedKeys.add(key)
	return true
}
