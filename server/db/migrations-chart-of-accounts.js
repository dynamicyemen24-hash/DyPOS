/**
 * Migration v47 — Chart of Accounts templates (per country/sector/activity).
 *
 * Account templates for double-entry accounting. Supports:
 * - Global templates by country + business sector
 * - Tenant-specific overrides with inheritance
 * - Account types: asset, liability, equity, revenue, expense, cost
 */
export function migrateChartOfAccounts(db, addColumnIfMissing, { version = 47, description = 'chart of accounts templates' } = {}) {
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