import { ref, onMounted, onUnmounted } from "vue"

/**
 * Composable to reactively track a media query
 * @param {string} query - The media query string (e.g., "(max-width: 768px)")
 * @returns {Ref<boolean>} True if the media query matches
 */
export function useMediaQuery(query) {
	const matches = ref(false)

	let mediaQuery = null

	onMounted(() => {
		if (typeof window !== "undefined" && window.matchMedia) {
			mediaQuery = window.matchMedia(query)
			matches.value = mediaQuery.matches

			const handler = (event) => {
				matches.value = event.matches
			}

			mediaQuery.addEventListener("change", handler)

			matches._cleanup = () => {
				mediaQuery.removeEventListener("change", handler)
			}
		}
	})

	onUnmounted(() => {
		if (matches._cleanup) {
			matches._cleanup()
		}
	})

	return matches
}