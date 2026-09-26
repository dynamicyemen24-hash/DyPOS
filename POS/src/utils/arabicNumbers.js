/**
 * Arabic number formatting utilities.
 *
 * Formats numbers, currencies, dates, and percentages
 * according to Arabic (ar-EG) locale conventions.
 * Uses Eastern Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩).
 */

const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]
import { getCurrencySymbol } from "./currency"

const LATIN_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
const ARABIC_DIGIT_MAP = Object.fromEntries(
	ARABIC_DIGITS.map((d, i) => [d, LATIN_DIGITS[i]]),
)
const LATIN_TO_ARABIC = Object.fromEntries(
	LATIN_DIGITS.map((d, i) => [d, ARABIC_DIGITS[i]]),
)

/**
 * Convert Latin digits to Arabic-Indic digits for display.
 * @param {string|number} value
 * @returns {string}
 */
export function toArabicNumerals(value) {
	if (value == null) return ""
	return String(value).replace(/\d/g, (d) => LATIN_TO_ARABIC[d] || d)
}

/**
 * Convert Arabic-Indic digits back to Latin for computation.
 * @param {string} value
 * @returns {string}
 */
export function fromArabicNumerals(value) {
	if (value == null) return ""
	return String(value).replace(/[٠-٩]/g, (d) => ARABIC_DIGIT_MAP[d] || d)
}

/**
 * Format a number with Arabic digits, separators, and decimal.
 * @param {number} value
 * @param {Object} [opts]
 * @param {number} [opts.decimals=2]
 * @param {string} [opts.decimalSep="٫"]
 * @param {string} [opts.groupSep="٬"]
 * @returns {string}
 */
export function formatNumber(value, opts = {}) {
	const { decimals = 2, decimalSep = "٫", groupSep = "٬" } = opts
	const num = Number(value)
	if (Number.isNaN(num)) return "-"

	const fixed = num.toFixed(decimals)
	const [intPart, decPart] = fixed.split(".")

	// Group integer part by 3 from right
	const groups = []
	for (let i = intPart.length; i > 0; i -= 3) {
		groups.unshift(intPart.slice(Math.max(0, i - 3), i))
	}
	const formattedInt = groups.join(groupSep)

	const result =
		decimals > 0 ? `${formattedInt}${decimalSep}${decPart}` : formattedInt
	return toArabicNumerals(result)
}

/**
 * Format a currency amount in Arabic.
 * @param {number} amount
 * @param {Object} [opts]
 * @param {string} [opts.currency] - defaults to the configured currency symbol
 * @param {string} [opts.position="after"]
 * @returns {string}
 */
export function formatCurrency(amount, opts = {}) {
	const {
		currency = getCurrencySymbol(),
		position = "after",
		decimals = 2,
	} = opts
	const formatted = formatNumber(amount, { decimals })
	return position === "before"
		? `${currency} ${formatted}`
		: `${formatted} ${currency}`
}

/**
 * Format a percentage in Arabic.
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPercentage(value, decimals = 1) {
	return `${formatNumber(value, { decimals: decimals })}٪`
}

/**
 * Format a date/time in Arabic.
 * @param {Date|number} date
 * @param {Object} [opts]
 * @param {string} [opts.format="full"]
 * @returns {string}
 */
export function formatArabicDate(date, opts = {}) {
	const { format = "full", locale = "ar-EG" } = opts
	const d = date instanceof Date ? date : new Date(date)

	const options = {
		full: {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		},
		date: { year: "numeric", month: "long", day: "numeric" },
		time: { hour: "2-digit", minute: "2-digit" },
		short: { year: "numeric", month: "short", day: "numeric" },
	}

	try {
		return d.toLocaleDateString(locale, options[format] || options.full)
	} catch {
		return d.toISOString()
	}
}

/**
 * Format a duration in Arabic (e.g., "٥ دقائق", "٢ ساعة").
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
	if (seconds < 60) return `${seconds} ثانية`
	if (seconds < 3600) return `${Math.floor(seconds / 60)} دقيقة`
	if (seconds < 86400) return `${Math.floor(seconds / 3600)} ساعة`
	return `${Math.floor(seconds / 86400)} يوم`
}

/**
 * Format relative time in Arabic.
 * @param {number} timestamp
 * @returns {string}
 */
export function timeAgoArabic(timestamp) {
	const now = Date.now()
	const diff = now - timestamp
	const seconds = Math.floor(diff / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)

	if (seconds < 60) return "الآن"
	if (minutes < 60) return `قبل ${minutes} دقيقة`
	if (hours < 24) return `قبل ${hours} ساعة`
	if (days < 30) return `قبل ${days} يوم`
	return formatArabicDate(timestamp, { format: "short" })
}

/**
 * Validate an Arabic phone number format.
 * Supports Egyptian formats: 010, 011, 012, 015 prefixes.
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidArabicPhone(phone) {
	if (!phone) return false
	const cleaned = fromArabicNumerals(phone.replace(/[\s\-()]/g, ""))
	return /^01[0-5]\d{8}$/.test(cleaned) || /^\+201[0-5]\d{8}$/.test(cleaned)
}

/**
 * Format a phone number in Arabic style.
 * @param {string} phone
 * @returns {string}
 */
export function formatArabicPhone(phone) {
	if (!phone) return ""
	const cleaned = fromArabicNumerals(phone.replace(/[\s\-()]/g, ""))
	if (/^01[0-5]\d{8}$/.test(cleaned)) {
		return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
	}
	return phone
}

export default {
	toArabicNumerals,
	fromArabicNumerals,
	formatNumber,
	formatCurrency,
	formatPercentage,
	formatArabicDate,
	formatDuration,
	timeAgoArabic,
	isValidArabicPhone,
	formatArabicPhone,
}
