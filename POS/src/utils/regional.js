/**
 * DyPOS regional display helpers — Intl-based, dependency-free, DISPLAY-ONLY.
 *
 * These formatters localize how numbers/dates/tax-labels are RENDERED for the
 * cashier. They are never a source of financial authority: totals are always
 * recomputed server-side on submit, and `resolveTaxDisplay` only produces
 * labels/preview figures to show in the UI.
 *
 * No third-party i18n or date libs (no vue-i18n, no dayjs) — native Intl only,
 * matching the existing `ar-SA-u-nu-latn` default locale convention used by
 * utils/currency.js.
 */

// Single source of currency truth: utils/currency.js holds the configured
// default (set from posSettings via configureCurrency). A second hardcoded
// "SAR" here would silently format a non-SAR shop as SAR.
import { DEFAULT_CURRENCY } from "./currency.js"

const DEFAULT_LOCALE = "ar-SA-u-nu-latn"

// eslint-disable-next-line no-unused-vars
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩"
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"

/**
 * Editable tax profiles for the display layer. `rate` is a FRACTION (0.15).
 * `inclusion`: "inclusive" = price shows tax already included (الضريبة شاملة),
 * "exclusive" = tax is added on top of the price (تضاف الضريبة).
 */
const TAX_PROFILES = Object.freeze([
	{
		key: "tax_inclusive_15",
		nameAr: "الضريبة شاملة في السعر (15%)",
		nameEn: "Tax included in price (15%)",
		rate: 0.15,
		inclusion: "inclusive",
	},
	{
		key: "tax_exclusive_15",
		nameAr: "الضريبة تُضاف إلى السعر (15%)",
		nameEn: "Tax added on top of price (15%)",
		rate: 0.15,
		inclusion: "exclusive",
	},
	{
		key: "tax_inclusive_0",
		nameAr: "بدون ضريبة",
		nameEn: "No tax",
		rate: 0,
		inclusion: "inclusive",
	},
])

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveNumber(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0
	const num = Number(value)
	return Number.isFinite(num) ? num : 0
}

/** Display-only rounding to 2 decimals (never authoritative for totals). */
function roundMoney(value) {
	const n = Number(value)
	if (!Number.isFinite(n)) return 0
	return Math.round((n + Number.EPSILON) * 100) / 100
}

function toDate(input) {
	if (input instanceof Date) return input
	if (typeof input === "number" || typeof input === "string") {
		const date = new Date(input)
		return Number.isNaN(Number(date)) ? null : date
	}
	return null
}

// ---------------------------------------------------------------------------
// Money / number formatting
// ---------------------------------------------------------------------------

/**
 * Locale-aware currency formatting.
 * @param {number|string} amount
 * @param {Object} [opts] { locale?, currency?, currencyDisplay?,
 *   minimumFractionDigits?, maximumFractionDigits? }
 * @returns {string}
 */
function formatMoney(amount, opts = {}) {
	const locale = opts.locale || DEFAULT_LOCALE
	const currency = opts.currency || DEFAULT_CURRENCY
	const value = resolveNumber(amount)
	try {
		return new Intl.NumberFormat(locale, {
			style: "currency",
			currency,
			currencyDisplay: opts.currencyDisplay || "symbol",
			minimumFractionDigits: opts.minimumFractionDigits,
			maximumFractionDigits: opts.maximumFractionDigits,
		}).format(value)
	} catch {
		return `${value.toFixed(2)}`
	}
}

/**
 * Plain (non-currency) decimal formatting, e.g. for quantities.
 */
function formatDecimal(amount, opts = {}) {
	const locale = opts.locale || DEFAULT_LOCALE
	const value = resolveNumber(amount)
	try {
		return new Intl.NumberFormat(locale, {
			minimumFractionDigits: opts.minimumFractionDigits,
			maximumFractionDigits:
				opts.maximumFractionDigits ?? opts.minimumFractionDigits ?? 2,
		}).format(value)
	} catch {
		return `${value}`
	}
}

// ---------------------------------------------------------------------------
// Date / time formatting
// ---------------------------------------------------------------------------

/** Locale-aware date string. Falls back gracefully for invalid input. */
function formatDate(input, opts = {}) {
	const date = toDate(input)
	if (!date) return opts.fallback ?? ""
	const locale = opts.locale || DEFAULT_LOCALE
	try {
		return new Intl.DateTimeFormat(locale, {
			dateStyle: opts.dateStyle || "medium",
		}).format(date)
	} catch {
		return String(opts.fallback ?? "")
	}
}

/** Locale-aware date + time string (receipt timestamps etc.). */
function formatDateTime(input, opts = {}) {
	const date = toDate(input)
	if (!date) return opts.fallback ?? ""
	const locale = opts.locale || DEFAULT_LOCALE
	try {
		return new Intl.DateTimeFormat(locale, {
			dateStyle: opts.dateStyle || "medium",
			timeStyle: opts.timeStyle || "short",
		}).format(date)
	} catch {
		return String(opts.fallback ?? "")
	}
}

// ---------------------------------------------------------------------------
// Number input normalization
// ---------------------------------------------------------------------------

/**
 * Fold Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII, convert the
 * Arabic/Persian decimal separator "٫" (U+066B) to ".", and strip grouping
 * separators (U+066C Arabic thousands, "،" U+060C, and ASCII ",") plus spaces.
 *
 * Example: "١٬٢٣٤٬٥٦٧٫٨٩" → "1234567.89"
 * Limitation: European-style "1.234.567,89" keeps its dotted grouping as-is
 * (callers who feed cashier keyboard input in that convention should convert
 * before calling).
 */
function normalizeNumeric(input) {
	if (input === null || input === undefined) return ""
	if (typeof input === "number") {
		return Number.isFinite(input) ? String(input) : ""
	}
	let out = String(input)

	for (let i = 0; i < 10; i++) {
		out = out.split(ARABIC_INDIC[i]).join(String(i))
		out = out.split(PERSIAN_DIGITS[i]).join(String(i))
	}

	// Strip grouping separators first so they never collide with the decimal.
	out = out.replace(/[\u060C\u066C,]/g, "")
	// Arabic/Persian decimal → ASCII dot.
	out = out.replace(/\u066B/g, ".")
	// Collapse leftover spaces.
	out = out.replace(/\s/g, "")

	return out
}

// ---------------------------------------------------------------------------
// Tax display (labels/previews only — not authoritative)
// ---------------------------------------------------------------------------

function findProfile(profileOrKey) {
	if (typeof profileOrKey === "string") {
		return TAX_PROFILES.find((profile) => profile.key === profileOrKey) || null
	}
	if (profileOrKey && typeof profileOrKey === "object") return profileOrKey
	return null
}

/**
 * Localized tax label for a profile.
 * @param {string|Object} profileOrKey - profile or its `key`
 * @param {Object} [opts] { translate?: (key, fallbackAr) => string }
 */
function taxLabel(profileOrKey, opts = {}) {
	const profile = findProfile(profileOrKey)
	const translate = typeof opts.translate === "function" ? opts.translate : null
	if (!profile) return opts.fallback ?? ""
	if (translate) {
		const localized = translate(profile.key, profile.nameAr)
		return typeof localized === "string" && localized.length > 0
			? localized
			: profile.nameAr
	}
	return profile.nameAr
}

/**
 * DISPLAY-ONLY tax split for a price:
 *  - exclusive: tax = base * rate, total = base + tax
 *  - inclusive: base = price / (1 + rate), tax = price - base, total = price
 *
 * Returns rounded base/tax/total plus the localized label. The RESULTS are
 * presentation previews; authoritative totals always come from the server.
 *
 * @param {number|string} price - displayed selling price
 * @param {number|Object} rateOrProfile - fraction (0.15) or a TAX_PROFILES entry
 * @param {Object} [opts] { mode?: "inclusive"|"exclusive", translate? }
 */
function resolveTaxDisplay(price, rateOrProfile = 0.15, opts = {}) {
	const profile = findProfile(rateOrProfile)
	const rate =
		typeof rateOrProfile === "number"
			? rateOrProfile
			: Number(profile?.rate ?? 0)
	const mode =
		opts.mode || profile?.inclusion || (rate > 0 ? "inclusive" : "inclusive")
	const basePrice = resolveNumber(price)
	const factor = 1 + rate

	const base = mode === "exclusive" ? basePrice : basePrice / factor
	const tax = mode === "exclusive" ? base * rate : basePrice - base
	const total = mode === "exclusive" ? base + tax : basePrice

	return {
		mode,
		rate,
		profileKey: profile?.key || null,
		base: roundMoney(base),
		tax: roundMoney(tax),
		total: roundMoney(total),
		label: taxLabel(profile, opts),
	}
}

export {
	DEFAULT_LOCALE,
	DEFAULT_CURRENCY,
	TAX_PROFILES,
	formatMoney,
	formatDecimal,
	formatDate,
	formatDateTime,
	normalizeNumeric,
	taxLabel,
	resolveTaxDisplay,
}

export default {
	DEFAULT_LOCALE,
	DEFAULT_CURRENCY,
	TAX_PROFILES,
	formatMoney,
	formatDecimal,
	formatDate,
	formatDateTime,
	normalizeNumeric,
	taxLabel,
	resolveTaxDisplay,
}
