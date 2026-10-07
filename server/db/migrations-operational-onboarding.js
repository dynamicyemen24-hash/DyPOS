/**
 * Migration v37 — POS operational onboarding profile + saved templates.
 *
 * DyPOS is a cashier/POS system. This stores operational identity only;
 * accounting/fiscal-year data belongs to the separate accounting product.
 */
export function migrateOperationalOnboarding(db) {
  db.exec(`
    ALTER TABLE organizations ADD COLUMN country_code TEXT NOT NULL DEFAULT 'YE';
  `);
  db.exec(`
    ALTER TABLE organizations ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Aden';
  `);
  db.exec(`
    ALTER TABLE organizations ADD COLUMN establishment_type TEXT NOT NULL DEFAULT 'retail';
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS onboarding_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      data_type TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, name, data_type)
    );
    CREATE INDEX IF NOT EXISTS idx_onboarding_templates_tenant
      ON onboarding_templates(tenant_id, data_type, is_active);
  `);
  db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
    37,
    'POS operational onboarding profile + saved import templates',
  );
}
