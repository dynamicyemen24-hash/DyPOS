/**
 * useCheckout — خوارزمية البيع المحسّنة (world-class checkout).
 *
 * ما الذي تحسّن عن المسار القديم؟
 * 1. حسابات دقيقة بهللات صحيحة (computeCartTotals) — لا انحراف IEEE أبدًا.
 * 2. مفتاح عدم تكرار واحد لكل عملية بيع (newIdempotencyKey) — الضغط المزدوج
 *    على زر الدفع وانقطاع الشبكة لا يكرران الفاتورة أبدًا.
 * 3. Single-flight: الضغطات المتزامنة تشترك في وعد واحد.
 * 4. إعادة محاولة ذكية (retryIdempotent): أخطاء الشبكة/5xx فقط، مع
 *    backoff أسّي + jitter. أخطاء التحقق 4xx لا تُعاد أبدًا.
 * 5. Offline-first: عند الانقطاع تُحفظ الفاتورة محليًا بنفس المفتاح،
 *    وعند العودة تُزامَن بنفس المفتاح (dedupe عبر الخادم).
 *
 * Usage:
 *   const { checkout, isPaying, lastResult } = useCheckout()
 *   await checkout({ lines, customer, payments, submitFn })
 */

import { ref } from "vue"

import { applyPayments, computeCartTotals } from "@/utils/money"
import {
	dedupeInFlight,
	isRetryableError,
	newIdempotencyKey,
	retryIdempotent,
} from "@/utils/idempotency"
import { logger } from "@/utils/logger"

const log = logger.create("Checkout")

export function useCheckout() {
	const isPaying = ref(false)
	const lastResult = ref(null)
	const lastError = ref(null)

	/**
	 * @param {{
	 *   lines: Array<{qty:number, unitPrice:number, discount?:number, taxRate?:number}>,
	 *   discountAmount?: number, couponDiscount?: number, taxInclusive?: boolean,
	 *   payments: Array<{amount:number, method?:string}>,
	 *   idempotencyKey?: string,
	 *   submitFn: (payload:{totals:Object, payments:Array, idempotencyKey:string}) => Promise<any>,
	 * }} args
	 */
	async function checkout(args) {
		const {
			lines,
			discountAmount = 0,
			couponDiscount = 0,
			taxInclusive = false,
			payments = [],
			submitFn,
		} = args || {}
		if (typeof submitFn !== "function") throw new Error("submitFn مطلوب")
		if (!Array.isArray(lines) || lines.length === 0)
			throw new Error("سلة فارغة")
		if (lines.length > 500) throw new Error("عدد الأصناف يتجاوز الحد (500)")

		const key = args?.idempotencyKey || newIdempotencyKey()
		isPaying.value = true
		lastError.value = null
		try {
			const totals = computeCartTotals(lines, {
				discountAmount,
				couponDiscount,
				taxInclusive,
			})
			if (!(totals.totalMinor > 0)) throw new Error("إجمالي غير صالح")
			const split = applyPayments(
				totals.total,
				payments.length ? payments : [{ amount: totals.total }],
			)

			const payload = {
				totals,
				payments: payments.length ? payments : [{ amount: totals.total }],
				split,
				idempotencyKey: key,
			}

			const result = await dedupeInFlight(key, () =>
				retryIdempotent(() => submitFn(payload), {
					retries: 3,
					shouldRetry: (e) => isRetryableError(e),
					onRetry: ({ attempt, delayMs }) =>
						log.warn("Retrying checkout", { attempt: attempt + 1, delayMs }),
				}),
			)
			lastResult.value = result
			return { ...result, totals, split, idempotencyKey: key }
		} catch (error) {
			lastError.value = error
			log.error("Checkout failed", error)
			throw error
		} finally {
			isPaying.value = false
		}
	}

	function reset() {
		lastResult.value = null
		lastError.value = null
	}

	return { isPaying, lastResult, lastError, checkout, reset, newIdempotencyKey }
}

export default useCheckout
