/**
 * Migration v51 — Units of Measure with conversions (global + tenant overrides).
 *
 * Comprehensive UoM master with categories, base units, and conversion factors.
 * Supports sale/purchase/inventory units per product, and activity-specific units.
 */
export function migrateUnits(
	db,
	_addColumnIfMissing,
	{ version = 51, description = 'units of measure with conversions' } = {},
) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS uom_categories (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      base_unit_code TEXT,              -- The base unit for this category (e.g., 'KG' for weight)
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_uom_cat_active ON uom_categories(is_active);

    CREATE TABLE IF NOT EXISTS units_of_measure (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',           -- '' = global template
      code TEXT NOT NULL,                  -- Short code (e.g., 'PCS', 'KG', 'L')
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      symbol_ar TEXT DEFAULT '',
      symbol_en TEXT DEFAULT '',
      category_id TEXT NOT NULL REFERENCES uom_categories(id),
      factor_to_base REAL NOT NULL DEFAULT 1, -- Conversion to base unit (e.g., 1000 for KG→G)
      is_base INTEGER NOT NULL DEFAULT 0,  -- Is the base unit for its category
      precision INTEGER NOT NULL DEFAULT 2, -- Decimal places for display
      rounding_method TEXT NOT NULL DEFAULT 'standard', -- 'standard', 'up', 'down', 'banker'
      allows_fraction INTEGER NOT NULL DEFAULT 1, -- Can be sold in fractions (0.5 KG)
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0, -- System units cannot be deleted
      source_template_id TEXT,             -- Link to global template if overridden
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_uom_tenant ON units_of_measure(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_uom_category ON units_of_measure(category_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_uom_base ON units_of_measure(is_base, is_active);
    CREATE INDEX IF NOT EXISTS idx_uom_template ON units_of_measure(source_template_id);

    CREATE TABLE IF NOT EXISTS uom_conversions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      from_unit_id TEXT NOT NULL REFERENCES units_of_measure(id),
      to_unit_id TEXT NOT NULL REFERENCES units_of_measure(id),
      factor REAL NOT NULL,                -- Multiply FROM by factor to get TO
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      source_template_id TEXT,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, from_unit_id, to_unit_id)
    );
    CREATE INDEX IF NOT EXISTS idx_uom_conv_tenant ON uom_conversions(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_uom_conv_from ON uom_conversions(from_unit_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_uom_conv_to ON uom_conversions(to_unit_id, is_active);

    -- Product-specific unit mappings (sale unit, purchase unit, inventory unit)
    CREATE TABLE IF NOT EXISTS product_unit_mappings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL,            -- References products(id)
      sale_unit_id TEXT REFERENCES units_of_measure(id),
      purchase_unit_id TEXT REFERENCES units_of_measure(id),
      inventory_unit_id TEXT REFERENCES units_of_measure(id),
      sale_to_inventory_factor REAL DEFAULT 1,   -- Sale → Inventory
      purchase_to_inventory_factor REAL DEFAULT 1, -- Purchase → Inventory
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, product_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pum_tenant ON product_unit_mappings(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_pum_product ON product_unit_mappings(product_id);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateUnits;
