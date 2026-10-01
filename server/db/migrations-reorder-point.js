/**
 * v31 — persist per-product reorder points in SQLite.
 */
export function migrateReorderPoint(
	db,
	addColumnIfMissing,
	{ version = 31, description = "product reorder point" } = {},
) {
	addColumnIfMissing("products", "reorder_point", "REAL NOT NULL DEFAULT 0");
	db.prepare(
		"INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)",
	).run(version, description);
}

export default migrateReorderPoint;
