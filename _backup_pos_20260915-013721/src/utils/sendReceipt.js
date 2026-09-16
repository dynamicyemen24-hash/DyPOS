/**
 * Receipt Sharing Utilities
 * ============================================================================
 *
 * Production-grade receipt/invoice sharing for DyPOS.
 *
 * Supports:
 * - Native Web Share API
 * - WhatsApp deep links
 * - SMS deep links
 * - mailto links
 * - Arabic-first receipt summaries
 * - International phone numbers
 * - Graceful fallback for unsupported browsers
 * - Safe URL encoding
 * - User-cancelled share handling
 *
 * Design goals:
 * - Pure helpers wherever possible
 * - Browser-safe / SSR-safe
 * - No hard dependency on a UI framework
 * - No network requests
 * - No mutation of invoiceData
 * - Deterministic output
 * - Backward-compatible public API
 */

import { digitsOnly } from "./arabic"
import { formatCurrency } from "./currency"

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_LOCALE = "ar"
const DEFAULT_SHARE_TITLE = "إيصال الفاتورة"

const MAX_REFERENCE_LENGTH = 120
const MAX_CUSTOMER_LENGTH = 160
const MAX_PHONE_LENGTH = 32
const MAX_EMAIL_LENGTH = 254
const MAX_LINK_LENGTH = 2048

/**
 * Conservative email validation.
 *
 * This is intentionally not an RFC-complete parser.
 * Final delivery validation belongs to the email provider.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

/**
 * Supported locales for user-facing generated copy.
 *
 * Unknown locales gracefully fall back to English.
 */
const ARABIC_LOCALES = new Set([
	"ar",
	"ar-SA",
	"ar-YE",
	"ar-AE",
	"ar-KW",
	"ar-QA",
	"ar-BH",
	"ar-OM",
	"ar-JO",
	"ar-EG",
])

/* -------------------------------------------------------------------------- */
/* Runtime helpers                                                            */
/* -------------------------------------------------------------------------- */

function isBrowser() {
	return typeof window !== "undefined" && typeof navigator !== "undefined"
}

function normalizeLocale(locale) {
	const value = String(locale ?? DEFAULT_LOCALE)
		.trim()
		.toLowerCase()

	return value || DEFAULT_LOCALE
}

function isArabicLocale(locale) {
	return ARABIC_LOCALES.has(normalizeLocale(locale))
}

function safeString(value, maxLength = Number.POSITIVE_INFINITY) {
	if (value === null || value === undefined) {
		return ""
	}

	return String(value).trim().slice(0, maxLength)
}

function normalizeReference(value) {
	return safeString(value, MAX_REFERENCE_LENGTH)
}

function normalizeCustomer(value) {
	return safeString(value, MAX_CUSTOMER_LENGTH)
}

function normalizePhone(value) {
	if (value === null || value === undefined) {
		return ""
	}

	const raw = String(value).trim()

	if (!raw) {
		return ""
	}

	/**
	 * digitsOnly is intentionally retained from the existing Arabic
	 * utility so Arabic-Indic and Latin digits can be normalized according
	 * to the application's established behavior.
	 */
	const digits = digitsOnly(raw)

	return digits.slice(0, MAX_PHONE_LENGTH)
}

function normalizeEmail(value) {
	const email = safeString(value, MAX_EMAIL_LENGTH)

	if (!email || !EMAIL_PATTERN.test(email)) {
		return ""
	}

	return email
}

function normalizeReceiptLink(value) {
	const link = safeString(value, MAX_LINK_LENGTH)

	if (!link) {
		return ""
	}

	/**
	 * Only allow web links for generated receipt URLs.
	 *
	 * This prevents javascript:, data:, file:, etc. from being injected
	 * into WhatsApp/SMS/email content through invoice data.
	 */
	try {
		const url = new URL(link)

		if (url.protocol !== "https:" && url.protocol !== "http:") {
			return ""
		}

		return url.toString()
	} catch {
		return ""
	}
}

function normalizeTotal(invoiceData) {
	return (
		invoiceData?.grand_total ??
		invoiceData?.net_total ??
		invoiceData?.total ??
		""
	)
}

function encode(value) {
	return encodeURIComponent(String(value ?? ""))
}

/* -------------------------------------------------------------------------- */
/* Receipt text                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Build a compact human-readable receipt summary.
 *
 * @param {Object} invoiceData
 * @param {Object} [opts]
 * @param {string} [opts.locale="ar"]
 * @param {string|null} [opts.currency]
 * @returns {string}
 */
export function buildReceiptSummary(
	invoiceData = {},
	{ locale = DEFAULT_LOCALE, currency = null } = {},
) {
	const data = invoiceData && typeof invoiceData === "object" ? invoiceData : {}

	const total = normalizeTotal(data)

	let amount = ""

	if (total !== "") {
		try {
			amount = safeString(formatCurrency(total, currency || data.currency), 80)
		} catch {
			/**
			 * Formatting must never prevent a receipt from being shared.
			 */
			amount = safeString(total, 80)
		}
	}

	const customer = normalizeCustomer(data.customer_name ?? data.customer)

	const reference = normalizeReference(data.invoice_no ?? data.name)

	const arabic = isArabicLocale(locale)

	if (arabic) {
		const parts = [reference ? `فاتورة رقم ${reference}` : "الفاتورة"]

		if (amount) {
			parts.push(`المجموع: ${amount}`)
		}

		if (customer) {
			parts.push(`العميل: ${customer}`)
		}

		return parts.join("\n")
	}

	const parts = [reference ? `Invoice ${reference}` : "Invoice"]

	if (amount) {
		parts.push(`Total: ${amount}`)
	}

	if (customer) {
		parts.push(`Customer: ${customer}`)
	}

	return parts.join("\n")
}

/* -------------------------------------------------------------------------- */
/* Share body                                                                 */
/* -------------------------------------------------------------------------- */

function buildShareText(
	invoiceData = {},
	{ locale = DEFAULT_LOCALE, currency = null, includeLink = true } = {},
) {
	const summary = buildReceiptSummary(invoiceData, {
		locale,
		currency,
	})

	if (!includeLink) {
		return summary
	}

	const link = normalizeReceiptLink(
		invoiceData?.link ?? invoiceData?.receipt_link ?? invoiceData?.invoice_link,
	)

	return link ? `${summary}\n${link}` : summary
}

/* -------------------------------------------------------------------------- */
/* Send links                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Generate clickable delivery links.
 *
 * @param {Object} invoiceData
 * @param {Object} [opts]
 * @param {string} [opts.phone]
 * @param {string} [opts.email]
 * @param {string} [opts.locale="ar"]
 * @param {string|null} [opts.currency]
 * @param {boolean} [opts.includeLink=true]
 *
 * @returns {{
 *   whatsapp: string|null,
 *   sms: string|null,
 *   mailto: string|null
 * }}
 */
export function buildSendLinks(
	invoiceData = {},
	{
		phone = "",
		email = "",
		locale = DEFAULT_LOCALE,
		currency = null,
		includeLink = true,
	} = {},
) {
	const text = buildShareText(invoiceData, {
		locale,
		currency,
		includeLink,
	})

	const whatsappNumber = normalizePhone(phone)

	const normalizedEmail = normalizeEmail(email)

	/**
	 * WhatsApp
	 *
	 * wa.me expects the phone number without:
	 * - +
	 * - spaces
	 * - parentheses
	 * - dashes
	 */
	const whatsapp = whatsappNumber
		? `https://wa.me/${whatsappNumber}?text=${encode(text)}`
		: null

	/**
	 * SMS
	 *
	 * `body` is encoded independently from the recipient.
	 */
	const sms = whatsappNumber
		? `sms:${whatsappNumber}?body=${encode(text)}`
		: null

	/**
	 * Email
	 */
	const mailto = normalizedEmail
		? `mailto:${encode(normalizedEmail)}?subject=${encode(
				isArabicLocale(locale) ? "نسخة من الفاتورة" : "Invoice copy",
			)}&body=${encode(text)}`
		: null

	return {
		whatsapp,
		sms,
		mailto,
	}
}

/* -------------------------------------------------------------------------- */
/* Web Share                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Whether the current runtime safely exposes Web Share.
 *
 * @returns {boolean}
 */
export function canWebShare() {
	return isBrowser() && typeof navigator.share === "function"
}

/**
 * Whether a specific Web Share payload can be shared.
 *
 * This is intentionally defensive because some browsers expose
 * navigator.share while supporting only a subset of payload types.
 *
 * @param {Object} data
 * @returns {boolean}
 */
export function canShareReceiptData(data = {}) {
	if (!canWebShare() || typeof navigator.canShare !== "function") {
		return canWebShare()
	}

	try {
		return navigator.canShare(data)
	} catch {
		return false
	}
}

/* -------------------------------------------------------------------------- */
/* Native share                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Share a receipt through the native Web Share API.
 *
 * If native sharing is unavailable or fails, the function returns the
 * generated deep links so the caller can present WhatsApp/SMS/email actions.
 *
 * @param {Object} invoiceData
 * @param {Object} [opts]
 * @param {string} [opts.title]
 * @param {string} [opts.locale="ar"]
 * @param {string|null} [opts.currency]
 * @param {boolean} [opts.includeLink=true]
 * @param {(links: Object, context?: Object) => void} [opts.onFallback]
 *
 * @returns {Promise<{
 *   links: Object,
 *   shared: boolean,
 *   cancelled: boolean,
 *   supported: boolean,
 *   error: Error|null
 * }>}
 */
export async function shareReceipt(
	invoiceData = {},
	{
		title = DEFAULT_SHARE_TITLE,
		locale = DEFAULT_LOCALE,
		currency = null,
		includeLink = true,
		onFallback,
	} = {},
) {
	const links = buildSendLinks(invoiceData, {
		locale,
		currency,
		includeLink,
		phone: invoiceData?.customer_phone ?? invoiceData?.phone ?? "",
		email: invoiceData?.customer_email ?? invoiceData?.email ?? "",
	})

	const text = buildShareText(invoiceData, {
		locale,
		currency,
		includeLink,
	})

	const supported = canWebShare()

	if (!supported) {
		onFallback?.(links, {
			reason: "unsupported",
		})

		return {
			links,
			shared: false,
			cancelled: false,
			supported: false,
			error: null,
		}
	}

	try {
		const shareData = {
			title: safeString(title, 120) || DEFAULT_SHARE_TITLE,
			text,
		}

		/**
		 * Some browsers expose navigator.share but reject a payload
		 * through canShare. We still attempt the minimal supported payload.
		 */
		if (
			typeof navigator.canShare === "function" &&
			!canShareReceiptData(shareData)
		) {
			onFallback?.(links, {
				reason: "payload-not-supported",
			})

			return {
				links,
				shared: false,
				cancelled: false,
				supported: true,
				error: null,
			}
		}

		await navigator.share(shareData)

		return {
			links,
			shared: true,
			cancelled: false,
			supported: true,
			error: null,
		}
	} catch (error) {
		/**
		 * AbortError means the user deliberately closed/cancelled the
		 * native share sheet.
		 *
		 * This is not an application failure and should not open another
		 * UI automatically.
		 */
		if (error?.name === "AbortError") {
			return {
				links,
				shared: false,
				cancelled: true,
				supported: true,
				error: null,
			}
		}

		/**
		 * Actual Web Share failure.
		 *
		 * The caller receives fallback actions.
		 */
		onFallback?.(links, {
			reason: "share-failed",
			error,
		})

		return {
			links,
			shared: false,
			cancelled: false,
			supported: true,
			error:
				error instanceof Error ? error : new Error("Receipt sharing failed"),
		}
	}
}

/* -------------------------------------------------------------------------- */
/* Convenience helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Build all share data without invoking any browser API.
 *
 * Useful for:
 * - menus
 * - tests
 * - previews
 * - analytics
 * - native/mobile bridges
 */
export function getReceiptShareOptions(invoiceData = {}, options = {}) {
	const links = buildSendLinks(invoiceData, {
		...options,
		phone:
			options.phone ?? invoiceData?.customer_phone ?? invoiceData?.phone ?? "",
		email:
			options.email ?? invoiceData?.customer_email ?? invoiceData?.email ?? "",
	})

	return {
		text: buildShareText(invoiceData, options),
		links,
		canWebShare: canWebShare(),
	}
}
