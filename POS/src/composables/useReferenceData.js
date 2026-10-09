/**
 * Reference data access (v53) — server-first, offline-cached, provenance-aware.
 *
 * The 26 reference doctypes (Country … ProductAttribute) are global templates
 * the whole POS reads: pickers, registration, tax/UoM rules. Three rules shape
 * this module:
 *
 *  - S2 (offline): every read goes through `methodGetListWithSource`, which
 *    falls back to the `reference_data` Dexie cache (`utils/offline/localMirror`)
 *    when the server is unreachable — no boot probe, only screen-driven reads.
 *  - S1 (no fabricated data): an empty list never renders as a measurement.
 *    The caller receives `server | local | unavailable` and must surface it;
 *    there is no default row set in this module.
 *  - S3 (one implementation): rows are requested with the SAME field aliases
 *    online and offline (`name as name` maps the doctype's id column through
 *    `spec.fields`), so the cached shape and the served shape are identical and
 *    one key (`name`) drives the management screen's writes.
 */
import { ref, unref } from "vue"

import { DATA_SOURCE, methodGetListWithSource } from "@/utils/methodClient"
import {
	REFERENCE_DOCTYPES,
	REFERENCE_TABLE,
} from "@/utils/offline/localMirror"

export { REFERENCE_DOCTYPES, REFERENCE_TABLE }

/**
 * Field aliases for reference lists. `name as name` asks the server for
 * `spec.fields.name` (the doctype id column) under the response key `name`,
 * so `Country` (id), `Language` (code) and the rest all come back with one
 * uniform key for the cache and for set_value/delete_doc.
 */
const REFERENCE_FIELDS = Object.freeze([
	"name as name",
	"name_ar",
	"name_en",
	"is_active",
	"code",
])

function byName(a, b) {
	return String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
}

/**
 * Replace a doctype's cached rows (never append: a stale row must not survive
 * a successful pull). Cache failures are logged, never thrown — the server
 * answer is already good, and the next offline read simply misses.
 */
export async function cacheReferenceRows(doctype, rows) {
	try {
		const { db } = await import("@/utils/offline/db")
		await db.transaction("rw", db.table(REFERENCE_TABLE), async () => {
			await db.table(REFERENCE_TABLE).where("doctype").equals(doctype).delete()
			await db
				.table(REFERENCE_TABLE)
				.bulkPut(
					rows
						.filter((r) => r && r.name !== undefined && r.name !== null)
						.map((r) => ({ ...r, doctype })),
				)
		})
	} catch {
		/* cache is a convenience; the server rows already reached the caller */
	}
}

/**
 * Load one reference doctype: server first, cached rows as the offline answer.
 *
 * @param {string} doctype one of {@link REFERENCE_DOCTYPES}
 * @param {{filters?: Array, limit?: number, orderBy?: string}} [options]
 * @returns {Promise<{rows: Array, source: string, error: Error|null}>}
 */
export async function loadReferenceData(doctypeOrRef, options = {}) {
	// Screens hand a `ref` (the doctype picker); resolve it per call so a
	// refresh after switching lists always reads the CURRENT doctype.
	const doctype = String(unref(doctypeOrRef) || "")
	const { rows, source, error } = await methodGetListWithSource(doctype, {
		fields: [...REFERENCE_FIELDS],
		filters: options.filters ?? [],
		// Server pages cap at 500 and read `limit: 0` as 50 — reference tables
		// are small (largest ≈ 75 rows), so one full page is the whole table.
		limit: options.limit ?? 500,
		orderBy: options.orderBy ?? "name",
	})
	if (source === DATA_SOURCE.SERVER) {
		await cacheReferenceRows(doctype, rows)
	}
	return { rows: [...rows].sort(byName), source, error }
}

/**
 * Reactive wrapper for a screen: rows + provenance + refresh.
 *
 * `source` is null until the first read answers; an unreadable result is
 * `unavailable`, never an empty `server` answer.
 */
export function useReferenceData(doctypeOrRef, options = {}) {
	const rows = ref([])
	const source = ref(null)
	const error = ref(null)
	const loading = ref(false)

	async function refresh() {
		loading.value = true
		error.value = null
		try {
			const result = await loadReferenceData(doctypeOrRef, options)
			rows.value = result.rows
			source.value = result.source
			error.value = result.error
		} catch (e) {
			// NO_DYPOS_API (no client at all) still lands here: the screen shows
			// the unavailable state with a retry instead of crashing.
			rows.value = []
			source.value = DATA_SOURCE.UNAVAILABLE
			error.value = e
		} finally {
			loading.value = false
		}
	}

	return { rows, source, error, loading, refresh }
}
