/**
 * Declarative field validation with bilingual (Arabic/English) messages.
 *
 * Core `validateField` is pure (injectable `messages`), and `useFieldValidation`
 * wraps it for Vue components the same way ProductManagement.vue does, but in a
 * reusable, consistent shape.
 */

// ---------------------------------------------------------------------------
// Default (fallback) validation messages.
// ---------------------------------------------------------------------------
const DEFAULT_EN = {
	required: "This field is required",
	email: "Enter a valid email address",
	phone: "Enter a valid phone number",
	number: "Enter a valid number",
	positive: "Value must be positive",
	integer: "Value must be a whole number",
	min: "Must be at least {0}",
	max: "Must be at most {0}",
	minLength: "Must be at least {0} characters",
	maxLength: "Must not exceed {0} characters",
	pattern: "Invalid format",
	match: "Values do not match",
	default: "Invalid value",
}

const DEFAULT_AR = {
	required: "هذا الحقل مطلوب",
	email: "أدخل بريدًا إلكترونيًا صحيحًا",
	phone: "أدخل رقم هاتف صحيحًا",
	number: "أدخل رقمًا صحيحًا",
	positive: "يجب أن تكون القيمة موجبة",
	integer: "يجب أن تكون القيمة عددًا صحيحًا",
	min: "يجب أن تكون القيمة {0} على الأقل",
	max: "يجب ألا تزيد القيمة عن {0}",
	minLength: "يجب ألا يقل الحقل عن {0} حرفًا",
	maxLength: "يجب ألا يزيد الحقل عن {0} حرفًا",
	pattern: "الصيغة غير صحيحة",
	match: "القيم غير متطابقة",
	default: "قيمة غير صحيحة",
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9+\-() .]{7,20}$/

const builtinRules = {
	required: (value) => {
		if (typeof value === "number") return Number.isFinite(value) // 0 counts as provided
		if (typeof value === "string") return value.trim().length > 0
		return value != null && value !== ""
	},
	email: (value) =>
		!value || (typeof value === "string" && EMAIL_PATTERN.test(value.trim())),
	phone: (value) =>
		!value || (typeof value === "string" && PHONE_PATTERN.test(value.trim())),
	number: (value) =>
		value === "" || value == null || !Number.isNaN(Number(value)),
	positive: (value) => value === "" || value == null || Number(value) > 0,
	integer: (value) =>
		value === "" || value == null || Number.isInteger(Number(value)),
	min: (value, arg) =>
		value === "" || value == null || Number(value) >= Number(arg),
	max: (value, arg) =>
		value === "" || value == null || Number(value) <= Number(arg),
	minLength: (value, arg) => !value || String(value).length >= Number(arg),
	maxLength: (value, arg) => !value || String(value).length <= Number(arg),
	pattern: (value, arg) =>
		!value ||
		(typeof arg === "string" ? new RegExp(arg) : arg).test(String(value)),
	match: (value, arg) => value === arg,
}

function interpolate(message, args) {
	return typeof message === "string" && Array.isArray(args)
		? message.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ""))
		: message
}

/**
 * Validate a single value against a rules array.
 * @param {*} value
 * @param {Array<{rule:string, arg?:*, message?:string}|string>} rules
 * @param {Object} [opts]
 * @param {string} [opts.locale="en"]
 * @param {function} [opts.message] - `(key, args, locale) => string` custom resolver.
 * @returns {{ valid: boolean, message: string, rule: string|null }}
 */
export function validateField(
	value,
	rules = [],
	{ locale = "en", message } = {},
) {
	const resolveMessage =
		message ||
		((key, args, loc) => {
			const dict = loc === "ar" ? DEFAULT_AR : DEFAULT_EN
			return interpolate(dict[key] ?? dict.default, args)
		})

	for (const entry of rules) {
		const { rule, arg, customMessage } =
			typeof entry === "string" ? { rule: entry } : entry
		const fn = builtinRules[rule]
		if (!fn) continue
		const passes = fn(value, arg)
		if (!passes) {
			const msg =
				customMessage ||
				(typeof message === "function"
					? null
					: resolveMessage(rule, [arg], locale))
			return {
				valid: false,
				message: msg || resolveMessage(rule, [arg], locale),
				rule,
			}
		}
	}
	return { valid: true, message: "", rule: null }
}

/** Helpers to keep rules declarative and inline-readable. */
export const rules = Object.keys(builtinRules).reduce((acc, name) => {
	acc[name] = (arg, message) => ({ rule: name, arg, message })
	return acc
}, {})

rules.email = (message) => ({ rule: "email", message })
rules.phone = (message) => ({ rule: "phone", message })

// ---------------------------------------------------------------------------
// Vue-ready composable
// ---------------------------------------------------------------------------

/**
 * @param {Object} opts
 * @param {import('vue').Ref|import('vue').ComputedRef|any} opts.model - value ref (or accessor fn).
 * @param {Function} [opts.rules] - `(value) => rules[]` or static array.
 * @param {import('vue').Ref<string>} [opts.localeRef] - Reactive locale.
 * @param {Object} [opts.messages] - Custom message resolver overrides.
 * @returns {{ error: import('vue').Ref<string>, valid: import('vue').Ref<boolean>|import('vue').ComputedRef<boolean>,
 *   validate(): {valid:boolean, message:string}, clear(): void, validateOn : Function }}
 */
export function useFieldValidation({
	model,
	rules: rulesGetter = () => [],
	localeRef = null,
	messages = null,
} = {}) {
	const error = ref("")
	const touched = ref(false)

	const ruleList = () =>
		typeof rulesGetter === "function" ? rulesGetter() : rulesGetter || []

	function validate() {
		const value = model?.value
		const res = validateField(value, ruleList(), {
			locale: localeRef?.value || "en",
			message: messages,
		})
		error.value = res.message
		touched.value = true
		return res
	}

	function clear() {
		error.value = ""
		touched.value = false
	}

	return {
		error,
		valid: computed(() => !touched.value || error.value === ""),
		validate,
		clear,
		validateOn: (eventName) =>
			typeof eventName === "string" ? { [eventName]: validate } : validate,
	}
}
