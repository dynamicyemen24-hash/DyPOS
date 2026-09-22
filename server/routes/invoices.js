import { Router } from 'express';
import crypto from 'crypto';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { validate, invoiceSchema } from '../middleware/validate.js';
import { invoicesCounter } from '../middleware/metrics.js';
import { recalcTier } from '../lib/loyalty.js';
import { computeCouponDiscount } from './offers.js';
import { appendChain } from '../lib/chain.js';
import { toMinor, toMajor, pctOf, clampMinor } from '../lib/money.js';
import { dayRange } from '../lib/dates.js';
import { assertTenantScope, resolveTenantFilter, assertRecordTenant } from '../lib/tenant.js';
import { assertCurrency, assertUom } from '../lib/fx.js';
import { recordTrail } from '../lib/trail.js';
import { ah } from '../lib/async.js';
import { idempotency } from '../lib/idempotency.js';
import { emit } from '../lib/webhooks.js';
import { ensureOpenFiscalYear, yearOf } from './fiscal.js';
import { invoicePrefix, getSetting, defaultTaxRate } from '../lib/settings.js';

const cryptoId = () => crypto.randomUUID();

const router = Router();

// Payment-method master validation (user-managed in masters.js — the same
// currencies/UoMs pattern). Unknown or disabled methods → 400 Arabic;
// methods flagging requires_reference need a reference.
//
// NOTE (best practice): the lookup prepares LAZILY per call, never at module
// scope — route modules load before migrate() runs, so a module-scope prepare
// against a migrated table throws on fresh DBs and would silently disable
// this validation forever. The table probe is cached (tables never vanish at
// runtime; migrate only adds).
let payMethodsTable = null;
function payMethodsAvailable() {
  if (payMethodsTable !== null) return payMethodsTable;
  try {
    db.prepare('SELECT 1 FROM payment_methods LIMIT 1').get();
    payMethodsTable = true;
  } catch {
    payMethodsTable = false;
  }
  return payMethodsTable;
}
function assertPayMethod(pm, ref) {
  if (!payMethodsAvailable()) return; // pre-v13 DBs (migrate pending) → permissive
  const row = db.prepare('SELECT code, requires_reference, is_active FROM payment_methods WHERE code=?').get(pm);
  if (!row) throw Object.assign(new Error(`طريقة الدفع غير معرفة: ${pm}`), { statusCode: 400 });
  if (Number(row.is_active) !== 1) throw Object.assign(new Error(`طريقة الدفع موقوفة: ${pm}`), { statusCode: 400 });
  if (Number(row.requires_reference) === 1 && !String(ref || '').trim()) {
    throw Object.assign(new Error(`طريقة الدفع ${pm} تتطلب مرجعًا (رقم العملية)`), { statusCode: 400 });
  }
}
// Fiscal year of an existing invoice (UTC slice of created_at; current year
// fallback for legacy rows). Used to gate pay/void/return on CLOSED periods.
function invoiceFiscalYear(inv) {
  const y = String(inv?.created_at || '').slice(0, 4);
  return /^\d{4}$/.test(y) ? y : yearOf();
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Deduct a WALLET payment from the customer's balance (atomic — caller MUST
 * be inside a transaction so a later failure rolls the deduction back).
 * Writes the canonical ledger row (v7) + the loyalty mirror for compat.
 */
function deductWallet(customerId, amt, invoiceId, actor) {
  if (!customerId) throw Object.assign(new Error('الدفع بالمحفظة يتطلب عميلًا'), { statusCode: 400 });
  const c = db.prepare('SELECT wallet_balance FROM customers WHERE id=?').get(customerId);
  if (!c) throw Object.assign(new Error('العميل غير موجود'), { statusCode: 404 });
  const bal = Number(c.wallet_balance) || 0;
  if (bal < amt - 0.01) throw Object.assign(new Error(`رصيد المحفظة غير كاف (المتاح ${bal.toFixed(2)})`), { statusCode: 402 });
  const next = Math.round((bal - amt) * 100) / 100;
  db.prepare(`UPDATE customers SET wallet_balance=?,updated_at=datetime('now') WHERE id=?`).run(next, customerId);
  db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`)
    .run(uuid(), customerId, 0, -amt, 'WALLET_DEBIT', 'INVOICE', invoiceId, 'دفع بالمحفظة');
  try {
    db.prepare(`INSERT INTO wallet_transactions (id,customer_id,amount,direction,balance_after,reference_type,reference_id,note,created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), customerId, Math.round(amt * 100) / 100, 'debit', next, 'INVOICE', invoiceId, 'دفع بالمحفظة', actor || 'system');
  } catch { /* pre-v7 DBs: ledger missing, mirror suffices */ }
  return next;
}

/**
 * Refund WALLET payments back to the customer's balance (atomic — caller MUST
 * be inside a transaction). Exact inverse of deductWallet: same rounding,
 * mirrored ledger rows, bank-statement style balance_after.
 * Missing/deleted customer → no-op (never breaks void/return).
 */
function refundWallet(customerId, amt, invoiceId, actor) {
  if (!customerId || !(amt > 0)) return 0;
  const c = db.prepare('SELECT wallet_balance FROM customers WHERE id=?').get(customerId);
  if (!c) return 0;
  const next = Math.round(((Number(c.wallet_balance) || 0) + amt) * 100) / 100;
  db.prepare(`UPDATE customers SET wallet_balance=?,updated_at=datetime('now') WHERE id=?`).run(next, customerId);
  db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`)
    .run(uuid(), customerId, 0, amt, 'WALLET_REFUND', 'INVOICE', invoiceId, 'استرداد محفظة (إلغاء/إرجاع)');
  try {
    db.prepare(`INSERT INTO wallet_transactions (id,customer_id,amount,direction,balance_after,reference_type,reference_id,note,created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(uuid(), customerId, Math.round(amt * 100) / 100, 'credit', next, 'INVOICE', invoiceId, 'استرداد محفظة (إلغاء/إرجاع)', actor || 'system');
  } catch { /* pre-v7 DBs: ledger missing, mirror suffices */ }
  return next;
}

// POST /api/invoices — create sale (idempotent via idempotencyKey)
router.post('/', validate(invoiceSchema), (req, res) => {
  const b = req.body;
  const items = b.items;
  if (!items.length) return res.status(400).json({ error: 'سلة فارغة' });

  // Tenant scope + master-data validation BEFORE touching money/stock.
  // Invoice currency defaults to the business profile currency (any-country),
  // falling back to SAR; the effective value is what gets validated + stored.
  const invCurrency = String(b.currency || getSetting('currency', 'SAR')).slice(0, 10);
  let scope = { tenantId: null, branchId: null };
  let fiscalYear = { code: yearOf(), status: 'OPEN' };
  try {
    scope = assertTenantScope(req);
    assertCurrency(invCurrency);
    for (const it of items) assertUom(it.uom || 'Unit');
    // Fiscal period control: the sale posts into the current UTC fiscal year;
    // a CLOSED year refuses posting so reported periods stay immutable.
    fiscalYear = ensureOpenFiscalYear(yearOf());
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }

  const idemKey = String(b.idempotencyKey || '').trim() || null;
  if (idemKey) {
    // Indexed lookup — O(log n), no full-table LIKE scan.
    const existing = db.prepare('SELECT id FROM invoices WHERE id=? OR idempotency_key=? LIMIT 1').get(idemKey, idemKey);
    if (existing) return res.json({ deduped: true, invoiceId: existing.id });
  }

  const invoiceId = uuid();
  // Halala-integer accumulators (see lib/money.js): exact at any scale,
  // no IEEE-754 drift across 500-line carts or billions of rows.
  let subtotalMinor = 0, taxTotalMinor = 0;

  // ── Batch load products: 1 query instead of N (critical for 500-line carts) ──
  const ids = [...new Set(items.map((it) => String(it.productId).trim()))];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id,name,name_ar,barcode,unit_price,tax_rate FROM products WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const pid of ids) {
    if (!byId.has(pid)) {
      return res.status(400).json({ error: `صنف غير موجود: ${pid}`.slice(0, 200) });
    }
  }

  const insertItem = db.prepare(`INSERT INTO invoice_items (id,invoice_id,product_id,product_name,name_ar,barcode,qty,unit_price,discount,tax_rate,tax_amount,total,uom,warehouse_id,free_qty,is_free_item) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertPayment = db.prepare(`INSERT INTO payments (id,invoice_id,method,amount,reference) VALUES (?,?,?,?,?)`);
  // Guarded stock decrement. Unlike the old blind UPSERT (which let qty go
  // negative on undersized stock), this enforces available = qty - reserved_qty
  // INSIDE the same SQLite write transaction, so no concurrent writer can
  // interleave between the check and the decrement (single-writer: the whole
  // sale, including this, is atomic). Policy on a stock_levels row that does
  // NOT exist yet is governed by DYPOS_STOCK_GUARD:
  //   - "legacy" (default): missing row = untracked walk-in → unlimited
  //     (backward compatible; keeps the walk-in/offline POS working with zero
  //      setup and keeps legacy catalog exports working).
  //   - "strict": missing row = 0 available → 409. Use once every sellable
  //     SKU is known to carry a stock_levels row (recommended on the origin).
  // Guarded UPSERT: refuses the decrement (changes=0) if it would drive
  // qty below reserved_qty (i.e. below available), keeping stock never negative
  // for tracked items while leaving the row present.
  const stockGuardMode = String(process.env.DYPOS_STOCK_GUARD || 'legacy').trim().toLowerCase().slice(0, 12) === 'strict' ? 'strict' : 'legacy';
  const selectStockRow = db.prepare(`SELECT qty, reserved_qty FROM stock_levels WHERE product_id=? AND warehouse_id=?`);
  const guardedDecr = db.prepare(`UPDATE stock_levels SET qty=qty+?,updated_at=datetime('now') WHERE product_id=? AND warehouse_id=? AND qty+?>=reserved_qty`);
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
    // Shift gate (optional strict mode for chains: DYPOS_REQUIRE_SHIFT=1).
    // Default off (backward compatible with walk-in/offline sales).
    if (process.env.DYPOS_REQUIRE_SHIFT === '1' && !shiftId) {
      throw Object.assign(new Error('الوردية مطلوبة (DYPOS_REQUIRE_SHIFT=1) — افتح وردية أولًا'), { statusCode: 400 });
    }
    if (shiftId) {
      const sh = db.prepare('SELECT id, status FROM shifts WHERE id=?').get(shiftId);
      if (!sh) throw Object.assign(new Error('الوردية غير موجودة'), { statusCode: 404 });
      if (sh.status !== 'OPEN') throw Object.assign(new Error('البيع على وردية مغلقة مرفوض'), { statusCode: 409 });
    }
    // Country pricing mode: tax-exclusive shelf prices (default) vs
    // tax-inclusive (business_settings.tax_inclusive=1, e.g. Gulf retail).
    const taxInclusive = getSetting('tax_inclusive', '0') === '1';
    // Gapless invoice number per (branch-scope, fiscal year), allocated INSIDE
    // the transaction: single-writer UPDATE+SELECT is atomic, and the
    // idempotency pre-check above means retried requests dedupe WITHOUT
    // consuming a number. Format {prefix}-{YYYY}-{000000} — the sequential,
    // gapless e-invoicing norm (ZATCA and equivalents); the unique index on
    // number stays as a backstop.
    const seqScope = `${scope.branchId || 'STD'}/${fiscalYear.code}`;
    const seqPrefix = invoicePrefix();
    db.prepare(`INSERT OR IGNORE INTO invoice_sequences (scope,prefix,last_number) VALUES (?,?,0)`).run(seqScope, seqPrefix);
    db.prepare(`UPDATE invoice_sequences SET last_number=last_number+1,updated_at=datetime('now') WHERE scope=?`).run(seqScope);
    const seqNo = Number(db.prepare(`SELECT last_number FROM invoice_sequences WHERE scope=?`).get(seqScope)?.last_number) || 0;
    if (!(seqNo > 0)) throw new Error('تعذر تخصيص رقم الفاتورة');
    const number = `${seqPrefix}-${fiscalYear.code}-${String(seqNo).padStart(6, '0')}`;
    // Header FIRST: children (items/payments) have FK → invoices(id).
    // Inserting children before the parent violates FOREIGN KEY with FK enforcement ON.
    try {
      db.prepare(`INSERT INTO invoices (id,number,customer_id,customer_name,subtotal,discount_amount,tax_amount,total,paid_amount,remaining_amount,status,currency,notes,channel_id,shift_id,terminal_id,idempotency_key,tenant_id,branch_id,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(invoiceId, number, customerId, customerName, 0, 0, 0, 0, 0, 0, 'UNPAID', invCurrency, String(b.notes || '').trim().slice(0, 1000), String(b.channelId || '').trim().slice(0, 64), shiftId, terminalId, idemKey, scope.tenantId, scope.branchId, req.user?.username || null);
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
      const discountMinor = clampMinor(toMinor(it.discount), toMinor(qty * price));
      const taxRate = it.taxRate != null ? Math.max(0, Math.min(toNum(it.taxRate), 100)) : toNum(product.tax_rate, defaultTaxRate());
      const lineGrossMinor = toMinor(qty * price) - discountMinor;
      let lineNetMinor = lineGrossMinor;
      let lineTaxMinor = pctOf(lineGrossMinor, taxRate);
      if (taxInclusive && taxRate > 0) {
        // Tax-inclusive shelf price (business_settings.tax_inclusive=1): back
        // the tax out so net+tax still equal the charged gross EXACTLY in
        // minor units — no IEEE drift, no halala leakage either direction.
        lineNetMinor = Math.round((lineGrossMinor * 100) / (100 + taxRate));
        lineTaxMinor = lineGrossMinor - lineNetMinor;
      }
      const lineTotalMinor = lineNetMinor + lineTaxMinor;
      subtotalMinor += lineNetMinor;
      taxTotalMinor += lineTaxMinor;
      const wh = String(it.warehouseId || defaultWh).trim().slice(0, 32) || 'W-01';
      const isFree = it.isFreeItem ? 1 : 0;
      const freeQty = isFree ? 0 : (Number(it.freeQty) || 0);
      insertItem.run(uuid(), invoiceId, product.id, product.name, product.name_ar || '', product.barcode, qty, price, toMajor(discountMinor), taxRate, toMajor(lineTaxMinor), toMajor(lineTotalMinor), String(it.uom || 'Unit').slice(0, 20), wh, freeQty, isFree);
      // Atomic stock decrement — guarded for TRACKED rows at qty >= 0, with a
      // missing-row policy that keeps the walk-in/offline POS backward compatible.
      //   - If a stock_levels row EXISTS with qty >= 0 for (product,warehouse):
      //     guardedDecr refuses the decrement (changes=0) when it would drive qty
      //     below reserved_qty (i.e. below available = qty-reserved_qty). This is
      //     the real fix for overselling tracked items: a row that carries qty=5,
      //     reserved_qty=0 can no longer be oversold to qty=-5. Inside the same
      //     SQLite write transaction, so no concurrent seller can interleave.
      //   - Legacy-artifact rows already negative (created by the old blind
      //     UPSERT for untracked walk-ins) stay on the blind path in legacy mode
      //     so repeat walk-in sales behave exactly as before; strict mode 409s.
      //   - If NO row exists: DYPOS_STOCK_GUARD policy decides:
      //       "legacy" (default) → untracked walk-in → blind UPSERT (creates the
      //        row, unlimited) — backward compatible; keeps walk-in/offline POS
      //        and legacy catalog exports working untouched.
      //       "strict" → missing = 0 available → 409. Use once every sellable
      //        SKU carries a stock_levels row (recommended on the origin).
      const tracked = selectStockRow.get(product.id, wh);
      const trackedQty = tracked ? Number(tracked.qty) : null;
      if (tracked && trackedQty >= 0) {
        // Tracked stock at zero or above: guarded decrement refuses any sale
        // that would drive qty below reserved_qty (available). 409, no write.
        const ch = guardedDecr.run(-qty, product.id, wh, -qty);
        if (ch.changes === 0) {
          throw Object.assign(new Error(`الكمية المتوفرة غير كافية لصنف ${product.id} في المستودع ${wh} (المتاح ${Math.max(0, trackedQty - Number(tracked.reserved_qty))})`), { statusCode: 409 });
        }
      } else if (stockGuardMode === 'strict') {
        // strict: missing row OR legacy-artifact negative row = 0 available.
        // Strict mode never creates or extends negative stock → 409.
        throw Object.assign(new Error(`الكمية المتوفرة غير كافية لصنف ${product.id} في المستودع ${wh} (غير مدرج في المخزون — DYPOS_STOCK_GUARD=strict)`), { statusCode: 409 });
      } else {
        // legacy: missing row (untracked walk-in → unlimited, row created on
        // first sale) or pre-existing negative row (legacy artifact → keep the
        // exact old blind-UPSERT behaviour so repeat walk-in sales succeed).
        upsertStock.run(product.id, wh, -qty);
      }
    }

    const grossMinor = subtotalMinor + taxTotalMinor;
    const manualDiscountMinor = clampMinor(toMinor(b.discountAmount), grossMinor);
    // Coupon discount (atomic use-count, race-safe). Checked against gross.
    let couponDiscountMinor = 0;
    let couponCode = null;
    if (b.couponCode) {
      couponCode = String(b.couponCode).trim().toUpperCase().slice(0, 64);
      const c = db.prepare('SELECT * FROM coupons WHERE code=?').get(couponCode);
      if (!c) throw Object.assign(new Error('الكوبون غير موجود'), { statusCode: 404 });
      const r = computeCouponDiscount(c, toMajor(grossMinor));
      if (!r.ok) throw Object.assign(new Error(r.error), { statusCode: 400 });
      couponDiscountMinor = Math.min(toMinor(r.discount), grossMinor - manualDiscountMinor);
      const inc = db.prepare(`UPDATE coupons SET used_count=used_count+1 WHERE code=? AND (max_uses=0 OR used_count < max_uses)`).run(couponCode);
      if (inc.changes === 0) throw Object.assign(new Error('تجاوز حد استخدام الكوبون (تعارض تزامن)'), { statusCode: 409 });
    }
    const discountAmountMinor = Math.min(manualDiscountMinor + couponDiscountMinor, grossMinor);
    const totalMinor = grossMinor - discountAmountMinor;
    if (totalMinor < 0) throw new Error('إجمالي غير صالح');
    const discountAmount = toMajor(discountAmountMinor);
    const subtotal = toMajor(subtotalMinor);
    const taxTotal = toMajor(taxTotalMinor);
    const total = toMajor(totalMinor);
    const payments = Array.isArray(b.payments) && b.payments.length ? b.payments : [{ method: 'CASH', amount: total }];
    if (payments.length > 10) throw new Error('عدد الدفعات يتجاوز الحد');
    let paidMinor = 0;
    let needMinor = totalMinor; // still-unpaid remainder while applying payments
    for (const p of payments) {
      const amt = toNum(p.amount);
      if (amt < 0 || amt > 10_000_000) throw new Error('مبلغ دفعة غير صالح');
      const pm = String(p.method || 'CASH').toUpperCase().slice(0, 20);
      assertPayMethod(pm, p.reference);
      // WALLET deducts from the customer's balance inside this same transaction.
      // Digital balance is capped at what is still owed: cash handed over the
      // total is fine (it becomes change), silently draining a wallet past the
      // total is not.
      let recAmt = amt;
      if (pm === 'WALLET' && amt > 0) {
        const effMinor = Math.min(toMinor(amt), Math.max(0, needMinor));
        if (effMinor > 0) deductWallet(customerId, toMajor(effMinor), invoiceId, req.user?.username);
        recAmt = toMajor(effMinor);
      }
      paidMinor += toMinor(recAmt);
      needMinor -= toMinor(recAmt);
      insertPayment.run(uuid(), invoiceId, pm, recAmt, String(p.reference || '').trim().slice(0, 128));
    }
    // Overpay becomes explicit change: paid/remaining are clamped so
    // receivables never go negative in reports (best-practice POS behavior —
    // the drawer audit keeps the full handed amounts in `payments`).
    const changeMinor = Math.max(0, paidMinor - totalMinor);
    const paidMinorCapped = paidMinor - changeMinor;
    const paidAmount = toMajor(paidMinorCapped);
    const remainingMinor = totalMinor - paidMinorCapped;
    const remainingAmount = toMajor(remainingMinor);
    const change = toMajor(changeMinor);
    // Epsilons in minor units (identical semantics to the old 0.01 margins).
    const status = remainingMinor <= 1 ? 'PAID' : remainingMinor >= totalMinor - 1 ? 'UNPAID' : 'PARTIAL';

    db.prepare(`UPDATE invoices SET subtotal=?,discount_amount=?,tax_amount=?,total=?,paid_amount=?,remaining_amount=?,status=?,paid_at=?,updated_by=? WHERE id=?`)
      .run(subtotal, discountAmount, taxTotal, total, paidAmount, remainingAmount, status, status === 'PAID' ? new Date().toISOString() : null, req.user?.username || null, invoiceId);

    // Credit sale — enforce credit_limit when set (>0). Limit 0 = unlimited (legacy compat).
    if (remainingAmount > 0.01 && customerId) {
      const cust = db.prepare('SELECT credit_limit, credit_used FROM customers WHERE id=?').get(customerId);
      if (cust) {
        const lim = Number(cust.credit_limit) || 0;
        const used = Number(cust.credit_used) || 0;
        if (lim > 0 && used + remainingAmount - lim > 0.01) {
          throw Object.assign(new Error(`تجاوز حد الائتمان (المتاح ${(lim - used).toFixed(2)})`), { statusCode: 402 });
        }
      }
      db.prepare(`UPDATE customers SET credit_used=credit_used+?,updated_at=datetime('now') WHERE id=?`).run(remainingAmount, customerId);
    }

    // Loyalty points earn + auto-tier (VIP stays manual)
    if (customerId && status === 'PAID') {
      const pts = Math.floor(total / 10); // 1 point per 10 SAR
      if (pts > 0) {
        db.prepare(`UPDATE customers SET loyalty_points=loyalty_points+? WHERE id=?`).run(pts, customerId);
        db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`)
          .run(uuid(), customerId, pts, total, 'EARN', 'INVOICE', invoiceId, 'نقاط من بيع');
        try { recalcTier(customerId); } catch { /* tier never breaks sales */ }
      }
    }

    // Sync log
    db.prepare(`INSERT INTO sync_log (entity_type,entity_id,action,payload,status) VALUES (?,?,?,?,?)`)
      .run('INVOICE', invoiceId, 'CREATE', JSON.stringify({ id: invoiceId, number, total, status }), 'PENDING');

    // Tamper-evident chain link (inside the same transaction — atomic with the sale)
    try { appendChain(invoiceId, { number, total, status, action: 'CREATE' }); } catch { /* chain never breaks sales */ }

    return { invoiceId, number, subtotal: Math.round(subtotal * 100) / 100, taxAmount: Math.round(taxTotal * 100) / 100, discountAmount, total, paidAmount, remainingAmount, change, status, itemsCount: items.length };
  });

  try {
    const result = transaction();
    if (!result.deduped) {
      try { invoicesCounter.inc(); } catch { /* metrics optional */ }
      req.audit?.('invoice.create', { invoiceId: result.invoiceId, total: result.total });
      recordTrail(req, { entity: 'INVOICE', entityId: result.invoiceId, action: 'CREATE', after: { number: result.number, total: result.total, status: result.status } });
      emit('invoice.created', 'INVOICE', result.invoiceId, { number: result.number, total: result.total, status: result.status });
    }
    return res.status(result.deduped ? 200 : 201).json(result);
  } catch (e) {
    return res.status(e.statusCode && Number.isInteger(e.statusCode) ? e.statusCode : 400).json({ error: String(e.message || '').slice(0, 300) });
  }
});

// GET /api/invoices/reports/daily — MUST be before /:id so "reports" isn't treated as an id
router.get('/reports/daily', ah(async (req, res) => {
  const raw = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return res.status(400).json({ error: 'صيغة التاريخ غير صالحة (YYYY-MM-DD)' });
  const terminalId = req.query.terminal ? String(req.query.terminal).slice(0, 32) : null;
  // Sargable range (index-seek on idx_invoices_created, not a date() full scan).
  const { from, to } = dayRange(raw);
  let sql = `SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as gross_sales, COALESCE(SUM(CASE WHEN status='RETURNED' THEN total ELSE 0 END),0) as refunds, COALESCE(SUM(discount_amount),0) as discounts, COALESCE(SUM(tax_amount),0) as tax_amount, COALESCE(SUM(paid_amount),0) as net_sales FROM invoices WHERE created_at>=? AND created_at<?`;
  const params = [from, to];
  if (terminalId) { sql += ' AND terminal_id=?'; params.push(terminalId); }
  const stats = db.prepare(sql).get(...params);
  const payMethods = db.prepare(`SELECT p.method, COALESCE(SUM(p.amount),0) as total FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.created_at>=? AND i.created_at<? ${terminalId ? 'AND i.terminal_id=?' : ''} GROUP BY p.method`).all(...(terminalId ? [from, to, terminalId] : [from, to]));
  return res.json({ date: raw, ...stats, payment_methods: Object.fromEntries(payMethods.map(p => [p.method, p.total])) });
}));

// GET /api/invoices — capped pagination + بحث نصي q (رقم/عميل/حالة) + total/hasMore
// Billions-scale access: ?after=<id> keyset cursor (stable, O(log n)) beats deep
// OFFSET (O(n)); ?count=false skips the COUNT(*) scan for infinite scroll.
router.get('/', ah(async (req, res) => {
  const { status, shift_id, from, to, q } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  if (offset > 100000) return res.status(400).json({ error: 'Offset يتجاوز الحد — استخدم فلاتر التاريخ' });
  const wantCount = String(req.query.count ?? 'true').toLowerCase() !== 'false' && req.query.count !== '0';
  const after = req.query.after ? String(req.query.after).slice(0, 64) : null;
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  let base = 'FROM invoices WHERE 1=1';
  const params = [];
  if (scopeTenant) { base += ' AND tenant_id=?'; params.push(scopeTenant); }
  if (status) {
    if (!/^[A-Z_]{3,20}$/.test(String(status))) return res.status(400).json({ error: 'حالة غير صالحة' });
    base += ' AND status=?'; params.push(status);
  }
  if (shift_id) { base += ' AND shift_id=?'; params.push(String(shift_id).slice(0, 64)); }
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(from))) return res.status(400).json({ error: 'صيغة from غير صالحة' });
    base += ' AND created_at>=?'; params.push(from);
  }
  if (to) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(to))) return res.status(400).json({ error: 'صيغة to غير صالحة' });
    base += ' AND created_at<=?'; params.push(to);
  }
  if (q) {
    const needle = String(q).trim().slice(0, 64);
    if (needle.length <= 3) { base += ' AND (number LIKE ? OR customer_name LIKE ?)'; const like = `${needle}%`; params.push(like, like); }
    else { base += ' AND (number LIKE ? OR customer_name LIKE ? OR id LIKE ?)'; const like = `%${needle}%`; params.push(like, like, like); }
  }
  let effOffset = offset;
  if (after) {
    const ref = db.prepare('SELECT created_at, id FROM invoices WHERE id=?').get(after);
    if (!ref) return res.status(404).json({ error: 'المؤشر غير موجود' });
    // Keyset on (created_at DESC, id DESC) — stable even with identical timestamps.
    base += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
    params.push(ref.created_at, ref.created_at, ref.id);
    effOffset = 0;
  }
  const totalRow = wantCount ? db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params) : null;
  const total = wantCount ? totalRow?.c || 0 : null;
  const rows = db.prepare(`SELECT * ${base} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, effOffset);
  res.set('Cache-Control', 'private, max-age=3, stale-while-revalidate=15');
  return res.json({ invoices: rows, total, limit, offset: effOffset, hasMore: rows.length === limit, nextCursor: rows.length === limit ? rows[rows.length - 1].id : null });
}));

// GET /api/invoices/:id
router.get('/:id', ah(async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  try {
    assertRecordTenant(req, inv);
  } catch {
    return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  }
  inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(inv.id);
  inv.payments = db.prepare('SELECT * FROM payments WHERE invoice_id=?').all(inv.id);
  return res.json(inv);
}));

// GET /api/invoices/:id/audit — hash-chained mutation trail (tamper-evident)
router.get('/:id/audit', ah(async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const inv = db.prepare('SELECT id,number,tenant_id FROM invoices WHERE id=?').get(id);
  if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  try {
    assertRecordTenant(req, inv);
  } catch {
    return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  }
  let links = [];
  try {
    links = db.prepare('SELECT id,prev_hash,hash,action,total,number,status,created_at FROM invoice_audit WHERE invoice_id=? ORDER BY id ASC').all(id);
  } catch {
    return res.json({ invoiceId: id, links: [], chained: false, note: 'migrate to v6 for chain' });
  }
  return res.json({ invoiceId: id, links, chained: links.length > 0 });
}));

// POST /api/invoices/:id/pay — atomic: single transaction, no lost-update race
// Optional { idempotencyKey }: retried webhooks/clients get { deduped:true } instead of double-charging.
router.post('/:id/pay', ah(async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const { method = 'CASH', amount = 0, reference = '' } = req.body || {};
  const amt = Number(amount);
  if (!(amt > 0) || amt > 10_000_000) return res.status(400).json({ error: 'المبلغ أكبر من صفر' });
  const payMethod = String(method).toUpperCase().slice(0, 20);
  const payRef = String(reference).trim().slice(0, 128);
  try {
    assertPayMethod(payMethod, payRef);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const payIdem = String(req.body?.idempotencyKey || '').trim().slice(0, 128) || null;

  try {
    const result = db.transaction(() => {
      const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
      if (!inv) throw Object.assign(new Error('الفاتورة غير موجودة'), { statusCode: 404 });
      try {
        assertRecordTenant(req, inv);
      } catch {
        throw Object.assign(new Error('الفاتورة غير موجودة'), { statusCode: 404 });
      }
      if (payIdem) {
        const dup = db.prepare('SELECT id FROM payments WHERE invoice_id=? AND idempotency_key=?').get(id, payIdem);
        if (dup) {
          return { invoiceId: inv.id, paidAmount: inv.paid_amount, remainingAmount: inv.remaining_amount, status: inv.status, deduped: true, paymentId: dup.id };
        }
      }
      if (['PAID', 'VOIDED', 'RETURNED'].includes(inv.status)) throw Object.assign(new Error(inv.status === 'PAID' ? 'الفاتورة مدفوعة بالفعل' : 'لا يمكن الدفع على فاتورة ملغاة/مرتجعة'), { statusCode: inv.status === 'PAID' ? 400 : 409 });
      // Period immutability: real money movement only — deduped retries above
      // return before this line, so at-least-once webhooks never 409.
      ensureOpenFiscalYear(invoiceFiscalYear(inv));
      // Wallet is capped at what is still owed (see create-path note); cash
      // overpay is recorded in full and returned as change below.
      let recAmt = amt;
      if (payMethod === 'WALLET' && amt > 0) {
        const effMinor = Math.min(toMinor(amt), Math.max(0, toMinor(inv.total) - toMinor(inv.paid_amount)));
        if (effMinor > 0) deductWallet(inv.customer_id, toMajor(effMinor), inv.id, req.user?.username);
        recAmt = toMajor(effMinor);
      }
      const payId = uuid();
      try {
        db.prepare('INSERT INTO payments (id,invoice_id,method,amount,reference,idempotency_key) VALUES (?,?,?,?,?,?)').run(payId, inv.id, payMethod, recAmt, payRef, payIdem);
      } catch (e) {
        if (payIdem && /UNIQUE|CONFLICT/i.test(String(e.message))) {
          const dup = db.prepare('SELECT id FROM payments WHERE invoice_id=? AND idempotency_key=?').get(id, payIdem);
          if (dup) {
            const cur = db.prepare('SELECT paid_amount,remaining_amount,status FROM invoices WHERE id=?').get(id);
            return { invoiceId: id, paidAmount: cur.paid_amount, remainingAmount: cur.remaining_amount, status: cur.status, deduped: true, paymentId: dup.id };
          }
        }
        throw e;
      }
      const newPaidMinor = toMinor(inv.paid_amount) + toMinor(recAmt);
      // Overpay becomes explicit change (same clamped semantics as create):
      // paid/remaining never go past the total into the negative.
      const overMinor = Math.max(0, newPaidMinor - toMinor(inv.total));
      const newPaidMinorCapped = newPaidMinor - overMinor;
      const newRemainingMinor = toMinor(inv.total) - newPaidMinorCapped;
      const newPaid = toMajor(newPaidMinorCapped);
      const newRemaining = toMajor(newRemainingMinor);
      const change = toMajor(overMinor);
      const newStatus = newRemainingMinor <= 1 ? 'PAID' : 'PARTIAL';
      // Conditional write guards against concurrent double-pay overwriting each other
      // (and can never resurrect a VOIDED/RETURNED invoice).
      const upd = db.prepare("UPDATE invoices SET paid_amount=?,remaining_amount=?,status=?,paid_at=COALESCE(paid_at,?) WHERE id=? AND status NOT IN ('PAID','VOIDED','RETURNED')").run(newPaid, newRemaining, newStatus, newStatus === 'PAID' ? new Date().toISOString() : null, inv.id);
      if (upd.changes === 0) throw Object.assign(new Error('الفاتورة مدفوعة بالفعل (تعارض تزامن)'), { statusCode: 409 });
      // Release exactly what this payment settled: old outstanding minus new
      // outstanding. Partial pays release their share immediately, so
      // credit_used always equals the live outstanding (no stranded leakage).
      if (inv.customer_id) {
        const releasedMinor = Math.max(0, toMinor(inv.remaining_amount) - newRemainingMinor);
        if (releasedMinor > 0) {
          db.prepare("UPDATE customers SET credit_used=MAX(0,credit_used-?),updated_at=datetime('now') WHERE id=?").run(toMajor(releasedMinor), inv.customer_id);
        }
      }
      try { appendChain(inv.id, { number: inv.number, total: inv.total, status: newStatus, action: 'PAY' }); } catch { /* ignore */ }
      return { invoiceId: inv.id, paidAmount: newPaid, remainingAmount: newRemaining, change, status: newStatus };
    })();
    req.audit?.('invoice.pay', { invoiceId: id, amount: amt, method: payMethod });
    recordTrail(req, { entity: 'INVOICE', entityId: id, action: 'PAY', after: { amount: amt, method: payMethod, status: result.status } });
    if (result.status === 'PAID') emit('invoice.paid', 'INVOICE', id, { paidAmount: result.paidAmount });
    return res.json(result);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message || '').slice(0, 300) });
  }
}));

// POST /api/invoices/:id/void — إيقاف/إلغاء فاتورة (ADMIN/MANAGER) — يعكس المخزون والنقاط
// Idempotent عبر Idempotency-Key: إعادة نفس المفتاح تُرجع {deduped:true} بدل إعادة العكس.
router.post('/:id/void', ah(async (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const reason = String(req.body?.reason || '').trim().slice(0, 200);
  return idempotency(req, res, 'invoice:void', async () => {
    const r = db.transaction(() => {
      const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
      if (!inv) throw Object.assign(new Error('الفاتورة غير موجودة'), { statusCode: 404 });
      try {
        assertRecordTenant(req, inv);
      } catch {
        throw Object.assign(new Error('الفاتورة غير موجودة'), { statusCode: 404 });
      }
      // Period immutability: voiding mutates stock/loyalty/credit — refused in CLOSED years.
      ensureOpenFiscalYear(invoiceFiscalYear(inv));
      if (inv.status === 'VOIDED') throw Object.assign(new Error('الفاتورة ملغاة مسبقًا'), { statusCode: 400 });
      const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(id);
      // Restore stock atomically. Partial returns shrink line qty in place
      // (and restock their own share immediately), so the current qty is
      // exactly what remains to restore — no double counting possible.
      for (const it of items) {
        const restore = Number(it.qty);
        if (!(restore > 0)) continue;
        const wh = String(it.warehouse_id || 'W-01').slice(0, 32);
        db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=qty+?,updated_at=datetime('now')`).run(it.product_id, wh, restore, restore);
      }
      // Reverse exactly what was earned (net EARN ledger sum), not floor of the
      // current total: a prior partial return shrank the total and already
      // reversed its share via RETURN_PARTIAL rows; PARTIAL invoices that
      // never earned sum to 0 and reverse nothing.
      if (inv.customer_id) {
        const earned = db.prepare(`SELECT COALESCE(SUM(points),0) as s FROM loyalty_transactions WHERE reference_type='INVOICE' AND reference_id=? AND type IN ('EARN','RETURN_PARTIAL')`).get(id)?.s || 0;
        const pts = Math.max(0, Math.floor(Number(earned)));
        if (pts > 0) {
          db.prepare('UPDATE customers SET loyalty_points=MAX(0,loyalty_points-?) WHERE id=?').run(pts, inv.customer_id);
          db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`).run(cryptoId(), inv.customer_id, -pts, Number(inv.total), 'VOID', 'INVOICE', id, reason || 'إلغاء فاتورة');
          try { recalcTier(inv.customer_id); } catch { /* ignore */ }
        }
      }
      // Reverse credit if was unpaid/partial
      if (inv.customer_id && Number(inv.remaining_amount) > 0) {
        db.prepare('UPDATE customers SET credit_used=MAX(0,credit_used-?) WHERE id=?').run(Number(inv.remaining_amount), inv.customer_id);
      }
      // Refund wallet-paid money (deductWallet's missing inverse): sum every
      // recorded WALLET payment — the capped effective amounts, not the request.
      if (inv.customer_id) {
        const walletPaid = db.prepare(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE invoice_id=? AND method='WALLET'`).get(id)?.s || 0;
        if (Number(walletPaid) > 0) refundWallet(inv.customer_id, Number(walletPaid), id, req.user?.username);
      }
      db.prepare(`UPDATE invoices SET status='VOIDED',voided_at=datetime('now'),voided_by=?,notes=COALESCE(notes,'') || ? WHERE id=?`).run(req.user.username, ` | إلغاء: ${reason}`, id);
      try { appendChain(id, { number: inv.number, total: inv.total, status: 'VOIDED', action: 'VOID' }); } catch { /* ignore */ }
      return { invoiceId: id, status: 'VOIDED' };
    })();
    req.audit?.('invoice.void', { invoiceId: id, reason });
    recordTrail(req, { entity: 'INVOICE', entityId: id, action: 'VOID', after: { reason } });
    return r;
  });
}));

// POST /api/invoices/:id/return — إرجاع بضاعة (ADMIN/MANAGER/CASHIER) — يعكس المخزون ويوسم RETURNED
// Idempotent عبر Idempotency-Key: نفس المفتاح لا يعكس المخزون مرتين.
router.post('/:id/return', ah(async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const reason = String(req.body?.reason || '').trim().slice(0, 200) || 'إرجاع';
  return idempotency(req, res, 'invoice:return', async () => {
    const r = db.transaction(() => {
      const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
      if (!inv) throw Object.assign(new Error('الفاتورة غير موجودة'), { statusCode: 404 });
      try {
        assertRecordTenant(req, inv);
      } catch {
        throw Object.assign(new Error('الفاتورة غير موجودة'), { statusCode: 404 });
      }
      // Period immutability: returns mutate stock/loyalty/credit — refused in CLOSED years.
      ensureOpenFiscalYear(invoiceFiscalYear(inv));
      if (inv.status === 'VOIDED' || inv.status === 'RETURNED') throw Object.assign(new Error('الفاتورة ملغاة/مرتجعة مسبقًا'), { statusCode: 400 });
      if (inv.status === 'UNPAID') throw Object.assign(new Error('لا يمكن إرجاع فاتورة غير مدفوعة — ألغها (void) بدلًا من ذلك'), { statusCode: 400 });
      // Accountant control: a CASHIER returning above the approval threshold
      // needs a MANAGER/ADMIN (0 = disabled, preserves legacy behavior).
      const approvalThreshold = Number(getSetting('return_approval_threshold', '0')) || 0;
      if (approvalThreshold > 0 && req.user?.role === 'CASHIER' && Number(inv.total) > approvalThreshold) {
        throw Object.assign(new Error(`المرتجع فوق ${approvalThreshold} يتطلب اعتماد مدير`), { statusCode: 403 });
      }
      // ── Partial return: subset of lines by qty ──
      // Body: { reason?, items: [{ productId, qty, warehouseId? }] }.
      // Recomputes the invoice as if the returned qty never existed (same
      // halala-integer math as create), restocks only the returned share,
      // refunds overpay (wallet share first, remainder as an explicit
      // negative REFUND payment row so shift/report sums net correctly),
      // and reverses only the loyalty share attributable to the return.
      // Each partial batch needs its own Idempotency-Key; replays dedupe.
      const retReq = Array.isArray(req.body?.items) ? req.body.items : null;
      if (retReq) {
        if (retReq.length === 0 || retReq.length > 100) throw Object.assign(new Error('قائمة المرتجع يجب أن تكون بين 1 و 100 بند'), { statusCode: 400 });
        const want = new Map();
        for (const r of retReq) {
          const pid = String(r.productId ?? r.product_id ?? '').trim().slice(0, 64);
          const q = Number(r.qty ?? r.quantity);
          if (!pid) throw Object.assign(new Error('صنف غير محدد في بنود المرتجع'), { statusCode: 400 });
          if (!(q > 0) || q > 100000) throw Object.assign(new Error(`كمية إرجاع غير صالحة للصنف ${pid}`), { statusCode: 400 });
          const wh = String(r.warehouseId ?? r.warehouse_id ?? 'W-01').trim().slice(0, 32) || 'W-01';
          const k = `${pid}|${wh}`;
          want.set(k, (want.get(k) || 0) + q);
        }
        const allLines = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(id);
        const plan = [];
        for (const [k, q] of want) {
          const sep = k.lastIndexOf('|');
          const pid = k.slice(0, sep);
          const wh = k.slice(sep + 1);
          const row = allLines.find((l) => String(l.product_id) === pid && String(l.warehouse_id || 'W-01') === wh && Number(l.is_free_item ?? 0) !== 1);
          if (!row) throw Object.assign(new Error(`البند غير موجود في الفاتورة: ${pid}`), { statusCode: 404 });
          // qty already shrinks with each partial return (returned_qty is the
          // audit trail), so the live available quantity IS the current qty.
          const avail = Math.max(0, Number(row.qty));
          if (q > avail + 1e-9) throw Object.assign(new Error(`الكمية المطلوب إرجاعها تتجاوز المتاح (${avail}) للصنف ${pid}`), { statusCode: 409 });
          plan.push({ row, retQty: q });
        }
        if (plan.length === 0) throw Object.assign(new Error('لا بنود قابلة للإرجاع'), { statusCode: 400 });
        const taxInclusive = getSetting('tax_inclusive', '0') === '1';
        const upsertStock = db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=qty+?,updated_at=datetime('now')`);
        const updateLine = db.prepare(`UPDATE invoice_items SET qty=?,discount=?,tax_amount=?,total=?,returned_qty=? WHERE id=?`);
        const retByRowId = new Map(plan.map((p) => [p.row.id, p.retQty]));
        let newSubMinor = 0, newTaxMinor = 0;
        for (const l of allLines) {
          const ret = retByRowId.get(l.id) || 0;
          if (ret > 0 && Number(l.qty) > 0) {
            const newQty = Math.max(0, Number(l.qty) - ret);
            const discMinor = Math.round(toMinor(l.discount) * newQty / Number(l.qty));
            const grossMinor = toMinor(newQty * Number(l.unit_price)) - discMinor;
            const rate = Math.max(0, Math.min(Number(l.tax_rate) || 0, 100));
            let netMinor = grossMinor, taxMinor = pctOf(grossMinor, rate);
            if (taxInclusive && rate > 0) {
              netMinor = Math.round((grossMinor * 100) / (100 + rate));
              taxMinor = grossMinor - netMinor;
            }
            newSubMinor += netMinor;
            newTaxMinor += taxMinor;
            updateLine.run(newQty, toMajor(discMinor), toMajor(taxMinor), toMajor(netMinor + taxMinor), Number(l.returned_qty || 0) + ret, l.id);
            upsertStock.run(l.product_id, String(l.warehouse_id || 'W-01').slice(0, 32), ret, ret);
          } else {
            newSubMinor += toMinor(l.total) - toMinor(l.tax_amount);
            newTaxMinor += toMinor(l.tax_amount);
          }
        }
        const newGrossMinor = newSubMinor + newTaxMinor;
        const oldGrossMinor = toMinor(inv.subtotal) + toMinor(inv.tax_amount);
        const oldDiscMinor = toMinor(inv.discount_amount);
        const newDiscMinor = oldGrossMinor > 0 ? Math.min(Math.round(oldDiscMinor * newGrossMinor / oldGrossMinor), newGrossMinor) : 0;
        const newTotalMinor = newGrossMinor - newDiscMinor;
        if (newTotalMinor < 0) throw new Error('إجمالي غير صالح بعد الإرجاع الجزئي');
        const paidMinor = toMinor(inv.paid_amount);
        const newPaidMinorCapped = Math.min(paidMinor, newTotalMinor);
        const refundMinor = paidMinor - newPaidMinorCapped;
        const newRemainingMinor = newTotalMinor - newPaidMinorCapped;
        // Refund tender: wallet share back to the wallet first, remainder as
        // an explicit negative REFUND row (nets correctly in shift/report sums).
        const insertRefundPayment = db.prepare(`INSERT INTO payments (id,invoice_id,method,amount,reference) VALUES (?,?,?,?,?)`);
        let refundLeft = refundMinor;
        if (refundLeft > 0 && inv.customer_id) {
          const walletPaid = db.prepare(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE invoice_id=? AND method='WALLET'`).get(id)?.s || 0;
          const wb = Math.min(toMinor(walletPaid), refundLeft);
          if (wb > 0) {
            refundWallet(inv.customer_id, toMajor(wb), id, req.user?.username);
            refundLeft -= wb;
          }
        }
        if (refundLeft > 0) {
          insertRefundPayment.run(uuid(), id, 'REFUND', -toMajor(refundLeft), String(reason || '').slice(0, 128));
        }
        const newStatus = newRemainingMinor <= 1 ? 'PAID' : 'PARTIAL';
        db.prepare(`UPDATE invoices SET subtotal=?,discount_amount=?,tax_amount=?,total=?,paid_amount=?,remaining_amount=?,status=?,notes=COALESCE(notes,'') || ? WHERE id=?`)
          .run(toMajor(newSubMinor), toMajor(newDiscMinor), toMajor(newTaxMinor), toMajor(newTotalMinor), toMajor(newPaidMinorCapped), toMajor(newRemainingMinor), newStatus, ` | إرجاع جزئي: ${reason}`, id);
        if (inv.customer_id) {
          const deltaMinor = newRemainingMinor - toMinor(inv.remaining_amount);
          if (deltaMinor !== 0) {
            db.prepare(`UPDATE customers SET credit_used=MAX(0,credit_used+?),updated_at=datetime('now') WHERE id=?`).run(toMajor(deltaMinor), inv.customer_id);
          }
          const earned = db.prepare(`SELECT COALESCE(SUM(points),0) as s FROM loyalty_transactions WHERE reference_type='INVOICE' AND reference_id=? AND type IN ('EARN','RETURN_PARTIAL')`).get(id)?.s || 0;
          const wouldEarn = Math.floor(toMajor(newTotalMinor) / 10);
          const diff = Math.max(0, Math.floor(Number(earned)) - wouldEarn);
          if (diff > 0) {
            db.prepare('UPDATE customers SET loyalty_points=MAX(0,loyalty_points-?) WHERE id=?').run(diff, inv.customer_id);
            db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`).run(cryptoId(), inv.customer_id, -diff, toMajor(newTotalMinor), 'RETURN_PARTIAL', 'INVOICE', id, reason);
            try { recalcTier(inv.customer_id); } catch { /* ignore */ }
          }
        }
        db.prepare(`INSERT INTO sync_log (entity_type,entity_id,action,payload,status) VALUES (?,?,?,?,?)`).run('INVOICE', id, 'RETURN_PARTIAL', JSON.stringify({ id, reason, lines: plan.length }), 'PENDING');
        try { appendChain(id, { number: inv.number, total: toMajor(newTotalMinor), status: newStatus, action: 'RETURN_PARTIAL' }); } catch { /* ignore */ }
        return { invoiceId: id, status: newStatus, partial: true, refunded: toMajor(refundMinor), subtotal: toMajor(newSubMinor), taxAmount: toMajor(newTaxMinor), discountAmount: toMajor(newDiscMinor), total: toMajor(newTotalMinor), paidAmount: toMajor(newPaidMinorCapped), remainingAmount: toMajor(newRemainingMinor), lines: plan.length };
      }
      const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(id);
      // Same in-place invariant as void: current qty is what remains.
      for (const it of items) {
        const restore = Number(it.qty);
        if (!(restore > 0)) continue;
        const wh = String(it.warehouse_id || 'W-01').slice(0, 32);
        db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=qty+?,updated_at=datetime('now')`).run(it.product_id, wh, restore, restore);
      }
      if (inv.customer_id && (inv.status === 'PAID' || inv.status === 'PARTIAL')) {
        // Reverse exactly what was earned net of prior partial returns
        // (PARTIAL invoices that never earned sum to 0 and reverse nothing).
        const earned = db.prepare(`SELECT COALESCE(SUM(points),0) as s FROM loyalty_transactions WHERE reference_type='INVOICE' AND reference_id=? AND type IN ('EARN','RETURN_PARTIAL')`).get(id)?.s || 0;
        const pts = Math.max(0, Math.floor(Number(earned)));
        if (pts > 0) {
          db.prepare('UPDATE customers SET loyalty_points=MAX(0,loyalty_points-?) WHERE id=?').run(pts, inv.customer_id);
          db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`).run(cryptoId(), inv.customer_id, -pts, Number(inv.total), 'RETURN', 'INVOICE', id, reason);
          try { recalcTier(inv.customer_id); } catch { /* ignore */ }
        }
        if (Number(inv.remaining_amount) > 0) {
          db.prepare('UPDATE customers SET credit_used=MAX(0,credit_used-?) WHERE id=?').run(Number(inv.remaining_amount), inv.customer_id);
        }
        // Refund wallet-paid money (same inverse as void).
        const walletPaid = db.prepare(`SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE invoice_id=? AND method='WALLET'`).get(id)?.s || 0;
        if (Number(walletPaid) > 0) refundWallet(inv.customer_id, Number(walletPaid), id, req.user?.username);
      }
      db.prepare(`UPDATE invoices SET status='RETURNED',voided_at=datetime('now'),voided_by=?,notes=COALESCE(notes,'') || ? WHERE id=?`).run(req.user?.username || 'system', ` | إرجاع: ${reason}`, id);
      db.prepare(`INSERT INTO sync_log (entity_type,entity_id,action,payload,status) VALUES (?,?,?,?,?)`).run('INVOICE', id, 'RETURN', JSON.stringify({ id, reason }), 'PENDING');
      try { appendChain(id, { number: inv.number, total: inv.total, status: 'RETURNED', action: 'RETURN' }); } catch { /* ignore */ }
      return { invoiceId: id, status: 'RETURNED' };
    })();
    const isPartial = !!(r && r.partial);
    req.audit?.(isPartial ? 'invoice.return_partial' : 'invoice.return', { invoiceId: id, reason, ...(isPartial ? { lines: r.lines, refunded: r.refunded } : {}) });
    recordTrail(req, { entity: 'INVOICE', entityId: id, action: isPartial ? 'RETURN_PARTIAL' : 'RETURN', after: isPartial ? { reason, lines: r.lines, refunded: r.refunded } : { reason } });
    emit('invoice.returned', 'INVOICE', id, isPartial ? { reason, partial: true } : { reason });
    return r;
  });
}));

export default router;
