/**
 * =============================================================================
 * DyPOS — PIN field rules for the login page
 * =============================================================================
 * The keypad on the login page is three inputs and a setup form, and the rules
 * governing them were inline in a 2000-line SFC: a length range, a digits-only
 * filter, a confirmation match, and the human sentence for each failure. They
 * belong together because they are one contract — "what counts as a valid PIN"
 * — and a range changed in one place while the filter still allowed the old
 * maximum is a bug that no type checker and no markup test can see.
 *
 * Extraction also puts the rules under test. The 4..8 range and the digits-only
 * filter are now asserted directly rather than being visible only as
 * `maxlength` attributes a reviewer has to notice.
 * =============================================================================
 */

/** Shortest PIN the login page accepts. */
export const PIN_MIN_LENGTH = 4

/**
 * Longest PIN the login page accepts.
 *
 * The bound exists for more than tidiness: a cashier can type into a keypad
 * field forever, and an unbounded PIN turns every attempt into a PBKDF2
 * operation over attacker-chosen input. It also matches the visible keypad, so
 * the cap is a UI constant and a cost constant at once.
 */
export const PIN_MAX_LENGTH = 8

/** How long a locally stored PIN stays valid. */
export const PIN_EXPIRY_MS = 60 * 60 * 1000

/**
 * Strip everything that is not a digit and cap the result.
 *
 * The filter runs before the hash for a reason: PBKDF2 should never see a
 * string the keypad could not have produced.
 *
 * @param {unknown} value raw field value
 * @returns {string} digits only, at most PIN_MAX_LENGTH of them
 */
export function sanitizePin(value) {
	return String(value ?? "")
		.replace(/\D/g, "")
		.slice(0, PIN_MAX_LENGTH)
}

/**
 * Validate a proposed PIN and its confirmation.
 *
 * Returns the Arabic sentence to show, or `null` when the pair is acceptable —
 * a null return is the success case so a caller cannot accidentally render an
 * empty error on success.
 *
 * @param {string} code the entered PIN
 * @param {string} confirmation the re-entered PIN
 * @returns {string|null} Arabic error message, or null when valid
 */
export function validatePinPair(code, confirmation) {
	if (String(code ?? "").length < PIN_MIN_LENGTH) {
		return `كود PIN يجب أن يكون ${PIN_MIN_LENGTH} خانات على الأقل`
	}
	if (code !== confirmation) {
		return "كودا PIN غير متطابقين"
	}
	return null
}
