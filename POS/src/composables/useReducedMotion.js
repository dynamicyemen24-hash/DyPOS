import { ref, onMounted, onUnmounted } from "vue"

/**
 * Composable to detect user's preference for reduced motion
 * @returns {Ref<boolean>} True if user prefers reduced motion
 */
export function useReducedMotion() {
	const prefersReducedMotion = ref(false)

	let mediaQuery = null

	onMounted(() => {
		if (typeof window !== "undefined" && window.matchMedia) {
			mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
			prefersReducedMotion.value = mediaQuery.matches

			const handler = (event) => {
				prefersReducedMotion.value = event.matches
			}

			mediaQuery.addEventListener("change", handler)

			// Store cleanup function
			prefersReducedMotion._cleanup = () => {
				mediaQuery.removeEventListener("change", handler)
			}
		}
	})

	onUnmounted(() => {
		if (prefersReducedMotion._cleanup) {
			prefersReducedMotion._cleanup()
		}
	})

	return prefersReducedMotion
}