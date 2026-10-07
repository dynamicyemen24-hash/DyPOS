import { onBeforeUnmount } from "vue"

/**
 * Keeps browser timers out of Vue template expressions. Render-context globals
 * can be renamed by production minification (for example Q.setTimeout), so
 * timer ownership belongs to script/composable scope.
 */
export function useLoginEmailBlur({ showEmailSuggestions, delay = 200 }) {
	let timer = null

	function deferHideEmailSuggestions() {
		if (timer !== null) window.clearTimeout(timer)
		timer = window.setTimeout(() => {
			timer = null
			showEmailSuggestions.value = false
		}, delay)
	}

	function cleanup() {
		if (timer !== null) {
			window.clearTimeout(timer)
			timer = null
		}
	}

	onBeforeUnmount(cleanup)

	return { deferHideEmailSuggestions, cleanup }
}
