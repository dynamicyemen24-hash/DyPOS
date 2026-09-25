import { logger } from "@/utils/logger"

const log = logger.create("CSRF")

const CSRF_COOKIE = "csrf_token"
const CSRF_PLACEHOLDER = "{{ csrf_token }}"
const CSRF_TOKEN_ENDPOINT = "/api/csrf_token"
const CSRF_LEGACY_ENDPOINT = "/api/method/DyPOS.api.utilities.get_csrf_token"

let refreshPromise = null
let lastKnownToken = null
const tokenRefreshCallbacks = [] // Callbacks to notify when token is refreshed

function readCookie(name) {
	const value = `; ${document.cookie}`
	const parts = value.split(`; ${name}=`)
	if (parts.length === 2) {
		return parts.pop().split(";").shift() || null
	}
	return null
}

function normalizeToken(token) {
	if (typeof token !== "string" || token === CSRF_PLACEHOLDER || !token) {
		return null
	}
	return token
}

function setGlobalToken(token, source) {
	if (!token) {
		return null
	}

	window.csrf_token = token

	if (token !== lastKnownToken) {
		const prefix = token.substring(0, 10)
		const context = source === "response" ? "initialized" : "loaded"
		if (import.meta.env.DEV) {
			log.debug(`CSRF token ${context}: ${prefix}...`)
		}
		lastKnownToken = token

		// Notify all registered callbacks about the token refresh
		tokenRefreshCallbacks.forEach((callback) => {
			try {
				callback(token)
			} catch (error) {
				log.error("Error in CSRF token refresh callback:", error)
			}
		})
	}

	return token
}

export function onCSRFTokenRefresh(callback) {
	if (typeof callback === "function") {
		tokenRefreshCallbacks.push(callback)
	}
}

export function getCSRFTokenFromCookie() {
	const token = normalizeToken(readCookie(CSRF_COOKIE))
	if (token) {
		setGlobalToken(token, "cookie")
	}
	return token
}

function isOfflineFastFail() {
	try {
		if (typeof navigator !== "undefined" && navigator.onLine === false) {
			return true
		}
	} catch {
		/* non-browser — assume online */
	}
	return false
}

async function fetchCSRFToken() {
	// Offline-first: never waste a network round-trip when radios say offline.
	if (isOfflineFastFail()) {
		const err = new Error("offline — skipping CSRF refresh")
		err.offline = true
		throw err
	}
	// Use raw fetch (not frappeRequest) to avoid circular dependency:
	// - This function is called when CSRF token is invalid
	// - frappeRequest is wrapped with CSRF auto-refresh
	// - Using frappeRequest here would cause infinite loop
	const tryEndpoints = [CSRF_TOKEN_ENDPOINT, CSRF_LEGACY_ENDPOINT]
	let lastError = null
	for (const endpoint of tryEndpoints) {
		try {
			const response = await fetch(endpoint, {
				method: "GET",
				credentials: "include", // Include session cookies
				cache: "no-store", // Bypass service worker cache for CSRF token refresh
				headers: {
					Accept: "application/json",
				},
			})
			if (response.status === 404 || response.status === 503) {
				lastError = new Error(`CSRF endpoint unavailable (${response.status})`)
				lastError.status = response.status
				continue
			}
			let data = null
			const contentType = response.headers.get("content-type") || ""
			if (contentType.includes("application/json")) {
				try {
					data = await response.json()
				} catch (error) {
					log.warn("Could not parse CSRF refresh response as JSON")
				}
			}
			return { response, data }
		} catch (error) {
			lastError = error
		}
	}
	throw lastError || new Error("CSRF refresh unavailable")
}

function extractTokenFromResponse(data) {
	// Worker shape: { csrf_token: "..." } — legacy Frappe shape: { message: { csrf_token } }
	return normalizeToken(data?.csrf_token || data?.message?.csrf_token)
}

export async function ensureCSRFToken({
	forceRefresh = false,
	silent = false,
} = {}) {
	if (!forceRefresh) {
		// Check if we already have a valid token in window.csrf_token
		if (
			window.csrf_token &&
			typeof window.csrf_token === "string" &&
			window.csrf_token !== CSRF_PLACEHOLDER
		) {
			return true
		}

		// Fallback: check cookie (though Frappe typically doesn't use csrf_token cookies)
		const existingToken = getCSRFTokenFromCookie()
		if (existingToken) {
			return true
		}
	}

	if (refreshPromise) {
		return refreshPromise
	}

	refreshPromise = (async () => {
		try {
			// Clear any stale token before fetching a new one
			if (forceRefresh) {
				window.csrf_token = null
				lastKnownToken = null
			}

			const { response, data } = await fetchCSRFToken()

			if (response.status === 401 || response.status === 403) {
				if (!silent && import.meta.env.DEV) {
					log.debug("User not authenticated, skipping CSRF token refresh")
				}
				return false
			}

			if (!response.ok) {
				if (!silent) {
					log.warn("Failed to refresh CSRF token, status:", response.status)
				}
				// For non-OK responses, don't try to extract token from potentially invalid data
				return false
			}

			// First check if the cookie was updated by the API call
			const tokenFromCookie = getCSRFTokenFromCookie()
			if (tokenFromCookie) {
				if (!silent && forceRefresh && import.meta.env.DEV) {
					log.debug("CSRF token refreshed via cookie update")
				}
				return true
			}

			// Extract token from response payload (this is the primary method for Frappe)
			const tokenFromResponse = extractTokenFromResponse(data)
			if (tokenFromResponse) {
				setGlobalToken(tokenFromResponse, "response")
				if (!silent && forceRefresh && import.meta.env.DEV) {
					log.debug("CSRF token refreshed from response payload")
				}
				return true
			}

			if (!silent) {
				log.warn("CSRF token not found after refresh attempt")
			}
			return false
		} catch (error) {
			if (!silent) {
				log.error("Failed to refresh CSRF token:", error)
			}
			return false
		} finally {
			refreshPromise = null
		}
	})()

	return refreshPromise
}

export async function forceRefreshCSRFToken(options = {}) {
	return ensureCSRFToken({ ...options, forceRefresh: true })
}

export function isCSRFApiError(error) {
	if (!error) {
		return false
	}

	if (error.exc_type === "CSRFTokenError") {
		return true
	}

	if (
		typeof error.message === "string" &&
		error.message.toLowerCase().includes("csrf")
	) {
		return true
	}

	if (Array.isArray(error.messages)) {
		return error.messages.some(
			(message) =>
				typeof message === "string" && message.toLowerCase().includes("csrf"),
		)
	}

	return false
}

export function createCSRFAwareRequest(
	originalRequest,
	{ silent = false } = {},
) {
	return async function csrfAwareRequest(...args) {
		try {
			return await originalRequest.apply(this, args)
		} catch (error) {
			if (isCSRFApiError(error)) {
				if (!silent) {
					log.warn(
						"CSRF token error detected, refreshing token and retrying...",
					)
				}

				const refreshed = await forceRefreshCSRFToken({ silent })
				if (refreshed) {
					if (!silent && import.meta.env.DEV) {
						log.debug("Retrying request after CSRF token refresh...")
					}
					return await originalRequest.apply(this, args)
				}

				if (!silent) {
					log.warn(
						"CSRF token refresh failed; request will reject with original error",
					)
				}
			}

			throw error
		}
	}
}
