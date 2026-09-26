/**
 * Single source of truth for dashboard period + data loading.
 *
 * Every dashboard composes this instead of hand-rolling its own
 * filter refs, cache calls, debounce and refresh wiring. It fixes
 * the defects that duplicated code allowed:
 *
 * 1. Cache keys are namespaced per dashboard (a shared key made
 *    every dashboard read and overwrite every other dashboard's
 *    cached facts).
 * 2. The first load uses the active period instead of loading
 *    unfiltered.
 * 3. A manual refresh bypasses the cache TTL.
 * 4. Cached facts are hydrated so a failed/offline fetch still
 *    renders the last known data (flagged as stale) instead of a
 *    blank screen.
 * 5. The auto-refresh toggle actually drives the refresh timer.
 */
import {
	ref,
	computed,
	watch,
	provide,
	inject,
	isRef,
	onMounted,
	onUnmounted,
} from "vue"
import { useDashboardCache } from "./useDashboardCache"
import { useRealtimeRefresh } from "./realtime-refresh"

const PERIOD_KEY = "dashboardPeriod"

/**
 * Local calendar day (YYYY-MM-DD).
 *
 * `new Date(y, m, 1).toISOString()` is WRONG for every timezone east of UTC
 * (Egypt/UTC+2/+3 included): local midnight is the previous day in UTC, so the
 * period silently started a day early. Format the local components instead.
 */
function localDay(date) {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, "0")
	const d = String(date.getDate()).padStart(2, "0")
	return `${y}-${m}-${d}`
}

function defaultPeriod() {
	const today = new Date()
	return {
		from: localDay(new Date(today.getFullYear(), today.getMonth(), 1)),
		to: localDay(today),
	}
}

export function createDashboardPeriod() {
	const defaults = defaultPeriod()
	const from = ref(defaults.from)
	const to = ref(defaults.to)
	const refreshKey = ref(0)

	function apply(next = {}) {
		if (next.from) from.value = next.from
		if (next.to) to.value = next.to
		refreshKey.value += 1
	}

	function reset() {
		const fresh = defaultPeriod()
		from.value = fresh.from
		to.value = fresh.to
		refreshKey.value += 1
	}

	return { from, to, refreshKey, apply, reset }
}

export function provideDashboardPeriod() {
	const state = createDashboardPeriod()
	provide(PERIOD_KEY, state)
	return state
}

export function useDashboardPeriod() {
	return inject(PERIOD_KEY, null) || createDashboardPeriod()
}

/**
 * @param {Object} options
 * @param {Function} options.fetch - async (filter) => facts
 * @param {string} options.scope - stable cache namespace (required)
 * @param {string[]} [options.doctypes] - doctypes for realtime refresh
 * @param {number} [options.pollInterval=30000] - fallback polling ms
 * @param {number} [options.ttlMinutes=5] - cache freshness window
 * @param {boolean} [options.realtime=true] - enable socket/polling refresh
 * @param {Object|Function} [options.extraFilter] - extra filter values (ref or getter)
 */
export function useDashboardSource(options = {}) {
	const {
		fetch,
		scope,
		doctypes = ["Sales Invoice", "Payment Entry"],
		pollInterval = 30000,
		ttlMinutes = 5,
		realtime = true,
		extraFilter = null,
	} = options

	if (!scope) throw new Error("useDashboardSource requires a cache scope")
	if (typeof fetch !== "function") {
		throw new Error("useDashboardSource requires a fetch function")
	}

	const period = useDashboardPeriod()
	const cache = useDashboardCache({ defaultTTL: ttlMinutes })

	const facts = ref(null)
	const loading = ref(false)
	const error = ref(null)
	const lastLoaded = ref(null)
	const isStale = ref(false)
	const fromCache = ref(false)
	const autoRefresh = ref(false)

	let autoTimer = null
	let debounceTimer = null
	let inflight = null

	// Callers pass one of three shapes and all three must work:
	//   - a function/getter  → called on every read (preferred)
	//   - a ref              → unwrapped via .value
	//   - a reactive()/plain object → read directly
	// The reactive case used to fall through to `undefined`, which silently
	// dropped every extra filter from the request AND from the cache key.
	function readExtraFilter() {
		if (!extraFilter) return {}
		if (typeof extraFilter === "function") return extraFilter()
		if (isRef(extraFilter)) return extraFilter.value
		return extraFilter
	}

	function extraValues() {
		const raw = readExtraFilter()
		return raw && typeof raw === "object" ? { ...raw } : {}
	}

	function currentFilter() {
		return {
			scope,
			from: period.from.value,
			to: period.to.value,
			...extraValues(),
		}
	}

	async function request(filter) {
		loading.value = true
		error.value = null
		try {
			const data = await fetch(filter)
			facts.value = data
			lastLoaded.value = new Date()
			isStale.value = false
			fromCache.value = false
			cache.save(filter, data, ttlMinutes)
			return data
		} catch (err) {
			error.value = err?.message || String(err)
			const fallback = cache.loadStale(filter)
			if (fallback !== null) {
				facts.value = fallback
				isStale.value = true
			}
			throw err
		} finally {
			loading.value = false
		}
	}

	function refresh({ force = false } = {}) {
		const filter = currentFilter()
		if (force) cache.invalidate(filter)

		const hit = cache.load(filter)
		if (hit.fromCache) {
			facts.value = hit.data
			fromCache.value = true
			isStale.value = false
			return Promise.resolve(hit.data)
		}

		if (inflight) return inflight
		inflight = request(filter)
			.promise.catch(() => null)
			.finally(() => {
				inflight = null
			})
		return inflight
	}

	function stopAutoRefresh() {
		if (autoTimer) {
			clearInterval(autoTimer)
			autoTimer = null
		}
	}

	function syncAutoRefresh() {
		stopAutoRefresh()
		if (autoRefresh.value) {
			autoTimer = setInterval(() => refresh({ force: true }), pollInterval)
		}
	}

	function toggleAutoRefresh() {
		autoRefresh.value = !autoRefresh.value
	}

	const {
		mode: rtMode,
		start: startRealtime,
		stop: stopRealtime,
	} = useRealtimeRefresh({
		onRefresh: () => refresh({ force: true }),
		pollInterval,
		doctypes,
	})

	function scheduleReload() {
		if (debounceTimer) clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => refresh({ force: true }), 300)
	}

	// One debounced path for every reload trigger. `period.apply()` bumps
	// refreshKey AND may move from/to, so separate watchers fired the request
	// twice for a single filter change; a single watcher set makes it one fetch.
	watch(
		[period.from, period.to, period.refreshKey, readExtraFilter],
		scheduleReload,
		{ deep: true },
	)
	watch(autoRefresh, syncAutoRefresh)

	const isLoaded = computed(() => facts.value !== null)

	onMounted(() => {
		refresh()
		if (realtime) startRealtime()
	})

	onUnmounted(() => {
		stopAutoRefresh()
		if (debounceTimer) clearTimeout(debounceTimer)
	})

	return {
		facts,
		loading,
		error,
		lastLoaded,
		isLoaded,
		isStale,
		fromCache,
		autoRefresh,
		rtMode,
		filterFrom: period.from,
		filterTo: period.to,
		refreshKey: period.refreshKey,
		refresh,
		toggleAutoRefresh,
	}
}
