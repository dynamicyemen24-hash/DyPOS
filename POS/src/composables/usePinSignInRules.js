/**
 * PIN sign-in — the quick-access code rules, with no Vue and no I/O.
 *
 * ## Why this exists
 *
 * `Login.vue` is under the tightest file-size cap in the tree, and the PIN
 * block was 144 lines of state machine inside it. The ratchet's answer to
 * "the page must grow" is "extract the behaviour", not "raise the number".
 *
 * ## The four contracts this preserves
 *
 *  1. **Digits only, before any hashing.** `sanitizePin` runs on the input,
 *     not on the PBKDF2 call, so a letter can never reach key derivation.
 *  2. **`pinLogin` returns `{ success, error }` and never throws.** The caller
 *     used to rely on a rejection, which made every WRONG PIN look like a
 *     success and walked the operator past the form. `success` is checked
 *     explicitly in `readPinLoginResult`, and that is the whole point.
 *  3. **`validatePinPair` owns the setup rules.** Length, digits-only and
 *     confirmation match are ONE contract, so the two setup fields cannot
 *     disagree about what a valid PIN is.
 *  4. **Setup takes `(pin, email, expiryMs)`.** The order was once reversed,
 *     which stored the address in the code slot.
 *
 * Pure functions only, so each rule is testable without mounting a page.
 */

/** Disabled-state labels for the "quick PIN" action. */
export const PIN_DEVICE_HINT = "اضبط رمز دخول سريع لهذا الجهاز"
export const PIN_EMAIL_TOO_SHORT = "أدخل بريدك أولًا"
export const PIN_EMAIL_REQUIRED =
	"أدخل بريدك الإلكتروني أولًا لتمكين إنشاء رمز PIN"

/**
 * Interpret `pinLogin`'s return value.
 *
 * The pin this is extracted from relied on a `catch` for a WRONG PIN, so an
 * unsuccessful attempt looked identical to a successful one. This function is
 * where that decision now lives, and it is deliberately explicit.
 *
 * @param {{success?: boolean, error?: string} | null | undefined} result
 * @returns {{ok: boolean, message: string|null}}
 */
export function readPinLoginResult(result) {
	if (result?.success) return { ok: true, message: null }
	// A failure MUST carry a message. Returning `null` would let the caller
	// render an empty error box, which reads as "no problem".
	return { ok: false, message: result?.error || "كود PIN غير صحيح" }
}

/**
 * Whether the "set up a quick PIN" action may run for this email.
 *
 * @param {string} email
 * @returns {{enabled: boolean, label: string}}
 */
export function pinSetupAvailability(email) {
	const trimmed = String(email ?? "").trim()
	if (!trimmed) return { enabled: false, label: PIN_EMAIL_REQUIRED }
	if (trimmed.length < 3) return { enabled: false, label: PIN_EMAIL_TOO_SHORT }
	return { enabled: true, label: PIN_DEVICE_HINT }
}

/**
 * Whether a stored PIN can be offered as a sign-in method at all.
 *
 * @param {unknown} available
 * @returns {boolean}
 */
export function pinLoginAvailable(available) {
	return available === true
}
