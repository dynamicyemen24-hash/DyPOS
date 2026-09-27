/**
 * DyPOS UI Kit — resource engine.
 *
 * `createResource()` is the declarative data primitive used across the POS
 * (71 call sites). It is deliberately NOT a cache-first store: the POS has a
 * real offline database (Dexie, `src/utils/offline`) and a real sync queue. This
 * engine owns exactly three things:
 *
 *   1. request lifecycle — `loading` / `data` / `error` / `fetched` / `promise`
 *   2. parameter shaping — `makeParams`, `validate`, `transform`
 *   3. optional snapshot — `cache: [...]` persists the LAST GOOD payload to
 *      IndexedDB and replays it on the next cold start, which is what makes a
 *      dashboard usable on a terminal that boots with no connectivity.
 *
 * Contract preserved from the previous implementation (AGENTS.md invariant 4):
 * members `data previousData loading fetched error promise auto params`
 * and methods `fetch reload submit reset update setData`.
 */
import { reactive, toRaw } from "vue"
import { getConfig } from "../utils/config.js"
import { debounce } from "../utils/debounce.js"
import { getLocal, saveLocal } from "../utils/localCache.js"
import { request as defaultRequest } from "../utils/request.js"

/** @type {Record<string, unknown>} */
const cached = Object.create(null)

/**
 * Normalise the `cache` option into a stable string key.
 * @param {unknown} cacheKey
 * @returns {string|null}
 */
export function getCacheKey(cacheKey) {
	if (!cacheKey) return null
	return JSON.stringify(Array.isArray(cacheKey) ? cacheKey : [cacheKey])
}

/**
 * Look up a live (or previously created) resource by cache key.
 * @param {unknown} cacheKey
 * @returns {unknown|null}
 */
export function getCachedResource(cacheKey) {
	const key = getCacheKey(cacheKey)
	return key ? (cached[key] ?? null) : null
}

/**
 * Structured-clone-safe deep copy of plain data.
 * @template T
 * @param {T} value
 * @returns {T|null}
 */
function snapshot(value) {
	if (value === null || typeof value !== "object") return value
	try {
		return JSON.parse(JSON.stringify(toRaw(value)))
	} catch {
		return null
	}
}

/**
 * Create a reactive resource bound to one DyPOS method.
 *
 * @param {object|string} options Resource options, or a bare method name.
 * @param {object} [vm] Component instance (`this` for the lifecycle hooks).
 * @returns {object} Reactive resource handle.
 */
export function createResource(options, vm) {
	const opts = (typeof options === "string" ? { url: options } : options) || {}

	const cacheKey = getCacheKey(opts.cache)
	if (cacheKey && cached[cacheKey]) {
		const existing = /** @type {any} */ (cached[cacheKey])
		if (existing.auto) existing.reload()
		return existing
	}

	const run = function run(params, tempOptions = {}) {
		return fetchResource(params, tempOptions)
	}

	const fetchFunction = opts.debounce ? debounce(run, opts.debounce) : run

	const out = reactive({
		method: opts.method,
		url: opts.url,
		data: opts.initialData || null,
		previousData: null,
		loading: false,
		fetched: false,
		error: null,
		promise: null,
		auto: opts.auto,
		params: null,
		fetch: fetchFunction,
		reload: fetchFunction,
		submit: fetchFunction,
		reset,
		update,
		setData,
	})

	async function fetchResource(inputParams, tempOptions = {}) {
		const resourceFetcher =
			opts.resourceFetcher || getConfig("resourceFetcher") || defaultRequest

		// A DOM event bubbled into `fetch()` is never a parameter object.
		let effectiveParams = inputParams instanceof Event ? null : inputParams
		effectiveParams = effectiveParams ?? out.params
		if (opts.makeParams) {
			effectiveParams = opts.makeParams.call(vm, effectiveParams)
		}

		out.params = effectiveParams
		out.previousData = snapshot(out.data)
		out.loading = true
		out.error = null

		opts.onFetch?.call(vm, out.params)
		opts.beforeSubmit?.call(vm, out.params)
		tempOptions.beforeSubmit?.call(vm, out.params)

		const validateFn = tempOptions.validate || opts.validate
		if (validateFn) {
			try {
				const invalidMessage = await validateFn.call(vm, out.params)
				if (invalidMessage && typeof invalidMessage === "string") {
					throw new Error(invalidMessage)
				}
			} catch (error) {
				await handleError(error, [opts.onError, tempOptions.onError])
				return out.data
			}
		}

		try {
			out.promise = resourceFetcher({
				...opts,
				onError: undefined,
				params: params || opts.params,
			})
			const data = await out.promise
			if (cacheKey) void saveLocal(cacheKey, data)
			out.data = applyTransform(data)
			out.fetched = true
			opts.onSuccess?.call(vm, data)
			tempOptions.onSuccess?.call(vm, data)
			opts.onData?.call(vm, data)
			tempOptions.onData?.call(vm, data)
		} catch (error) {
			await handleError(error, [opts.onError, tempOptions.onError])
		}

		out.loading = false
		return out.data
	}

	/**
	 * @param {unknown} error
	 * @param {Array<Function|undefined>} handlers
	 */
	async function handleError(error, handlers) {
		out.loading = false
		// Keep showing the last good payload instead of blanking the screen.
		if (out.previousData) out.data = out.previousData
		out.error = error

		for (const fn of handlers) fn?.call(vm, error)

		if (handlers.every((fn) => fn == null)) {
			const fallback = getConfig("fallbackErrorHandler")
			if (typeof fallback === "function") {
				try {
					fallback(error)
				} catch {
					// A throwing error handler must not mask the original error.
				}
			}
		}

		return error
	}

	/**
	 * Apply the optional `transform` hook.
	 * @param {unknown} data
	 */
	function applyTransform(data) {
		if (opts.transform) {
			const value = opts.transform.call(vm, data)
			if (value != null) return value
		}
		return data
	}

	/**
	 * Overwrite the payload locally: `setData(next)` or `setData(d => d.filter(...))`.
	 * @param {unknown|((current: unknown) => unknown)} data
	 */
	function setData(data) {
		out.data = applyTransform(
			typeof data === "function" ? data.call(vm, out.data) : data,
		)
	}

	/** Reset to the declared initial state. */
	function reset() {
		out.data = opts.initialData || null
		out.previousData = null
		out.loading = false
		out.fetched = false
		out.error = null
		out.params = null
		out.auto = opts.auto
	}

	/**
	 * Change the target method in place (used by dynamic screens).
	 * @param {{ method?: string, url?: string, params?: unknown, auto?: boolean }} [next]
	 */
	function update({ method, url, params, auto } = {}) {
		if (method && method !== opts.method) out.method = method
		if (url && url !== opts.url) out.url = url
		if (params && params !== opts.params) out.params = params
		if (auto !== undefined && auto !== out.auto) out.auto = auto
	}

	if (cacheKey && !cached[cacheKey]) {
		cached[cacheKey] = out
		// Offline-first: replay the last good snapshot as soon as it is read,
		// so a terminal that boots offline still renders real data.
		void getLocal(cacheKey).then((data) => {
			if (data != null && (out.loading || !out.fetched)) {
				setData(data)
				opts.onData?.call(vm, data)
			}
		})
	}

	if (opts.auto) out.fetch()

	return out
}
