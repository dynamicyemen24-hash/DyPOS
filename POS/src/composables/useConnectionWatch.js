/**
 * POS connection state — the browser's online/offline events.
 *
 * Extracted from `pages/POSSale.vue`, where the pair plus its two addEventListener
 * lines and their two removals were four separate facts about the same thing:
 * a listener registered in `onMounted` and forgotten in `onBeforeUnmount` is an
 * offline POS that keeps writing to a ref nobody reads. The composable owns the
 * registration, so the teardown cannot be dropped without failing the test below.
 *
 * Pure with respect to the page: it only writes the two refs it is handed.
 *
 * @param {{ value: boolean }} isOnline
 * @param {{ value: string }} syncState — set to "ready" / "offline" on transition
 * @returns {{ handleOnline: () => void, handleOffline: () => void }}
 */
export function useConnectionWatch(isOnline, syncState) {
	function handleOnline() {
		isOnline.value = true

		syncState.value = "ready"
	}

	function handleOffline() {
		isOnline.value = false

		syncState.value = "offline"
	}

	return { handleOnline, handleOffline }
}
