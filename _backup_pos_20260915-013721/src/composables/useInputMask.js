/**
 * Input Mask composable for Arabic/phone/currency formatting.
 *
 * Provides real-time formatting for:
 *   - Phone numbers (Egyptian format)
 *   - Currency amounts
 *   - Arabic text normalization
 *   - Date inputs
 */

import { ref, watch } from "vue"
import { normalizeArabic, digitsOnly } from "@/utils/arabic"
import { formatArabicPhone, formatArabicNumerals, fromArabicNumerals } from "@/utils/arabicNumbers"

/**
 * Create an input mask for phone numbers.
 * Formats as: 010-XXX-XXXX
 * @param {import('vue').Ref<string>} model - The model ref
 * @returns {Object} Masked input helpers
 */
export function usePhoneMask(model) {
	const formatted = ref("")
	const isFormatting = ref(false)

	function applyMask(value) {
		if (isFormatting.value) return
		isFormatting.value = true

		const digits = digitsOnly(value)
		let result = ""

		if (digits.length <= 4) {
			result = digits
		} else if (digits.length <= 7) {
			result = `${digits.slice(0, 4)}-${digits.slice(4)}`
		} else {
			result = `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7, 11)}`
		}

		formatted.value = result
		isFormatting.value = false
	}

	function onInput(rawValue) {
		const digits = digitsOnly(rawValue)
		if (digits.length > 11) {
			return digits.slice(0, 11)
		}
		applyMask(rawValue)
		return formatted.value
	}

	function clear() {
		formatted.value = ""
	}

	watch(model, (newVal) => {
		if (newVal) {
			const digits = digitsOnly(newVal)
			if (digits.length > 0) {
				applyMask(digits)
			}
		}
	})

	return {
		formatted,
		isFormatting,
		applyMask,
		onInput,
		clear,
		getRawValue() {
			return digitsOnly(formatted.value)
		},
	}
}

/**
 * Create an input mask for currency amounts.
 * Formats as: ١٢٬٣٤٫٥٦ ج.م (Arabic numerals)
 * @param {import('vue').Ref<number>} model - The model ref
 * @param {Object} [opts] - Formatting options
 * @returns {Object} Masked input helpers
 */
export function useCurrencyMask(model, opts = {}) {
	const {
		currencySymbol = "ج.م",
		decimals = 2,
		groupSep = "٬",
		decimalSep = "٫",
	} = opts

	const formatted = ref("")

	function formatValue(value) {
		const num = Number(value)
		if (isNaN(num)) {
			formatted.value = ""
			return ""
		}

		const fixed = num.toFixed(decimals)
		const [intPart, decPart] = fixed.split(".")

		// Group integer part by 3 from right
		const groups = []
		for (let i = intPart.length; i > 0; i -= 3) {
			groups.unshift(intPart.slice(Math.max(0, i - 3), i))
		}
		const formattedInt = groups.join(groupSep)

		const arabicInt = formatArabicNumerals(formattedInt)
		const arabicDec = formatArabicNumerals(decPart)

		const result = `${arabicInt}${decimalSep}${arabicDec}`
		formatted.value = result
		return result
	}

	function onInput(rawValue) {
		const cleaned = rawValue.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
		const num = parseFloat(cleaned)
		if (!isNaN(num)) {
			model.value = num
			formatValue(num)
		} else {
			formatted.value = ""
		}
	}

	function clear() {
		formatted.value = ""
		model.value = 0
	}

	return {
		formatted,
		formatValue,
		onInput,
		clear,
	}
}

/**
 * Create an input mask for Arabic text.
 * Normalizes Arabic text and prevents Latin characters in certain contexts.
 * @param {import('vue').Ref<string>} model - The model ref
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.allowNumbers=true] - Allow Arabic-Indic digits
 * @param {number} [opts.maxLength=null] - Max length
 * @returns {Object} Masked input helpers
 */
export function useArabicTextMask(model, opts = {}) {
	const { allowNumbers = true, maxLength = null } = opts

	const normalized = ref("")

	function normalize(value) {
		let result = value

		// Normalize Arabic text
		result = normalizeArabic(result)

		// Remove Latin letters if not allowed
		if (!allowNumbers) {
			result = result.replace(/[a-zA-Z]/g, "")
		}

		// Enforce max length
		if (maxLength && result.length > maxLength) {
			result = result.slice(0, maxLength)
		}

		return result
	}

	function onInput(value) {
		const result = normalize(value)
		normalized.value = result
		model.value = result
		return result
	}

	function clear() {
		normalized.value = ""
		model.value = ""
	}

	return {
		normalized,
		normalize,
		onInput,
		clear,
	}
}

/**
 * Create a numeric input mask that only accepts Arabic-Indic digits.
 * @param {import('vue').Ref<string>} model
 * @param {Object} [opts]
 * @param {number} [opts.maxLength]
 * @returns {Object}
 */
export function useArabicNumericMask(model, opts = {}) {
	const { maxLength = null } = opts

	function formatValue(value) {
		const digits = String(value).replace(/[^0-9]/g, "")
		if (maxLength && digits.length > maxLength) {
			return digits.slice(0, maxLength)
		}
		return formatArabicNumerals(digits)
	}

	function onInput(rawValue) {
		const digits = String(rawValue).replace(/[^0-9]/g, "")
		const formatted = formatValue(digits)
		model.value = formatted
		return formatted
	}

	function getNumericValue() {
		return parseInt(fromArabicNumerals(model.value || ""), 10) || 0
	}

	return {
		formatValue,
		onInput,
		getNumericValue,
	}
}

/**
 * Format a value as it's typed (for display in inputs).
 * Supports phone, currency, and numeric formats.
 */
export function createInputFormatter(type, opts = {}) {
	switch (type) {
		case "phone":
			return usePhoneMask(opts.model)
		case "currency":
			return useCurrencyMask(opts.model, opts)
		case "arabic-text":
			return useArabicTextMask(opts.model, opts)
		case "arabic-numeric":
			return useArabicNumericMask(opts.model, opts)
		default:
			return {
				formatted: ref(""),
				onInput: (v) => v,
				clear: () => {},
			}
	}
}

export default {
	usePhoneMask,
	useCurrencyMask,
	useArabicTextMask,
	useArabicNumericMask,
	createInputFormatter,
}