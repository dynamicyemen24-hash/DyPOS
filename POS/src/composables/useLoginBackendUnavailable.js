import { computed } from "vue"

/**
 * useLoginBackendUnavailable — backend unavailable banner logic.
 *
 * Shows an informative banner when the edge worker returns 503
 * (UPSTREAM_MISCONFIGURED) but the app is otherwise online and not
 * rate-limited. The banner explains that offline sales work while
 * sync is unavailable.
 */
export function useLoginBackendUnavailable({
	runtimeState,
	isRateLimited,
	isOnline,
	isOfflineMode,
	loginError,
}) {
	const UPSTREAM_MARK = "المزامنة غير متاحة"
	const isBackendUnavailable = computed(() => {
		if (isRateLimited.value !== false) return false
		if (isOnline.value !== true) return false
		if (isOfflineMode.value !== false) return false
		if (runtimeState.value === "failed") return true
		// A 503 during submitLogin leaves runtime "ready" — surface the
		// banner then too so the retry button re-attempts the right step.
		try {
			const message = String(loginError?.value || "")
			return message.includes(UPSTREAM_MARK)
		} catch {
			return false
		}
	})

	return { isBackendUnavailable }
}
