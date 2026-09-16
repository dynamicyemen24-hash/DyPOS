import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { validate, invoiceSchema } from '../middleware/validate.js';
import { invoicesCounter } from '../middleware/metrics.js';
import { emit } from '../lib/webhooks.js';

const router = Router();

function genInvoiceNumber() {
  // Collision-safe under concurrency: timestamp + 6 random chars.
  // Unique index idx_invoices_number guarantees no duplicates.
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `INV-${Date.now()}-${rand}`;
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// POST /api/invoices — create sale (idempotent via idempotencyKey)
router.post('/', validate(invoiceSchema), (req, res) => {
  const b = req.body;
  const items = b.items;
  if (!items.length) return res.status(400).json({ error: 'سلة فارغة' });

  const idemKey = String(b.idempotencyKey || '').trim() || null;
  if (idemKey) {
    // Indexed lookup — O(log n), no full-table LIKE scan.
    const existing = db.prepare('SELECT id FROM invoices WHERE id=? OR idempotency_key=? LIMIT 1').get(idemKey, idemKey);
    if (existing) return res.json({ deduped: true, invoiceId: existing.id });
  }

  const invoiceId = uuid();
  const number = genInvoiceNumber();
  let subtotal = 0, taxTotal = 0;

  // ── Batch load products: 1 query instead of N (critical for 500-line carts) ──
  const ids = [...new Set(items.map((it) => String(it.productId).trim()))];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id,name,barcode,unit_price,tax_rate FROM products WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const pid of ids) {
    if (!byId.has(pid)) {
      return res.status(400).json({ error: `صنف غير موجود: ${pid}`.slice(0, 200) });
    }
  }

  const insertItem = db.prepare(`INSERT INTO invoice_items (id,invoice_id,product_id,product_name,barcode,qty,unit_price,discount,tax_rate,tax_amount,total,uom,warehouse_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertPayment = db.prepare(`INSERT INTO payments (id,invoice_id,method,amount,reference) VALUES (?,?,?,?,?)`);
  // excluded.qty is negative (-qty) → qty+excluded.qty atomically decrements
  const upsertStock = db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=qty+excluded.qty,updated_at=datetime('now')`);

  const transaction = db.transaction(() => {
    const defaultWh = String(b.warehouseId || 'W-01').trim().slice(0, 32);
    const customerId = String(b.customerId || '').trim().slice(0, 64) || null;
    const customerName = String(b.customerName || 'Walk-in Customer').trim().slice(0, 200) || 'Walk-in Customer';
    const shiftId = String(b.shiftId || '').trim().slice(0, 64) || null;
    const terminalId = String(b.terminalId || '').trim().slice(0, 32) || null;
    // Provision every warehouse touched: stock_levels.warehouse_id is a real FK.
    const ensureWh = db.prepare('INSERT OR IGNORE INTO warehouses (id,name) VALUES (?,?)');
    ensureWh.run(defaultWh, defaultWh === 'W-01' ? 'المستودع الرئيسي' : defaultWh);
    for (const it of items) {
      const w = String(it.warehouseId || defaultWh).trim().slice(0, 32) || 'W-01';
      if (w !== defaultWh) ensureWh.run(w, w);
    }
    // Header FIRST: children (items/payments) have FK → invoices(id).
    // Inserting children before the parent violates FOREIGN KEY with FK enforcement ON.
    try {
      db.prepare(`INSERT INTO invoices (id,number,customer_id,customer_name,subtotal,discount_amount,tax_amount,total,paid_amount,remaining_amount,status,currency,notes,channel_id,shift_id,terminal_id,idempotency_key)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(invoiceId, number, customerId, customerName, 0, 0, 0, 0, 0, 0, 'UNPAID', String(b.currency || 'SAR').slice(0, 10), String(b.notes || '').trim().slice(0, 1000), String(b.channelId || '').trim().slice(0, 64), shiftId, terminalId, idemKey);
    } catch (e) {
      if (idemKey && /UNIQUE|CONFLICT/i.test(String(e.message))) {
        const dup = db.prepare('SELECT id FROM invoices WHERE idempotency_key=?').get(idemKey);
        if (dup) return { deduped: true, invoiceId: dup.id };
      }
      throw e;
    }
    for (const it of items) {
      const product = byId.get(String(it.productId).trim());
      const qty = toNum(it.qty, 1);
      if (!(qty > 0) || qty > 100000) throw new Error(`كمية غير صالحة للصنف ${product.id}`);
      const price = it.unitPrice != null ? toNum(it.unitPrice) : toNum(product.unit_price);
      const discount = Math.max(0, Math.min(toNum(it.discount), qty * price));
      const taxRate = it.taxRate != null ? Math.max(0, Math.min(toNum(it.taxRate), 100)) : toNum(product.tax_rate, 15);
      const lineNet = qty * price - discount;
      const lineTax = Math.round(lineNet * taxRate) / 100;
      const lineTotal = lineNet + lineTax;
      subtotal += lineNet;
      taxTotal += lineTax;
      const wh = String(it.warehouseId || defaultWh).trim().slice(0, 32) || 'W-01';
      insertItem.run(uuid(), invoiceId, product.id, product.name, product.barcode, qty, price, discount, taxRate, lineTax, lineTotal, String(it.uom || 'Unit').slice(0, 20), wh);
      // Atomic stock decrement via UPSERT (handles missing rows, no SELECT round-trip)
      upsertStock.run(product.id, wh, -qty);
    }

    const discountAmount = Math.max(0, Math.min(toNum(b.discountAmount), subtotal + taxTotal));
    const total = Math.round((subtotal + taxTotal - discountAmount) * 100) / 100;
    if (total < 0) throw new Error('إجمالي غير صالح');
    const payments = Array.isArray(b.payments) && b.payments.length ? b.payments : [{ method: 'CASH', amount: total }];
    if (payments.length > 10) throw new Error('عدد الدفعات يتجاوز الحد');
    let paidAmount = 0;
    for (const p of payments) {
      const amt = toNum(p.amount);
      if (amt < 0 || amt > 10_000_000) throw new Error('مبلغ دفعة غير صالح');
      paidAmount = Math.round((paidAmount + amt) * 100) / 100;
      insertPayment.run(uuid(), invoiceId, String(p.method || 'CASH').toUpperCase().slice(0, 20), amt, String(p.reference || '').trim().slice(0, 128));
    }
    const remainingAmount = Math.round((total - paidAmount) * 100) / 100;
    const status = remainingAmount <= 0.01 ? 'PAID' : remainingAmount >= total - 0.01 ? 'UNPAID' : 'PARTIAL';

    db.prepare(`UPDATE invoices SET subtotal=?,discount_amount=?,tax_amount=?,total=?,paid_amount=?,remaining_amount=?,status=?,paid_at=? WHERE id=?`)
      .run(Math.round(subtotal * 100) / 100, discountAmount, Math.round(taxTotal * 100) / 100, total, paidAmount, remainingAmount, status, status === 'PAID' ? new Date().toISOString() : null, invoiceId);

    // Credit sale
    if (remainingAmount > 0.01 && customerId) {
      db.prepare(`UPDATE customers SET credit_used=credit_used+?,updated_at=datetime('now') WHERE id=?`).run(remainingAmount, customerId);
    }

    // Loyalty points earn
    if (customerId && status === 'PAID') {
      const pts = Math.floor(total / 10); // 1 point per 10 SAR
      if (pts > 0) {
        db.prepare(`UPDATE customers SET loyalty_points=loyalty_points+? WHERE id=?`).run(pts, customerId);
        db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`)
          .run(uuid(), customerId, pts, total, 'EARN', 'INVOICE', invoiceId, 'نقاط من بيع');
      }
    }

    // Sync log
    db.prepare(`INSERT INTO sync_log (entity_type,entity_id,action,payload,status) VALUES (?,?,?,?,?)`)
      .run('INVOICE', invoiceId, 'CREATE', JSON.stringify({ id: invoiceId, number, total, status }), 'PENDING');

    return { invoiceId, number, subtotal: Math.round(subtotal * 100) / 100, taxAmount: Math.round(taxTotal * 100) / 100, discountAmount, total, paidAmount, remainingAmount, status, itemsCount: items.length };
  });

  try {
    const result = transaction();
    if (!result.deduped) {
      try { invoicesCounter.inc(); } catch { /* metrics optional */ }
      req.audit?.('invoice.create', { invoiceId: result.invoiceId, total: result.total });
      emit('invoice.created', 'INVOICE', result.invoiceId, { number: result.number, total: result.total, status: result.status });
    }
    return res.status(result.deduped ? 200 : 201).json(result);
  } catch (e) {
    return res.status(400).json({ error: String(e.message || '').slice(0, 300) });
  }
});

// GET /api/invoices/reports/daily — MUST be before /:id so "reports" isn't treated as an id
router.get('/reports/daily', (req, res) => {
  const raw = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return res.status(400).json({ error: 'صيغة التاريخ غير صالحة (YYYY-MM-DD)' });
  const terminalId = req.query.terminal ? String(req.query.terminal).slice(0, 32) : null;
  let sql = `SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as gross_sales, COALESCE(SUM(CASE WHEN status='RETURNED' THEN total ELSE 0 END),0) as refunds, COALESCE(SUM(discount_amount),0) as discounts, COALESCE(SUM(tax_amount),0) as tax_amount, COALESCE(SUM(paid_amount),0) as net_sales FROM invoices WHERE date(created_at)=?`;
  const params = [raw];
  if (terminalId) { sql += ' AND terminal_id=?'; params.push(terminalId); }
  const stats = db.prepare(sql).get(...params);
  const payMethods = db.prepare(`SELECT p.method, COALESCE(SUM(p.amount),0) as total FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE date(i.created_at)=? ${terminalId ? 'AND i.terminal_id=?' : ''} GROUP BY p.method`).all(...(terminalId ? [raw, terminalId] : [raw]));
  return res.json({ date: raw, ...stats, payment_methods: Object.fromEntries(payMethods.map(p => [p.method, p.total])) });
});

// GET /api/invoices — capped pagination (prevents full-table DoS at scale)
router.get('/', (req, res) => {
  const { status, shift_id, from, to } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  if (offset > 100000) return res.status(400).json({ error: 'Offset يتجاوز الحد — استخدم فلاتر التاريخ' });
  let sql = 'SELECT * FROM invoices WHERE 1=1';
  const params = [];
  if (status) {
    if (!/^[A-Z_]{3,20}$/.test(String(status))) return res.status(400).json({ error: 'حالة غير صالحة' });
    sql += ' AND status=?'; params.push(status);
  }
  if (shift_id) { sql += ' AND shift_id=?'; params.push(String(shift_id).slice(0, 64)); }
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(from))) return res.status(400).json({ error: 'صيغة from غير صالحة' });
    sql += ' AND created_at>=?'; params.push(from);
  }
  if (to) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(to))) return res.status(400).json({ error: 'صيغة to غير صالحة' });
    sql += ' AND created_at<=?'; params.push(to);
  }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return res.json({ invoices: db.prepare(sql).all(...params), limit, offset });
});

// GET /api/invoices/:id
router.get('/:id', (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(inv.id);
  inv.payments = db.prepare('SELECT * FROM payments WHERE invoice_id=?').all(inv.id);
  return res.json(inv);
});

// POST /api/invoices/:id/pay — atomic: single transaction, no lost-update race
router.post('/:id/pay', (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const { method = 'CASH', amount = 0, reference = '' } = req.body || {};
  const amt = Number(amount);
  if (!(amt > 0) || amt > 10_000_000) return res.status(400).json({ error: 'المبلغ أكبر من صفر' });
  const payMethod = String(method).toUpperCase().slice(0, 20);
  const payRef = String(reference).trim().slice(0, 128);

  try {
    const result = db.transaction(() => {
      const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
      if (!inv) throw Object.assign(new Error('الفاتورة غير موجودة'), { statusCode: 404 });
      if (inv.status === 'PAID') throw Object.assign(new Error('الفاتورة مدفوعة بالفعل'), { statusCode: 400 });
      db.prepare('INSERT INTO payments (id,invoice_id,method,amount,reference) VALUES (?,?,?,?,?)').run(uuid(), inv.id, payMethod, amt, payRef);
      const newPaid = Math.round((inv.paid_amount + amt) * 100) / 100;
      const newRemaining = Math.round((inv.total - newPaid) * 100) / 100;
      const newStatus = newRemaining <= 0.01 ? 'PAID' : 'PARTIAL';
      // Conditional write guards against concurrent double-pay overwriting each other
      const upd = db.prepare("UPDATE invoices SET paid_amount=?,remaining_amount=?,status=?,paid_at=COALESCE(paid_at,?) WHERE id=? AND status != 'PAID'").run(newPaid, newRemaining, newStatus, newStatus === 'PAID' ? new Date().toISOString() : null, inv.id);
      if (upd.changes === 0) throw Object.assign(new Error('الفاتورة مدفوعة بالفعل (تعارض تزامن)'), { statusCode: 409 });
      if (newStatus === 'PAID' && inv.customer_id) {
        db.prepare("UPDATE customers SET credit_used=MAX(0,credit_used-?),updated_at=datetime('now') WHERE id=?").run(inv.remaining_amount, inv.customer_id);
      }
      return { invoiceId: inv.id, paidAmount: newPaid, remainingAmount: newRemaining, status: newStatus };
    })();
    req.audit?.('invoice.pay', { invoiceId: id, amount: amt, method: payMethod });
    if (result.status === 'PAID') emit('invoice.paid', 'INVOICE', id, { paidAmount: result.paidAmount });
    return res.json(result);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message || '').slice(0, 300) });
  }
});

export default router;
