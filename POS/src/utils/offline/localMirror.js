/**
 * Local mirror — the offline answer to "the server is unreachable".
 *
 * ## Why this exists
 *
 * The report data layers used to swallow fetch failures and hand callers an
 * empty array (`getList(...).catch(() => [])`). Offline that produced
 * **confident, authoritative, wrong numbers**: an inventory dashboard reading
 * "Total Stock Value 0.00 / Out of Stock 0" while the network was dead, with
 * nothing on screen to say the data never arrived. A zero that means "unknown"
 * is worse than an error — a manager restocking from it decides on fiction.
 *
 * So the data layer now asks a different question: *where did these rows come
 * from?* and reports the answer (`server` | `local` | `unavailable`).
 *
 * ## The mirror
 *
 * The sync layer already caches the doc types the dashboards need
 * (`invoice_history`, `items`, `stock`, `customers` — see `offline/db.js` and
 * `offline/sync.js`). This module reads those tables with the same filter
 * subset the server understands, and **refuses** to answer when it cannot
 * reproduce the query faithfully: an unsupported operator yields
 * `{ ok: false }`, and the caller reports `unavailable` rather than silently
 * summing an unfiltered set.
 *
 * Rule of thumb: a number we cannot prove is not a number we display.
 *
 * @module utils/offline/localMirror
 */
import { logger } from "../logger"

const log = logger.create("LocalMirror")

/** Where a set of report rows came from. */
export const DATA_SOURCE = Object.freeze({
	SERVER: "server",
	LOCAL: "local",
	UNAVAILABLE: "unavailable",
})

/** Doc types this mirror can answer, mapped to their cached table. */
export const MIRRORED_DOCTYPES = Object.freeze({
	"Sales Invoice": "invoice_history",
	Item: "items",
	Bin: "stock",
	Customer: "customers",
})

/** Filter operators the mirror reproduces exactly as the server evaluates them. */
const SUPPORTED_OPS = new Set([
	"=",
	"!=",
	">",
	">=",
	"<",
	"<=",
	"in",
	"like",
	"not like",
])

function toComparable(value) {
	if (value === null || value === undefined) return null
	if (typeof value === "number") return value
	if (typeof value === "boolean") return value ? 1 : 0
	// Dates and ISO strings must stay strings: "2026-09-27" < "2026-10-01" is
	// true lexicographically, which is exactly chronological order — while
	// Number("2026-09-27") would be NaN.
	if (
		value !== "" &&
		Number.isFinite(Number(value)) &&
		!/^\d{4}-\d{2}-\d{2}/.test(String(value))
	) {
		return Number(value)
	}
	return String(value)
}

function likeToRegExp(pattern) {
	const escaped = String(pattern)
		.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		.replace(/%/g, ".*")
		.replace(/_/g, ".")
	return new RegExp(`^${escaped}$`, "i")
}

/**
 * Evaluate one `[field, op, value]` filter against a cached row.
 * @returns {{ok: true, value: boolean}|{ok: false, reason: string}}
 */
export function matchesFilter(row, filter) {
	if (!Array.isArray(filter) || filter.length < 3) {
		return { ok: false, reason: "malformed filter" }
	}
	const [field, op, expected] = filter
	if (typeof field !== "string" || !SUPPORTED_OPS.has(op)) {
		return { ok: false, reason: `unsupported operator ${String(op)}` }
	}
	const actual = row?.[field]
	if (op === "in") {
		if (!Array.isArray(expected))
			return { ok: false, reason: "in expects an array" }
		return {
			ok: true,
			value: expected.some((v) => toComparable(v) === toComparable(actual)),
		}
	}
	if (op === "like" || op === "not like") {
		const matched =
			actual !== null &&
			actual !== undefined &&
			likeToRegExp(expected).test(String(actual))
		return { ok: true, value: op === "like" ? matched : !matched }
	}
	const left = toComparable(actual)
	const right = toComparable(expected)
	if (left === null || right === null) {
		// SQL drops the row on a NULL comparison; the reports never rely on NULL
		// rows counting, so excluding them matches the server.
		return { ok: true, value: op === "!=" }
	}
	switch (op) {
		case "=":
			return { ok: true, value: left === right }
		case "!=":
			return { ok: true, value: left !== right }
		case ">":
			return { ok: true, value: left > right }
		case ">=":
			return { ok: true, value: left >= right }
		case "<":
			return { ok: true, value: left < right }
		case "<=":
			return { ok: true, value: left <= right }
		default:
			return { ok: false, reason: `unsupported operator ${op}` }
	}
}

/** True when `doctype` has a local counterpart. */
export function isMirrored(doctype) {
	return Object.prototype.hasOwnProperty.call(MIRRORED_DOCTYPES, doctype)
}

/**
 * Apply a filter list to rows. All-or-nothing: one unsupported filter makes the
 * whole answer `ok: false` rather than a partial, wrong result.
 */
export function applyFilters(rows, filters = []) {
	let out = rows
	for (const filter of filters) {
		const results = out.map((row) => matchesFilter(row, filter))
		const failed = results.find((r) => !r.ok)
		if (failed) return { ok: false, rows: [], reason: failed.reason }
		out = out.filter((_, i) => results[i].value)
	}
	return { ok: true, rows: out }
}

async function defaultLoadDb() {
	const mod = await import("../offline/db")
	return mod.db
}

/**
 * Read mirrored rows for a doctype.
 *
 * @param {string} doctype
 * @param {{filters?: Array, limit?: number}} [options]
 * @param {{loadDb?: Function}} [deps] injectable so tests never touch IndexedDB
 * @returns {Promise<{ok: boolean, rows: Array, reason?: string, table?: string}>}
 */
export async function readLocalRows(doctype, options = {}, deps = {}) {
	const table = MIRRORED_DOCTYPES[doctype]
	if (!table)
		return { ok: false, rows: [], reason: `no local mirror for ${doctype}` }
	const { filters = [], limit = 0, offset = 0 } = options
	// Validate the filters BEFORE touching IndexedDB: a query we cannot honour
	// must not read the database at all.
	for (const filter of filters) {
		const probe = matchesFilter({}, filter)
		if (!probe.ok) return { ok: false, rows: [], reason: probe.reason }
	}
	try {
		const loadDb = deps.loadDb || defaultLoadDb
		const db = await loadDb()
		if (!db || typeof db.table !== "function") {
			throw new Error("offline database unavailable")
		}
		const all = await db.table(table).toArray()
		const filtered = applyFilters(all, filters)
		if (!filtered.ok) return { ok: false, rows: [], reason: filtered.reason }
		// Same windowing the server applies via `limit_start`/`limit_page_length`,
		// so a paged reader walks identical rows online and offline.
		const start = offset > 0 ? offset : 0
		const rows =
			limit > 0
				? filtered.rows.slice(start, start + limit)
				: filtered.rows.slice(start)
		return { ok: true, rows, table }
	} catch (error) {
		log.warn("local mirror read failed", {
			doctype,
			table,
			error: String(error),
		})
		return { ok: false, rows: [], reason: String(error?.message || error) }
	}
}

/**
 * Aggregate several sources into the weakest one, so a dashboard mixing a
 * server answer with a local one is never presented as fully authoritative.
 */
export function weakestSource(sources) {
	if (sources.includes(DATA_SOURCE.UNAVAILABLE)) return DATA_SOURCE.UNAVAILABLE
	if (sources.includes(DATA_SOURCE.LOCAL)) return DATA_SOURCE.LOCAL
	return DATA_SOURCE.SERVER
}
