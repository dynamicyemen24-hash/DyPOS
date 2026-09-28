/**
 * =============================================================================
 * DyPOS — "Remember my email" for the login page
 * =============================================================================
 * A cashier signs in on the same terminal all day. Typing the address every time
 * is pure friction on the screen they touch most, so the last address is kept
 * — and every access is guarded, because `localStorage` throws rather than
 * returns in a partitioned / private-mode context, and a login page that
 * crashes on load because a preference could not be read is a cashier standing
 * at a dead terminal.
 * =============================================================================
 */
import { ref } from "vue"

const REMEMBERED_EMAIL_KEY = "dypos.auth.email"

/**
 * Remember (and restore) the last email address on this device.
 *
 * @param {object} [options]
 * @param {boolean} [options.enabled] when false, never read or write storage
 * @param {(scope: string, error: unknown) => void} [options.onError] diagnostic sink
 */
export function useRememberedEmail({ enabled = true, onError } = {}) {
	const email = ref("")
	const rememberMe = ref(true)

	function restore() {
		if (!enabled) return
		try {
			const remembered = window.localStorage.getItem(REMEMBERED_EMAIL_KEY)
			if (remembered) email.value = remembered
		} catch (error) {
			onError?.("DyPOS remembered email unavailable", error)
		}
	}

	/**
	 * Persist or clear the remembered address, following the checkbox.
	 *
	 * Clearing on an unticked box is the half that is easy to forget: a stored
	 * address is a piece of PII, and leaving it behind after the user opted out
	 * would keep it on a shared till.
	 */
	function persist() {
		if (!enabled) return
		try {
			if (rememberMe.value && email.value.trim()) {
				window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.value.trim())
			} else {
				window.localStorage.removeItem(REMEMBERED_EMAIL_KEY)
			}
		} catch (error) {
			onError?.("DyPOS remembered email persistence unavailable", error)
		}
	}

	return { email, rememberMe, restore, persist }
}
