/**
 * DyPOS UI Kit — HTTP transport.
 *
 * Single source of truth for every network call the POS makes through the UI
 * kit (`call`, `request`, `createResource`). Design goals:
 *
 *  - **Offline-first** — when the radios report offline we fail in
 *    microseconds with an Arabic, machine-tagged error instead of burning a
 *    15-second timeout per tap. Queued work is handled by the sync engine
 *    (src/utils/offline), never by hanging sockets.
 *  - **Bounded** — every request carries an AbortController timeout, so a dead
 *    backend or captive portal can never freeze the cashier UI.
 *  - **Same-origin only** — no third-party host is ever contacted (AGENTS.md
 *    invariant 8). `credentials: "same-origin"` keeps the session cookie scoped.
 *  - **One error shape** — see ./error.js. Callers never branch on transport
 *    accidents (edge 502 HTML, tunnel restart text, offline).
 */
import {
	buildServerError,
	buildTransportError,
	createOfflineError,
	isDefinitelyOffline,
} from "./error.js"

const DEFAULT_TIMEOUT_MS = 20000
const CSRF_PLACEHOLDER = "{{ csrf_token }}"

/** Method router prefix. Bare method names are resolved under it. */
export const METHOD_PREFIX = "/api/method/"

/**
 * Resolve a bare method name to a same-origin path.
 * @param {string} url
 * @returns {string}
 */
export function resolveUrl(url) {
	if (!url || typeof url !== "string") {
		throw new Error("[dypos-ui] options.url is required")
	}
	if (url.startsWith("/") || /^https?:\/\//i.test(url)) {
		return url
	}
	return `${METHOD_PREFIX}${url}`
}

/**
 * Base headers for every API call (CSRF double-submit + JSON contract).
 * @param {Record<string, string>} [extra]
 * @returns {Record<string, string>}
 */
export function buildHeaders(extra) {
	/** @type {Record<string, string>} */
	const headers = {
		Accept: "application/json",
		"Content-Type": "application/json; charset=utf-8",
	}
	const token = typeof window !== "undefined" ? window.csrf_token : undefined
	if (typeof token === "string" && token && token !== CSRF_PLACEHOLDER) {
		headers["X-DyPOS-CSRF-Token"] = token
	}
	return { ...headers, ...(extra || {}) }
}

/**
 * Perform a bounded, same-origin fetch.
 *
 * @param {string} url       Absolute path or bare method name.
 * @param {object} init      `{ method, body, headers, timeoutMs, signal }`
 * @returns {Promise<Response>}
 */
async function fetchBounded(url, init) {
	if (isDefinitelyOffline()) {
		throw createOfflineError(url)
	}

	const controller = new AbortController()
	const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS
	const timer = setTimeout(() => controller.abort(), timeoutMs)

	// Honour an upstream abort signal in addition to our own timeout.
	const external = init.signal
	const onExternalAbort = () => controller.abort()
	if (external) {
		if (external.aborted) controller.abort()
		else external.addEventListener("abort", onExternalAbort, { once: true })
	}

	try {
		return await fetch(resolveUrl(url), {
			method: init.method || "GET",
			credentials: "same-origin",
			cache: "no-store",
			headers: buildHeaders(init.headers),
			body: init.body,
			signal: controller.signal,
		})
	} catch (cause) {
		if (controller.signal.aborted && !external?.aborted) {
			const error = buildTransportError(
				new Error(`انتهت مهلة الطلب (${timeoutMs}ms)`),
				url,
			)
			error.code = "ETIMEDOUT"
			throw error
		}
		throw buildTransportError(cause, url)
	} finally {
		clearTimeout(timer)
		external?.removeEventListener("abort", onExternalAbort)
	}
}

/**
 * Read a response body as JSON when possible, else as text.
 * @param {Response} response
 * @returns {Promise<{ json: unknown, text: string }>}
 */
async function readBody(response) {
	const text = await response.text()
	if (!text) return { json: null, text: "" }
	try {
		return { json: JSON.parse(text), text }
	} catch {
		return { json: null, text }
	}
}

/**
 * Unwrap the DyPOS method-router envelope.
 *
 * The router answers `{ message: <payload> }` and, for document endpoints, also
 * spreads the document at the top level. `login` and list responses carrying
 * `docs` are returned whole (short-circuit path, AGENTS.md).
 *
 * @param {unknown} json
 * @param {string} url
 * @returns {unknown}
 */
export function unwrapEnvelope(json, url) {
	if (json == null) return null
	if (typeof json !== "object") return json
	const record = /** @type {Record<string, unknown>} */ (json)
	if (Array.isArray(record.docs) || url === "/api/method/login") {
		return record
	}
	return "message" in record ? record.message : record
}

/**
 * Call a DyPOS method.
 *
 * @param {string} method   Bare method name (e.g. `DyPOS.api.invoices.submit_invoice`)
 *                          or an absolute path.
 * @param {object} [args]   JSON body.
 * @param {object} [options] `{ headers, timeoutMs, signal, onError }`
 * @returns {Promise<any>}  The unwrapped `message` payload.
 */
export async function call(method, args, options = {}) {
	const url = resolveUrl(method)
	const response = await fetchBounded(url, {
		method: "POST",
		body: JSON.stringify(args ?? {}),
		headers: options.headers,
		timeoutMs: options.timeoutMs,
		signal: options.signal,
	})

	const { json, text } = await readBody(response)

	if (!response.ok) {
		throw buildServerError(response, method, text, options)
	}

	return unwrapEnvelope(json, url)
}

/**
 * Generic same-origin JSON request used by the resource engine.
 *
 * @param {object} options `{ url, method, params, headers, timeoutMs, signal }`
 * @returns {Promise<any>} Unwrapped payload.
 */
export async function request(options = {}) {
	const url = resolveUrl(options.url)
	const method = (options.method || "GET").toUpperCase()
	const params = options.params

	let body
	if (params && method !== "GET" && method !== "HEAD") {
		body = JSON.stringify(params)
	}

	let target = url
	if (params && (method === "GET" || method === "HEAD")) {
		const search = new URLSearchParams()
		for (const [key, value] of Object.entries(params)) {
			if (value === undefined || value === null) continue
			search.append(
				key,
				typeof value === "object" ? JSON.stringify(value) : String(value),
			)
		}
		const qs = search.toString()
		if (qs) target += (target.includes("?") ? "&" : "?") + qs
	}

	const response = await fetchBounded(target, {
		method,
		body,
		headers: options.headers,
		timeoutMs: options.timeoutMs,
		signal: options.signal,
	})

	const { json, text } = await readBody(response)

	if (!response.ok) {
		throw buildServerError(response, options.url, text, options)
	}

	return unwrapEnvelope(json, url)
}

export { buildServerError, buildTransportError, createOfflineError }
