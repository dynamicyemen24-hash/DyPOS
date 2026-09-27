/**
 * Paged report queries — the denominator behind every number a report shows.
 *
 * ## Why this exists
 *
 * `dypos.client.get_list` clamps a page to 500 rows (and to 50 when the caller
 * asks for `limit: 0`, which is what the report layer used to send). So a month
 * with 1,200 invoices was summarised from the FIRST 50 — oldest first — and the
 * KPI was labelled "Total Revenue". That is a wrong financial number with a
 * confident label, which is the worst failure mode in this repo.
 *
 * Two ways out, and only one honest:
 *
 *   1. Fetch every page (what this does) up to an explicit, logged bound.
 *   2. Stop at one page and admit it — `truncated: true` + the real `total` so
 *      the UI can say "N من M" instead of implying a whole-period total.
 *
 * The bound is a client safety limit, not a product limit: hitting it is logged
 * and surfaced, never silent. `dypos.client.get_count` supplies the denominator
 * through the SAME filter pipeline (see `buildWhereFor` in routes/method.js), so
 * the count can never describe a different query than the list.
 */
import { logger } from "@/utils/logger"
import { methodCall, methodGetListWithSource } from "@/utils/methodClient"
import { DATA_SOURCE } from "@/utils/offline/localMirror"
import { isServerBacked, unavailableReason } from "./reportDoctypes"

const log = logger.create("PagedQuery")

/** The server's own page cap; asking for more would be clamped anyway. */
export const PAGE_SIZE = 500

/** Client safety bound — a month with 40k invoices must not OOM a terminal. */
export const MAX_ROWS = 20000

/**
 * Fetch every page of a doctype, or stop at {@link MAX_ROWS} and say so.
 *
 * @param {string} doctype
 * @param {object} [options] `fields`, `filters`, `orderBy` (as get_list takes)
 * @returns {Promise<{rows: Array, source: string, truncated: boolean,
 *   total: number|null, reason: string|null}>}
 */
export async function pagedList(doctype, options = {}) {
	const { fields, filters = [], orderBy = null } = options

	// A doctype the router cannot map can never answer, not even offline: asking
	// would spend a round-trip to learn what we already know.
	if (!isServerBacked(doctype)) {
		return {
			rows: [],
			source: DATA_SOURCE.UNAVAILABLE,
			truncated: false,
			total: null,
			reason: unavailableReason(doctype),
		}
	}

	const first = await methodGetListWithSource(doctype, {
		fields,
		filters,
		orderBy,
		limit: PAGE_SIZE,
	})
	if (first.source !== DATA_SOURCE.SERVER) {
		// Offline: the local mirror returns the whole cached table in one read,
		// and there is no server page to walk.
		return {
			rows: first.rows,
			source: first.source,
			truncated: false,
			total: first.rows.length || null,
			reason: null,
		}
	}

	const rows = [...first.rows]
	const total = await countRows(doctype, fields, filters, orderBy)

	while (
		rows.length < MAX_ROWS &&
		typeof total === "number" &&
		rows.length < total
	) {
		const page = await methodGetListWithSource(doctype, {
			fields,
			filters,
			orderBy,
			limit: PAGE_SIZE,
			offset: rows.length,
		})
		if (page.source !== DATA_SOURCE.SERVER || page.rows.length === 0) break
		rows.push(...page.rows)
	}

	const truncated =
		typeof total === "number" ? rows.length < total : rows.length >= MAX_ROWS
	if (truncated) {
		log.warn("report query stopped at the client safety bound", {
			doctype,
			loaded: rows.length,
			total,
			bound: MAX_ROWS,
		})
	}
	return { rows, source: DATA_SOURCE.SERVER, truncated, total, reason: null }
}

/**
 * The denominator. A count that failed must never be turned into a confident
 * total, so it is `null` — "unknown", which the caller must handle.
 */
async function countRows(doctype, fields, filters, orderBy) {
	try {
		const response = await methodCall("dypos.client.get_count", {
			doctype,
			filters,
			order_by: orderBy,
		})
		const value = response?.message ?? response
		return Number.isFinite(Number(value)) ? Number(value) : null
	} catch (error) {
		log.warn("count unavailable — truncation cannot be proven", {
			doctype,
			error: String(error),
		})
		return null
	}
}
