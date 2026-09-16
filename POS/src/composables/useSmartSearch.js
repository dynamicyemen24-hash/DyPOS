/**
 * Smart, Arabic-first search composable for item/customer suggestion lists.
 *
 * Combines the existing cache/server search with client-side fuzzy ranking,
 * typo tolerance, and "did you mean" corrections. Kept framework-thin: the
 * composable wraps the pure utils and returns reactive state.
 */

import { computed, ref } from "vue"
import { fuzzyMatch, suggestCorrections, fuzzyScore } from "@/utils/fuzzy"
import { normalizeArabic } from "@/utils/arabic"

/**
 * @param {Object} opts
 * @param {import('vue').Ref<string>} opts.query - Current search term.
 * @param {Function|Array} opts.source - `() => candidates[]` getter OR array.
 * @param {Function} [opts.getText] - `(candidate) => string` field to score.
 * @param {Function} [opts.searchAsync] - `(term) => Promise<Array>` server/cache search.
 * @param {number} [opts.limit=20]
 * @param {number} [opts.debounceMs=200]
 * @param {Array<string>} [opts.dictionary] - Known terms for corrections.
 * @param {number} [opts.minChars=1] - Minimum chars to search.
 * @returns {Object} See inline docs.
 */
export function useSmartSearch({
	query,
	source,
	getText,
	searchAsync,
	limit = 20,
	debounceMs = 200,
	dictionary = [],
	minChars = 1,
} = {}) {
	const results = ref([])
	const corrections = ref([])
	const loading = ref(false)
	const searchedTerm = ref("")
	const usedFuzzy = ref(false)

	const candidates = computed(() => {
		if (Array.isArray(source)) return source
		if (typeof source === "function") return source()
		return []
	})

	// Normalized form of the current query (could drive highlighting).
	const normalizedQuery = computed(() => normalizeArabic(query.value || ""))

	let debounceTimer = null
	function debounce(fn) {
		if (debounceMs <= 0) return Promise.resolve(fn())
		return new Promise((resolve) => {
			clearTimeout(debounceTimer)
			debounceTimer = setTimeout(() => resolve(fn()), debounceMs)
		})
	}

	/**
	 * Run the search pipeline. Returns the final results array (for direct use).
	 * @returns {Promise<Array>}
	 */
	async function search() {
		const term = (query.value || "").trim()
		if (term.length < minChars) {
			results.value = []
			corrections.value = []
			usedFuzzy.value = false
			return []
		}

		loading.value = true

		// 1) Local fuzzy ranking over the in-memory candidate set.
		let local = fuzzyMatch(term, candidates.value, {
			getText,
			limit,
			threshold: 0,
			scoreKey: true,
		})
		if (searchAsync && local.length === 0) {
			// 2) Remote/cache search when local pass yields nothing.
			loading.value = true
			try {
				const remote = await searchAsync(term)
				local = (remote || []).map((item) => ({
					...item,
					__score: getText ? fuzzyScore(term, getText(item)) : 100,
				}))
				usedFuzzy.value =
					remote?.length > 0 &&
					fuzzyMatch(term, remote, { getText, limit, threshold: 0 }).length >= 0
			} catch {
				local = []
			}
		} else {
			usedFuzzy.value = true
		}

		results.value = local.slice(0, Math.max(0, limit))
		searchedTerm.value = term

		// 3) Did-you-mean corrections when nothing matched.
		if (results.value.length === 0 && dictionary.length > 0) {
			corrections.value = suggestCorrections(term, dictionary, { limit: 3 })
		} else {
			corrections.value = []
		}

		loading.value = false
		return results.value
	}

	/** Debounced flavor for keystroke-driven input. */
	function searchDebounced() {
		return debounce(search)
	}

	/** Reset transient state. */
	function reset() {
		results.value = []
		corrections.value = []
		usedFuzzy.value = false
		searchedTerm.value = ""
		if (debounceTimer) clearTimeout(debounceTimer)
	}

	return {
		results,
		corrections,
		loading,
		searchedTerm,
		usedFuzzy,
		normalizedQuery,
		search,
		searchDebounced,
		reset,
	}
}
