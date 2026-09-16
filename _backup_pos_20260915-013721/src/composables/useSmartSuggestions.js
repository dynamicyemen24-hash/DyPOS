import { defineStore } from "pinia"
import { ref, computed } from "vue"
import { useItemSearchStore } from "@/stores/itemSearch"
import { logger } from "@/utils/logger"

const log = logger.create("SmartSuggestions")

/**
 * Store for intelligent search suggestions based on user purchase history
 * and item popularity. This enhances the cashier's speed by predicting
 * what they are likely to scan next.
 */
export const useSmartSuggestionsStore = defineStore("smartSuggestions", () => {
	const itemSearchStore = useItemSearchStore()

	// Cached recent scans: array of item_codes, most recent first. Max 50.
	const recentScans = ref([])
	// Frequency map of scanned item_codes across the session.
	const scanFrequency = ref({})

	/**
	 * Record a successful scan to update frequency maps.
	 * @param {string} itemCode - The item code that was scanned.
	 */
	function recordScan(itemCode) {
		const code = String(itemCode ?? "").trim()
		if (!code) return

		// Update frequency
		scanFrequency.value[code] = (scanFrequency.value[code] || 0) + 1

		// Update recent list (move to front if exists, else prepend)
		recentScans.value = [
			code,
			...recentScans.value.filter((existing) => existing !== code),
		].slice(0, 50)

		log.debug("Recorded scan", {
			itemCode: code,
			freq: scanFrequency.value[code],
		})
	}

	/**
	 * Derive smart suggestions: recent unique items first, then popular items.
	 * Filters out items not in the current item cache.
	 * @param {string} currentQuery - The current text in the search box.
	 * @returns {Promise<Array>} List of suggested item objects (async due to getItem lookup).
	 */
	const getSmartSuggestions = computed(() => {
		return async (currentQuery) => {
			const query = String(currentQuery ?? "").trim()

			// If query is empty/whitespace, show recently scanned items.
			if (!query) {
				const recentItems = await Promise.all(
					recentScans.value
						.slice(0, 5)
						.map((code) =>
							Promise.resolve(itemSearchStore.getItem(code)).catch(() => null),
						),
				)
				return recentItems.filter(Boolean)
			}

			// Get the current search results filtered by query.
			// Note: searchItems is async but does its own internal debouncing.
			let queryResults
			try {
				queryResults = await itemSearchStore.searchItems(query)
			} catch (searchError) {
				log.warn("Search unavailable, returning empty suggestions", {
					searchError,
				})
				return []
			}

			// Boost items that have been scanned recently/frequently.
			return (
				queryResults
					.map((item) => ({
						...item,
						_boostScore: (scanFrequency.value[item.item_code] || 0) * 0.5,
					}))
					.sort((a, b) => {
						// Sort by boost score (popularity) primarily, then by name.
						if (b._boostScore !== a._boostScore) {
							return b._boostScore - a._boostScore
						}
						return a.name.localeCompare(b.name)
					})
					.slice(0, 8)
					// Drop the internal ranking field before exposing to callers.
					.map(({ _boostScore, ...item }) => item)
			)
		}
	})

	/**
	 * Clear all suggestion state (e.g., on logout or session end).
	 */
	function clear() {
		recentScans.value = []
		scanFrequency.value = {}
		log.info("Cleared smart suggestion state.")
	}

	return {
		recentScans,
		scanFrequency,
		recordScan,
		getSmartSuggestions,
		clear,
	}
})

export default useSmartSuggestionsStore
