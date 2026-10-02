/**
 * v28 — settlement integrity.
 * A terminal may have at most one OPEN shift inside its tenant boundary.
 */
export function migrateShiftSettlementIntegrity(db) {
	const duplicates = db
		.prepare(
			`SELECT COALESCE(tenant_id, ''), terminal_id, COUNT(*) AS c FROM shifts WHERE status='OPEN' GROUP BY COALESCE(tenant_id, ''), terminal_id HAVING c > 1`,
		)
		.all();
	if (duplicates.length) throw new Error(`v28 refused: ${duplicates.length} terminal(s) have multiple OPEN shifts`);
	db.exec(
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_shifts_open_terminal ON shifts(COALESCE(tenant_id, ''), terminal_id) WHERE status='OPEN'; CREATE INDEX IF NOT EXISTS idx_shifts_settlement ON shifts(tenant_id, status, closed_at DESC, id);`,
	);
	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
		28,
		'shift settlement concurrency integrity',
	);
}
export default migrateShiftSettlementIntegrity;
