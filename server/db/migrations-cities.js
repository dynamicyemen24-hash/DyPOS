/**
 * Migration v41 — cities (cities, districts, municipalities).
 *
 * Cities/districts under regions. Supports multiple levels of granularity.
 */
export function migrateCities(db, addColumnIfMissing, { version = 41, description = 'cities (districts/municipalities)' } = {}) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS cities (
      id TEXT PRIMARY KEY,
      region_id TEXT NOT NULL REFERENCES regions(id),
      country_id TEXT NOT NULL REFERENCES countries(id),
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      native_name TEXT NOT NULL DEFAULT '',
      postal_code TEXT DEFAULT '',
      latitude REAL,
      longitude REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cities_region ON cities(region_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_cities_country ON cities(country_id, is_active);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateCities;