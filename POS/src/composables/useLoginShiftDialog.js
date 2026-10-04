import { ref } from "vue"

/**
 * Shift dialog wiring for the login page.
 *
 * Extracted so `Login.vue` stays under its file-size ratchet: the page owns
 * nothing here — the refs and the three transitions (open on
 * `shift-opening-required`, close on `shift-opened`, close on `dialog-closed`)
 * live in one testable closure.
 *
 * @param {object} [options]
 * @param {Function} [options.emit] - page emit (for the `ready` event).
 * @param {object} [options.isRuntimeReady] - ref read for the ready payload.
 */
export function useLoginShiftDialog({ emit, isRuntimeReady } = {}) {
	const shiftDialogOpen = ref(false)
	const shiftOpening = ref(false)

	function openShiftDialog() {
		shiftOpening.value = false
		shiftDialogOpen.value = true
	}

	function onShiftOpened() {
		shiftDialogOpen.value = false
		shiftOpening.value = false
		try {
			emit?.("ready", {
				authenticated: true,
				runtimeReady: isRuntimeReady?.value,
			})
		} catch {
			// Ready emit must never break the dialog close.
		}
	}

	function onShiftDialogClosed() {
		shiftDialogOpen.value = false
		shiftOpening.value = false
	}

	return {
		shiftDialogOpen,
		shiftOpening,
		openShiftDialog,
		onShiftOpened,
		onShiftDialogClosed,
	}
}

export default useLoginShiftDialog
