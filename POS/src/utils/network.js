/**
 * Network resilience primitives for POS terminals.
 *
 * POS hardware (and slow/volatile store Wi-Fi) means transient failures are
 * the norm, not the exception. This module provides:
 *   - bounded async operations      (withTimeout)
 *   - exponential backoff + jitter  (retryAsync)
 *   - classification of retryable vs. permanent errors
 *   - coalesced read caching        (memoizeAsync) — dedupes in-flight calls
 *
 * Retries are safe to wrap around idempotent/idempotency-keyed operations
 * (offline invoices already carry an offline_id; GETs are naturally safe).
 */

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

/**
 * Backoff delay for a failed attempt: exponential growth clamped to maxDelay,
 * with full-jitter applied to avoid thundering herds on reconnection.
 * @param {number} attempt - Zero-indexed failed attempt count.
 * @param {Object} [opts]
 * @returns {number} Delay in milliseconds.
 */
export function backoffDelay(
	attempt,
	{ base = 300, factor = 2, max = 8000, jitter = 0.3 } = {},
) {
	const growth = Math.min(max, base * factor ** Math.max(0, attempt))
	const jitRange = growth * (jitter > 0 ? jitter : 0)
	const randomized = growth - jitRange + Math.random() * 2 * jitRange
	return Math.max(0, Math.round(randomized))
}

export const sleep = (ms) =>
	new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))

/**
 * Race a promise against a deadline. Rejects with a TimeoutError.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} [label] - Context for the error message.
 * @returns {Promise<T>}
 */
export async function withTimeout(promise, ms, label = "operation") {
	if (!ms || ms <= 0) return promise
	let timer
	try {
		return await Promise.race([
			Promise.resolve(promise),
			new Promise((_, reject) => {
				timer = setTimeout(() => {
					const err = new Error(`${label} timed out after ${ms}ms`)
					err.name = "TimeoutError"
					reject(err)
				}, ms)
			}),
		])
	} finally {
		clearTimeout(timer)
	}
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/** Extract an HTTP status-like code from frappe/axios/fetch errors. */
export function extractStatus(error) {
	if (typeof error?.status === "number") return error.status
	if (typeof error?.statusCode === "number") return error.statusCode
	if (typeof error?.httpStatus === "number") return error.httpStatus
	if (error?.response?.status) return error.response.status
	return null
}

const NETWORK_SIGNALS =
	/fetch failed|networkerror|network error|ecoonreset|socket hang|temporary failure|transport error|connection refused|timed out|timeout/i

/** True when the transport/connection failed, not the business logic. */
export function isNetworkError(error) {
	if (!error) return false
	const name = error.name || ""
	if (name === "AbortError") return false // intentional cancellation — never retry
	if (name === "TimeoutError") return true
	const message = `${String(error?.message || error?.exc || "")} ${String(error?.title || "")}`
	return error instanceof TypeError || NETWORK_SIGNALS.test(message)
}

/** Statuses where retrying a moment later is likely to succeed. */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

/** True when a caller may retry after a short backoff. */
export function isRetryable(error) {
	if (!error) return false
	if (isNetworkError(error)) return true
	const status = extractStatus(error)
	return status != null && RETRYABLE_STATUSES.has(status)
}

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

/**
 * Run an async function with exponential backoff + jitter on retryable errors.
 * @template T
 * @param {Function} fn - `() => Promise<T>`; re-invoked on failure.
 * @param {Object} [opts]
 * @param {number} [opts.retries=3] - Extra attempts after the first failure.
 * @param {number} [opts.baseDelay=300]
 * @param {number} [opts.factor=2]
 * @param {number} [opts.maxDelay=8000]
 * @param {number} [opts.jitter=0.3]
 * @param {(error: any, attempt: number) => boolean} [opts.shouldRetry=isRetryable]
 * @param {Function} [opts.onRetry] - `(error, attempt, delayMs) => void`
 * @returns {Promise<T>}
 */
export async function retryAsync(
	fn,
	{
		retries = 3,
		baseDelay = 300,
		factor = 2,
		maxDelay = 8000,
		jitter = 0.3,
		shouldRetry = isRetryable,
		onRetry,
	} = {},
) {
	let attempt = 0
	while (true) {
		try {
			return await fn(attempt)
		} catch (error) {
			if (attempt >= retries || !shouldRetry(error, attempt)) {
				throw error
			}
			const delay = backoffDelay(attempt, {
				base: baseDelay,
				factor,
				max: maxDelay,
				jitter,
			})
			attempt += 1
			onRetry?.(error, attempt, delay)
			await sleep(delay)
		}
	}
}

// ---------------------------------------------------------------------------
// Coalescing + memoization
// ---------------------------------------------------------------------------

/**
 * Cache async results and deduplicate concurrent calls with the same key.
 * In-flight (or recently resolved) calls share one promise — ideal for the
 * same POS terminal pressing "search" faster than the network responds.
 *
 * For mutation-sensitive data pass `{ ttl: 0 }` (only coalesces in-flight).
 * @template T
 * @param {Object} opts
 * @param {(key: string) => Promise<T>} opts.load - Executes on cache miss.
 * @param {number} [opts.ttl=30000] - Positive: stale-while-revalidate window in ms.
 * @param {Function} [opts.shouldCache] - `(value: T) => boolean`; skip empties.
 * @returns {{ get(key: string): Promise<T>, invalidate(key?: string): void, clear(): void }}
 */
export function memoizeAsync({ load, ttl = 30000, shouldCache } = {}) {
	const cache = new Map() // key -> { value: Promise<T>, resolvedAt: number, valueSnapshot }
	const inflight = new Map() // key -> Promise<T> (dedupe window)

	async function get(key) {
		const cached = cache.get(key)
		if (cached) {
			const stale = Date.now() - cached.resolvedAt > ttl
			if (stale && !inflight.has(key)) {
				// Revalidate in the background; keep serving the stale value.
				inflight.set(
					key,
					load(key)
						.then((value) => {
							settle(key, value)
							return value
						})
						.finally(() => inflight.delete(key)),
				)
			}
			return cached.valueSnapshot ?? cached.value
		}

		const inProgress = inflight.get(key)
		if (inProgress) return inProgress

		const promise = load(key)
		inflight.set(key, promise)
		try {
			const value = await promise
			settle(key, value)
			return value
		} finally {
			inflight.delete(key)
		}
	}

	function settle(key, value) {
		if (shouldCache && !shouldCache(value)) {
			cache.delete(key)
			return
		}
		cache.set(key, { resolvedAt: Date.now(), valueSnapshot: value })
	}

	function invalidate(key) {
		if (key == null) {
			cache.clear()
			return
		}
		cache.delete(key)
	}

	return { get, invalidate, clear: invalidate }
}
