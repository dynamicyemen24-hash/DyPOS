import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';

const router = Router();

// POST /api/invoices — create sale (idempotent via idempotency_key)
router.post('/', (req, res) => {
  const b = req.body;
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return res.status(400).json({ error: 'سلة فارغة' });

  const idemKey = String(b.idempotencyKey || '').trim();
  if (idemKey) {
    const existing = db.prepare('SELECT id FROM invoices WHERE id=? OR notes LIKE ?').get(idemKey, `%idem:${idemKey}%`);
    if (existing) return res.json({ deduped: true, invoiceId: existing.id });
  }

  const invoiceId = uuid();
  const number = `INV-${Date.now()}`;
  let subtotal = 0, taxTotal = 0, cogsTotal = 0;

  const insertItem = db.prepare(`INSERT INTO invoice_items (id,invoice_id,product_id,product_name,barcode,qty,unit_price,discount,tax_rate,tax_amount,total,uom,warehouse_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertPayment = db.prepare(`INSERT INTO payments (id,invoice_id,method,amount,reference) VALUES (?,?,?,?,?)`);
  const updateStock = db.prepare(`UPDATE stock_levels SET qty=qty-?,updated_at=datetime('now') WHERE product_id=? AND warehouse_id=?`);
  const insertStock = db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty) VALUES (?,?,?) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=qty-?`);
  const creditCustomer = db.prepare(`UPDATE customers SET credit_used=credit_used+?,updated_at=datetime('now') WHERE id=?`);

  const transaction = db.transaction(() => {
    // Process items
    for (const it of items) {
      const product = db.prepare('SELECT id,name,barcode,unit_price,tax_rate FROM products WHERE id=?').get(String(it.productId).trim());
      if (!product) throw new Error(`صنف غير موجود: ${it.productId}`);
      const qty = Number(it.qty) || 1;
      const price = it.unitPrice != null ? Number(it.unitPrice) : Number(product.unit_price);
      const discount = Number(it.discount) || 0;
      const taxRate = Number(it.taxRate ?? product.tax_rate ?? 15);
      const lineNet = qty * price - discount;
      const lineTax = Math.round(lineNet * taxRate / 100 * 100) / 100;
      const lineTotal = lineNet + lineTax;
      subtotal += lineNet;
      taxTotal += lineTax;
      const wh = String(it.warehouseId || b.warehouseId || 'W-01').trim();
      insertItem.run(uuid(), invoiceId, product.id, product.name, product.barcode, qty, price, discount, taxRate, lineTax, lineTotal, String(it.uom || 'Unit'), wh);
      // Stock deduction
      const sl = db.prepare('SELECT qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(product.id, wh);
      if (sl) { updateStock.run(qty, product.id, wh); }
      else { insertStock.run(product.id, wh, -qty); }
    }

    const total = Math.round((subtotal + taxTotal) * 100) / 100;
    const payments = Array.isArray(b.payments) ? b.payments : [{ method: 'CASH', amount: total }];
    let paidAmount = 0;
    for (const p of payments) {
      const amt = Number(p.amount) || 0;
      paidAmount += amt;
      insertPayment.run(uuid(), invoiceId, String(p.method || 'CASH').toUpperCase(), amt, String(p.reference || '').trim());
    }
    const remainingAmount = Math.round((total - paidAmount) * 100) / 100;
    const status = remainingAmount <= 0.01 ? 'PAID' : remainingAmount >= total - 0.01 ? 'UNPAID' : 'PARTIAL';
    const customerId = String(b.customerId || '').trim() || null;
    const customerName = String(b.customerName || 'Walk-in Customer').trim();
    const shiftId = String(b.shiftId || '').trim() || null;
    const terminalId = String(b.terminalId || '').trim() || null;

    db.prepare(`INSERT INTO invoices (id,number,customer_id,customer_name,subtotal,discount_amount,tax_amount,total,paid_amount,remaining_amount,status,currency,notes,channel_id,shift_id,terminal_id,paid_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(invoiceId, number, customerId, customerName, Math.round(subtotal * 100) / 100, Number(b.discountAmount) || 0, Math.round(taxTotal * 100) / 100, total, paidAmount, remainingAmount, status, String(b.currency || 'SAR'), String(b.notes || `idem:${idemKey}`).trim(), String(b.channelId || '').trim(), shiftId, terminalId, status === 'PAID' ? new Date().toISOString() : null);

    // Credit sale
    if (remainingAmount > 0.01 && customerId) {
      creditCustomer.run(remainingAmount, customerId);
    }

    // Loyalty points earn
    if (customerId && status === 'PAID') {
      const pts = Math.floor(total / 10); // 1 point per 10 SAR
      db.prepare(`UPDATE customers SET loyalty_points=loyalty_points+? WHERE id=?`).run(pts, customerId);
      db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uuid(), customerId, pts, total, 'EARN', 'INVOICE', invoiceId, 'نقاط من بيع');
    }

    // Sync log
    db.prepare(`INSERT INTO sync_log (entity_type,entity_id,action,payload,status) VALUES (?,?,?,?,?)`)
      .run('INVOICE', invoiceId, 'CREATE', JSON.stringify({ id: invoiceId, number, total, status }), 'PENDING');

    return { invoiceId, number, subtotal: Math.round(subtotal * 100) / 100, taxAmount: Math.round(taxTotal * 100) / 100, total, paidAmount, remainingAmount, status, itemsCount: items.length };
  });

  try {
    const result = transaction();
    return res.status(201).json(result);
  } catch (e) {
    return res.status(400).json({ error: String(e.message || '').slice(0, 300) });
  }
});

// GET /api/invoices
router.get('/', (req, res) => {
  const { status, shift_id, limit = 50, offset = 0, from, to } = req.query;
  let sql = 'SELECT * FROM invoices WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (shift_id) { sql += ' AND shift_id=?'; params.push(shift_id); }
  if (from) { sql += ' AND created_at>=?'; params.push(from); }
  if (to) { sql += ' AND created_at<=?'; params.push(to); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  return res.json({ invoices: db.prepare(sql).all(...params) });
});

// GET /api/invoices/:id
router.get('/:id', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(inv.id);
  inv.payments = db.prepare('SELECT * FROM payments WHERE invoice_id=?').all(inv.id);
  return res.json(inv);
});

// POST /api/invoices/:id/pay — add payment
router.post('/:id/pay', (req, res) => {
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  if (inv.status === 'PAID') return res.status(400).json({ error: 'الفاتورة مدفوعة بالفعل' });
  const { method = 'CASH', amount = 0, reference = '' } = req.body || {};
  const amt = Number(amount);
  if (!(amt > 0)) return res.status(400).json({ error: 'المبلغ أكبر من صفر' });
  db.prepare('INSERT INTO payments (id,invoice_id,method,amount,reference) VALUES (?,?,?,?,?)').run(uuid(), inv.id, String(method).toUpperCase(), amt, String(reference).trim());
  const newPaid = Math.round((inv.paid_amount + amt) * 100) / 100;
  const newRemaining = Math.round((inv.total - newPaid) * 100) / 100;
  const newStatus = newRemaining <= 0.01 ? 'PAID' : 'PARTIAL';
  db.prepare('UPDATE invoices SET paid_amount=?,remaining_amount=?,status=?,paid_at=COALESCE(paid_at,?) WHERE id=?').run(newPaid, newRemaining, newStatus, newStatus === 'PAID' ? new Date().toISOString() : null, inv.id);
  if (newRemaining <= 0.01 && inv.customer_id) {
    db.prepare('UPDATE customers SET credit_used=MAX(0,credit_used-?),updated_at=datetime(\'now\') WHERE id=?').run(inv.remaining_amount, inv.customer_id);
  }
  return res.json({ invoiceId: inv.id, paidAmount: newPaid, remainingAmount: newRemaining, status: newStatus });
});

// GET /api/invoices/reports/daily
router.get('/reports/daily', (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const terminalId = req.query.terminal || null;
  let sql = `SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as gross_sales, COALESCE(SUM(CASE WHEN status='RETURNED' THEN total ELSE 0 END),0) as refunds, COALESCE(SUM(discount_amount),0) as discounts, COALESCE(SUM(tax_amount),0) as tax_amount, COALESCE(SUM(paid_amount),0) as net_sales FROM invoices WHERE date(created_at)=?`;
  const params = [date];
  if (terminalId) { sql += ' AND terminal_id=?'; params.push(terminalId); }
  const stats = db.prepare(sql).get(...params);
  const payMethods = db.prepare(`SELECT p.method, COALESCE(SUM(p.amount),0) as total FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE date(i.created_at)=? ${terminalId ? 'AND i.terminal_id=?' : ''} GROUP BY p.method`).all(...(terminalId ? [date, terminalId] : [date]));
  return res.json({ date, ...stats, payment_methods: Object.fromEntries(payMethods.map(p => [p.method, p.total])) });
});

export default router;