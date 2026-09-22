/** DyPOS Integration Mappers v1.31.0 — DyPOS invoice/product to external shapes. */

/** Map a DyPOS invoice row + items to a generic external invoice payload. */
export function mapInvoiceToExternal(invoice, items = [], payments = []) {
  return {
    externalRef: invoice.number || invoice.id,
    dyposId: invoice.id,
    customer: invoice.customer_name || 'Walk-in Customer',
    currency: invoice.currency || 'SAR',
    subtotal: Number(invoice.subtotal) || 0,
    discount: Number(invoice.discount_amount) || 0,
    tax: Number(invoice.tax_amount) || 0,
    total: Number(invoice.total) || 0,
    status: invoice.status || 'UNPAID',
    lines: (items || []).map((it) => ({
      sku: it.product_id,
      name: it.product_name,
      qty: Number(it.qty) || 0,
      unitPrice: Number(it.unit_price) || 0,
      total: Number(it.total) || 0,
    })),
    payments: (payments || []).map((p) => ({
      method: p.method,
      amount: Number(p.amount) || 0,
      reference: p.reference || null,
    })),
  };
}

/** Map an external product row into the DyPOS import shape. */
export function mapExternalToProduct(row) {
  return {
    code: String(row.code || row.sku || row.id || '').slice(0, 64),
    name: String(row.name || row.title || 'Unnamed').slice(0, 200),
    unit_price: Number(row.unit_price ?? row.price ?? 0) || 0,
    barcode: String(row.barcode || '').slice(0, 64),
  };
}

export default { mapInvoiceToExternal, mapExternalToProduct };
