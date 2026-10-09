/**
 * Migration v55 — Purchasing & Suppliers (supplier types, purchase terms, supply methods, PO cycle).
 *
 * Complete procurement management with:
 * - Supplier types and groups
 * - Purchase terms and conditions
 * - Supply methods (direct, dropship, consignment, etc.)
 * - Purchase Order → Receipt → Invoice → Payment cycle
 * - Return reasons for purchases
 * - Supplier documents and certifications
 */
export function migratePurchasing(db, addColumnIfMissing, { version = 55, description = 'purchasing & suppliers' } = {}) {
	db.exec(`
    -- Supplier Types
    CREATE TABLE IF NOT EXISTS supplier_types (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      default_payment_terms_id TEXT REFERENCES payment_terms(id),
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
    CREATE INDEX IF NOT EXISTS idx_stype_tenant ON supplier_types(tenant_id, is_active);

    -- Supplier Groups
    CREATE TABLE IF NOT EXISTS supplier_groups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
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
    CREATE INDEX IF NOT EXISTS idx_sgroup_tenant ON supplier_groups(tenant_id, is_active);

    -- Suppliers (enhanced)
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      short_name_ar TEXT DEFAULT '',
      short_name_en TEXT DEFAULT '',
      supplier_type_id TEXT REFERENCES supplier_types(id),
      supplier_group_id TEXT REFERENCES supplier_groups(id),
      payment_terms_id TEXT REFERENCES payment_terms(id),
      currency_code TEXT REFERENCES currencies(code),
      tax_number TEXT DEFAULT '',
      commercial_register TEXT DEFAULT '',
      contact_person TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      mobile TEXT DEFAULT '',
      email TEXT DEFAULT '',
      website TEXT DEFAULT '',
      address_ar TEXT DEFAULT '',
      address_en TEXT DEFAULT '',
      city_id TEXT REFERENCES cities(id),
      region_id TEXT REFERENCES regions(id),
      country_id TEXT REFERENCES countries(id),
      postal_code TEXT DEFAULT '',
      bank_name TEXT DEFAULT '',
      bank_account TEXT DEFAULT '',
      iban TEXT DEFAULT '',
      swift_code TEXT DEFAULT '',
      credit_limit REAL DEFAULT 0,
      credit_used REAL DEFAULT 0,
      rating INTEGER DEFAULT 0,               -- 1-5 rating
      preferred_supply_method TEXT DEFAULT 'direct', -- 'direct', 'dropship', 'consignment', 'vmi'
      lead_time_days INTEGER DEFAULT 0,
      min_order_amount REAL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_preferred INTEGER NOT NULL DEFAULT 0,
      onboarding_status TEXT DEFAULT 'active', -- 'pending', 'active', 'suspended', 'blocked'
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(supplier_type_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_suppliers_group ON suppliers(supplier_group_id, is_active);

    -- Supplier Documents
    CREATE TABLE IF NOT EXISTS supplier_documents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      document_type TEXT NOT NULL,            -- 'commercial_register', 'tax_card', 'certificate', 'insurance', 'license', 'other'
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
      UNIQUE(tenant_id, supplier_id, document_type, document_number)
    );
    CREATE INDEX IF NOT EXISTS idx_sdoc_supplier ON supplier_documents(supplier_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_sdoc_expiry ON supplier_documents(expiry_date);

    -- Purchase Orders
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      number TEXT NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
      branch_id TEXT REFERENCES branches(id),
      status TEXT NOT NULL DEFAULT 'draft',   -- 'draft', 'pending_approval', 'approved', 'sent', 'partial_receipt', 'received', 'invoiced', 'cancelled', 'closed'
      priority TEXT DEFAULT 'normal',         -- 'low', 'normal', 'high', 'urgent'
      order_date TEXT NOT NULL DEFAULT (date('now')),
      expected_date TEXT,
      required_date TEXT,
      currency_code TEXT NOT NULL REFERENCES currencies(code),
      exchange_rate REAL NOT NULL DEFAULT 1,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      balance_amount REAL NOT NULL DEFAULT 0,
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      internal_notes_ar TEXT DEFAULT '',
      internal_notes_en TEXT DEFAULT '',
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      sent_by TEXT REFERENCES users(id),
      sent_at TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, number)
    );
    CREATE INDEX IF NOT EXISTS idx_po_tenant ON purchase_orders(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id, status);
    CREATE INDEX IF NOT EXISTS idx_po_warehouse ON purchase_orders(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(order_date);
    CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(tenant_id, number);

    -- Purchase Order Items
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      po_id TEXT NOT NULL REFERENCES purchase_orders(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      variant_id TEXT REFERENCES product_variants(id),
      line_number INTEGER NOT NULL DEFAULT 1,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      uom_id TEXT REFERENCES units_of_measure(id),
      unit_price REAL NOT NULL DEFAULT 0,
      discount_percentage REAL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_id TEXT REFERENCES taxes(id),
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      received_qty REAL NOT NULL DEFAULT 0,
      invoiced_qty REAL NOT NULL DEFAULT 0,
      cancelled_qty REAL NOT NULL DEFAULT 0,
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(po_id);
    CREATE INDEX IF NOT EXISTS idx_poi_product ON purchase_order_items(product_id, variant_id);

    -- Goods Receipts (GRN - Goods Received Note)
    CREATE TABLE IF NOT EXISTS goods_receipts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      number TEXT NOT NULL,
      po_id TEXT REFERENCES purchase_orders(id),
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
      branch_id TEXT REFERENCES branches(id),
      receipt_date TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'partial', 'completed', 'returned', 'cancelled'
      delivery_note TEXT DEFAULT '',
      vehicle_number TEXT DEFAULT '',
      driver_name TEXT DEFAULT '',
      received_by TEXT REFERENCES users(id),
      inspected_by TEXT REFERENCES users(id),
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, number)
    );
    CREATE INDEX IF NOT EXISTS idx_gr_tenant ON goods_receipts(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_gr_po ON goods_receipts(po_id);
    CREATE INDEX IF NOT EXISTS idx_gr_supplier ON goods_receipts(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_gr_date ON goods_receipts(receipt_date);

    -- Goods Receipt Items
    CREATE TABLE IF NOT EXISTS goods_receipt_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      gr_id TEXT NOT NULL REFERENCES goods_receipts(id),
      po_item_id TEXT REFERENCES purchase_order_items(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      variant_id TEXT REFERENCES product_variants(id),
      line_number INTEGER NOT NULL DEFAULT 1,
      ordered_qty REAL NOT NULL DEFAULT 0,
      received_qty REAL NOT NULL DEFAULT 0,
      accepted_qty REAL NOT NULL DEFAULT 0,
      rejected_qty REAL NOT NULL DEFAULT 0,
      uom_id TEXT REFERENCES units_of_measure(id),
      batch_id TEXT REFERENCES product_batches(id),
      serial_numbers_json TEXT DEFAULT '[]',  -- JSON array of serial numbers
      expiry_date TEXT,
      unit_cost REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      quality_status TEXT DEFAULT 'accepted', -- 'accepted', 'rejected', 'pending_inspection'
      rejection_reason_ar TEXT DEFAULT '',
      rejection_reason_en TEXT DEFAULT '',
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gri_gr ON goods_receipt_items(gr_id);
    CREATE INDEX IF NOT EXISTS idx_gri_po_item ON goods_receipt_items(po_item_id);
    CREATE INDEX IF NOT EXISTS idx_gri_product ON goods_receipt_items(product_id, variant_id);
    CREATE INDEX IF NOT EXISTS idx_gri_batch ON goods_receipt_items(batch_id);

    -- Purchase Invoices (Supplier Invoices)
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      number TEXT NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      gr_id TEXT REFERENCES goods_receipts(id),
      po_id TEXT REFERENCES purchase_orders(id),
      branch_id TEXT REFERENCES branches(id),
      invoice_date TEXT NOT NULL DEFAULT (date('now')),
      due_date TEXT,
      currency_code TEXT NOT NULL REFERENCES currencies(code),
      exchange_rate REAL NOT NULL DEFAULT 1,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      balance_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'partial_paid', 'paid', 'overdue', 'cancelled', 'disputed'
      payment_terms_id TEXT REFERENCES payment_terms(id),
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      supplier_invoice_number TEXT DEFAULT '',
      supplier_invoice_date TEXT,
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, number)
    );
    CREATE INDEX IF NOT EXISTS idx_pinv_tenant ON purchase_invoices(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_pinv_supplier ON purchase_invoices(supplier_id, status);
    CREATE INDEX IF NOT EXISTS idx_pinv_due ON purchase_invoices(due_date, status);
    CREATE INDEX IF NOT EXISTS idx_pinv_date ON purchase_invoices(invoice_date);

    -- Purchase Invoice Items
    CREATE TABLE IF NOT EXISTS purchase_invoice_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      pi_id TEXT NOT NULL REFERENCES purchase_invoices(id),
      gr_item_id TEXT REFERENCES goods_receipt_items(id),
      po_item_id TEXT REFERENCES purchase_order_items(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      variant_id TEXT REFERENCES product_variants(id),
      line_number INTEGER NOT NULL DEFAULT 1,
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      uom_id TEXT REFERENCES units_of_measure(id),
      unit_price REAL NOT NULL DEFAULT 0,
      discount_percentage REAL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      tax_id TEXT REFERENCES taxes(id),
      tax_rate REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pii_pi ON purchase_invoice_items(pi_id);
    CREATE INDEX IF NOT EXISTS idx_pii_gr_item ON purchase_invoice_items(gr_item_id);
    CREATE INDEX IF NOT EXISTS idx_pii_product ON purchase_invoice_items(product_id, variant_id);

    -- Purchase Return Reasons
    CREATE TABLE IF NOT EXISTS purchase_return_reasons (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      requires_approval INTEGER NOT NULL DEFAULT 1,
      affects_inventory INTEGER NOT NULL DEFAULT 1,
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
    CREATE INDEX IF NOT EXISTS idx_pret_tenant ON purchase_return_reasons(tenant_id, is_active);

    -- Purchase Returns
    CREATE TABLE IF NOT EXISTS purchase_returns (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      number TEXT NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
      pi_id TEXT REFERENCES purchase_invoices(id),
      gr_id TEXT REFERENCES goods_receipts(id),
      return_date TEXT NOT NULL DEFAULT (date('now')),
      reason_id TEXT REFERENCES purchase_return_reasons(id),
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'received', 'credited', 'rejected', 'cancelled'
      total_amount REAL NOT NULL DEFAULT 0,
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      created_by TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, number)
    );
    CREATE INDEX IF NOT EXISTS idx_preturn_tenant ON purchase_returns(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_preturn_supplier ON purchase_returns(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_preturn_date ON purchase_returns(return_date);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migratePurchasing;