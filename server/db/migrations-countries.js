/**
 * Migration v39 — countries (ISO 3166-1).
 *
 * Global reference data: countries with ISO codes, phone codes, default currency,
 * timezone, date/number formats. Single source for all tenants.
 */
export function migrateCountries(db, addColumnIfMissing, { version = 39, description = 'countries (ISO 3166-1)' } = {}) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS countries (
      id TEXT PRIMARY KEY,                 -- ISO 3166-1 alpha-2 (e.g., 'YE', 'SA')
      iso2 TEXT UNIQUE NOT NULL,           -- Same as id, for clarity
      iso3 TEXT UNIQUE NOT NULL,           -- ISO 3166-1 alpha-3 (e.g., 'YEM', 'SAU')
      numeric_code TEXT UNIQUE NOT NULL,   -- ISO 3166-1 numeric (e.g., '887', '682')
      name_ar TEXT NOT NULL,               -- Arabic name
      name_en TEXT NOT NULL,               -- English name
      native_name TEXT NOT NULL DEFAULT '', -- Native name
      phone_code TEXT NOT NULL DEFAULT '',  -- International dialing code (e.g., '+967')
      currency_code TEXT NOT NULL DEFAULT '', -- ISO 4217 currency (e.g., 'YER', 'SAR')
      timezone TEXT NOT NULL DEFAULT '',    -- IANA timezone (e.g., 'Asia/Aden')
      date_format TEXT NOT NULL DEFAULT 'yyyy-mm-dd',
      number_format TEXT NOT NULL DEFAULT '#,###.##',
      number_system TEXT NOT NULL DEFAULT 'latn', -- 'latn' or 'arab'
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_countries_active ON countries(is_active);
    CREATE INDEX IF NOT EXISTS idx_countries_currency ON countries(currency_code);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateCountries;