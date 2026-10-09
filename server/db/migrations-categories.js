/**
 * Migration v48 — product/service categories (hierarchical, multi-tenant).
 *
 * Hierarchical categories for products and services. Supports global templates
 * and tenant-specific overrides with inheritance.
 */
export function migrateCategories(db, addColumnIfMissing, { version = 48, description = 'product/service categories (hierarchical)' } = {}) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',          -- '' = global template, tenant_id = tenant override
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'product', -- 'product' or 'service'
      parent_id TEXT REFERENCES categories(id), -- Self-referencing for hierarchy
      level INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0, -- System categories cannot be deleted
      source_template_id TEXT,            -- Links to global template if overridden
      business_sector_id TEXT REFERENCES business_sectors(id), -- Default sector
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type, is_active);
    CREATE INDEX IF NOT EXISTS idx_categories_sector ON categories(business_sector_id);
    CREATE INDEX IF NOT EXISTS idx_categories_template ON categories(source_template_id);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateCategories;