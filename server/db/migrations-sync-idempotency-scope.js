/**
 * v39 — tenant/branch scoped sync idempotency.
 *
 * A retry key belongs to the originating tenant + branch. A global UNIQUE
 * sync_log.idempotency_key incorrectly makes two branches collide.
 */
export function migrateSyncIdempotencyScope(
	db,
	_addColumnIfMissing,
	{ version = 39, description = 'tenant/branch-scoped sync idempotency' } = {},
) {
	const hasBranch = db
		.prepare('PRAGMA table_info(sync_log)')
		.all()
		.some((c) => c.name === 'branch_id');
	if (!hasBranch) throw new Error('sync_log.branch_id is required before v39');

	db.exec(`
		DROP INDEX IF EXISTS idx_sync_idem;
		CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_tenant_branch_idem
			ON sync_log(tenant_id, branch_id, idempotency_key)
			WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
		CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_null_scope_idem
			ON sync_log(idempotency_key)
			WHERE tenant_id IS NULL AND branch_id IS NULL
				AND idempotency_key IS NOT NULL AND idempotency_key <> '';
	`);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateSyncIdempotencyScope;
