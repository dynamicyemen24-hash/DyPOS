import { computed, ref, watch } from "vue"
import { usePOSSettingsStore } from "@/stores/posSettings"
import {
	getCachedPaymentMethods,
	cachePaymentMethodsFromServer,
	getSetting,
	setSetting,
} from "@/utils/offline/cache"
import { offlineState } from "@/utils/offline/offlineState"
import { logger } from "@/utils/logger"

const log = logger.create("PaymentMethods")

const PAYMENT_METHODS_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

const paymentMethodsCache = null
const cacheTimestamp = 0

/**
 * Check if we're online (uses centralized offlineState)
 */
function isOnline() {
	if (typeof window === "undefined") return false
	return !offlineState.isOffline
}

/**
 * Load payment methods from cache (localStorage + IndexedDB)
 * @returns {Promise<Array|null>} Cached payment methods or null if not available/expired
 */
async function loadPaymentMethodsFromCache() {
	try {
		// Try localStorage cache first
		const cached = localStorage.getItem("DyPOS_payment_methods_cache")
		if (cached) {
			const { data, timestamp, posProfile } = JSON.parse(cached)
			const posSettingsStore = usePOSSettingsStore()
			const currentProfile = posSettingsStore.posProfile || "default"

			if (
				posProfile === currentProfile &&
				Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000
			) {
				return data
			}
		}
		return null
	} catch {
		return null
	}
}

/**
 * Cache payment methods to localStorage
 */
async function cachePaymentMethodsLocally(posProfile, data) {
	try {
		localStorage.setItem(
			"DyPOS_payment_methods_cache",
			JSON.stringify({
				data,
				timestamp: Date.now(),
				posProfile,
			}),
		)
	} catch (e) {
		// Ignore cache write failures
	}
}

/**
 * Load payment methods from IndexedDB cache
 */
async function loadPaymentMethodsFromIndexedDB(posProfile) {
	try {
		const { getCachedPaymentMethods } = await import("@/utils/offline/cache")
		return await getCachedPaymentMethods(posProfile)
	} catch {
		return []
	}
}

/**
 * Load payment methods from server and cache locally
 */
async function loadPaymentMethodsFromServer(posProfile) {
	try {
		const { cachePaymentMethodsFromServer } = await import(
			"@/utils/offline/cache"
		)
		const result = await cachePaymentMethodsFromServer(posProfile)
		return result.payment_methods || result
	} catch {
		return []
	}
}

/**
 * usePaymentMethods - Reactive payment methods loader with offline-first strategy
 *
 * Priority:
 * 1. localStorage cache (fastest, 7-day TTL)
 * 2. IndexedDB cache (persistent, survives browser restart)
 * 3. Server (when online, then caches to both)
 * 4. Fallback to minimal hardcoded defaults (never empty)
 *
 * @param {Object} options
 * @param {import("vue").Ref<string>} options.posProfile - Reactive POS profile name
 * @returns {Object} { paymentMethods, isLoading, loadPaymentMethods }
 */
export function usePaymentMethods({ posProfile }) {
	const paymentMethods = ref([])
	const isLoading = ref(false)
	const lastError = ref(null)

	// Fallback defaults - never empty so UI never breaks
	const DEFAULT_PAYMENT_METHODS = [
		{ id: "cash", label: "نقدي", icon: "credit-card" },
		{ id: "card", label: "بطاقة", icon: "credit-card" },
		{ id: "mixed", label: "دفع مختلط", icon: "layers" },
	]

	async function loadPaymentMethods() {
		if (isLoading.value) return

		isLoading.value = true
		lastError.value = null

		try {
			const posSettingsStore = usePOSSettingsStore()
			const profile =
				posProfile.value || posSettingsStore.posProfile || "default"

			// 1. Try localStorage cache (fastest)
			let methods = await loadPaymentMethodsFromCache()
			if (methods && methods.length > 0) {
				paymentMethods.value = methods
				isLoading.value = false
				return methods
			}

			// 2. Try IndexedDB cache (persistent)
			methods = await loadPaymentMethodsFromIndexedDB(profile)
			if (methods && methods.length > 0) {
				paymentMethods.value = methods
				await cachePaymentMethodsLocally(profile, methods)
				isLoading.value = false
				return methods
			}

			// 3. Try server if online
			if (typeof window !== "undefined" && navigator.onLine) {
				methods = await loadPaymentMethodsFromServer(profile)
				if (methods && methods.length > 0) {
					paymentMethods.value = methods
					await cachePaymentMethodsLocally(profile, methods)
					isLoading.value = false
					return methods
				}
			}

			// 4. Fallback to defaults (never empty)
			paymentMethods.value = DEFAULT_PAYMENT_METHODS
		} catch (error) {
			lastError.value = error
			paymentMethods.value = DEFAULT_PAYMENT_METHODS
		} finally {
			isLoading.value = false
		}

		return paymentMethods.value
	}

	// Watch for profile changes
	watch(
		() => posProfile.value,
		() => {
			paymentMethods.value = []
			loadPaymentMethods()
		},
	)

	// Initial load
	loadPaymentMethods()

	return {
		paymentMethods: computed(() => paymentMethods.value),
		isLoading,
		lastError,
		loadPaymentMethods,
	}
}

// Default export for convenience
export default usePaymentMethods
