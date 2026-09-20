/**
 * useDebouncedSearch — professional debounced catalog search (VueUse-powered).
 *
 * Uses @vueuse/core useDebounceFn (world-standard, SSR-safe, cancelable).
 * Single choke-point: every catalog/customer search input should debounce
 * through here instead of hand-rolled setTimeout chains.
 */

import { useDebounceFn } from "@vueuse/core"
import { ref } from "vue"

/**
 * @param {(q:string)=>Promise<any>|any} searchFn
 * @param {{delay?:number, minLength?:number}} opts
 */
export function useDebouncedSearch(searchFn, opts = {}) {
	const { delay = 250, minLength = 0 } = opts
	const query = ref("")
	const results = ref([])
	const isSearching = ref(false)
	const error = ref(null)
	let seq = 0

	const run = async (q) => {
		const my = ++seq
		if ((q || "").trim().length < minLength) {
			results.value = []
			isSearching.value = false
			return
		}
		isSearching.value = true
		error.value = null
		try {
			const out = await searchFn(q)
			if (my !== seq) return // stale
			results.value = Array.isArray(out) ? out : (out?.rows ?? out?.items ?? [])
		} catch (e) {
			if (my !== seq) return
			error.value = e
		} finally {
			if (my === seq) isSearching.value = false
		}
	}

	const debounced = useDebounceFn(run, delay)

	function setQuery(q) {
		query.value = q
		debounced(q)
	}

	function cancel() {
		seq++
		isSearching.value = false
		if (typeof debounced.cancel === "function") debounced.cancel()
	}

	return {
		query,
		results,
		isSearching,
		error,
		setQuery,
		cancel,
		runImmediate: run,
	}
}

export default useDebouncedSearch
