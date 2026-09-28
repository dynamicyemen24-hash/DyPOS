/**
 * =============================================================================
 * DyPOS — Countdown derivation for the login overlays
 * =============================================================================
 * Both overlays on the login page (the lockout banner and the expiring-session
 * dialog) show a number of *seconds*, and both computed it in the template.
 * That is where two of the three defects in this release lived:
 *
 *   - `Math.ceil(sessionTimeout.timeRemaining / 1000)` — `useSessionTimeout`
 *     returns an object *of refs*, and `<script setup>` unwraps only top-level
 *     bindings. The template therefore divided a ref object by 1000, which is
 *     `NaN`, and the dialog printed the literal text "NaN" inside a sentence
 *     whose subject is a number of seconds.
 *   - `sessionTimeout.showWarning` — the same ref object is always truthy, so
 *     the dialog's `v-if` never went false and it stood over the login form on
 *     every load, for users who had just arrived.
 *   - `rateLimitState.retryAfterMs` — the same nested-ref shape, and on top of
 *     it `getState()` never returned the key (fixed at its source in
 *     rateLimiterEnhanced.js, where `check()` already returned it).
 *
 * So: convert to a number here, exactly once, and coerce defensively. A
 * countdown that cannot be computed renders `0` — it never renders `NaN` into
 * an Arabic sentence. `Number.isFinite` makes that a property of this module
 * rather than of every future caller's care.
 * =============================================================================
 */
import { computed, isRef } from "vue"

/**
 * Whole seconds remaining, floored at 0.
 *
 * A non-finite or non-positive input is not an error worth surfacing: an
 * overlay that cannot count down correctly shows `0`. `Number.isFinite` is
 * what keeps a `null` / `undefined` / string source from becoming `NaN` in
 * the view.
 *
 * @param {import("vue").Ref<number>|number} source milliseconds remaining
 * @returns {import("vue").ComputedRef<number>} seconds remaining, 0 when unknown
 */
export function useSecondsRemaining(source) {
	const read = () => (isRef(source) ? source.value : source)
	return computed(() => {
		// A boolean is a real trap here: `Number(true)` is `1`, so a truthy flag
		// piped into this by mistake would render "1 ثانية" — a confident,
		// wrong answer rather than an obvious failure. Reject non-numbers
		// outright, then coerce the numeric ones (JSON and localStorage hand
		// back strings, and rejecting those would show "0 ثانية" to a user who
		// is genuinely locked out).
		const raw = read()
		if (typeof raw === "boolean") return 0
		const ms = Number(raw)
		return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0
	})
}
