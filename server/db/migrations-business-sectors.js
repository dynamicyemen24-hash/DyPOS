/**
 * Migration v47 — business sectors (hierarchical classification).
 *
 * Top-level industry classification (ISIC-like but POS-focused).
 * Sectors → Activities → Sub-activities.
 */
export function migrateBusinessSectors(db, addColumnIfMissing, { version = 47, description = 'business sectors (hierarchical)' } = {}) {
	// v41 (the origin/main foundation) already created a flat `business_sectors`
	// — same table name, incompatible shape (code PK, name, name_ar; no id).
	// Rebuild it into the canonical id-keyed hierarchy the doctypes and seeds
	// require, carrying every row so `business_activities.sector_code`
	// foreign keys keep resolving. Idempotent: a table that already has `id`
	// (our shape) is left alone.
	//
	// The pragma dance is load-bearing: SQLite rewrites children's REFERENCES
	// clauses on rename whenever `legacy_alter_table` is OFF (its default) —
	// even with foreign_keys disabled — which would leave
	// `business_activities` pointing at the renamed table. `legacy_alter_table
	// = ON` keeps their clauses saying `business_sectors`, the very name we
	// recreate around them, and foreign_keys = OFF keeps the DROP of the flat
	// copy from running FK checks against nobody. `migrate()` runs each ladder
	// row outside a transaction, so both pragmas actually take effect here.
	// Carried ids are lower(code) so the canonical seed rows (`retail`,
	// `health`, …) that collide on code resolve INTO the carried rows instead
	// of failing their children's foreign keys.
	const existing = db.prepare('PRAGMA table_info(business_sectors)').all();
	if (existing.length > 0 && !existing.some((c) => c.name === 'id')) {
		db.pragma('foreign_keys = OFF');
		db.pragma('legacy_alter_table = ON');
		try {
			db.exec(`
        ALTER TABLE business_sectors RENAME TO business_sectors_flat_v41;
        CREATE TABLE business_sectors (
          id TEXT PRIMARY KEY,
          code TEXT UNIQUE NOT NULL,
          name_ar TEXT NOT NULL,
          name_en TEXT NOT NULL,
          description_ar TEXT DEFAULT '',
          description_en TEXT DEFAULT '',
          icon TEXT DEFAULT '',
          color TEXT DEFAULT '',
          parent_id TEXT REFERENCES business_sectors(id),
          level INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 100,
          is_active INTEGER NOT NULL DEFAULT 1,
          is_leaf INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO business_sectors (
          id, code, name_ar, name_en, description_ar, description_en, icon, color,
          parent_id, level, sort_order, is_active, is_leaf, created_at, updated_at
        )
        SELECT lower(code), code, name_ar, IFNULL(name, name_ar), '', '', '', '',
               NULL, 1, 100, IFNULL(is_active, 1), 0, datetime('now'), datetime('now')
        FROM business_sectors_flat_v41;
        DROP TABLE business_sectors_flat_v41;
      `);
		} finally {
			db.pragma('legacy_alter_table = OFF');
			db.pragma('foreign_keys = ON');
		}
	}
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