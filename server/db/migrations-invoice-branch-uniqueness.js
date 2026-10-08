/**
 * v40 — branch-scoped invoice uniqueness.
 *
 * Invoice numbering is allocated per branch + fiscal year, so uniqueness and
 * idempotency must use the same scope. v36 stopped cross-tenant collisions but
 * still made two branches inside one tenant compete for the same number/key.
 */
export function migrateInvoiceBranchUniqueness(
	db,
	_addColumnIfMissing,
	{ version = 40, description = 'branch-scoped invoice uniqueness (number + idempotency_key)' } = {},
) {
	db.exec(`
		DROP INDEX IF EXISTS idx_invoices_tenant_number;
		DROP INDEX IF EXISTS idx_invoices_null_tenant_number;
		DROP INDEX IF EXISTS idx_invoices_tenant_idem;
		DROP INDEX IF EXISTS idx_invoices_null_tenant_idem;

		CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_branch_number
			ON invoices(tenant_id, branch_id, number)
			WHERE tenant_id IS NOT NULL AND branch_id IS NOT NULL;

		CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_std_number
			ON invoices(tenant_id, number)
			WHERE tenant_id IS NOT NULL AND branch_id IS NULL;

		CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_null_branch_number
			ON invoices(branch_id, number)
			WHERE tenant_id IS NULL AND branch_id IS NOT NULL;

		CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_null_scope_number
			ON invoices(number)
			WHERE tenant_id IS NULL AND branch_id IS NULL;

		CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_branch_idem
			ON invoices(tenant_id, branch_id, idempotency_key)
			WHERE tenant_id IS NOT NULL AND branch_id IS NOT NULL
			  AND idempotency_key IS NOT NULL AND idempotency_key <> '';

		CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_std_idem
			ON invoices(tenant_id, idempotency_key)
			WHERE tenant_id IS NOT NULL AND branch_id IS NULL
			  AND idempotency_key IS NOT NULL AND idempotency_key <> '';

		CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_null_branch_idem
			ON invoices(branch_id, idempotency_key)
			WHERE tenant_id IS NULL AND branch_id IS NOT NULL
			  AND idempotency_key IS NOT NULL AND idempotency_key <> '';

		CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_null_scope_idem
			ON invoices(idempotency_key)
			WHERE tenant_id IS NULL AND branch_id IS NULL
			  AND idempotency_key IS NOT NULL AND idempotency_key <> '';
	`);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateInvoiceBranchUniqueness;
