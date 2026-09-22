/**
 * Features Store — feature-flag gate for the POS shell.
 *
 * Fetches the public-safe subset of server flags from /api/features on init
 * (5s network timeout). Failure/offline NEVER blocks the POS: every exposed
 * flag falls back to its documented default (ON) so cashiers keep working.
 *
 * `enabled(name)` is reactive: components call it inside `computed()` and the
 * value flips the moment init finishes (server truth) or a reconnect refetch
 * lands. `registerFeatureHooks()` wires the browser "online" event so the
 * store refetches after a reconnect (idempotent; returns a cleanup handle).
 */
import { ref } from "vue"
import { defineStore } from "pinia"

/** Mirror of the server's exposed-flag defaults (server/lib/features.js). */
export const OFFLINE_DEFAULTS = {
	OFFLINE_MODE: true,
	PRINT_SPOOL: true,
	REALTIME_STOCK: true,
	CUSTOMER_CRM: true,
	SMART_SEARCH: true,
}

export const FETCH_TIMEOUT_MS = 5000

export const OFFLINE_ERROR_MESSAGE =
	"تعذر تحميل الخصائص — الميزات الافتراضية مفعّلة"

function normalize(name) {
	return String(name ?? "")
		.toUpperCase()
		.replace(/[^A-Z0-9_]/g, "")
}

/** Race `fetch` against a hard timeout. Resolves true on success, false on any failure. */
export function withTimeout(promise, ms = FETCH_TIMEOUT_MS) {
	return Promise.race([
		promise,
		new Promise((resolve) => {
			setTimeout(() => resolve(null), ms)
		}),
	])
}

export const useFeaturesStore = defineStore("features", () => {
	const features = ref({ ...OFFLINE_DEFAULTS })
	const loaded = ref(false)
	const isOffline = ref(false)
	const lastError = ref(null)

	let initEpoch = 0

	/**
	 * Fetch server-exposed flags with a 5s timeout. Offline-safe: resolves
	 * false and resets to defaults ON rather than rejecting.
	 * @returns {Promise<boolean>} true when server values are live
	 */
	function init() {
		const epoch = ++initEpoch
		const applyDefaults = () => {
			features.value = { ...OFFLINE_DEFAULTS }
			loaded.value = true
			isOffline.value = true
			lastError.value = new Error(OFFLINE_ERROR_MESSAGE)
		}
		const timer = setTimeout(() => {
			if (epoch === initEpoch) applyDefaults()
		}, FETCH_TIMEOUT_MS)

		return withTimeout(
			fetch("/api/features", { headers: { accept: "application/json" } })
				.then(async (res) => {
					if (epoch !== initEpoch) return false
					if (!res.ok) throw new Error(`HTTP ${res.status}`)
					const json = await res.json()
					const map = {}
					for (const flag of json.features || []) {
						const name = normalize(flag?.name)
						if (name) map[name] = flag?.enabled !== false
					}
					features.value = { ...OFFLINE_DEFAULTS, ...map }
					loaded.value = true
					isOffline.value = false
					lastError.value = null
					return true
				})
				.catch(() => {
					if (epoch !== initEpoch) return false
					applyDefaults()
					return false
				})
				.finally(() => clearTimeout(timer)),
		).then((ok) => (epoch === initEpoch ? ok === true : false))
	}

	/**
	 * Reactive flag lookup. Unknown flags default ON (offline-safe: the POS must
	 * never be blocked because a flag was renamed server-side).
	 * @param {string} name
	 * @returns {boolean}
	 */
	function enabled(name) {
		const key = normalize(name)
		if (!key) return false
		const value = features.value[key]
		return value === undefined ? true : value !== false
	}

	/** Alias kept for readability at call sites. */
	function isActive(name) {
		return enabled(name)
	}

	function refresh() {
		return init()
	}

	let hookInstalled = false
	let removeOnlineListener = null

	/**
	 * Register the reconnect hook so views reactively switch after the server
	 * comes back. Idempotent: safe to call from multiple entry points.
	 * @returns {{ installed: boolean, cleanup: (() => void)|null }}
	 */
	function registerFeatureHooks() {
		if (hookInstalled) return { installed: false, cleanup: null }
		const onOnline = () => {
			if (isOffline.value) void init()
		}
		if (
			typeof window !== "undefined" &&
			typeof window.addEventListener === "function"
		) {
			window.addEventListener("online", onOnline)
			removeOnlineListener = () => {
				window.removeEventListener("online", onOnline)
				hookInstalled = false
				removeOnlineListener = null
			}
		}
		hookInstalled = true
		return { installed: true, cleanup: () => removeOnlineListener?.() }
	}

	return {
		features,
		loaded,
		isOffline,
		lastError,
		init,
		enabled,
		isActive,
		refresh,
		registerFeatureHooks,
	}
})

export default useFeaturesStore
