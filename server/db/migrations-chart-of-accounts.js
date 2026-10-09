/**
 * Migration v50 — Chart of Accounts templates (per country/sector/activity).
 *
 * Account templates for double-entry accounting. Supports:
 * - Global templates by country + business sector
 * - Tenant-specific overrides with inheritance
 * - Account types: asset, liability, equity, revenue, expense, cost
 */
export function migrateChartOfAccounts(db, addColumnIfMissing, { version = 50, description = 'chart of accounts templates' } = {}) {
	// v41 (the origin/main foundation) already created a flat `account_templates`
	// — same table name, incompatible shape (code PK; no id, no account_type).
	// Rebuild it into the canonical id-keyed template the doctypes and seeds
	// require, carrying every row so `account_template_lines.template_code`
	// foreign keys keep resolving. Idempotent: a table that already has `id`
	// (our shape) is left alone. Same pragma dance as v47 — see
	// migrations-business-sectors.js for why legacy_alter_table keeps the
	// children's REFERENCES clauses on this table's name across the rename.
	const existing = db.prepare('PRAGMA table_info(account_templates)').all();
	if (existing.length > 0 && !existing.some((c) => c.name === 'id')) {
		db.pragma('foreign_keys = OFF');
		db.pragma('legacy_alter_table = ON');
		try {
			db.exec(`
        ALTER TABLE account_templates RENAME TO account_templates_flat_v41;
        CREATE TABLE account_templates (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          name_ar TEXT NOT NULL,
          name_en TEXT NOT NULL,
          description_ar TEXT DEFAULT '',
          description_en TEXT DEFAULT '',
          account_type TEXT NOT NULL,
          account_subtype TEXT DEFAULT '',
          parent_code TEXT,
          level INTEGER NOT NULL DEFAULT 1,
          nature TEXT NOT NULL DEFAULT 'debit',
          is_system INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          country_id TEXT REFERENCES countries(id),
          business_sector_id TEXT REFERENCES business_sectors(id),
          sort_order INTEGER NOT NULL DEFAULT 100,
          allow_manual_entry INTEGER NOT NULL DEFAULT 1,
          requires_sub_account INTEGER NOT NULL DEFAULT 0,
          created_by TEXT DEFAULT '',
          updated_by TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(country_id, business_sector_id, code)
        );
        INSERT INTO account_templates (
          id, code, name_ar, name_en, description_ar, description_en, account_type,
          account_subtype, parent_code, level, nature, is_system, is_active,
          country_id, business_sector_id, sort_order, allow_manual_entry,
          requires_sub_account, created_by, updated_by, created_at, updated_at
        )
        SELECT code, code, name_ar, IFNULL(name, name_ar), '', '', '',
               '', NULL, 1, 'debit', 0, IFNULL(is_active, 1),
               NULL, NULL, 100, 1, 0, '', '', datetime('now'), datetime('now')
        FROM account_templates_flat_v41;
        DROP TABLE account_templates_flat_v41;
      `);
			// Their line table's FK targets `account_templates(code)`, but the
			// canonical template is only unique on (country, sector, code) — a
			// composite key can never satisfy that clause, and SQLite answers
			// "foreign key mismatch" the moment anything resolves it. The table
			// is read by nothing (a count in the foundation test is its only
			// consumer), so rebuild it carrying every row and dropping the
			// clause that can no longer hold.
			db.exec(`
        ALTER TABLE account_template_lines RENAME TO account_template_lines_v41;
        CREATE TABLE account_template_lines (
          template_code TEXT NOT NULL,
          account_code TEXT NOT NULL,
          parent_code TEXT,
          name TEXT NOT NULL,
          name_ar TEXT NOT NULL DEFAULT '',
          account_type TEXT NOT NULL,
          normal_balance TEXT NOT NULL,
          is_control INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 100,
          PRIMARY KEY(template_code,account_code)
        );
        INSERT INTO account_template_lines
          SELECT * FROM account_template_lines_v41;
        DROP TABLE account_template_lines_v41;
      `);
		} finally {
			db.pragma('legacy_alter_table = OFF');
			db.pragma('foreign_keys = ON');
		}
	}
	db.exec(`
    CREATE TABLE IF NOT EXISTS account_templates (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,                  -- Account code (e.g., '1000', '4000')
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      account_type TEXT NOT NULL,          -- 'asset', 'liability', 'equity', 'revenue', 'expense', 'cost'
      account_subtype TEXT DEFAULT '',     -- e.g., 'current_asset', 'fixed_asset', 'bank', 'cash'
      parent_code TEXT,                    -- Parent account code for hierarchy
      level INTEGER NOT NULL DEFAULT 1,
      nature TEXT NOT NULL DEFAULT 'debit', -- 'debit' or 'credit' (normal balance)
      is_system INTEGER NOT NULL DEFAULT 0, -- System accounts (cash, bank, AR, AP, etc.)
      is_active INTEGER NOT NULL DEFAULT 1,
      country_id TEXT REFERENCES countries(id), -- Country-specific template
      business_sector_id TEXT REFERENCES business_sectors(id), -- Sector-specific
      sort_order INTEGER NOT NULL DEFAULT 100,
      allow_manual_entry INTEGER NOT NULL DEFAULT 1,
      requires_sub_account INTEGER NOT NULL DEFAULT 0, -- Requires sub-account (e.g., per customer)
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(country_id, business_sector_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_acc_tpl_country ON account_templates(country_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_acc_tpl_sector ON account_templates(business_sector_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_acc_tpl_type ON account_templates(account_type, is_active);
    CREATE INDEX IF NOT EXISTS idx_acc_tpl_parent ON account_templates(parent_code);

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      account_type TEXT NOT NULL,
      account_subtype TEXT DEFAULT '',
      parent_id TEXT REFERENCES accounts(id),
      level INTEGER NOT NULL DEFAULT 1,
      nature TEXT NOT NULL DEFAULT 'debit',
      is_system INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      allow_manual_entry INTEGER NOT NULL DEFAULT 1,
      balance REAL NOT NULL DEFAULT 0,      -- Current balance
      opening_balance REAL NOT NULL DEFAULT 0,
      template_id TEXT REFERENCES account_templates(id), -- Link to template
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type, is_active);
    CREATE INDEX IF NOT EXISTS idx_accounts_template ON accounts(template_id);

    CREATE TABLE IF NOT EXISTS account_templates_sets (
      id TEXT PRIMARY KEY,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      country_id TEXT REFERENCES countries(id),
      business_sector_id TEXT REFERENCES business_sectors(id),
      template_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of account_template IDs
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_acc_sets_country ON account_templates_sets(country_id);
    CREATE INDEX IF NOT EXISTS idx_acc_sets_sector ON account_templates_sets(business_sector_id);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateChartOfAccounts;