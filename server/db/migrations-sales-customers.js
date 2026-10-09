/**
 * Migration v54 — Sales & Customers (customer types, groups, credit, payment terms, sale types, channels).
 *
 * Complete customer management with:
 * - Customer types (retail, wholesale, corporate, government, etc.)
 * - Customer groups (VIP, regular, new, etc.)
 * - Credit limits and payment terms
 * - Due dates and aging
 * - Return/cancel reasons
 * - Sale types (cash, credit, order, quote, layaway, rental)
 * - Sales channels (POS, online, B2B, phone, email)
 */
export function migrateSalesCustomers(db, addColumnIfMissing, { version = 54, description = 'sales & customers' } = {}) {
	db.exec(`
    -- Customer Types
    CREATE TABLE IF NOT EXISTS customer_types (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      default_credit_limit REAL DEFAULT 0,
      default_payment_terms_id TEXT,         -- References payment_terms(id)
      requires_approval INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      source_template_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_ctype_tenant ON customer_types(tenant_id, is_active);

    -- Customer Groups
    CREATE TABLE IF NOT EXISTS customer_groups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      discount_percentage REAL DEFAULT 0,
      price_list_id TEXT REFERENCES price_lists(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      source_template_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_cgroup_tenant ON customer_groups(tenant_id, is_active);

    -- Payment Terms
    CREATE TABLE IF NOT EXISTS payment_terms (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      days_net INTEGER NOT NULL DEFAULT 0,      -- Net days (e.g., 30 for Net 30)
      days_discount INTEGER DEFAULT 0,        -- Early payment discount days
      discount_percentage REAL DEFAULT 0,     -- Early payment discount %
      payment_schedule TEXT DEFAULT '[]',     -- JSON: [{day: 30, pct: 50}, {day: 60, pct: 50}] for installments
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      source_template_id TEXT,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_pterms_tenant ON payment_terms(tenant_id, is_active);

    -- Return / Cancel Reasons
    CREATE TABLE IF NOT EXISTS return_reasons (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'return',    -- 'return', 'cancel', 'void', 'refund'
      requires_approval INTEGER NOT NULL DEFAULT 0,
      affects_inventory INTEGER NOT NULL DEFAULT 1,
      affects_loyalty INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      source_template_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_rreason_tenant ON return_reasons(tenant_id, is_active, type);

    -- Sale Types
    CREATE TABLE IF NOT EXISTS sale_types (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      requires_customer INTEGER NOT NULL DEFAULT 1,
      allows_credit INTEGER NOT NULL DEFAULT 1,
      allows_partial_payment INTEGER NOT NULL DEFAULT 1,
      creates_invoice INTEGER NOT NULL DEFAULT 1,
      creates_order INTEGER NOT NULL DEFAULT 0,
      creates_quote INTEGER NOT NULL DEFAULT 0,
      requires_deposit INTEGER NOT NULL DEFAULT 0,
      deposit_percentage REAL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      source_template_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_stype_tenant ON sale_types(tenant_id, is_active);

    -- Sales Channels
    CREATE TABLE IF NOT EXISTS sales_channels (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      channel_type TEXT NOT NULL DEFAULT 'pos', -- 'pos', 'online', 'b2b', 'phone', 'email', 'marketplace', 'social'
      requires_sync INTEGER NOT NULL DEFAULT 1,
      default_price_list_id TEXT REFERENCES price_lists(id),
      default_warehouse_id TEXT REFERENCES warehouses(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      source_template_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_schannel_tenant ON sales_channels(tenant_id, is_active);

    -- Customer Loyalty Tiers
    CREATE TABLE IF NOT EXISTS loyalty_tiers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      min_points INTEGER NOT NULL DEFAULT 0,
      max_points INTEGER,
      discount_percentage REAL DEFAULT 0,
      points_earn_rate REAL NOT NULL DEFAULT 1, -- Points per currency unit
      points_redeem_rate REAL NOT NULL DEFAULT 1, -- Currency value per point
      benefits_json TEXT DEFAULT '[]',          -- JSON array of benefits
      color TEXT DEFAULT '',
      icon TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      source_template_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_ltier_tenant ON loyalty_tiers(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_ltier_points ON loyalty_tiers(min_points, max_points);

    -- Customer Documents (ID, Commercial Register, Tax Card, etc.)
    CREATE TABLE IF NOT EXISTS customer_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      document_type TEXT NOT NULL,            -- 'national_id', 'commercial_register', 'tax_card', 'passport', 'license', 'other'
      document_number TEXT NOT NULL,
      issuing_authority TEXT DEFAULT '',
      issue_date TEXT,
      expiry_date TEXT,
      file_url TEXT DEFAULT '',
      verified INTEGER NOT NULL DEFAULT 0,
      verified_by TEXT DEFAULT '',
      verified_at TEXT,
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, customer_id, document_type, document_number)
    );
    CREATE INDEX IF NOT EXISTS idx_cdoc_customer ON customer_documents(customer_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_cdoc_type ON customer_documents(document_type);
    CREATE INDEX IF NOT EXISTS idx_cdoc_expiry ON customer_documents(expiry_date);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateSalesCustomers;