/**
 * v29 — per-branch sync scope (multi-branch / multi-terminal campaign).
 *
 * Sync must be efficient at every point of sale: a terminal in branch A
 * must never pull branch B's changes, and two branches must never contend
 * for one cursor. `sync_log.branch_id` carries the origin branch of every
 * queued change so the pull can filter by (tenant, branch, entity) instead
 * of the tenant alone; the composite index serves exactly that access
 * pattern. Rows written before v29 keep branch_id NULL and stay visible to
 * every scope of their tenant (legacy passthrough — same rule as
 * tenant_id NULL), so the migration never hides existing data.
 *
 * Signature follows LATE_MIGRATIONS: (db, addColumnIfMissing, {version…}).
 */
export function migrateSyncLogBranchScope(
	db,
	addColumnIfMissing,
	{ version = 29, description = 'sync_log branch scope (multi-branch pull + cursor)' } = {},
) {
	addColumnIfMissing('sync_log', 'branch_id', 'TEXT');
	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_sync_tenant_branch ON sync_log(tenant_id, branch_id, status, id);
		CREATE INDEX IF NOT EXISTS idx_sync_pull ON sync_log(status, id, entity_type);
	`);
	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}
export default migrateSyncLogBranchScope;
