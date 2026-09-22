/**
 * DyPOS Feature Flag Store — DB layer for server/lib/features.js.
 *
 * Table: feature_flags(flag TEXT PRIMARY KEY, enabled INTEGER, note TEXT,
 * updated_at TEXT). Created lazily (CREATE TABLE IF NOT EXISTS) so it works on
 * :memory: test DBs and pre-existing file DBs without a dedicated migration.
 * All access is best-effort: a missing/broken table degrades to the
 * env-over-default precedence in features.js, never throws.
 */
import db from "../db/schema.js"

const TABLE = "feature_flags"

function ensureTable() {
	try {
		db.prepare(
			`CREATE TABLE IF NOT EXISTS ${TABLE} (
        flag TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        note TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
		).run()
		return true
	} catch {
		return false
	}
}

/**
 * @param {string} name normalised flag name
 * @returns {{ flag: string, enabled: number, note: string|null, updated_at: string }|null}
 */
export function getFeature(name) {
	if (!ensureTable()) return null
	try {
		return (
			db
				.prepare(
					`SELECT flag, enabled, note, updated_at FROM ${TABLE} WHERE flag = ?`,
				)
				.get(name) ?? null
		)
	} catch {
		return null
	}
}

/** @returns {Array<{ flag: string, enabled: number, note: string|null, updated_at: string }>} */
export function allFeatures() {
	if (!ensureTable()) return []
	try {
		return db
			.prepare(`SELECT flag, enabled, note, updated_at FROM ${TABLE}`)
			.all()
	} catch {
		return []
	}
}

/**
 * @param {string} name normalised flag name
 * @param {boolean|0|1} enabled
 * @param {string} [note]
 * @returns {{ flag: string, enabled: number, note: string|null, updated_at: string }|null}
 */
export function upsertFeature(name, enabled, note) {
	ensureTable()
	db.prepare(
		`INSERT INTO ${TABLE} (flag, enabled, note) VALUES (?, ?, ?)
     ON CONFLICT(flag) DO UPDATE SET enabled = excluded.enabled, note = excluded.note, updated_at = datetime('now')`,
	).run(name, enabled ? 1 : 0, note || null)
	return getFeature(name)
}

export default { getFeature, allFeatures, upsertFeature }
