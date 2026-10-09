/**
 * Migration v45 — languages (ISO 639-1/3).
 *
 * Global language reference with direction, locale codes, and display names.
 */
export function migrateLanguages(db, _addColumnIfMissing, { version = 45, description = 'languages (ISO 639)' } = {}) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS languages (
      code TEXT PRIMARY KEY,              -- ISO 639-1 (e.g., 'ar', 'en') or 639-3
      iso639_1 TEXT UNIQUE,               -- 2-letter code
      iso639_2 TEXT UNIQUE,               -- 3-letter bibliographic
      iso639_3 TEXT UNIQUE,               -- 3-letter terminology
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      native_name TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL DEFAULT 'ltr', -- 'ltr' or 'rtl'
      locale_codes TEXT NOT NULL DEFAULT '[]', -- JSON array of locale codes (e.g., ['ar-SA', 'ar-YE', 'ar-AE'])
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_languages_active ON languages(is_active);
    CREATE INDEX IF NOT EXISTS idx_languages_direction ON languages(direction);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateLanguages;
