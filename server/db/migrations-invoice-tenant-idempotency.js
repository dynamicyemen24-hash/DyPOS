/**
 * v27 migration — invoice idempotency is scoped to the owning tenant.
 *
 * A client-generated idempotency key is only unique inside its business
 * boundary. Keeping a global unique index can incorrectly deduplicate an
 * otherwise independent tenant, which is a financial integrity defect.
 */
export function migrateInvoiceTenantIdempotency(db) {
	db.exec('DROP INDEX IF EXISTS idx_invoices_idem');
	db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_idem
    ON invoices(tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''`);
	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
		27,
		'invoice idempotency scoped to tenant',
	);
}

export default migrateInvoiceTenantIdempotency;
