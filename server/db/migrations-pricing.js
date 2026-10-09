/**
 * Migration v53 — Pricing Engine (price lists, customer pricing, quantity breaks, promotions).
 *
 * Flexible pricing with:
 * - Multiple price lists (retail, wholesale, VIP, etc.)
 * - Customer-specific pricing
 * - Quantity breaks (tiered pricing)
 * - Time-based promotions
 * - BOGO / Buy X Get Y
 * - Discount rules (percentage, fixed, mix & match)
 * - Min/max price guards
 * - Rounding rules
 */
export function migratePricing(db, _addColumnIfMissing, { version = 53, description = 'pricing engine' } = {}) {
	db.exec(`
    -- Price Lists
    CREATE TABLE IF NOT EXISTS price_lists (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      currency_code TEXT NOT NULL REFERENCES currencies(code),
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      valid_from TEXT,
      valid_to TEXT,
      priority INTEGER NOT NULL DEFAULT 100,    -- Higher = more specific
      applies_to_channels TEXT DEFAULT '[]',    -- JSON array: 'pos', 'online', 'b2b'
      applies_to_customer_groups TEXT DEFAULT '[]', -- JSON array of customer group IDs
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_plist_tenant ON price_lists(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_plist_default ON price_lists(is_default, is_active);

    -- Price List Items (product prices per price list)
    CREATE TABLE IF NOT EXISTS price_list_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      price_list_id TEXT NOT NULL REFERENCES price_lists(id),
      product_id TEXT REFERENCES products(id),
      variant_id TEXT REFERENCES product_variants(id),
      unit_price REAL NOT NULL DEFAULT 0,
      min_qty REAL DEFAULT 0,                 -- Minimum quantity for this price
      max_qty REAL,                           -- Maximum quantity (NULL = unlimited)
      uom_id TEXT REFERENCES units_of_measure(id), -- UoM for this price
      is_active INTEGER NOT NULL DEFAULT 1,
      valid_from TEXT,
      valid_to TEXT,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(price_list_id, product_id, variant_id, uom_id, min_qty)
    );
    CREATE INDEX IF NOT EXISTS idx_plitem_list ON price_list_items(price_list_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_plitem_product ON price_list_items(product_id, variant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_plitem_qty ON price_list_items(min_qty, max_qty);

    -- Customer-Specific Pricing (overrides price lists)
    CREATE TABLE IF NOT EXISTS customer_prices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      product_id TEXT REFERENCES products(id),
      variant_id TEXT REFERENCES product_variants(id),
      unit_price REAL NOT NULL,
      uom_id TEXT REFERENCES units_of_measure(id),
      min_qty REAL DEFAULT 0,
      max_qty REAL,
      valid_from TEXT,
      valid_to TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, customer_id, product_id, variant_id, uom_id, min_qty)
    );
    CREATE INDEX IF NOT EXISTS idx_cprice_customer ON customer_prices(customer_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_cprice_product ON customer_prices(product_id, variant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_cprice_valid ON customer_prices(valid_from, valid_to);

    -- Promotions / Offers
    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      promotion_type TEXT NOT NULL,           -- 'discount', 'bogo', 'bundle', 'free_shipping', 'loyalty_points', 'gift'
      discount_type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage', 'fixed_amount', 'buy_x_get_y'
      discount_value REAL NOT NULL DEFAULT 0, -- Percentage or fixed amount
      buy_quantity REAL DEFAULT 0,            -- For BOGO: buy X
      get_quantity REAL DEFAULT 0,            -- For BOGO: get Y
      get_discount_percentage REAL DEFAULT 100, -- For BOGO: Y at Z% off
      max_discount_amount REAL,               -- Cap on discount
      min_purchase_amount REAL DEFAULT 0,
      max_uses INTEGER DEFAULT 0,             -- 0 = unlimited
      used_count INTEGER NOT NULL DEFAULT 0,
      uses_per_customer INTEGER DEFAULT 1,
      applies_to_products TEXT DEFAULT '[]',  -- JSON array of product IDs (empty = all)
      applies_to_categories TEXT DEFAULT '[]', -- JSON array of category IDs
      applies_to_brands TEXT DEFAULT '[]',    -- JSON array of brand IDs
      applies_to_customer_groups TEXT DEFAULT '[]', -- JSON array of customer group IDs
      excluded_products TEXT DEFAULT '[]',
      excluded_categories TEXT DEFAULT '[]',
      channels TEXT DEFAULT '["pos"]',        -- JSON: 'pos', 'online', 'b2b'
      valid_from TEXT NOT NULL,
      valid_to TEXT NOT NULL,
      start_time TEXT DEFAULT '00:00',        -- HH:MM
      end_time TEXT DEFAULT '23:59',          -- HH:MM
      days_of_week TEXT DEFAULT '1,2,3,4,5,6,7', -- 1=Mon, 7=Sun
      requires_coupon INTEGER NOT NULL DEFAULT 0,
      coupon_code TEXT,
      coupon_max_uses INTEGER DEFAULT 0,
      coupon_used_count INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 100,
      can_combine INTEGER NOT NULL DEFAULT 0, -- Can combine with other promotions
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_promo_tenant ON promotions(tenant_id, is_active, valid_from, valid_to);
    CREATE INDEX IF NOT EXISTS idx_promo_coupon ON promotions(coupon_code, is_active);
    CREATE INDEX IF NOT EXISTS idx_promo_type ON promotions(promotion_type, is_active);

    -- Promotion Applications (tracking for analytics and limits)
    CREATE TABLE IF NOT EXISTS promotion_applications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      promotion_id TEXT NOT NULL REFERENCES promotions(id),
      invoice_id TEXT REFERENCES invoices(id),
      customer_id TEXT REFERENCES customers(id),
      discount_amount REAL NOT NULL DEFAULT 0,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_papp_promo ON promotion_applications(promotion_id);
    CREATE INDEX IF NOT EXISTS idx_papp_invoice ON promotion_applications(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_papp_customer ON promotion_applications(customer_id);
    CREATE INDEX IF NOT EXISTS idx_papp_date ON promotion_applications(applied_at);

    -- Rounding Rules
    CREATE TABLE IF NOT EXISTS rounding_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      applies_to TEXT NOT NULL DEFAULT 'total', -- 'total', 'line', 'tax', 'payment'
      method TEXT NOT NULL DEFAULT 'standard', -- 'standard', 'up', 'down', 'banker', 'nearest_5', 'nearest_10', 'nearest_25', 'nearest_50', 'nearest_100'
      precision INTEGER NOT NULL DEFAULT 2,   -- Decimal places
      min_amount REAL DEFAULT 0,
      max_amount REAL,
      currency_code TEXT REFERENCES currencies(code),
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_rrule_tenant ON rounding_rules(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_rrule_default ON rounding_rules(is_default, is_active);

    -- Price Guards (min/max price enforcement)
    CREATE TABLE IF NOT EXISTS price_guards (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT REFERENCES products(id),
      category_id TEXT REFERENCES categories(id),
      brand_id TEXT REFERENCES brands(id),
      min_price REAL,
      max_price REAL,
      min_margin_pct REAL,                    -- Minimum margin %
      max_discount_pct REAL,                  -- Maximum discount %
      applies_to_roles TEXT DEFAULT '[]',     -- JSON array of roles (empty = all)
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pguard_tenant ON price_guards(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_pguard_product ON price_guards(product_id);
    CREATE INDEX IF NOT EXISTS idx_pguard_category ON price_guards(category_id);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migratePricing;
