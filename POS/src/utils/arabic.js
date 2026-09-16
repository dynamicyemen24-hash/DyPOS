/**
 * Arabic text normalization for search — DyPOS Quality Suite.
 *
 * Arabic search is notoriously brittle without normalization: users type
 * ى for ي, ة for ه, omit diacritics, or type Arabic-Indic digits (٠-٩).
 * This canonicalizes user input (and optionally stored data) so that
 * "بَيْت" = "بيت" and "123" = "١٢٣" all match. Pure + testable.
 *
 * NOTE: normalization is lossy on purpose — it is for SEARCH tokens only.
 */

const DIACRITICS_PATTERN =
	/[\u064B-\u0652\u0670\u0640\u0653-\u065D\u06DF-\u06E8]/g

const FOLD_MAP = {
	// همزات → أساس الحرف
	"\u0623": "\u0627", // أ → ا
	"\u0625": "\u0627", // إ → ا
	"\u0622": "\u0627", // آ → ا
	"\u0671": "\u0627", // ٱ (alef wasla) → ا
	"\u0624": "\u0648", // ؤ → و
	"\u0626": "\u064A", // ئ → ي
	"\u0621": "", // ء تُسقط
	// تاء التأنيث/الألف المقصورة → أساسها
	"\u0629": "\u0647", // ة → ه
	"\u0649": "\u064A", // ى → ي
}

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669]/g // ٠-٩
const PERSIAN_DIGITS = /[\u06F0-\u06F9]/g // ۰-۹

const ARABIC_DIGIT_MAP = {
	"\u0660": "0",
	"\u0661": "1",
	"\u0662": "2",
	"\u0663": "3",
	"\u0664": "4",
	"\u0665": "5",
	"\u0666": "6",
	"\u0667": "7",
	"\u0668": "8",
	"\u0669": "9",
	"\u06F0": "0",
	"\u06F1": "1",
	"\u06F2": "2",
	"\u06F3": "3",
	"\u06F4": "4",
	"\u06F5": "5",
	"\u06F6": "6",
	"\u06F7": "7",
	"\u06F8": "8",
	"\u06F9": "9",
}

const WHITESPACE_PATTERN = /\s+/g

function applyFold(text) {
	let out = ""
	for (const ch of text) {
		out += FOLD_MAP[ch] !== undefined ? FOLD_MAP[ch] : ch
	}
	return out
}

/**
 * Canonicalize Arabic text for comparisons:
 * NFC → strip diacritics/tatweel → fold hamza/ة/ى → Arabic & Persian digits
 * to Latin → collapse whitespace → lowercase.
 * @param {string} text
 * @returns {string}
 */
export function normalizeArabic(text) {
	if (typeof text !== "string" || text.length === 0) return ""
	let result = text.normalize("NFC")
	result = result.replace(DIACRITICS_PATTERN, "")
	result = applyFold(result)
	result = result.replace(ARABIC_INDIC_DIGITS, (d) => ARABIC_DIGIT_MAP[d] ?? d)
	result = result.replace(PERSIAN_DIGITS, (d) => ARABIC_DIGIT_MAP[d] ?? d)
	result = result.replace(WHITESPACE_PATTERN, " ").trim()
	return result.toLowerCase()
}

/**
 * Normalize a search term AND split it into individual tokens (word-based
 * matching ignores punctuation Arabic users insert casually).
 * @param {string} text
 * @returns {string[]}
 */
export function normalizeSearchTokens(text) {
	const normalized = normalizeArabic(text)
	if (normalized.length === 0) return []
	return normalized
		.split(/[.,\u060C\u061B:!?\u061F()[\]{}%$#@;:"'`~^&*_+|\\/<>=\-\s]+/)
		.filter((token) => token.length > 0)
}

/** Truthiness helper safe for Arabic/Latin mixed content. */
export function isEmptyArabic(text) {
	return typeof text !== "string" || text.trim().length === 0
}

/** Unify a phone number to digits only (for wa.me links & SMS). */
export function digitsOnly(value) {
	if (typeof value !== "string") return ""
	return value.replace(/[^\d]/g, "")
}
