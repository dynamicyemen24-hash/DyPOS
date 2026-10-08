/**
 * v38 — tenant scope for POS shifts.
 *
 * Shifts previously had no tenant discriminator and several legacy reads used
 * the most recent OPEN row. That is unsafe in a multi-subscriber POS.
 */
export function migrateShiftTenantScope(db, addColumnIfMissing) {
	addColumnIfMissing('shifts', 'tenant_id', "TEXT NOT NULL DEFAULT ''");
	try {
		db.exec(`UPDATE shifts
		SET tenant_id = COALESCE(
			(SELECT u.tenant_id FROM users u
			 WHERE (u.full_name = shifts.opened_by OR u.username = shifts.opened_by)
			   AND u.tenant_id IS NOT NULL
			 LIMIT 1), ''
		)
		WHERE tenant_id=''`);
	} catch {
		/* Legacy rows remain unscoped and are intentionally excluded from tenant reads. */
	}
	db.exec('CREATE INDEX IF NOT EXISTS idx_shifts_tenant_terminal_status ON shifts(tenant_id, terminal_id, status)');
	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
		38,
		'POS shifts tenant isolation',
	);
}
