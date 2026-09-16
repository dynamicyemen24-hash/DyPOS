import { Router } from 'express';
import db from '../db/schema.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Read-only integration roles. CASHIER is intentionally excluded.
router.use(requireRole('ADMIN', 'MANAGER', 'AUDITOR'));

const ENTITIES = {
  products: {
    columns: ['id', 'code', 'name', 'name_ar', 'barcode', 'unit_price', 'cost', 'tax_rate', 'uom', 'category', 'brand', 'is_active'],
    sql: 'SELECT * FROM products ORDER BY name',
    args: () => [],
  },
  customers: {
    columns: ['id', 'name', 'phone', 'email', 'tax_number', 'loyalty_tier', 'loyalty_points', 'wallet_balance', 'credit_limit', 'credit_used'],
    sql: 'SELECT * FROM customers ORDER BY name',
    args: () => [],
  },
  invoices: {
    columns: ['id', 'number', 'customer_id', 'customer_name', 'subtotal', 'discount_amount', 'tax_amount', 'total', 'paid_amount', 'remaining_amount', 'status', 'currency', 'terminal_id', 'created_at', 'paid_at'],
    sql: 'SELECT * FROM invoices WHERE 1=1',
    args: (q) => {
      const a = [];
      let s = 'SELECT * FROM invoices WHERE 1=1';
      if (q.from) { s += ' AND date(created_at)>=date(?)'; a.push(String(q.from).slice(0, 10)); }
      if (q.to) { s += ' AND date(created_at)<=date(?)'; a.push(String(q.to).slice(0, 10)); }
      if (q.status) { s += ' AND status=?'; a.push(String(q.status).slice(0, 20)); }
      return { sql: s + ' ORDER BY created_at DESC', args: a };
    },
  },
  invoice_items: {
    columns: ['id', 'invoice_id', 'product_id', 'product_name', 'barcode', 'qty', 'unit_price', 'discount', 'tax_rate', 'tax_amount', 'total', 'uom', 'warehouse_id'],
    sql: 'SELECT * FROM invoice_items ORDER BY rowid',
    args: () => [],
  },
  payments: {
    columns: ['id', 'invoice_id', 'method', 'amount', 'reference', 'created_at'],
    sql: 'SELECT * FROM payments ORDER BY created_at',
    args: () => [],
  },
  stock: {
    columns: ['product_id', 'warehouse_id', 'qty', 'reserved_qty', 'allocated_qty', 'updated_at'],
    sql: 'SELECT * FROM stock_levels ORDER BY warehouse_id, product_id',
    args: () => [],
  },
  shifts: {
    columns: ['id', 'terminal_id', 'opened_by', 'opening_cash', 'closing_cash', 'expected_cash', 'variance', 'status', 'opened_at', 'closed_at', 'total_sales', 'orders_count'],
    sql: 'SELECT * FROM shifts ORDER BY opened_at DESC',
    args: () => [],
  },
};

// GET /api/export/:entity?format=csv|json&limit=&from=&to=&status=
router.get('/:entity', (req, res) => {
  const def = ENTITIES[req.params.entity];
  if (!def) return res.status(404).json({ error: 'كيان غير مدعوم', supported: Object.keys(ENTITIES) });
  const format = String(req.query.format || 'csv').toLowerCase();
  if (!['csv', 'json'].includes(format)) return res.status(400).json({ error: 'الصيغة csv أو json فقط' });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 1000, 1), 10000);

  const built = typeof def.args === 'function' && def.args.length ? def.args(req.query) : { sql: def.sql, args: def.args() };
  const rows = db.prepare(`${built.sql} LIMIT ?`).all(...built.args, limit);

  req.audit?.('export.run', { entity: req.params.entity, format, count: rows.length });
  if (format === 'json') {
    return res.json({ entity: req.params.entity, exported_at: new Date().toISOString(), count: rows.length, rows });
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dypos-${req.params.entity}-${new Date().toISOString().slice(0, 10)}.csv"`);
  // Chunked write: constant memory even for 10k rows
  res.write('﻿' + def.columns.map((c) => (/,|"|\r|\n/.test(c) ? `"${c}"` : c)).join(',') + '\r\n');
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
      .map((r) => def.columns.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')).join('\r\n') + '\r\n';
    res.write(chunk);
  }
  return res.end();
});

export default router;
