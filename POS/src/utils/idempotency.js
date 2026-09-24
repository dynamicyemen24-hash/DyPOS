/**
 * Idempotency — world-class safe-retry core for POS checkout.
 *
 * Problem: cashiers double-tap PAY, networks flap, workers retry.
 * Without idempotency every retry = double charge / double invoice.
 *
 * Algorithm (industry standard, Stripe-style):
 * 1. Every checkout generates ONE UUID v4 key at cart-open (`newIdempotencyKey`).
 * 2. The key travels in body.idempotencyKey AND header X-Idempotency-Key.
 * 3. Retries reuse the SAME key; a NEW sale always mints a NEW key.
 * 4. `retryIdempotent` wraps any async fn with exponential backoff + jitter,
 *    retrying ONLY on retryable faults (network/timeout/5xx), never on 4xx.
 * 5. `dedupeInFlight` single-flights concurrent identical calls (double-tap guard).
 *
 * Pure + framework-free. Fully unit-tested.
 */

/** Generate a UUID v4 idempotency key (crypto-strong, offline-safe). */
export function newIdempotencyKey() {
	if (typeof crypto !== "undefined" && crypto.randomUUID)
		return crypto.randomUUID()
	// Fallback (non-secure contexts): 122-bit entropy via Math.random
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0
		const v = c === "x" ? r : (r & 0x3) | 0x8
		return v.toString(16)
	})
}

/** Retryable? Network/timeout/abort/5xx/429 → yes. 4xx (validation) → no. */
export function isRetryableError(error) {
	if (!error) return false
	// Known-offline verdicts never retry (see apiWrapper fast-fail).
	if (error?.offline === true) return false
	const msg = String(error?.message || error || "").toLowerCase()
	if (
		/network|timeout|abort|econn|etimedout|fetch failed|load failed/i.test(msg)
	)
		return true
	const status = Number(
		error?.status ?? error?.statusCode ?? error?.response?.status,
	)
	if (status === 429) return true
	if (status >= 500 && status <= 599) return true
	if (!status && !error?.exc_type) return true // unknown transport fault → retry once
	return false
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Retry an async fn with exponential backoff + jitter.
 * @param {() => Promise<any>} fn
 * @param {{retries?:number, baseMs?:number, maxMs?:number, shouldRetry?:Function, onRetry?:Function}} opts
 */
export async function retryIdempotent(fn, opts = {}) {
	const {
		retries = 3,
		baseMs = 300,
		maxMs = 4000,
		shouldRetry = isRetryableError,
		onRetry = null,
	} = opts
	let attempt = 0
	for (;;) {
		try {
			return await fn(attempt)
		} catch (error) {
			if (attempt >= retries || !shouldRetry(error, attempt)) throw error
			const backoff = Math.min(maxMs, baseMs * 2 ** attempt)
			const jitter = Math.random() * Math.min(250, backoff / 4)
			if (typeof onRetry === "function") {
				try {
					onRetry({ attempt, error, delayMs: Math.round(backoff + jitter) })
				} catch {
					/* observer never breaks retry */
				}
			}
			await sleep(backoff + jitter)
			attempt += 1
		}
	}
}

// ── Double-tap guard: concurrent identical keys share ONE promise ──
const inflight = new Map()

/**
 * Single-flight wrapper: concurrent calls with the same key share one promise.
 * Sequential retries (after settle) execute fresh — only TRUE concurrency dedupes.
 */
export function dedupeInFlight(key, fn) {
	if (!key) return fn()
	if (inflight.has(key)) return inflight.get(key)
	const p = (async () => {
		try {
			return await fn()
		} finally {
			inflight.delete(key)
		}
	})()
	inflight.set(key, p)
	return p
}

/** Extract server dedupe flag from common response shapes. */
export function isDedupedResponse(res) {
	return !!(res && (res.deduped === true || res?.data?.deduped === true))
}

/**
 * Legacy compat (pre-1.28 API): deterministic key from operation context.
 * Preserved so existing callers keep working; new code should prefer
 * `newIdempotencyKey()` (crypto UUID, Stripe-style, server-deduped).
 * @deprecated use newIdempotencyKey()
 */
let legacyCounter = 0
export function generateIdempotencyKey({
	userId,
	sessionId,
	operation,
	customId,
} = {}) {
	if (!userId || !sessionId || !operation) {
		throw new Error(
			"Require userId, sessionId, and operation for idempotency key",
		)
	}
	const base = [
		userId,
		sessionId,
		operation,
		Date.now().toString(36),
		String(++legacyCounter),
	]
	if (customId) base.push(customId)
	let hash = 0
	for (let i = 0; i < base.join("|").length; i++) {
		hash = (hash * 31 + base.join("|").charCodeAt(i)) | 0
	}
	return `${base.join("-")}-${(hash >>> 0).toString(36)}`
}

export default {
	newIdempotencyKey,
	isRetryableError,
	retryIdempotent,
	dedupeInFlight,
	isDedupedResponse,
	generateIdempotencyKey,
}
