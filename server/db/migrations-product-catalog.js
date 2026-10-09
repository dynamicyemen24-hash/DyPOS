/**
 * Migration v52 — Professional Product Catalog (products, attributes, variants, barcodes).
 *
 * Complete product master with:
 * - Hierarchical categories
 * - Brands
 * - Attributes (size, color, etc.)
 * - Variants (matrix of attribute values)
 * - Multiple barcodes (EAN13, UPC, Code128, QR, custom)
 * - Batch/Lot tracking
 * - Serial numbers
 * - Expiry dates
 * - Packaging hierarchy
 * - Kits/BOMs (composite products)
 * - Raw materials & recipes (for restaurants)
 */
export function migrateProductCatalog(db, addColumnIfMissing, { version = 52, description = 'professional product catalog' } = {}) {
	db.exec(`
    -- Brands
    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      logo_url TEXT DEFAULT '',
      description_ar TEXT DEFAULT '',
      description_en TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      source_template_id TEXT,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_brands_tenant ON brands(tenant_id, is_active);

    -- Product Attributes (Size, Color, Material, etc.)
    CREATE TABLE IF NOT EXISTS product_attributes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT DEFAULT '',
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      input_type TEXT NOT NULL DEFAULT 'select', -- 'select', 'text', 'number', 'boolean', 'color'
      values_json TEXT NOT NULL DEFAULT '[]',   -- JSON array of allowed values
      is_required INTEGER NOT NULL DEFAULT 0,
      is_variant INTEGER NOT NULL DEFAULT 1,    -- Creates variants matrix
      is_filterable INTEGER NOT NULL DEFAULT 1, -- Available in search filters
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      source_template_id TEXT,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_pattr_tenant ON product_attributes(tenant_id, is_active);

    -- Product Attribute Values (for select type)
    CREATE TABLE IF NOT EXISTS product_attribute_values (
      id TEXT PRIMARY KEY,
      attribute_id TEXT NOT NULL REFERENCES product_attributes(id),
      tenant_id TEXT DEFAULT '',
      value_ar TEXT NOT NULL,
      value_en TEXT NOT NULL,
      color_code TEXT DEFAULT '',              -- Hex color for color attributes
      image_url TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pattr_val_attr ON product_attribute_values(attribute_id, is_active);
  `);

	// Products: the table already exists from the initial migration with the
	// legacy shape (category/brand/uom as free text). CREATE TABLE IF NOT
	// EXISTS would silently skip it and every catalog index below would then
	// fail on a missing column — so the catalog rung is added IN PLACE.
	const productCatalogColumns = [
		["name_en", "TEXT NOT NULL DEFAULT ''"],
		["description_ar", "TEXT DEFAULT ''"],
		["description_en", "TEXT DEFAULT ''"],
		['category_id', 'TEXT REFERENCES categories(id)'],
		['brand_id', 'TEXT REFERENCES brands(id)'],
		["product_type", "TEXT NOT NULL DEFAULT 'simple'"],
		['uom_id', 'TEXT REFERENCES units_of_measure(id)'],
		['sale_uom_id', 'TEXT REFERENCES units_of_measure(id)'],
		['purchase_uom_id', 'TEXT REFERENCES units_of_measure(id)'],
		['tax_id', 'TEXT REFERENCES taxes(id)'],
		['tax_group_id', 'TEXT REFERENCES tax_groups(id)'],
		['weight', 'REAL DEFAULT 0'],
		['weight_uom_id', 'TEXT REFERENCES units_of_measure(id)'],
		['length', 'REAL DEFAULT 0'],
		['width', 'REAL DEFAULT 0'],
		['height', 'REAL DEFAULT 0'],
		['dimension_uom_id', 'TEXT REFERENCES units_of_measure(id)'],
		['min_stock_level', 'REAL DEFAULT 0'],
		['max_stock_level', 'REAL DEFAULT 0'],
		['reorder_qty', 'REAL DEFAULT 0'],
		["valuation_method", "TEXT NOT NULL DEFAULT 'fifo'"],
		['standard_cost', 'REAL DEFAULT 0'],
		['track_batch', 'INTEGER NOT NULL DEFAULT 0'],
		['track_serial', 'INTEGER NOT NULL DEFAULT 0'],
		['track_expiry', 'INTEGER NOT NULL DEFAULT 0'],
		['shelf_life_days', 'INTEGER DEFAULT 0'],
		['allow_negative_stock', 'INTEGER NOT NULL DEFAULT 0'],
		['is_sellable', 'INTEGER NOT NULL DEFAULT 1'],
		['is_purchasable', 'INTEGER NOT NULL DEFAULT 1'],
		['is_manufacturable', 'INTEGER NOT NULL DEFAULT 0'],
		["image_url", "TEXT DEFAULT ''"],
		["images_json", "TEXT DEFAULT '[]'"],
		["tags_json", "TEXT DEFAULT '[]'"],
		["attributes_json", "TEXT DEFAULT '{}'"],
		["variant_config_json", "TEXT DEFAULT '{}'"],
		["metadata_json", "TEXT DEFAULT '{}'"],
	];
	for (const [col, ddl] of productCatalogColumns) addColumnIfMissing('products', col, ddl);

	db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type, is_active);

    -- Product Variants (generated from attribute matrix)
    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      parent_product_id TEXT NOT NULL REFERENCES products(id),
      code TEXT NOT NULL,                       -- Variant SKU
      barcode TEXT,
      name_ar TEXT DEFAULT '',
      name_en TEXT DEFAULT '',
      attributes_json TEXT NOT NULL DEFAULT '{}', -- {attribute_id: value_id, ...}
      unit_price REAL NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      weight REAL DEFAULT 0,
      image_url TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      min_stock_level REAL DEFAULT 0,
      max_stock_level REAL DEFAULT 0,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, parent_product_id, code)
    );
    CREATE INDEX IF NOT EXISTS idx_pvar_parent ON product_variants(parent_product_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_pvar_code ON product_variants(tenant_id, code);
    CREATE INDEX IF NOT EXISTS idx_pvar_barcode ON product_variants(barcode);

    -- Product Barcodes (multiple per product/variant)
    CREATE TABLE IF NOT EXISTS product_barcodes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT REFERENCES products(id),
      variant_id TEXT REFERENCES product_variants(id),
      barcode TEXT NOT NULL,
      barcode_type TEXT NOT NULL DEFAULT 'EAN13', -- 'EAN13', 'EAN8', 'UPC-A', 'UPC-E', 'CODE128', 'QR', 'CUSTOM'
      is_primary INTEGER NOT NULL DEFAULT 0,
      packaging_level TEXT DEFAULT 'unit',        -- 'unit', 'inner', 'outer', 'pallet'
      qty_in_pack REAL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, barcode)
    );
    CREATE INDEX IF NOT EXISTS idx_pbar_product ON product_barcodes(product_id);
    CREATE INDEX IF NOT EXISTS idx_pbar_variant ON product_barcodes(variant_id);
    CREATE INDEX IF NOT EXISTS idx_pbar_barcode ON product_barcodes(barcode);

    -- Product Packaging (hierarchy: unit → inner box → outer box → pallet)
    CREATE TABLE IF NOT EXISTS product_packaging (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id),
      level TEXT NOT NULL,                    -- 'unit', 'inner', 'outer', 'pallet'
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      uom_id TEXT REFERENCES units_of_measure(id),
      qty_per_unit REAL NOT NULL DEFAULT 1,   -- How many base units in this pack
      barcode TEXT,
      barcode_type TEXT DEFAULT 'EAN13',
      weight REAL DEFAULT 0,
      length REAL DEFAULT 0,
      width REAL DEFAULT 0,
      height REAL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, product_id, level)
    );
    CREATE INDEX IF NOT EXISTS idx_ppack_product ON product_packaging(product_id, is_active);

    -- Kits / Bill of Materials (composite products)
    CREATE TABLE IF NOT EXISTS product_kits (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      parent_product_id TEXT NOT NULL REFERENCES products(id), -- The kit product
      component_product_id TEXT NOT NULL REFERENCES products(id), -- Component
      component_variant_id TEXT REFERENCES product_variants(id),
      quantity REAL NOT NULL DEFAULT 1,
      uom_id TEXT REFERENCES units_of_measure(id),
      is_optional INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, parent_product_id, component_product_id, component_variant_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pkit_parent ON product_kits(parent_product_id);
    CREATE INDEX IF NOT EXISTS idx_pkit_component ON product_kits(component_product_id);

    -- Recipes (for restaurants/manufacturing) - links products to raw materials
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id), -- Finished product
      variant_id TEXT REFERENCES product_variants(id),
      name_ar TEXT NOT NULL,
      name_en TEXT NOT NULL,
      yield_quantity REAL NOT NULL DEFAULT 1,
      yield_uom_id TEXT REFERENCES units_of_measure(id),
      instructions_ar TEXT DEFAULT '',
      instructions_en TEXT DEFAULT '',
      prep_time_minutes INTEGER DEFAULT 0,
      cook_time_minutes INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_recipes_product ON recipes(product_id, is_active);

    CREATE TABLE IF NOT EXISTS recipe_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      recipe_id TEXT NOT NULL REFERENCES recipes(id),
      product_id TEXT NOT NULL REFERENCES products(id), -- Raw material
      variant_id TEXT REFERENCES product_variants(id),
      quantity REAL NOT NULL,
      uom_id TEXT REFERENCES units_of_measure(id),
      waste_percentage REAL DEFAULT 0,
      is_optional INTEGER NOT NULL DEFAULT 0,
      step_order INTEGER NOT NULL DEFAULT 100,
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, recipe_id, product_id, variant_id, step_order)
    );
    CREATE INDEX IF NOT EXISTS idx_ritem_recipe ON recipe_items(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_ritem_product ON recipe_items(product_id);

    -- Batch/Lot tracking
    CREATE TABLE IF NOT EXISTS product_batches (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id),
      variant_id TEXT REFERENCES product_variants(id),
      batch_number TEXT NOT NULL,
      manufacture_date TEXT,
      expiry_date TEXT,
      supplier_id TEXT REFERENCES suppliers(id), -- If purchased
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, product_id, batch_number)
    );
    CREATE INDEX IF NOT EXISTS idx_pbatch_product ON product_batches(product_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_pbatch_expiry ON product_batches(expiry_date, is_active);
    CREATE INDEX IF NOT EXISTS idx_pbatch_number ON product_batches(batch_number);

    -- Serial numbers
    CREATE TABLE IF NOT EXISTS product_serials (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES products(id),
      variant_id TEXT REFERENCES product_variants(id),
      batch_id TEXT REFERENCES product_batches(id),
      serial_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_stock', -- 'in_stock', 'sold', 'returned', 'damaged', 'lost'
      sold_at TEXT,
      sold_invoice_id TEXT REFERENCES invoices(id),
      customer_id TEXT REFERENCES customers(id),
      warranty_expiry TEXT,
      notes_ar TEXT DEFAULT '',
      notes_en TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, serial_number)
    );
    CREATE INDEX IF NOT EXISTS idx_pserial_product ON product_serials(product_id, status);
    CREATE INDEX IF NOT EXISTS idx_pserial_batch ON product_serials(batch_id);
    CREATE INDEX IF NOT EXISTS idx_pserial_status ON product_serials(status);
  `);

	db.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
}

export default migrateProductCatalog;