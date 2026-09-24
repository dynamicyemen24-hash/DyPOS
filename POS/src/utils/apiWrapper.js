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

/**
 * Offline fast-fail (offline-first cashier UX).
 *
 * When the device radios report offline, EVERY network attempt is doomed:
 * waiting out 15s timeouts × retries before telling the cashier wastes up
 * to a minute per tap. Fail in milliseconds with an Arabic offline error so
 * the UI drops to queue/cache mode instantly. PIN login and cached sales
 * never touch this path.
 */
function isDefinitelyOffline() {
	try {
		if (typeof navigator !== "undefined" && navigator.onLine === false) {
			return true
		}
	} catch {
		/* non-browser bundling — assume online */
	}
	return false
}

function offlineError(method) {
	const err = new Error(
		"لا يوجد اتصال بالإنترنت — سيُحفظ العمل محليًا ويُزامَن لاحقًا",
	)
	err.code = "OFFLINE"
	err.status = 0
	err.offline = true
	err.method = method
	return err
}

// Request ID storage (module-level for correlation across calls)
let currentRequestId = null

function generateRequestId() {
	return `req-${crypto.randomUUID().slice(0, 8)}-${Date.now().toString(36)}`
}

function getOrCreateRequestId() {
	if (!currentRequestId) {
		currentRequestId = generateRequestId()
	}
	return currentRequestId
}

function updateRequestIdFromResponse(headers) {
	const serverId =
		headers?.get?.("x-request-id") || headers?.get?.("X-Request-Id")
	if (serverId) {
		currentRequestId = serverId
	}
}

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

// Wrapped call function with CSRF auto-refresh + timeout + safe retry + request ID propagation.
// - Request ID: generated once per session, passed via X-Request-Id header, updated from response
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

	const requestId = getOrCreateRequestId()

	const exec = () =>
		dedupeInFlight(idempotencyKey || "", async () => {
			if (isDefinitelyOffline()) throw offlineError(method)
			try {
				// Pass request ID via headers option to frappeCall
				const result = await withTimeout(
					frappeCall(method, params, {
						headers: {
							"X-Request-Id": requestId,
						},
					}),
					timeoutMs,
					method,
				)
				return result
			} catch (error) {
				if (isCSRFApiError(error)) {
					log.warn("CSRF token error, refreshing token and retrying once", {
						method,
						requestId,
					})
					const refreshed = await forceRefreshCSRFToken()
					if (refreshed) {
						log.debug("Retrying call after CSRF refresh", { method, requestId })
						return await withTimeout(
							frappeCall(method, params, {
								headers: {
									"X-Request-Id": requestId,
								},
							}),
							timeoutMs,
							method,
						)
					}
					log.warn(
						"Could not refresh CSRF token; rejecting with original error",
						{ method, requestId },
					)
				}
				throw error
			}
		})

	if (!idempotencyKey) {
		return retryIdempotent(exec, {
			retries,
			shouldRetry: (e) =>
				!e?.offline && !isCSRFApiError(e) && isRetryableError(e),
			onRetry: ({ attempt, delayMs }) =>
				log.warn("Retrying API call", {
					method,
					requestId,
					attempt: attempt + 1,
					delayMs,
				}),
		})
	}
	return retryIdempotent(exec, {
		retries,
		shouldRetry: (e) =>
			!e?.offline && !isCSRFApiError(e) && isRetryableError(e),
		onRetry: ({ attempt, delayMs }) =>
			log.warn("Retrying idempotent API call", {
				method,
				requestId,
				attempt: attempt + 1,
				delayMs,
			}),
	})
}

/**
 * Reset the request ID (call on login/logout/session change)
 */
export function resetRequestId() {
	currentRequestId = null
}

/**
 * Get current request ID (for logging/debugging)
 */
export function getRequestId() {
	return currentRequestId
}
