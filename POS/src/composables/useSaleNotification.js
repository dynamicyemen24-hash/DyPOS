/**
 * Auto-dismiss sale notification — extracted from `pages/POSSale.vue`.
 *
 * The screen showed its toast by hanging a `timeout` property on the
 * `showNotification` function itself (`showNotification.timeout`) and clearing
 * it in three places: the unmount handler, the next call, and nowhere else —
 * so a pending timer could outlive the page. Under the file-size ratchet the
 * 13-line body moved here; the semantics are byte-for-byte the same one
 * notification with a 3500ms auto-dismiss, newest call restarting the clock.
 *
 * Pure factory: no component lifecycle, so it is trivially testable
 * (`tests/saleNotification.test.js`). The caller owns the timer lifetime —
 * call `dispose()` on unmount, exactly where `POSSale.vue` used to clear
 * `showNotification.timeout`.
 *
 * Usage:
 *   const { notification, showNotification, dispose } = createSaleNotification()
 *   showNotification("تم إتمام عملية البيع بنجاح", "success")
 *
 * Additional: the composable dispatches a global event
 * `dypos:show-prof-notif` whenever `showNotification` is called, allowing
 * other parts of the app (e.g. the professional notification bar) to react.
 */
import { ref } from "vue"

export const SALE_NOTIFICATION_TTL = 3500
export const PROFESSIONAL_NOTIF_EVENT = "dypos:show-prof-notif"

export function createSaleNotification(ttlMs = SALE_NOTIFICATION_TTL) {
	const notification = ref(null)
	let timeoutId = 0

	function showNotification(message, type = "info") {
		notification.value = {
			id: Date.now(),
			message,
			type,
		}

		window.clearTimeout(timeoutId)

		timeoutId = window.setTimeout(() => {
			notification.value = null
		}, ttlMs)

		// Dispatch a global event so the professional notification bar can react
		try {
			window.dispatchEvent(
				new CustomEvent(PROFESSIONAL_NOTIF_EVENT, {
					detail: { message, type },
				}),
			)
		} catch {
			// window may not be available (e.g. SSR) — ignore
		}
	}

	/** Drop the visible notification and cancel its pending dismiss. */
	function clear() {
		window.clearTimeout(timeoutId)
		timeoutId = 0
		notification.value = null
	}

	/** Cancel only the pending dismiss (the visible notification stays). */
	function dispose() {
		window.clearTimeout(timeoutId)
		timeoutId = 0
	}

	return { notification, showNotification, clear, dispose }
}
