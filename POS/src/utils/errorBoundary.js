/**
 * Global error boundary.
 *
 * Captures unhandled exceptions (`window.onerror`) and unhandled promise
 * rejections at the browser level, routes them to the centralized Logger,
 * and deduplicates flood of identical failures so the log stays readable.
 *
 * Pure helpers (signatureOf / shouldThrottle / reportError) are fully unit
 * tested; only installGlobalErrorBoundary touches the DOM.
 */

import { logger } from "@/utils/logger"

const log = logger.create("ErrorBoundary")

const RECENT_WINDOW_MS = 5000
const recentSignatures = new Map() // signature -> last seen timestamp

/**
 * Build a stable signature for an error value, regardless of its shape.
 * @param {*} error - Error object, string, plain object, or null.
 * @param {string} fallback - Signature when nothing useful is available.
 * @returns {string}
 */
export function signatureOf(error, fallback = "unknown") {
	if (!error) return fallback
	if (typeof error === "string") return `str:${error}`
	if (error instanceof Error)
		return `${error.name || "Error"}:${error.message || ""}`
	if (typeof error === "object") {
		const msg = error.message || error._server_messages || error.description
		return `obj:${msg || JSON.stringify(error).slice(0, 120)}`
	}
	return fallback
}

/**
 * Throttle repeated identical signatures within a time window.
 * Returns true when the call should be suppressed.
 * @param {string} signature - Stable error signature.
 * @param {number} windowMs - Dedupe window in milliseconds.
 * @returns {boolean} true when this occurrence should be suppressed
 */
export function shouldThrottle(signature, windowMs = RECENT_WINDOW_MS) {
	const now = Date.now()
	const last = recentSignatures.get(signature)
	if (last && now - last < windowMs) {
		// Refresh the timestamp so a continuous flood stays suppressed.
		recentSignatures.set(signature, now)
		return true
	}
	recentSignatures.set(signature, now)
	return false
}

/**
 * Report an error via the centralized logger, deduplicating floods.
 * @param {*} error - The caught value (Error, string, object...).
 * @param {Object} [extra] - Extra structured context attached to the entry.
 * @returns {boolean} true when the error was actually logged (not suppressed)
 */
export function reportError(error, extra = {}) {
	const signature = signatureOf(error)
	if (shouldThrottle(signature)) {
		return false
	}
	const message =
		(error && (error.message || String(error))) || "Unhandled error"
	log.error(`[Boundary] ${message}`, { signature, ...extra })
	return true
}

/**
 * Hook `window.onerror` and `unhandledrejection` events. Safe to call
 * multiple times; returns a cleanup function. No-op outside browsers.
 * @returns {() => void} Cleanup function.
 */
export function installGlobalErrorBoundary() {
	if (typeof window === "undefined") return () => {}

	const onError = (event) => {
		reportError(event?.error || event?.message || "Unhandled exception", {
			handler: "window.onerror",
			origin: event?.filename ? `${event.filename}:${event.lineno}` : undefined,
		})
	}

	const onRejection = (event) => {
		reportError(event?.reason || "Unhandled promise rejection", {
			handler: "unhandledrejection",
		})
	}

	window.addEventListener("error", onError, { passive: true })
	window.addEventListener("unhandledrejection", onRejection, { passive: true })

	return () => {
		window.removeEventListener("error", onError)
		window.removeEventListener("unhandledrejection", onRejection)
	}
}

export default installGlobalErrorBoundary
