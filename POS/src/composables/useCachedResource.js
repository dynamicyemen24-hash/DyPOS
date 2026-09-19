/**
 * =============================================================================
 * DyPOS — Unified Cached Resource (SWR for POS reads)
 * =============================================================================
 *
 * Single reactive façade over `memoizeAsync` for every POS read (item groups,
 * brands, settings, sales persons, dashboards…): concurrent callers share one
 * in-flight promise, stale values keep the UI instant while a background
 * revalidation refreshes them.
 *
 * Node-safe (no DOM, no lifecycle hooks) so it stays unit-testable under the
 * lightweight vitest `node` environment.
 */

import { computed, ref } from "vue"

import { memoizeAsync } from "@/utils/network"

/**
 * @template T
 * @param {(key: string) => Promise<T>} loader - Executes on cache miss.
 * @param {Object} [opts]
 * @param {number} [opts.ttl=30000] - Stale-while-revalidate window in ms.
 * @param {Function} [opts.shouldCache] - `(value) => boolean`; skip empties.
 * @returns {{ data, error, loading, stale, activeKey, load, refresh, invalidate }}
 */
export function useCachedResource(loader, { ttl = 30000, shouldCache } = {}) {
	if (typeof loader !== "function") {
		throw new TypeError("[useCachedResource] loader must be a function")
	}

	const cache = memoizeAsync({ load: loader, ttl, shouldCache })

	const data = ref(null)
	const error = ref(null)
	const loading = ref(false)
	const stale = ref(false)
	const currentKey = ref(null)

	const activeKey = computed(() => currentKey.value)

	/**
	 * Load `key` (coalesced + SWR). Marks previous data stale while a new
	 * key resolves so the UI can show continuity instead of a blank flash.
	 */
	async function load(key, { refresh = false } = {}) {
		if (refresh) cache.invalidate(key)
		const previousKey = currentKey.value
		currentKey.value = key
		if (previousKey !== null && previousKey !== key) stale.value = true
		loading.value = true
		error.value = null
		try {
			const value = await cache.get(key)
			// A newer load() may have superseded this one — never clobber it.
			if (currentKey.value === key) {
				data.value = value
				stale.value = false
			}
			return value
		} catch (err) {
			if (currentKey.value === key) error.value = err
			throw err
		} finally {
			if (currentKey.value === key) loading.value = false
		}
	}

	/** Reload the active key bypassing the cache. No-op without a key. */
	function refresh() {
		if (currentKey.value == null) return Promise.resolve(null)
		return load(currentKey.value, { refresh: true })
	}

	/** Evict one key (or everything) and flag visible data as stale. */
	function invalidate(key) {
		cache.invalidate(key)
		if (key == null || key === currentKey.value) stale.value = true
	}

	return { data, error, loading, stale, activeKey, load, refresh, invalidate }
}

export default useCachedResource
