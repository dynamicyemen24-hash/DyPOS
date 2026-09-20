import { call as frappeCall } from "frappe-ui"

import { forceRefreshCSRFToken, isCSRFApiError } from "./csrf"
import {
	dedupeInFlight,
	isRetryableError,
	retryIdempotent,
} from "./idempotency"
import { logger } from "./logger"

const log = logger.create("ApiWrapper")

const DEFAULT_TIMEOUT_MS = 15000

function withTimeout(promise, ms = DEFAULT_TIMEOUT_MS, label = "api") {
	let timer = null
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => {
			const err = new Error(`${label} timed out after ${ms}ms`)
			err.code = "ETIMEDOUT"
			err.status = 0
			reject(err)
		}, ms)
	})
	return Promise.race([promise, timeout]).finally(() => {
		if (timer) clearTimeout(timer)
	})
}

// Wrapped call function with CSRF auto-refresh + timeout + safe retry.
// - CSRF errors: single refresh + one retry (never loops).
// - Transport faults (network/timeout/5xx): exponential backoff, max 2 retries.
// - Validation 4xx: never retried.
// - Concurrent identical idempotency keys: single-flight deduped.
export async function call(method, params, opts = {}) {
	const {
		timeoutMs = DEFAULT_TIMEOUT_MS,
		retries = 2,
		idempotencyKey = null,
	} = opts
	const exec = () =>
		dedupeInFlight(idempotencyKey || "", async () => {
			try {
				return await withTimeout(frappeCall(method, params), timeoutMs, method)
			} catch (error) {
				if (isCSRFApiError(error)) {
					log.warn("CSRF token error, refreshing token and retrying once", {
						method,
					})
					const refreshed = await forceRefreshCSRFToken()
					if (refreshed) {
						log.debug("Retrying call after CSRF refresh", { method })
						return await withTimeout(
							frappeCall(method, params),
							timeoutMs,
							method,
						)
					}
					log.warn(
						"Could not refresh CSRF token; rejecting with original error",
						{ method },
					)
				}
				throw error
			}
		})
	if (!idempotencyKey) {
		return retryIdempotent(exec, {
			retries,
			shouldRetry: (e) => !isCSRFApiError(e) && isRetryableError(e),
			onRetry: ({ attempt, delayMs }) =>
				log.warn("Retrying API call", {
					method,
					attempt: attempt + 1,
					delayMs,
				}),
		})
	}
	return retryIdempotent(exec, {
		retries,
		shouldRetry: (e) => !isCSRFApiError(e) && isRetryableError(e),
		onRetry: ({ attempt, delayMs }) =>
			log.warn("Retrying idempotent API call", {
				method,
				attempt: attempt + 1,
				delayMs,
			}),
	})
}
