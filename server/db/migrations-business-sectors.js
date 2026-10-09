/**
 * Migration v44 — business sectors (hierarchical classification).
 *
 * Top-level industry classification (ISIC-like but POS-focused).
 * Sectors → Activities → Sub-activities.
 */
export function migrateBusinessSectors(db, addColumnIfMissing, { version = 44, description = 'business sectors (hierarchical)' } = {}) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS business_sectors (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      icon TEXT DEFAULT '',               -- Icon identifier for UI
      color TEXT DEFAULT '',              -- Hex color for UI
      parent_id TEXT REFERENCES business_sectors(id), -- For hierarchy
      level INTEGER NOT NULL DEFAULT 1,   -- 1 = sector, 2 = activity, 3 = sub-activity
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_leaf INTEGER NOT NULL DEFAULT 0, -- 1 = can be selected as business activity
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sectors_parent ON business_sectors(parent_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_sectors_level ON business_sectors(level, is_active);
    CREATE INDEX IF NOT EXISTS idx_sectors_leaf ON business_sectors(is_leaf, is_active);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateBusinessSectors;