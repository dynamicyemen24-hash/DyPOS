/**
 * retryWithBackoff.js
 * استراتيجية إعادة المحاولة مع backoff أسّي.
 * =============================================================================
 *
 * أفضل الممارسات:
 * - Exponential backoff مع jitter لتجنب thundering herd.
 * - حدود زمنية واضحة للعمليات الحساسة.
 * - Logging كامل لكل محاولة.
 *
 * =============================================================================
 */
import { logger } from "@/utils/logger"

const log = logger.create("RetryWithBackoff")

/**
 * إعادة محاولة دالة مع exponential backoff.
 *
 * @param {Function} fn - الدالة التي قد تفشل.
 * @param {Object} options - الخيارات.
 * @param {number} options.maxRetries - أكبر عدد إعادة محاولة (افتراضي: 3).
 * @param {number} options.baseDelayMs - التأخير الأساسي (افتراضي: 1000).
 * @param {number} options.maxDelayMs - الحد الأقصى للتأخير (افتراضي: 10000).
 * @param {boolean} options.jitter - إضافة jitter عشوائي (افتراضي: true).
 * @param {Function} options.onRetry -.handler لكل إعادة محاولة.
 * @returns {Promise<any>} نتيجة الدالة الناجحة.
 */
export async function retryWithBackoff(fn, options = {}) {
	const {
		maxRetries = 3,
		baseDelayMs = 1000,
		maxDelayMs = 10000,
		jitter = true,
		onRetry,
	} = options

	let lastError = null

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const result = await fn()
			if (attempt > 0) {
				log.info?.(`Retry succeeded on attempt ${attempt + 1}`)
			}
			return result
		} catch (error) {
			lastError = error

			if (attempt === maxRetries) {
				log.error?.(`All ${maxRetries + 1} retry attempts failed`, { error: error?.message })
				throw error
			}

			// حساب التأخير
			const exponentialDelay = baseDelayMs * Math.pow(2, attempt)
			const cappedDelay = Math.min(exponentialDelay, maxDelayMs)

			let delay = cappedDelay
			if (jitter) {
				// إضافة jitter عشوائي بين 0 و 50% من التأخير
				const jitterRange = delay * 0.5
				delay = delay - jitterRange / 2 + Math.random() * jitterRange
			}

			log.warn?.(`Retry attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`, {
				error: error?.message,
				delay: Math.round(delay),
			})

			if (onRetry) {
				try {
					onRetry({ attempt, error, delay, maxRetries })
				} catch (cbError) {
					log.error?.(`onRetry callback error`, cbError)
				}
			}

			await new Promise(resolve => setTimeout(resolve, delay))
		}
	}

	throw lastError
}

/**
 * محاولة عمليات متوازية مع إعادة المحاولة لكل واحدة.
 *
 * @param {Array<Function>} tasks - مصفوفة دوال.
 * @param {Object} options - نفس خيارات retryWithBackoff.
 * @returns {Promise<Array<any>>} نتائج كل مهمة.
 */
export async function retryAll(tasks, options = {}) {
	const results = await Promise.all(
		tasks.map(async (task) => {
			return retryWithBackoff(() => task(), options)
		}),
	)
	return results
}

/**
 * إعادة محاولة حتى النجاح أو انتهاء الوقت (timeout-based retry).
 *
 * @param {Function} fn - الدالة.
 * @param {Object} options - الخيارات.
 * @param {number} options.timeoutMs - الحد الزمني الكلي (افتراضي: 30000).
 * @param {number} options.delayMs - التأخير بين المحاولات (افتراضي: 1000).
 * @returns {Promise<any>} النتيجة.
 */
export async function retryUntilTimeout(fn, options = {}) {
	const { timeoutMs = 30000, delayMs = 1000 } = options

	const startTime = Date.now()

	while (Date.now() - startTime < timeoutMs) {
		try {
			return await fn()
		} catch (error) {
			const elapsed = Date.now() - startTime
			if (elapsed >= timeoutMs) {
				throw new Error(`Timeout after ${timeoutMs}ms: ${error?.message}`)
			}
			const remaining = timeoutMs - elapsed
			const wait = Math.min(delayMs, remaining)
			await new Promise(resolve => setTimeout(resolve, wait))
		}
	}

	throw new Error(`Timeout after ${timeoutMs}ms with no successful attempt`)
}

/**
 * إعادة محاولة معًا (batch) — إما كل شيء ينجح أو كل شيء يفشل.
 *
 * @param {Array<Function>} tasks - مصفوفة دوال.
 * @param {Object} options - الخيارات.
 * @returns {Promise<Array<any>>} النتائج.
 */
export async function retryBatchAllOrNothing(tasks, options = {}) {
	const results = []

	for (let i = 0; i < tasks.length; i++) {
		try {
			const result = await retryWithBackoff(() => tasks[i](), options)
			results.push({ success: true, result, index: i })
		} catch (error) {
			results.push({ success: false, error, index: i })
			// في نمط all-or-nothing، نإيقاف هنا و نرمي الخطأ
			// أو نستمر إذا أردتو collect كل الأخطاء
			throw error
		}
	}

	return results.map(r => r.result)
}
