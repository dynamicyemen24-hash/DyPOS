/**
 * Utility helpers
 */

/**
 * Debounce function
 * @param {Function} fn - Function to debounce
 * @param {number} ms - Milliseconds to wait
 * @returns {Function} Debounced function
 */
export function debounce(fn, ms) {
	let timer
	return (...args) => {
		clearTimeout(timer)
		timer = setTimeout(() => fn(...args), ms)
	}
}

/**
 * Throttle function
 * @param {Function} fn - Function to throttle
 * @param {number} ms - Milliseconds to wait
 * @returns {Function} Throttled function
 */
export function throttle(fn, ms) {
	let lastCall = 0
	return (...args) => {
		const now = Date.now()
		if (now - lastCall >= ms) {
			lastCall = now
			return fn(...args)
		}
	}
}

/**
 * Deep clone
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
	return JSON.parse(JSON.stringify(obj))
}

/**
 * Generate unique ID
 * @param {string} prefix - Prefix for ID
 * @returns {string} Unique ID
 */
export function uniqueId(prefix = "") {
	return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Format number with thousand separators
 * @param {number} value - Number to format
 * @param {string} locale - Locale (default: ar-SA)
 * @returns {string} Formatted number
 */
export function formatNumber(value, locale = "ar-SA") {
	return new Intl.NumberFormat(locale).format(value)
}

/**
 * Format currency
 * @param {number} value - Amount
 * @param {string} currency - Currency code (default: SAR)
 * @param {string} locale - Locale (default: ar-SA)
 * @returns {string} Formatted currency
 */
export function formatCurrency(value, currency = "SAR", locale = "ar-SA") {
	return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
		value,
	)
}

/**
 * Format percentage
 * @param {number} value - Value (e.g., 0.15 for 15%)
 * @param {string} locale - Locale (default: ar-SA)
 * @returns {string} Formatted percentage
 */
export function formatPercent(value, locale = "ar-SA") {
	return new Intl.NumberFormat(locale, { style: "percent" }).format(value)
}

/**
 * Format date
 * @param {Date|string} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @param {string} locale - Locale (default: ar-SA)
 * @returns {string} Formatted date
 */
export function formatDate(
	date,
	options = { dateStyle: "medium" },
	locale = "ar-SA",
) {
	return new Intl.DateTimeFormat(locale, options).format(new Date(date))
}

/**
 * Get nested value from object
 * @param {Object} obj - Object
 * @param {string} path - Dot notation path
 * @returns {*} Value or undefined
 */
export function getNestedValue(obj, path) {
	return path.split(".").reduce((o, k) => o?.[k], obj)
}

/**
 * Set nested value in object
 * @param {Object} obj - Object
 * @param {string} path - Dot notation path
 * @param {*} value - Value to set
 */
export function setNestedValue(obj, path, value) {
	const keys = path.split(".")
	const last = keys.pop()
	const target = keys.reduce((o, k) => {
		if (!o[k]) o[k] = {}
		return o[k]
	}, obj)
	target[last] = value
}

/**
 * Check if value is empty
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isEmpty(value) {
	if (value === null || value === undefined) return true
	if (Array.isArray(value)) return value.length === 0
	if (typeof value === "object") return Object.keys(value).length === 0
	if (typeof value === "string") return value.trim() === ""
	return false
}

/**
 * Clamp value between min and max
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max)
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
