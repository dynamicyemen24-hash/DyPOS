/**
 * Migration v2 — initial schema creation.
 *
 * Extracted from db/schema.js under the file-size ratchet
 * (server/tests/fileSize.test.js). Behavior is byte-for-byte the original
 * block: the DDL and the schema_version stamp all moved together so
 * a fresh install and an upgrade land on the same schema.
 *
 * Called from migrate(); `db`, `addColumnIfMissing` and `currentVersion` are the
 * only dependencies.
 */

export function migrateInitial(db, addColumnIfMissing, currentVersion) {
	if (currentVersion < 2) {
		// ── Products ─────────────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        name_ar TEXT,
        barcode TEXT,
        unit_price REAL NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        tax_rate REAL NOT NULL DEFAULT 15,
        uom TEXT NOT NULL DEFAULT 'Unit',
        image TEXT,
        category TEXT,
        brand TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    `);

		// ── Customers ────────────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        tax_number TEXT,
        loyalty_tier TEXT NOT NULL DEFAULT 'BRONZE',
        loyalty_points INTEGER NOT NULL DEFAULT 0,
        wallet_balance REAL NOT NULL DEFAULT 0,
        credit_limit REAL NOT NULL DEFAULT 0,
        credit_used REAL NOT NULL DEFAULT 0,
        address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
      CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
    `);

		// ── Warehouses ───────────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        is_active INTEGER NOT NULL DEFAULT 1
      );
    `);

		// ── Stock Levels ─────────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS stock_levels (
        product_id TEXT NOT NULL REFERENCES products(id),
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        qty REAL NOT NULL DEFAULT 0,
        reserved_qty REAL NOT NULL DEFAULT 0,
        allocated_qty REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (product_id, warehouse_id)
      );
    `);

		// ── Shifts ───────────────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS shifts (
        id TEXT PRIMARY KEY,
        terminal_id TEXT NOT NULL,
        opened_by TEXT NOT NULL,
        opening_cash REAL NOT NULL DEFAULT 0,
        closing_cash REAL,
        expected_cash REAL,
        variance REAL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at TEXT,
        closed_by TEXT,
        cash_sales REAL,
        total_sales REAL,
        orders_count INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_shifts_terminal ON shifts(terminal_id, status);
    `);

		// ── Invoices ─────────────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        number TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT NOT NULL DEFAULT 'Walk-in Customer',
        shift_id TEXT,
        terminal_id TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        paid_amount REAL NOT NULL DEFAULT 0,
        remaining_amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'UNPAID',
        paid_at TEXT,
        voided_at TEXT,
        voided_by TEXT,
        returned_at TEXT,
        returned_by TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_shift ON invoices(shift_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);
    `);

		// ── Invoice Items ────────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id),
        product_id TEXT,
        product_name TEXT,
        barcode TEXT,
        qty REAL NOT NULL,
        unit_price REAL NOT NULL,
        discount REAL NOT NULL DEFAULT 0,
        tax_rate REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        uom TEXT,
        warehouse_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
    `);

		// ── Payments ─────────────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id),
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        reference TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
    `);

		// ── Offers ───────────────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'PERCENT',
        value REAL NOT NULL DEFAULT 0,
        min_qty REAL NOT NULL DEFAULT 0,
        max_qty REAL NOT NULL DEFAULT 0,
        min_amount REAL NOT NULL DEFAULT 0,
        max_amount REAL NOT NULL DEFAULT 0,
        applies_to TEXT NOT NULL DEFAULT 'ALL',
        item_groups TEXT,
        valid_from TEXT,
        valid_to TEXT,
        one_time_per_customer INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

		// ── Coupons ──────────────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        discount_type TEXT NOT NULL DEFAULT 'PCT',
        discount REAL NOT NULL DEFAULT 0,
        max_discount REAL NOT NULL DEFAULT 0,
        min_purchase REAL NOT NULL DEFAULT 0,
        max_uses INTEGER NOT NULL DEFAULT 0,
        used_count INTEGER NOT NULL DEFAULT 0,
        valid_from TEXT,
        valid_to TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
    `);

		// ── Hardware devices + growth engine ─────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS hardware_devices (
        id TEXT PRIMARY KEY,
        device_name TEXT,
        device_type TEXT,
        connection_type TEXT,
        connection_target TEXT,
        is_default INTEGER DEFAULT 0,
        settings_json TEXT DEFAULT '{}',
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS store_synergies (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        partner_store_name TEXT,
        partner_store_category TEXT,
        offer_text_ar TEXT,
        discount_code TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS merchant_insights (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        metric_key TEXT,
        metric_value TEXT,
        insight_text_ar TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS customer_feedback (
        id TEXT PRIMARY KEY,
        invoice_id TEXT,
        rating INTEGER,
        comment TEXT,
        created_at TEXT
      );
    `);

		// ── Loyalty Transactions ─────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        points INTEGER NOT NULL DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        type TEXT NOT NULL,
        reference_type TEXT,
        reference_id TEXT,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customer_id);
    `);

		// ── Users (for auth) ────────────────────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'CASHIER',
        is_active INTEGER NOT NULL DEFAULT 1,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

		// ── Sync Log (for ERP integration) ───────────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload TEXT,
        synced_at TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_log(status);
    `);

		// ── Sessions (for token revocation list) ─────────────────────────
		db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        issued_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        ip_address TEXT,
        user_agent TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
    `);

		// ── v2: correctness + scale ──────────────────────────────────────
		addColumnIfMissing('invoices', 'currency', "TEXT NOT NULL DEFAULT 'SAR'");
		addColumnIfMissing('invoices', 'channel_id', "TEXT NOT NULL DEFAULT ''");
		addColumnIfMissing('invoices', 'idempotency_key', 'TEXT');
		db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON invoices(number);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idem ON invoices(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_invoices_terminal_created ON invoices(terminal_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id);
      CREATE INDEX IF NOT EXISTS idx_products_active_cat ON products(is_active, category);
      CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
      CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON stock_levels(warehouse_id, product_id);
      CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);
      CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_log(entity_type, status, id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);
		db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(
			2,
			'Auto-migration v2',
		);
	}
}
