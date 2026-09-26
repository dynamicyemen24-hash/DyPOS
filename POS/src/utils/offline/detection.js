/**
 * Enterprise Offline Detection & Health Monitoring
 *
 * Features:
 * - Multi-endpoint health checks with circuit breaker
 * - Exponential backoff with jitter
 * - Connection quality scoring
 * - Captive portal detection
 * - Cross-tab state synchronization
 * - Automatic reconnection with debouncing
 */

import { logger } from "../logger"

const log = logger.create("OfflineDetection")

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
	// Health check endpoints (try in order)
	HEALTH_ENDPOINTS: [
		"/api/method/DyPOS.api.ping",
		"/api/method/frappe.ping",
		"/api/device",
	],

	// Timing
	INITIAL_TIMEOUT_MS: 3000,
	RETRY_TIMEOUT_MS: 5000,
	MAX_RETRIES: 3,
	BACKOFF_BASE_MS: 1000,
	BACKOFF_MAX_MS: 30000,
	BACKOFF_JITTER: 0.3,

	// Stability thresholds
	CONSECUTIVE_SUCCESS_REQUIRED: 2,
	CONSECUTIVE_FAILURE_THRESHOLD: 2,

	// Quality thresholds
	LATENCY_GOOD_MS: 500,
	LATENCY_DEGRADED_MS: 2000,
	LATENCY_POOR_MS: 5000,

	// Recheck intervals
	RECHECK_ONLINE_MS: 30000,
	RECHECK_OFFLINE_MS: 10000,
	RECHECK_UNSTABLE_MS: 5000,

	// Debounce
	STATE_DEBOUNCE_MS: 150,

	// Cross-tab sync
	BROADCAST_CHANNEL: "DyPOS_offline_detection",
}

// ============================================================================
// TYPES
// ============================================================================

/** @typedef {'online' | 'offline' | 'unstable'} ConnectionState */

/** @typedef {{
 *   state: ConnectionState,
 *   latency: number,
 *   quality: 'good' | 'degraded' | 'poor' | 'unknown',
 *   consecutiveSuccesses: number,
 *   consecutiveFailures: number,
 *   lastCheck: number,
 *   endpoint: string | null,
 *   captivePortal: boolean,
 * }} HealthStatus */

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout(promise, ms, abortSignal) {
	const timeout = new Promise((_, reject) => {
		const id = setTimeout(() => reject(new Error("Timeout")), ms)
		if (abortSignal) {
			abortSignal.addEventListener("abort", () => {
				clearTimeout(id)
				reject(new Error("Aborted"))
			})
		}
	})
	return Promise.race([promise, timeout])
}

function calculateBackoff(attempt, baseMs, maxMs, jitter) {
	const exponential = Math.min(baseMs * 1.5 ** attempt, maxMs)
	const jitterFactor = 1 + (Math.random() - 0.5) * 2 * jitter
	return Math.floor(exponential * jitterFactor)
}

function assessQuality(latency) {
	if (latency <= CONFIG.LATENCY_GOOD_MS) return "good"
	if (latency <= CONFIG.LATENCY_DEGRADED_MS) return "degraded"
	if (latency <= CONFIG.LATENCY_POOR_MS) return "poor"
	return "poor"
}

function detectCaptivePortal(responseText) {
	// Common captive portal indicators
	const indicators = [
		"captive",
		"portal",
		"login",
		"redirect",
		"hotspot",
		"wifi",
		"authentication required",
		"sign in",
	]
	const text = responseText.toLowerCase()
	return indicators.some((indicator) => text.includes(indicator))
}

// ============================================================================
// OFFLINE DETECTOR CLASS
// ============================================================================

class OfflineDetector {
	constructor() {
		this._state = {
			state: "unstable",
			latency: 0,
			quality: "unknown",
			consecutiveSuccesses: 0,
			consecutiveFailures: 0,
			lastCheck: 0,
			endpoint: null,
			captivePortal: false,
		}

		this._listeners = new Set()
		this._checkInterval = null
		this._isChecking = false
		this._debounceTimer = null
		this._pendingState = null
		this._broadcastChannel = null
		this._manualOffline = false
		this._initialized = false
		this._currentAttempt = 0
	}

	// ------------------------------------------------------------------------
	// PUBLIC API
	// ------------------------------------------------------------------------

	/**
	 * Initialize and start detection
	 * @param {{ manualOffline?: boolean, onStateChange?: (status: HealthStatus) => void }} options
	 */
	initialize(options = {}) {
		if (this._initialized) return

		this._manualOffline = options.manualOffline ?? false
		if (options.onStateChange) {
			this.subscribe(options.onStateChange)
		}

		this._initBroadcastChannel()
		this._initVisibilityListener()

		// Initial check
		this._scheduleCheck(0)

		this._initialized = true
		log.info("Offline detector initialized", this.getStatus())
	}

	/**
	 * Get current health status
	 * @returns {HealthStatus}
	 */
	getStatus() {
		const isOffline = this._manualOffline || this._state.state === "offline"
		return {
			...this._state,
			isOffline,
			isOnline: !isOffline,
		}
	}

	/**
	 * Subscribe to state changes
	 * @param {(status: HealthStatus) => void} listener
	 * @returns {() => void} Unsubscribe function
	 */
	subscribe(listener) {
		if (typeof listener !== "function") {
			throw new Error("Listener must be a function")
		}
		this._listeners.add(listener)
		return () => this._listeners.delete(listener)
	}

	/**
	 * Force immediate health check
	 * @returns {Promise<HealthStatus>}
	 */
	async checkNow() {
		if (this._checkInterval) {
			clearTimeout(this._checkInterval)
			this._checkInterval = null
		}
		await this._performHealthCheck()
		return this.getStatus()
	}

	/**
	 * Set manual offline mode
	 * @param {boolean} value
	 */
	setManualOffline(value) {
		const newValue = !!value
		if (this._manualOffline === newValue) return

		this._manualOffline = newValue
		log.info(`Manual offline mode ${newValue ? "enabled" : "disabled"}`)
		this._notifyChange("manual")
	}

	/**
	 * Toggle manual offline mode
	 * @returns {boolean} New manual offline state
	 */
	toggleManualOffline() {
		this.setManualOffline(!this._manualOffline)
		return this._manualOffline
	}

	/**
	 * Stop detection and cleanup
	 */
	destroy() {
		if (this._checkInterval) {
			clearTimeout(this._checkInterval)
			this._checkInterval = null
		}
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer)
			this._debounceTimer = null
		}
		if (this._broadcastChannel) {
			this._broadcastChannel.close()
			this._broadcastChannel = null
		}
		this._listeners.clear()
		this._initialized = false
		log.info("Offline detector destroyed")
	}

	// ------------------------------------------------------------------------
	// INTERNAL METHODS
	// ------------------------------------------------------------------------

	_initBroadcastChannel() {
		if (typeof BroadcastChannel === "undefined") return

		try {
			this._broadcastChannel = new BroadcastChannel(CONFIG.BROADCAST_CHANNEL)
			this._broadcastChannel.onmessage = (event) => {
				const { type, state } = event.data
				if (type === "STATE_SYNC" && state) {
					this._handleCrossTabSync(state)
				}
			}
		} catch (error) {
			log.warn("BroadcastChannel not available", error)
		}
	}

	_initVisibilityListener() {
		if (typeof document === "undefined") return

		document.addEventListener(
			"visibilitychange",
			() => {
				if (document.visibilityState === "visible") {
					log.debug("Tab visible, performing immediate health check")
					this._scheduleCheck(0)
				} else {
					// Tab hidden - slow down checks
					this._scheduleCheck(CONFIG.RECHECK_ONLINE_MS * 2)
				}
			},
			{ passive: true },
		)
	}

	_handleCrossTabSync(state) {
		let changed = false

		if (state.state !== undefined && this._state.state !== state.state) {
			this._state.state = state.state
			changed = true
		}
		if (state.quality !== undefined && this._state.quality !== state.quality) {
			this._state.quality = state.quality
			changed = true
		}
		if (state.latency !== undefined && this._state.latency !== state.latency) {
			this._state.latency = state.latency
			changed = true
		}

		if (changed) {
			log.debug("Received cross-tab state sync", state)
			this._notifyChange("cross-tab")
		}
	}

	_broadcastState() {
		if (this._broadcastChannel) {
			try {
				this._broadcastChannel.postMessage({
					type: "STATE_SYNC",
					state: this._state,
				})
			} catch (error) {
				// Channel might be closed
			}
		}
	}

	_scheduleCheck(delayMs) {
		if (this._checkInterval) {
			clearTimeout(this._checkInterval)
		}

		const delay = delayMs ?? this._getNextInterval()
		this._checkInterval = setTimeout(() => this._performHealthCheck(), delay)
	}

	_getNextInterval() {
		// Manual offline - very slow checks
		if (this._manualOffline) {
			return CONFIG.RECHECK_ONLINE_MS * 10
		}

		// Unstable state - check frequently
		if (this._state.state === "unstable") {
			return CONFIG.RECHECK_UNSTABLE_MS
		}

		// Offline - try to recover
		if (this._state.state === "offline") {
			return CONFIG.RECHECK_OFFLINE_MS
		}

		// Online - normal interval
		return CONFIG.RECHECK_ONLINE_MS
	}

	async _performHealthCheck() {
		if (this._isChecking) return
		if (typeof window === "undefined") return

		this._isChecking = true
		this._currentAttempt = 0

		try {
			const result = await this._checkWithRetries()
			this._processResult(result)
		} catch (error) {
			log.debug("Health check failed completely", error?.message || error)
			this._processFailure()
		} finally {
			this._isChecking = false
			this._scheduleCheck()
		}
	}

	async _checkWithRetries() {
		const errors = []

		for (const endpoint of CONFIG.HEALTH_ENDPOINTS) {
			for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
				this._currentAttempt = attempt

				try {
					const startTime = performance.now()
					const controller = new AbortController()
					const timeoutMs =
						attempt === 0 ? CONFIG.INITIAL_TIMEOUT_MS : CONFIG.RETRY_TIMEOUT_MS
					const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

					const response = await fetch(endpoint, {
						method: "GET",
						cache: "no-store",
						credentials: "same-origin",
						signal: controller.signal,
						headers: {
							"Cache-Control": "no-cache, no-store, must-revalidate",
							Pragma: "no-cache",
							Expires: "0",
						},
					})

					clearTimeout(timeoutId)
					const latency = Math.round(performance.now() - startTime)

					// Read response to detect captive portals
					const text = await response.text().catch(() => "")

					return {
						success: response.ok,
						latency,
						status: response.status,
						endpoint,
						captivePortal: detectCaptivePortal(text),
						responseText: text,
					}
				} catch (error) {
					errors.push({ endpoint, attempt, error: error?.message || error })

					if (attempt < CONFIG.MAX_RETRIES) {
						const backoff = calculateBackoff(
							attempt,
							CONFIG.BACKOFF_BASE_MS,
							CONFIG.BACKOFF_MAX_MS,
							CONFIG.BACKOFF_JITTER,
						)
						await sleep(backoff)
					}
				}
			}
		}

		// All endpoints failed
		throw new Error(
			`All health checks failed: ${errors.map((e) => e.error).join(", ")}`,
		)
	}

	_processResult(result) {
		const { success, latency, status, endpoint, captivePortal } = result

		this._state.endpoint = endpoint
		this._state.latency = latency
		this._state.quality = assessQuality(latency)
		this._state.captivePortal = captivePortal
		this._state.lastCheck = Date.now()

		if (success && !captivePortal) {
			this._state.consecutiveFailures = 0
			this._state.consecutiveSuccesses++

			if (
				this._state.consecutiveSuccesses >= CONFIG.CONSECUTIVE_SUCCESS_REQUIRED
			) {
				if (this._state.state !== "online") {
					this._state.state = "online"
					log.info(
						`Backend online via ${endpoint} (latency: ${latency}ms, quality: ${this._state.quality})`,
					)
					this._notifyChange("recovery")
				}
			} else if (this._state.state === "offline") {
				// Transitioning from offline to unstable
				this._state.state = "unstable"
				this._notifyChange("transition")
			}
		} else {
			this._processFailure(status, captivePortal)
		}
	}

	_processFailure(status = 0, captivePortal = false) {
		this._state.consecutiveSuccesses = 0
		this._state.consecutiveFailures++
		this._state.lastCheck = Date.now()

		if (status === 503) {
			this._state.captivePortal = false
		} else if (captivePortal) {
			this._state.captivePortal = true
		}

		if (
			this._state.consecutiveFailures >= CONFIG.CONSECUTIVE_FAILURE_THRESHOLD
		) {
			if (this._state.state !== "offline") {
				this._state.state = "offline"
				log.warn(
					`Backend offline (${this._state.consecutiveFailures} consecutive failures)`,
				)
				this._notifyChange("failure")
			}
		} else if (this._state.state === "online") {
			// Transitioning from online to unstable
			this._state.state = "unstable"
			this._notifyChange("transition")
		}
	}

	_notifyChange(source = "unknown") {
		const newState = this.getStatus()
		this._pendingState = newState

		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer)
		}

		this._debounceTimer = setTimeout(() => {
			this._debounceTimer = null

			if (this._pendingState) {
				const state = this._pendingState
				this._pendingState = null

				this._broadcastState()

				// Notify all listeners
				for (const listener of this._listeners) {
					try {
						listener(state)
					} catch (error) {
						log.error("Error in offline detection listener", error)
					}
				}

				// Dispatch DOM event
				if (typeof window !== "undefined") {
					window.dispatchEvent(
						new CustomEvent("offlineDetectionChange", { detail: state }),
					)
				}
			}
		}, CONFIG.STATE_DEBOUNCE_MS)
	}
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

export const offlineDetector = new OfflineDetector()

/**
 * Quick one-time offline check (for startup)
 * @param {number} timeoutMs
 * @returns {Promise<boolean>} True if offline
 */
export async function quickOfflineCheck(timeoutMs = 3000) {
	if (typeof window === "undefined") return false

	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

		const response = await fetch("/api/method/DyPOS.api.ping", {
			method: "GET",
			cache: "no-store",
			credentials: "same-origin",
			signal: controller.signal,
		})

		clearTimeout(timeoutId)
		return !response.ok
	} catch {
		return true
	}
}

/**
 * Initialize offline detection with default settings
 * @param {{ manualOffline?: boolean }} options
 * @returns {OfflineDetector}
 */
export function initOfflineDetection(options = {}) {
	offlineDetector.initialize(options)
	return offlineDetector
}

export default offlineDetector
