/**
 * Doctype specs for dypos.client.get_list / get_value / get — extracted from
 * routes/method.js under the file-size ratchet (server/tests/fileSize.test.js).
 *
 * These are pure data + pure mappers: no Express request, no DB handle. The
 * contract gates import them directly (`tests/doctype-contract.test.js`,
 * `tests/reports-data.test.js`), and routes/method.js re-exports them so its
 * public surface is unchanged.
 *
 * The coupon projection rides along because DOCTYPES.Coupons.mapRow calls it.
 */

/**
 * Doctype → table map for dypos.client.get_list / get_value / get.
 *
 * Exported for the doctype/field contract gate (`tests/doctype-contract.test.js`),
 * which proves every doctype the report layer asks for resolves to a REAL table
 * and produces the fields it reads. An entry that exists but maps to nothing is
 * the failure mode that made dashboards render confident zeros.
 */
export const DOCTYPES = {
  Item: {
    table: 'products',
    idCol: 'id',
    fields: {
      name: 'id', item_code: 'code', item_name: 'name', description: 'description',
      stock_uom: 'uom', image: 'image', item_group: 'category', brand: 'brand',
      barcode: 'barcode', disabled: 'is_active', is_stock_item: 'is_stock_item',
      valuation_rate: 'cost_price', standard_rate: 'unit_price',
    },
    mapRow(r) {
      return {
        name: r.id, item_code: r.code, item_name: r.name, description: r.description || '',
        stock_uom: r.uom || 'Unit', image: r.image || '', item_group: r.category || '',
        brand: r.brand || '', barcode: r.barcode || '',
        disabled: r.is_active === 0 ? 1 : 0, is_stock_item: r.is_stock_item ?? 1,
        valuation_rate: r.cost_price ?? 0, standard_rate: r.unit_price ?? 0,
        unit_price: r.unit_price ?? 0, cost_price: r.cost_price ?? 0,
        category: r.category || '', uom: r.uom || 'Unit', is_active: r.is_active,
        stock_qty: r.stock_qty ?? 0,
      };
    },
    defaultWhere: 'is_active=1',
    idAliases: ['id', 'code', 'name', 'item_code'],
  },
  Customer: {
    table: 'customers',
    idCol: 'id',
    fields: {
      name: 'id', customer_name: 'name', mobile_no: 'phone', phone: 'phone',
      email_id: 'email', customer_group: 'group', territory: 'territory',
      disabled: 'is_active',
    },
    mapRow(r) {
      return {
        name: r.id, customer_name: r.name, mobile_no: r.phone || '', phone: r.phone || '',
        email_id: r.email || '', customer_group: r.group || '', territory: r.territory || '',
        disabled: r.is_active === 0 ? 1 : 0, is_active: r.is_active,
        loyalty_points: r.loyalty_points ?? 0, credit_limit: r.credit_limit ?? 0,
        wallet_balance: r.wallet_balance ?? 0,
      };
    },
    defaultWhere: null,
    idAliases: ['id', 'name', 'phone'],
  },
  'Sales Invoice': {
    table: 'invoices',
    idCol: 'id',
    fields: {
      name: 'id', number: 'number', customer: 'customer_id',
      customer_name: 'customer_name', shift_id: 'shift_id', terminal_id: 'terminal_id',
      grand_total: 'total', status: 'status', posting_date: 'created_at',
      company: 'tenant_id',
      // Financial facts the report layer sums. Every one of these used to be
      // MISSING from this projection, so `sumBy(invoices, "base_net_total")`
      // summed `undefined` and "Total Revenue" rendered a confident 0.00
      // against a perfectly healthy server.
      base_net_total: 'subtotal',
      base_grand_total: 'total',
      base_total_taxes_and_charges: 'tax_amount',
      base_discount_amount: 'discount_amount',
      base_paid_amount: 'paid_amount',
      outstanding_amount: 'remaining_amount',
    },
    mapRow(r) {
      return {
        name: r.id, number: r.number || r.id, customer: r.customer_id,
        customer_name: r.customer_name || '',
        // The SQLite invoices table has no due_date column; emitting a derived
        // date would make every receivable look overdue, so it stays null and
        // the aging calculator buckets it as "not yet due".
        due_date: null,
        shift_id: r.shift_id || null,
        terminal_id: r.terminal_id || null,
        grand_total: r.total ?? 0,
        base_net_total: r.subtotal ?? 0,
        base_grand_total: r.total ?? 0,
        base_total_taxes_and_charges: r.tax_amount ?? 0,
        base_discount_amount: r.discount_amount ?? 0,
        base_paid_amount: r.paid_amount ?? 0,
        // `outstanding_amount` never existed on this row shape, so receivables
        // were always empty. `remaining_amount` is the real unpaid balance.
        outstanding_amount: r.remaining_amount ?? 0,
        status: r.status || 'PAID',
        posting_date: r.created_at,
        company: r.tenant_id || '',
        // A return is not a separate row: `applyInvoiceReturn` rewrites the
        // original invoice (status RETURNED, totals recomputed, negative REFUND
        // payment). So the truthful flag is the status, and the amounts the
        // reports sum are already net — the field simply never existed before.
        is_return: r.status === 'RETURNED' ? 1 : 0,
        docstatus: r.status === 'PAID' ? 1 : 0,
      };
    },
    defaultWhere: null,
    idAliases: ['id', 'number'],
  },
  User: {
    table: 'users',
    idCol: 'id',
    // Never expose credential material via dypos.client.* — even if the
    // caller omits fields (SELECT *) or explicitly asks for password_hash.
    safeColumns: ['id', 'username', 'full_name', 'role', 'is_active', 'tenant_id', 'created_at'],
    forbidden: new Set(['password_hash', 'password', 'token', 'api_key', 'secret']),
    fields: { name: 'username', full_name: 'full_name', email: 'username', role: 'role', enabled: 'is_active' },
    mapRow(r) {
      return { name: r.username, full_name: r.full_name, email: r.username, role: r.role, enabled: r.is_active };
    },
    defaultWhere: 'is_active=1',
    idAliases: ['id', 'username'],
  },
  UOM: {
    table: 'uoms',
    idCol: 'code',
    fields: { name: 'code', uom_name: 'name', category: 'category' },
    mapRow(r) { return { name: r.code, uom_name: r.name, category: r.category, code: r.code }; },
    defaultWhere: 'is_active=1',
    idAliases: ['code', 'name'],
  },
  Coupons: {
    table: 'coupons',
    idCol: 'id',
    fields: {
      name: 'code', coupon_name: 'code', coupon_code: 'code',
      discount_type: 'discount_type', discount: 'discount',
      discount_amount: 'discount', discount_percentage: 'discount',
      min_amount: 'min_purchase', min_purchase: 'min_purchase',
      max_amount: 'max_discount', max_discount: 'max_discount',
      maximum_use: 'max_uses', max_uses: 'max_uses', used_count: 'used_count',
      valid_from: 'valid_from', valid_upto: 'valid_to', valid_to: 'valid_to',
      disabled: 'is_active', is_active: 'is_active',
    },
    mapRow(r) { return mapCoupon(r); },
    defaultWhere: null,
    idAliases: ['id', 'code', 'name', 'coupon_name', 'coupon_code'],
  },
  Shifts: {
    table: 'shifts',
    idCol: 'id',
    fields: {
      name: 'id', terminal_id: 'terminal_id', status: 'status',
      opening_cash: 'opening_cash', closing_cash: 'closing_cash',
      opened_at: 'opened_at', closed_at: 'closed_at',
    },
    mapRow(r) {
      return {
        name: r.id, id: r.id, terminal_id: r.terminal_id, status: r.status,
        opening_cash: r.opening_cash ?? 0, closing_cash: r.closing_cash,
        expected_cash: r.expected_cash, variance: r.variance,
        opened_at: r.opened_at, closed_at: r.closed_at, opened_by: r.opened_by,
      };
    },
    defaultWhere: null,
    idAliases: ['id', 'name'],
  },
};

export function resolveDoctype(doctype) {
  const key = String(doctype || '').trim();
  if (DOCTYPES[key]) return DOCTYPES[key];
  // Common aliases
  const aliases = {
    'POS Invoice': 'Sales Invoice',
    Item: 'Item',
    Bin: null, // no Bin table — empty list
    'Serial No': null,
    'Customer Group': null,
    Territory: null,
    District: null,
    Campaign: null,
    'Selling Settings': null,
    'POS Profile': null,
    'POS Settings': null,
    'Promotional Scheme': null,
    'POS Coupon': 'Coupons',
    'POS Opening Shift': 'Shifts',
    'POS Closing Shift': 'Shifts',
    'Payment Entry': null,
    'Purchase Invoice': null,
    'DyPOS User Data': null,
    'DyPOS Settings': null,
  };
  if (Object.hasOwn(aliases, key)) {
    const mapped = aliases[key];
    return mapped ? DOCTYPES[mapped] : null;
  }
  return null;
}

export function couponStatus(c) {
  const t = new Date().toISOString().slice(0, 10);
  if (Number(c.is_active) !== 1) return 'Disabled';
  if (c.valid_from && String(c.valid_from).slice(0, 10) > t) return 'Scheduled';
  if (c.valid_to && String(c.valid_to).slice(0, 10) < t) return 'Expired';
  if (Number(c.max_uses) > 0 && Number(c.used_count) >= Number(c.max_uses)) return 'Exhausted';
  return 'Active';
}

export function mapCoupon(c) {
  const pct = String(c.discount_type).toUpperCase() === 'PCT';
  return {
    name: c.code,
    coupon_name: c.code,
    coupon_code: c.code,
    coupon_type: 'Promotional',
    discount_type: pct ? 'Percentage' : 'Amount',
    discount_percentage: pct ? Number(c.discount) || 0 : 0,
    discount_amount: pct ? 0 : Number(c.discount) || 0,
    min_amount: Number(c.min_purchase) || 0,
    max_amount: Number(c.max_discount) || 0,
    apply_on: 'Grand Total',
    valid_from: c.valid_from ? String(c.valid_from).slice(0, 10) : '',
    valid_upto: c.valid_to ? String(c.valid_to).slice(0, 10) : '',
    maximum_use: Number(c.max_uses) || 0,
    used_count: Number(c.used_count) || 0,
    status: couponStatus(c),
    disabled: Number(c.is_active) === 1 ? 0 : 1,
  };
}
