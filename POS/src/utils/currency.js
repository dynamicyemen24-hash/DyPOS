/**
 * Currency Utility for DyPOS
 * Handles formatting and rounding with DyPOS System Settings compatibility
 *
 * Rounding Methods (matches ERPNext `utils/data.py`):
 * - Banker's Rounding: Rounds .5 to nearest even number
 * - Commercial Rounding: Rounds .5 away from zero
 */

// =============================================================================
// Settings (initialized from bootstrap)
// =============================================================================

let settings = {
	currency: 2,
	float: 3,
	rounding_method: "Banker's Rounding",
	number_format: "#,###.##",
	// Display digits. LATIN by default in EVERY UI language (Arabic, Urdu, …):
	// accounting figures must stay machine-parseable and comparable. `arab`
	// (Eastern Arabic-Indic ٠١٢٣) is an explicit operator opt-in.
	number_system: "latn",
}

/** Initialize settings from bootstrap data */
export function initPrecision(data) {
	if (!data) return
	settings = {
		currency: data.currency ?? 2,
		float: data.float ?? 3,
		rounding_method: data.rounding_method || "Banker's Rounding",
		number_format: data.number_format || "#,###.##",
		number_system: normalizeNumberSystem(data.number_system),
	}
	_formatterCache.clear()
}

/** Accept operator synonyms; anything unknown falls back to Latin. */
function normalizeNumberSystem(value) {
	const v = String(value ?? "")
		.trim()
		.toLowerCase()
	if (v === "arab" || v === "arabic" || v === "ar" || v === "arabext")
		return "arab"
	return "latn"
}

/** Get current settings */
export function getPrecision() {
	return { ...settings }
}

// =============================================================================
// Currency Symbols
// =============================================================================

// Defaults are deployment-configurable (not country-exclusive). They follow
// the organization's bootstrap/System Settings and can be overridden at runtime
// via configureCurrency(). Live bindings: components that import the constants
// read the latest value when defaults are evaluated.
export let DEFAULT_CURRENCY = "SAR"
export let DEFAULT_LOCALE = "ar-SA-u-nu-latn"

/**
 * Override currency/locale used for formatting defaults.
 * Safe to call after settings/bootstrap load without touching existing callsites.
 * @param {Object} opts - { currency?: string, locale?: string, numberSystem?: string }
 */
export function configureCurrency({ currency, locale, numberSystem } = {}) {
	if (currency) DEFAULT_CURRENCY = currency
	if (locale) DEFAULT_LOCALE = locale
	if (numberSystem) settings.number_system = normalizeNumberSystem(numberSystem)
	_formatterCache.clear()
	_symbolCache.clear()
}

/**
 * Digits are part of the global configuration too — the UI language must not
 * decide them (an Arabic-speaking cashier still needs Latin accounting digits
 * unless the operator explicitly asks for ٠١٢٣).
 */
export function configureNumberSystem(numberSystem) {
	settings.number_system = normalizeNumberSystem(numberSystem)
	_formatterCache.clear()
}

/**
 * Fold the configured numbering system into a locale string.
 * `ar-SA` → `ar-SA-u-nu-latn` (default) · `ur` → `ur-u-nu-latn`, and any
 * pre-existing `-u-…` extension is dropped before re-appending so the result is
 * never `ar-SA-u-nu-latn-u-nu-arab`.
 *
 * Both parameters are optional with defaults (locale first, digits second) so
 * the existing one-argument call sites keep working unchanged.
 */
export function withNumberSystem(
	locale = DEFAULT_LOCALE,
	numberSystem = settings.number_system,
) {
	const base = String(locale || DEFAULT_LOCALE).split("-u-")[0]
	return `${base}-u-nu-${normalizeNumberSystem(numberSystem)}`
}

const SYMBOLS = {
	USD: "$",
	EUR: "€",
	GBP: "£",
	JPY: "¥",
	CNY: "¥",
	INR: "₹",
	EGP: "E£",
	SAR: "ر.س",
	AED: "د.إ",
	QAR: "ر.ق",
	KWD: "د.ك",
	BHD: "د.ب",
	OMR: "ر.ع",
}

const _symbolCache = new Map()

function getSymbol(currency) {
	if (!currency) return SYMBOLS[DEFAULT_CURRENCY]
	if (SYMBOLS[currency]) return SYMBOLS[currency]
	if (_symbolCache.has(currency)) return _symbolCache.get(currency)

	try {
		const parts = new Intl.NumberFormat(withNumberSystem(DEFAULT_LOCALE), {
			style: "currency",
			currency,
			currencyDisplay: "narrowSymbol",
		}).formatToParts(0)
		const symbol = parts.find((p) => p.type === "currency")?.value || currency
		_symbolCache.set(currency, symbol)
		return symbol
	} catch {
		_symbolCache.set(currency, currency)
		return currency
	}
}

export { getSymbol as getCurrencySymbol }

// =============================================================================
// Number Formatting
// =============================================================================

const _formatterCache = new Map()

function getFormatter(precision, locale = DEFAULT_LOCALE) {
	// The locale passed to Intl always carries the configured numbering system,
	// so a language switch can never silently change the digits of a figure.
	const resolved = withNumberSystem(locale)
	const key = `${resolved}:${precision}`
	if (!_formatterCache.has(key)) {
		_formatterCache.set(
			key,
			new Intl.NumberFormat(resolved, {
				minimumFractionDigits: precision,
				maximumFractionDigits: precision,
			}),
		)
	}
	return _formatterCache.get(key)
}

/** Format value as currency string with symbol */
export function formatCurrency(
	value,
	currency = DEFAULT_CURRENCY,
	locale = DEFAULT_LOCALE,
) {
	if (typeof value !== "number" || Number.isNaN(value)) return ""
	const abs = Math.abs(value)
	const formatted = `${getSymbol(currency)} ${getFormatter(
		settings.currency,
		locale,
	).format(abs)}`
	return value < 0 ? `-${formatted}` : formatted
}

/** Format value as number string (no symbol) */
export function formatCurrencyNumber(value, locale = DEFAULT_LOCALE) {
	if (typeof value !== "number" || Number.isNaN(value)) return "0.00"
	return getFormatter(settings.currency, locale).format(value)
}

/**
 * Null/NaN/string-safe currency formatting with symbol.
 * Single canonical entry point for component-level wrappers:
 * accepts any raw value (null, undefined, string, number) and never
 * returns an empty string — invalid input is treated as 0.
 */
export function formatCurrencySafe(
	value,
	currency = DEFAULT_CURRENCY,
	locale = DEFAULT_LOCALE,
) {
	const num = typeof value === "number" ? value : Number.parseFloat(value)
	if (Number.isNaN(num)) {
		return formatCurrency(0, currency, locale)
	}
	return formatCurrency(num, currency, locale)
}

/** Get CSS class for positive/negative values */
export function getCurrencyClass(value) {
	return value < 0 ? "text-red-600" : "text-gray-900"
}

// =============================================================================
// Canonical plain-number formatting (quantities, counts, percents)
// =============================================================================

/**
 * Plain number with the configured digits & precision (no currency symbol).
 * Null/undefined/NaN/strings never produce an empty cell — they resolve to 0.
 */
export function formatNumberSafe(value, precision = settings.currency) {
	const num = toNumber(value, 0)
	const decimals =
		Number.isInteger(precision) && precision >= 0
			? precision
			: settings.currency
	try {
		return new Intl.NumberFormat(withNumberSystem(DEFAULT_LOCALE), {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		}).format(num)
	} catch {
		return num.toFixed(decimals)
	}
}

/**
 * Quantity display: configured float precision, trailing zeros removed
 * (1.500 → 1.5, 2.000 → 2). Fractions are preserved for weighed goods.
 */
export function formatQuantitySafe(value, maxPrecision = settings.float) {
	const num = toNumber(value, 0)
	const decimals =
		Number.isInteger(maxPrecision) && maxPrecision >= 0
			? maxPrecision
			: settings.float
	let out
	try {
		out = new Intl.NumberFormat(withNumberSystem(DEFAULT_LOCALE), {
			maximumFractionDigits: decimals,
		}).format(num)
	} catch {
		out = num.toFixed(decimals)
	}
	return out
}

/** Percentage display (value is already a percent, e.g. 15 → "15%"). */
export function formatPercentSafe(value, decimals = 2) {
	const num = toNumber(value, 0)
	const out = formatQuantitySafe(num, Math.max(0, Math.min(6, decimals)))
	return `${out}%`
}

// =============================================================================
// Canonical numeric INPUT parsing (the other half of the digit decision)
// =============================================================================

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩"
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
const DEVANAGARI = "०१२३४५६७८९"

/**
 * Normalize ANY human numeric input into a machine-parseable Latin string.
 *
 * Handles: Arabic-Indic (٠-٩), Persian (۰-۹), Devanagari (०-९) digits; the Arabic
 * decimal separator `٫` and grouping `٬`/`،`; ASCII grouping; thousands spaces
 * and NBSP; European "1.234,56"; parenthesised negatives and a leading `−`.
 *
 * @returns {string} e.g. "١٢٣٤٬٥" → "1234.5", "1.234,56" → "1234.56"
 */
export function normalizeNumericInput(value) {
	if (value === null || value === undefined) return ""
	if (typeof value === "number")
		return Number.isFinite(value) ? String(value) : ""
	let out = String(value)
	for (let i = 0; i < 10; i++) {
		out = out
			.split(ARABIC_INDIC[i])
			.join(String(i))
			.split(PERSIAN_DIGITS[i])
			.join(String(i))
			.split(DEVANAGARI[i])
			.join(String(i))
	}
	// Accounting negatives: (123) and the typographic minus.
	out = out.replace(/^\((.*)\)$/, "-$1").replace(/[\u2212\u2013\u2014]/g, "-")
	// Arabic separators.
	out = out.replace(/\u066B/g, ".").replace(/[\u066C\u060C\u00A0\u202F\s]/g, "")

	const dots = (out.match(/\./g) || []).length
	const commas = (out.match(/,/g) || []).length
	if (dots && commas) {
		// Both present: the RIGHTMOST one is the decimal separator, the rest group.
		const lastDot = out.lastIndexOf(".")
		const lastComma = out.lastIndexOf(",")
		if (lastComma > lastDot) out = out.replace(/\./g, "").replace(",", ".")
		else out = out.replace(/,/g, "")
	} else if (commas) {
		// Only commas: exactly one followed by 1–2 digits is a European decimal
		// ("1234,5" → 1234.5); anything else is grouping ("1,234" → 1234).
		const euDecimal = commas === 1 && /,\d{1,2}$/.test(out)
		out = euDecimal ? out.replace(",", ".") : out.replace(/,/g, "")
	} else if (dots > 1) {
		// Only dots, multiple: European grouping with a decimal tail.
		const idx = out.lastIndexOf(".")
		out = `${out.slice(0, idx).replace(/\./g, "")}${out.slice(idx)}`
	}
	// Keep one sign + one dot; drop anything else a browser may inject.
	out = out.replace(/[^0-9.\-]/g, "")
	const neg = out.startsWith("-")
	out = out.replace(/-/g, "")
	return neg ? `-${out}` : out
}

/**
 * Parse a user/API value into a finite number, accepting every digit system.
 * NEVER returns NaN: invalid input resolves to `fallback` (0 by default), so a
 * mistyped quantity can't turn a total into `NaN`.
 */
export function toNumber(value, fallback = 0) {
	if (typeof value === "number")
		return Number.isFinite(value) ? value : fallback
	const normalized = normalizeNumericInput(value)
	if (normalized === "" || normalized === "-" || normalized === ".")
		return fallback
	const num = Number(normalized)
	return Number.isFinite(num) ? num : fallback
}

// =============================================================================
// Rounding (matches ERPNext `utils/data.py` exactly)
// =============================================================================

/**
 * Banker's Rounding - rounds .5 to nearest even
 * Matches upstream `_bankers_rounding()`
 */
function bankersRound(num, precision) {
	const multiplier = 10 ** precision
	// Round to 12 decimal places first to handle floating point errors
	let shifted = Number((num * multiplier).toFixed(12))

	if (shifted === 0) return 0

	const floor = Math.floor(shifted)
	const decimal = shifted - floor

	// Calculate epsilon for this number's magnitude
	const epsilon = 2 ** (Math.log2(Math.abs(shifted)) - 52)

	if (Math.abs(decimal - 0.5) < epsilon) {
		// Exactly .5 - round to even
		shifted = floor % 2 === 0 ? floor : floor + 1
	} else {
		shifted = Math.round(shifted)
	}

	return shifted / multiplier
}

/**
 * Commercial Rounding - .5 rounds away from zero
 * Matches upstream `_round_away_from_zero()`
 */
function commercialRound(num, precision) {
	if (num === 0) return 0

	// Calculate epsilon for this number's magnitude
	const epsilon = 2 ** (Math.log2(Math.abs(num)) - 52)

	// Add epsilon in the direction of the sign, then round
	const adjusted = num + Math.sign(num) * epsilon
	return Number(adjusted.toFixed(precision))
}

/**
 * Round using system rounding method
 * @param {number} value - Value to round
 * @param {number} precision - Decimal places
 * @returns {number} Rounded value
 */
function round(value, precision) {
	if (typeof value !== "number" || Number.isNaN(value)) return 0

	// Use Frappe's flt() if available in browser context
	if (typeof window !== "undefined" && typeof window.flt === "function") {
		return window.flt(value, precision)
	}

	// Apply rounding based on system setting
	if (settings.rounding_method === "Commercial Rounding") {
		return commercialRound(value, precision)
	}
	return bankersRound(value, precision)
}

// =============================================================================
// Exported Rounding Functions
// =============================================================================

/** Round to 2 decimal places */
export function round2(value) {
	return round(value, 2)
}

/** Round to 3 decimal places */
export function round3(value) {
	return round(value, 3)
}

/** Round using system currency precision */
export function roundCurrency(value) {
	return round(value, settings.currency)
}

/** Round using system float precision */
export function roundFloat(value) {
	return round(value, settings.float)
}
