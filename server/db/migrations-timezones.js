/**
 * Migration v43 — timezones (IANA timezone database).
 *
 * Global timezone reference with UTC offsets, DST rules, and display names.
 */
export function migrateTimezones(db, addColumnIfMissing, { version = 43, description = 'timezones (IANA)' } = {}) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS timezones (
      id TEXT PRIMARY KEY,                -- IANA timezone identifier (e.g., 'Asia/Aden')
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      utc_offset TEXT NOT NULL DEFAULT '+00:00', -- Standard offset (e.g., '+03:00')
      utc_dst_offset TEXT NOT NULL DEFAULT '+00:00', -- DST offset (same if no DST)
      has_dst INTEGER NOT NULL DEFAULT 0,
      country_codes TEXT NOT NULL DEFAULT '[]', -- JSON array of country ISO codes
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_timezones_active ON timezones(is_active);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateTimezones;