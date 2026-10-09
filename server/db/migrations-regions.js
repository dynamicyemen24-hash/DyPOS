/**
 * Migration v43 — regions (subdivisions: states, provinces, governorates).
 *
 * Hierarchical geographic data under countries. Flexible depth: not all
 * countries use the same subdivision structure.
 */
export function migrateRegions(db, addColumnIfMissing, { version = 43, description = 'regions (states/provinces/governorates)' } = {}) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      country_id TEXT NOT NULL REFERENCES countries(id),
      code TEXT NOT NULL,              -- Subdivision code (e.g., 'YE-MA', 'SA-01')
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      native_name TEXT NOT NULL DEFAULT '',
      level INTEGER NOT NULL DEFAULT 1, -- 1 = state/province, 2 = district/county, etc.
      parent_id TEXT REFERENCES regions(id), -- For nested subdivisions
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(country_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_regions_country ON regions(country_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_regions_parent ON regions(parent_id);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateRegions;