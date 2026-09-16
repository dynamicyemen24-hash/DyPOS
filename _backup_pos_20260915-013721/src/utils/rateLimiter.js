/**
 * Rate limiter for login and sensitive endpoints.
 *
 * Provides brute-force protection on the client side
 * as a UX enhancement layer — server-side enforcement
 * is the source of truth.
 *
 * Two modes:
 *   1. Fixed-window: count attempts per window
 *   2. Sliding-window: more precise rate limiting
 *
 * All state persisted to localStorage so it survives
 * page reloads but not manual clears.
 */

const STORAGE_PREFIX = "dypos_ratelimit_"
const DEFAULT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_LOCKOUT_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_MAX_LOCKOUT_MS = 60 * 60 * 1000 // 1 hour

/**
 * Read JSON from localStorage safely.
 */
function readStorage(key) {
	try {
		const raw = localStorage.getItem(key)
		return raw ? JSON.parse(raw) : null
	} catch {
		return null
	}
}

/**
 * Write JSON to localStorage safely.
 */
function writeStorage(key, value) {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// Storage full or unavailable
	}
}

/**
 * Create a rate limiter for a specific endpoint/action.
 *
 * @param {Object} opts
 * @param {string} opts.key - Unique identifier for the limiter
 * @param {number} [opts.windowMs] - Time window in ms
 * @param {number} [opts.maxAttempts] - Max attempts per window
 * @param {number} [opts.lockoutMs] - Initial lockout duration in ms
 * @param {number} [opts.maxLockoutMs] - Maximum lockout duration
 * @param {boolean} [opts.persist] - Persist state to localStorage
 * @returns {Object} Rate limiter instance
 */
export function createRateLimiter({
	key,
	windowMs = DEFAULT_WINDOW_MS,
	maxAttempts = DEFAULT_MAX_ATTEMPTS,
	lockoutMs = DEFAULT_LOCKOUT_MS,
	maxLockoutMs = DEFAULT_MAX_LOCKOUT_MS,
	persist = true,
} = {}) {
	const storageKey = STORAGE_PREFIX + key
	const state = loadState()

	function loadState() {
		if (!persist) {
			return {
				attempts: [],
				lockoutUntil: 0,
				totalBlocked: 0,
			}
		}
		const saved = readStorage(storageKey)
		if (saved && saved.attempts) {
			// Clean expired attempts from persisted state
			const now = Date.now()
			const cleaned = saved.attempts.filter((t) => now - t < windowMs)
			return {
				attempts: cleaned,
				lockoutUntil: saved.lockoutUntil || 0,
				totalBlocked: saved.totalBlocked || 0,
			}
		}
		return {
			attempts: [],
			lockoutUntil: 0,
			totalBlocked: 0,
		}
	}

	function saveState() {
		if (persist) {
			writeStorage(storageKey, {
				attempts: state.attempts,
				lockoutUntil: state.lockoutUntil,
				totalBlocked: state.totalBlocked,
			})
		}
	}

	/**
	 * Check if the current action is allowed.
	 * @returns {{ allowed: boolean, remainingAttempts: number, retryAfterMs: number, lockoutUntil: number }}
	 */
	function check() {
		const now = Date.now()

		// Check lockout
		if (state.lockoutUntil > now) {
			const retryAfterMs = state.lockoutUntil - now
			return {
				allowed: false,
				remainingAttempts: 0,
				retryAfterMs,
				lockoutUntil: state.lockoutUntil,
				locked: true,
			}
		}

		// Clean expired attempts
		state.attempts = state.attempts.filter((t) => now - t < windowMs)

		const remainingAttempts = Math.max(0, maxAttempts - state.attempts.length)

		if (state.attempts.length >= maxAttempts) {
			// Trigger lockout with exponential backoff
			const attemptCount = state.attempts.length
			const escalatedLockout = Math.min(
				lockoutMs * Math.pow(2, attemptCount - maxAttempts),
				maxLockoutMs,
			)
			state.lockoutUntil = now + escalatedLockout
			state.totalBlocked += 1
			saveState()

			return {
				allowed: false,
				remainingAttempts: 0,
				retryAfterMs: escalatedLockout,
				lockoutUntil: state.lockoutUntil,
				locked: true,
			}
		}

		return {
			allowed: true,
			remainingAttempts,
			retryAfterMs: 0,
			lockoutUntil: 0,
			locked: false,
		}
	}

	/**
	 * Record a failed attempt. Should be called when authentication fails.
	 * @returns {Object} Current check result
	 */
	function recordFailure() {
		const now = Date.now()
		state.attempts.push(now)
		saveState()
		return check()
	}

	/**
	 * Record a successful action. Resets the attempt counter.
	 */
	function recordSuccess() {
		state.attempts = []
		saveState()
	}

	/**
	 * Reset the rate limiter completely.
	 */
	function reset() {
		state.attempts = []
		state.lockoutUntil = 0
		state.totalBlocked = 0
		saveState()
	}

	/**
	 * Get current state for debugging/display.
	 */
	function getState() {
		const now = Date.now()
		const validAttempts = state.attempts.filter((t) => now - t < windowMs)
		return {
			attempts: validAttempts.length,
			maxAttempts,
			remainingAttempts: Math.max(0, maxAttempts - validAttempts.length),
			lockoutUntil: state.lockoutUntil,
			isLocked: state.lockoutUntil > now,
			totalBlocked: state.totalBlocked,
			windowMs,
		}
	}

	return {
		check,
		recordFailure,
		recordSuccess,
		reset,
		getState,
	}
}

/**
 * Global rate limiter registry.
 * Manages multiple limiters by key.
 */
class RateLimiterRegistry {
	constructor() {
		this.limiters = new Map()
	}

	/**
	 * Get or create a rate limiter by key.
	 */
	get(key, options) {
		if (!this.limiters.has(key)) {
			this.limiters.set(key, createRateLimiter({ key, ...options }))
		}
		return this.limiters.get(key)
	}

	/**
	 * Check if action is allowed.
	 */
	check(key, options) {
		return this.get(key, options).check()
	}

	/**
	 * Record a failure for a key.
	 */
	fail(key, options) {
		return this.get(key, options).recordFailure()
	}

	/**
	 * Record a success for a key.
	 */
	success(key, options) {
		return this.get(key, options).recordSuccess()
	}

	/**
	 * Reset a specific limiter or all limiters.
	 */
	reset(key) {
		if (key) {
			this.limiters.get(key)?.reset()
		} else {
			this.limiters.forEach((limiter) => limiter.reset())
		}
	}
}

export const globalRateLimiter = new RateLimiterRegistry()

/**
 * Pre-configured login rate limiter.
 */
export const loginRateLimiter = createRateLimiter({
	key: "login",
	windowMs: 15 * 60 * 1000,
	maxAttempts: 5,
	lockoutMs: 5 * 60 * 1000,
	maxLockoutMs: 60 * 60 * 1000,
})

export default { createRateLimiter, RateLimiterRegistry, globalRateLimiter, loginRateLimiter }