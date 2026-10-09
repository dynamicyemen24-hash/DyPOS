/**
 * Migration v49 — tax master data (country-specific, extensible).
 *
 * Tax types, rates, and rules per country. Supports inclusive/exclusive,
 * multiple tax types per country, and tenant overrides.
 */
export function migrateTaxes(db, _addColumnIfMissing, { version = 49, description = 'tax master data' } = {}) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS tax_types (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      applies_to TEXT NOT NULL DEFAULT 'sales', -- 'sales', 'purchase', 'service', 'both'
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tax_types_active ON tax_types(is_active);

    CREATE TABLE IF NOT EXISTS taxes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',           -- '' = global/country template
      country_id TEXT NOT NULL REFERENCES countries(id),
      tax_type_id TEXT NOT NULL REFERENCES tax_types(id),
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      rate REAL NOT NULL DEFAULT 0,        -- Percentage (e.g., 15.0 for 15%)
      is_inclusive INTEGER NOT NULL DEFAULT 0, -- 1 = price includes tax
      calculation_base TEXT NOT NULL DEFAULT 'net', -- 'net' or 'gross'
      applies_to TEXT NOT NULL DEFAULT 'sales', -- 'sales', 'purchase', 'service', 'both'
      valid_from TEXT NOT NULL DEFAULT (date('now')),
      valid_to TEXT,                       -- NULL = no expiry
      is_active INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0, -- Default tax for country
      source_template_id TEXT,             -- Links to country template if overridden
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_taxes_tenant ON taxes(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_taxes_country ON taxes(country_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_taxes_type ON taxes(tax_type_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_taxes_valid ON taxes(valid_from, valid_to);
    CREATE INDEX IF NOT EXISTS idx_taxes_template ON taxes(source_template_id);

    CREATE TABLE IF NOT EXISTS tax_groups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      tax_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of tax IDs
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tax_groups_tenant ON tax_groups(tenant_id, is_active);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateTaxes;
