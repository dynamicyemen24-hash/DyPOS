/**
 * Migration v8 — multi-tenancy (tenants → organizations → branches), control
 * fields on the scoping tables, and audit_trail.
 *
 * Extracted from db/schema.js under the file-size ratchet
 * (server/tests/fileSize.test.js). Behavior is byte-for-byte the original
 * block: the guard, the DDL and the schema_version stamp all moved together so
 * a fresh install and an upgrade land on the same schema.
 *
 * Called from migrate(); `db`, `addColumnIfMissing` and `currentVersion` are the
 * only dependencies.
 */

export function migrateTenancy(db, addColumnIfMissing, currentVersion) {
	if (currentVersion < 8) {
		db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE,
        plan TEXT NOT NULL DEFAULT 'standard',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT,
        vat_number TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_orgs_tenant ON organizations(tenant_id);
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        code TEXT,
        warehouse_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(org_id);
      CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);
      CREATE TABLE IF NOT EXISTS audit_trail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL DEFAULT '',
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        before_json TEXT NOT NULL DEFAULT '{}',
        after_json TEXT NOT NULL DEFAULT '{}',
        user_id TEXT,
        username TEXT,
        ip TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_trail_entity ON audit_trail(entity_type, entity_id, id);
      CREATE INDEX IF NOT EXISTS idx_trail_tenant ON audit_trail(tenant_id, created_at DESC);
    `);
		addColumnIfMissing('products', 'tenant_id', 'TEXT');
		addColumnIfMissing('products', 'created_by', 'TEXT');
		addColumnIfMissing('products', 'updated_by', 'TEXT');
		addColumnIfMissing('customers', 'tenant_id', 'TEXT');
		addColumnIfMissing('customers', 'created_by', 'TEXT');
		addColumnIfMissing('customers', 'updated_by', 'TEXT');
		addColumnIfMissing('invoices', 'tenant_id', 'TEXT');
		addColumnIfMissing('invoices', 'branch_id', 'TEXT');
		addColumnIfMissing('invoices', 'created_by', 'TEXT');
		addColumnIfMissing('invoices', 'updated_by', 'TEXT');
		addColumnIfMissing('shifts', 'tenant_id', 'TEXT');
		addColumnIfMissing('shifts', 'branch_id', 'TEXT');
		addColumnIfMissing('warehouses', 'tenant_id', 'TEXT');
		addColumnIfMissing('warehouses', 'branch_id', 'TEXT');
		addColumnIfMissing('users', 'tenant_id', 'TEXT');
		db.exec(`
      CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON shifts(tenant_id, status);
    `);
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			8,
			'Tenancy hierarchy + scoping + control fields + audit_trail',
		);
	}
}
