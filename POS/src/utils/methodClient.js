/**
 * Method-router client — the single way non-Vue modules reach `/api/method`.
 *
 * Why it exists: dashboards, stores and print utilities used to probe a
 * desk-style global (`window.dypos.call`) that only ever existed when the app
 * ran inside the legacy desk. Standalone/offline that global is undefined, so
 * every report failed with "API not available" and the feature looked broken
 * rather than unconfigured. Resolution order now:
 *
 *   1. a host that injected `window.dypos.call` (legacy embed) — honoured first
 *   2. the first-party DyPOS UI kit `call()` — the supported path
 *
 * If neither is reachable the caller gets a coded error (`NO_DYPOS_API`) so it
 * can degrade (empty dashboards, offline banner) instead of crashing.
 */

/** Error code carried by every "no method client available" failure. */
export const NO_DYPOS_API = "NO_DYPOS_API"

function noClientError() {
	const error = new Error("واجهة DyPOS غير متاحة")
	error.code = NO_DYPOS_API
	return error
}

function deskClient() {
	if (typeof window === "undefined") return null
	const host = window.dypos
	if (!host || typeof host.call !== "function") return null
	// Desk hosts speak the { method, args } object form; normalise it away.
	return (method, args) => host.call({ method, args })
}

let firstPartyClient = null

async function loadFirstPartyClient() {
	if (!firstPartyClient) {
		const kit = await import("dypos-ui")
		firstPartyClient = (method, args) => kit.call(method, args)
	}
	return firstPartyClient
}

/**
 * Call one method-router verb.
 *
 * @param {string} method dotted method path, e.g. "dypos.client.get_list"
 * @param {object} [args] method arguments
 * @returns {Promise<any>} the unwrapped `{ message }` payload
 */
export async function methodCall(method, args = {}) {
	const desk = deskClient()
	if (desk) return desk(method, args)
	const client = await loadFirstPartyClient()
	return client(method, args)
}

/**
 * Same as {@link methodCall} but typed for the `get_list` shape: always hands
 * back an array so a 404/empty response degrades to "no rows" instead of
 * throwing inside a chart builder.
 */
export async function methodGetList(doctype, options = {}) {
	const { fields, filters = [], orderBy = null, limit = 0 } = options
	const response = await methodCall("dypos.client.get_list", {
		doctype,
		fields,
		filters,
		order_by: orderBy,
		limit_page_length: limit,
		limit_start: 0,
	})
	const rows = response?.message ?? response
	return Array.isArray(rows) ? rows : []
}

/** Throws the coded error when no method client can be resolved at all. */
export function assertMethodClientAvailable() {
	if (deskClient()) return true
	if (firstPartyClient) return true
	throw noClientError()
}
