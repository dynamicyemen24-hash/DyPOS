/**
 * Dashboard data caching composable.
 *
 * Caches dashboard data in localStorage with configurable TTL.
 * Provides getCacheKey, getCachedData, and setCachedData helpers
 * plus a useDashboardCache composable for reactive cache management.
 */

const CACHE_PREFIX = "dypos-dash-cache:"
const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Generate a unique cache key from filter parameters.
 * @param {Object} filter - Filter parameters
 * @returns {string} Cache key
 */
export function getCacheKey(filter) {
	if (!filter || typeof filter !== "object") return `${CACHE_PREFIX}default`
	const parts = []
	const sortedKeys = Object.keys(filter).sort()
	for (const key of sortedKeys) {
		const val = filter[key]
		if (val && typeof val === "object") {
			if (val.value !== undefined) {
				parts.push(`${key}=${JSON.stringify(val.value)}`)
			} else {
				parts.push(`${key}=${JSON.stringify(val)}`)
			}
		} else {
			parts.push(`${key}=${String(val)}`)
		}
	}
	return CACHE_PREFIX + parts.join("&")
}

/**
 * Retrieve cached data from localStorage.
 * Returns null if expired or not found.
 * @param {string} key - Cache key
 * @param {Object} [options]
 * @param {boolean} [options.allowExpired=false] - return expired entries too
 * @returns {Object|null} Cached data object or null
 */
export function getCachedData(key, options = {}) {
	const { allowExpired = false } = options
	if (typeof localStorage === "undefined") return null
	try {
		const raw = localStorage.getItem(key)
		if (!raw) return null
		const entry = JSON.parse(raw)
		if (!entry || !entry.timestamp) {
			localStorage.removeItem(key)
			return null
		}
		const age = Date.now() - entry.timestamp
		if (age > entry.ttl && !allowExpired) {
			return null
		}
		return entry.data
	} catch {
		localStorage.removeItem(key)
		return null
	}
}

/**
 * Store data in localStorage with a TTL.
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 * @param {number} [ttlMinutes=5] - Time-to-live in minutes
 */
export function setCachedData(key, data, ttlMinutes = 5) {
	if (typeof localStorage === "undefined") return
	try {
		const entry = {
			data,
			timestamp: Date.now(),
			ttl: ttlMinutes * 60 * 1000,
		}
		localStorage.setItem(key, JSON.stringify(entry))
	} catch {
		// localStorage full or unavailable — silently fail
	}
}

/**
 * Remove a cached entry.
 * @param {string} key - Cache key
 */
export function clearCachedData(key) {
	if (typeof localStorage === "undefined") return
	localStorage.removeItem(key)
}

/**
 * Clear all dashboard cache entries.
 */
export function clearAllDashboardCache() {
	if (typeof localStorage === "undefined") return
	const prefix = CACHE_PREFIX
	const keysToRemove = []
	for (let i = 0; i < localStorage.length; i++) {
		const k = localStorage.key(i)
		if (k?.startsWith(prefix)) {
			keysToRemove.push(k)
		}
	}
	keysToRemove.forEach((k) => localStorage.removeItem(k))
}

/**
 * Reactive dashboard cache composable.
 *
 * @param {Object} options
 * @param {number} [options.defaultTTL=5] - Default TTL in minutes
 * @param {boolean} [options.enabled=true] - Whether caching is active
 */
export function useDashboardCache(options = {}) {
	const { defaultTTL = 5, enabled = true } = options

	function load(filter, options = {}) {
		const key = getCacheKey(filter)
		const cached = getCachedData(key, options)
		if (cached !== null) {
			return { data: cached, fromCache: true, key }
		}
		return { data: null, fromCache: false, key }
	}

	/**
	 * Read a cached entry even when the TTL has passed, so a failed
	 * or offline fetch can still render the last known data.
	 */
	function loadStale(filter) {
		const key = getCacheKey(filter)
		return getCachedData(key, { allowExpired: true })
	}

	function save(filter, data, ttlMinutes) {
		const key = getCacheKey(filter)
		const ttl = ttlMinutes ?? defaultTTL
		setCachedData(key, data, ttl)
		return key
	}

	function invalidate(filter) {
		const key = getCacheKey(filter)
		clearCachedData(key)
	}

	function invalidateAll() {
		clearAllDashboardCache()
	}

	return {
		load,
		loadStale,
		save,
		invalidate,
		invalidateAll,
		getCacheKey,
		getCachedData,
		setCachedData,
		defaultTTL,
		enabled,
	}
}

export default useDashboardCache
