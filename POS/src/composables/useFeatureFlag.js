/**
 * useFeatureFlag — thin Vue composable over the features store.
 *
 * Views call `useFeatureFlag("PRINT_SPOOL")` and bind `enabled` in their
 * template/computed; the boolean is reactive and switches as soon as the
 * store learns the server truth (init) or the connection recovers.
 */
import { computed } from "vue"
import { useFeaturesStore } from "@/stores/features"

/**
 * @param {string} name flag name (case/format-insensitive)
 * @returns {{ flagName: import('vue').ComputedRef<string>, enabled: import('vue').Ref<boolean>, isOffline: import('vue').Ref<boolean>, loaded: import('vue').Ref<boolean>, refresh: () => Promise<boolean>, store: ReturnType<typeof useFeaturesStore> }}
 */
export function useFeatureFlag(name) {
	const store = useFeaturesStore()
	const flagName = computed(() => String(name ?? "").toUpperCase())
	const enabled = computed(() => store.enabled(flagName.value))
	const isOffline = computed(() => store.isOffline)
	const loaded = computed(() => store.loaded)
	const refresh = () => store.refresh()
	return { flagName, enabled, isOffline, loaded, refresh, store }
}

/**
 * Bounded overview of every known exposed flag — for admin/dev toggles that
 * must react to the same store that gates the shell.
 */
export function useExposedFeatureList() {
	const store = useFeaturesStore()
	const features = computed(() => ({ ...store.features }))
	const isOffline = computed(() => store.isOffline)
	const loaded = computed(() => store.loaded)
	const refresh = () => store.refresh()
	return { features, isOffline, loaded, refresh, store }
}

export default useFeatureFlag
