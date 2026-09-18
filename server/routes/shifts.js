import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { validate, shiftOpenSchema } from '../middleware/validate.js';
import { assertTenantScope, resolveTenantFilter, assertRecordTenant } from '../lib/tenant.js';
import { recordTrail } from '../lib/trail.js';
import { emit } from '../lib/webhooks.js';

const router = Router();

// POST /api/shifts/open
router.post('/open', validate(shiftOpenSchema), (req, res) => {
  const { terminalId, openingCash = 0 } = req.body;
  const term = String(terminalId).trim().slice(0, 32);
  let scope = { tenantId: null, branchId: null };
  try {
    scope = assertTenantScope(req);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const existing = db.prepare('SELECT id FROM shifts WHERE terminal_id=? AND status=?').get(term, 'OPEN');
  if (existing) return res.status(409).json({ error: 'يوجد وردية مفتوحة بالفعل', shiftId: existing.id });
  const id = uuid();
  db.prepare('INSERT INTO shifts (id,terminal_id,opened_by,opening_cash,status,tenant_id,branch_id) VALUES (?,?,?,?,?,?,?)').run(id, term, req.user?.fullName || req.user?.username || 'System', Number(openingCash) || 0, 'OPEN', scope.tenantId, scope.branchId);
  req.audit?.('shift.open', { shiftId: id, terminalId: term });
  recordTrail(req, { entity: 'SHIFT', entityId: id, action: 'OPEN', after: { terminalId: term, tenantId: scope.tenantId } });
  return res.status(201).json({ shiftId: id, terminalId: term, openingCash: Number(openingCash) || 0, status: 'OPEN' });
});

// GET /api/shifts/open/:terminalId
router.get('/open/:terminalId', (req, res) => {
  const row = db.prepare('SELECT * FROM shifts WHERE terminal_id=? AND status=?').get(String(req.params.terminalId).slice(0, 32), 'OPEN');
  return res.json({ shift: row || null });
});

// GET /api/shifts — shift history (paginated, terminal/status/tenant filters)
router.get('/', (req, res) => {
  const terminal = req.query.terminal ? String(req.query.terminal).slice(0, 32) : '';
  const status = req.query.status ? String(req.query.status).toUpperCase().slice(0, 16) : '';
  if (status && !['OPEN', 'CLOSED'].includes(status)) return res.status(400).json({ error: 'حالة وردية غير صالحة' });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  let base = 'FROM shifts WHERE 1=1';
  const params = [];
  if (scopeTenant) { base += ' AND tenant_id=?'; params.push(scopeTenant); }
  if (terminal) { base += ' AND terminal_id=?'; params.push(terminal); }
  if (status) { base += ' AND status=?'; params.push(status); }
  const totalRow = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params);
  const total = totalRow?.c || 0;
  const rows = db.prepare(`SELECT * ${base} ORDER BY opened_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return res.json({ shifts: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

// POST /api/shifts/:id/close — atomic close (prevents double-close race)
router.post('/:id/close', (req, res) => {
  const { closingCash, varianceApproval } = req.body || {};
  const id = String(req.params.id).slice(0, 64);
  if (closingCash != null && (!Number.isFinite(Number(closingCash)) || Number(closingCash) < 0 || Number(closingCash) > 100_000_000)) {
    return res.status(400).json({ error: 'مبلغ الإغلاق غير صالح' });
  }
  try {
    const result = db.transaction(() => {
      const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(id);
      if (!shift) throw Object.assign(new Error('الوردية غير موجودة'), { statusCode: 404 });
      try {
        assertRecordTenant(req, shift);
      } catch {
        throw Object.assign(new Error('الوردية غير موجودة'), { statusCode: 404 });
      }
      if (shift.status !== 'OPEN') throw Object.assign(new Error('الوردية مغلقة بالفعل'), { statusCode: 400 });
      const stats = db.prepare(`SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as total_sales FROM invoices WHERE shift_id=? AND status IN ('PAID','PARTIAL')`).get(shift.id);
      const cashStats = db.prepare(`SELECT COALESCE(SUM(p.amount),0) as cash_total FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.shift_id=? AND p.method='CASH' AND i.status IN ('PAID','PARTIAL')`).get(shift.id);
      const expected = toNum(shift.opening_cash) + toNum(cashStats.cash_total);
      const counted = closingCash != null ? toNum(closingCash) : expected;
      const variance = Math.round((counted - expected) * 100) / 100;
      const varianceLimit = Math.max(Number(process.env.DYPOS_SHIFT_VARIANCE_LIMIT) || 100, 0);
      if (Math.abs(variance) > varianceLimit && !varianceApproval) {
        throw Object.assign(new Error(`فرق كبير (${variance}) — تطلب موافقة المدير (الحد ${varianceLimit})`), { statusCode: 403, needsApproval: true });
      }
      const upd = db.prepare(`UPDATE shifts SET status='CLOSED',closed_at=datetime('now'),closing_cash=?,expected_cash=?,variance=?,closed_by=?,cash_sales=?,total_sales=?,orders_count=? WHERE id=? AND status='OPEN'`)
        .run(counted, expected, variance, req.user?.fullName || req.user?.username || 'System', toNum(cashStats.cash_total), toNum(stats.total_sales), toNum(stats.orders_count), shift.id);
      if (upd.changes === 0) throw Object.assign(new Error('الوردية مغلقة بالفعل (تعارض تزامن)'), { statusCode: 409 });
      return { shiftId: shift.id, expected, counted, variance, ordersCount: stats.orders_count, totalSales: stats.total_sales };
    })();
    req.audit?.('shift.close', { shiftId: id });
    recordTrail(req, { entity: 'SHIFT', entityId: id, action: 'CLOSE', after: { variance: result.variance, totalSales: result.totalSales } });
    emit('shift.closed', 'SHIFT', id, { totalSales: result.totalSales, ordersCount: result.ordersCount, variance: result.variance });
    return res.json(result);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 300), needsApproval: e.needsApproval || undefined });
  }
});

// POST /api/shifts/:id/handover — atomic close + open (cashier change without losing sales)
// Body: { closingCash, newTerminalId?, openingCash?, varianceApproval? }
// The counted cash becomes the next opening unless openingCash is explicit.
router.post('/:id/handover', (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const { closingCash, newTerminalId, openingCash, varianceApproval } = req.body || {};
  if (closingCash != null && (!Number.isFinite(Number(closingCash)) || Number(closingCash) < 0 || Number(closingCash) > 100_000_000)) {
    return res.status(400).json({ error: 'مبلغ الإغلاق غير صالح' });
  }
  const term = String(newTerminalId || '').trim().slice(0, 32) || null;
  try {
    const result = db.transaction(() => {
      const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(id);
      if (!shift) throw Object.assign(new Error('الوردية غير موجودة'), { statusCode: 404 });
      try {
        assertRecordTenant(req, shift);
      } catch {
        throw Object.assign(new Error('الوردية غير موجودة'), { statusCode: 404 });
      }
      if (shift.status !== 'OPEN') throw Object.assign(new Error('الوردية مغلقة بالفعل'), { statusCode: 400 });
      const targetTerm = term || shift.terminal_id;
      const clash = db.prepare('SELECT id FROM shifts WHERE terminal_id=? AND status=? AND id!=?').get(targetTerm, 'OPEN', shift.id);
      if (clash) throw Object.assign(new Error('يوجد وردية مفتوحة بالفعل على الطرفية الهدف'), { statusCode: 409 });
      const stats = db.prepare(`SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as total_sales FROM invoices WHERE shift_id=? AND status IN ('PAID','PARTIAL')`).get(shift.id);
      const cashStats = db.prepare(`SELECT COALESCE(SUM(p.amount),0) as cash_total FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.shift_id=? AND p.method='CASH' AND i.status IN ('PAID','PARTIAL')`).get(shift.id);
      const expected = toNum(shift.opening_cash) + toNum(cashStats.cash_total);
      const counted = closingCash != null ? toNum(closingCash) : expected;
      const variance = Math.round((counted - expected) * 100) / 100;
      const varianceLimit = Math.max(Number(process.env.DYPOS_SHIFT_VARIANCE_LIMIT) || 100, 0);
      if (Math.abs(variance) > varianceLimit && !varianceApproval) {
        throw Object.assign(new Error(`فرق كبير (${variance}) — تطلب موافقة المدير (الحد ${varianceLimit})`), { statusCode: 403, needsApproval: true });
      }
      const me = req.user?.fullName || req.user?.username || 'System';
      const upd = db.prepare(`UPDATE shifts SET status='CLOSED',closed_at=datetime('now'),closing_cash=?,expected_cash=?,variance=?,closed_by=?,cash_sales=?,total_sales=?,orders_count=? WHERE id=? AND status='OPEN'`)
        .run(counted, expected, variance, me, toNum(cashStats.cash_total), toNum(stats.total_sales), toNum(stats.orders_count), shift.id);
      if (upd.changes === 0) throw Object.assign(new Error('الوردية مغلقة بالفعل (تعارض تزامن)'), { statusCode: 409 });
      const nid = uuid();
      const nOpening = openingCash != null ? toNum(openingCash) : counted;
      db.prepare('INSERT INTO shifts (id,terminal_id,opened_by,opening_cash,status,tenant_id,branch_id) VALUES (?,?,?,?,?,?,?)').run(nid, targetTerm, me, nOpening, 'OPEN', shift.tenant_id || null, shift.branch_id || null);
      return { closedShiftId: shift.id, newShiftId: nid, terminalId: targetTerm, counted, openingCash: nOpening, variance };
    })();
    req.audit?.('shift.handover', { from: id, to: result.newShiftId });
    recordTrail(req, { entity: 'SHIFT', entityId: id, action: 'HANDOVER', after: { to: result.newShiftId } });
    emit('shift.closed', 'SHIFT', id, { handoverTo: result.newShiftId, variance: result.variance });
    return res.status(201).json(result);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 300), needsApproval: e.needsApproval || undefined });
  }
});

// GET /api/shifts/:id/xreport — mid-shift snapshot (no mutation; ?counted= for variance preview)
router.get('/:id/xreport', (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!shift) return res.status(404).json({ error: 'الوردية غير موجودة' });
  try {
    assertRecordTenant(req, shift);
  } catch {
    return res.status(404).json({ error: 'الوردية غير موجودة' });
  }
  const stats = db.prepare(`SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as total_sales, COALESCE(SUM(paid_amount),0) as paid_total FROM invoices WHERE shift_id=? AND status IN ('PAID','PARTIAL')`).get(shift.id);
  const payments = db.prepare(`SELECT p.method, COALESCE(SUM(p.amount),0) as total, COUNT(*) as count FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.shift_id=? GROUP BY p.method`).all(shift.id);
  const expected = toNum(shift.opening_cash) + payments.filter((p) => p.method === 'CASH').reduce((a, p) => a + toNum(p.total), 0);
  const out = { shiftId: shift.id, status: shift.status, expected: Math.round(expected * 100) / 100, ordersCount: stats.orders_count, totalSales: stats.total_sales, paidTotal: stats.paid_total, payments };
  if (req.query.counted != null && req.query.counted !== '') {
    const counted = Number(req.query.counted);
    if (!Number.isFinite(counted) || counted < 0) return res.status(400).json({ error: 'counted غير صالح' });
    out.counted = counted;
    out.variance = Math.round((counted - out.expected) * 100) / 100;
  }
  return res.json(out);
});

// GET /api/shifts/:id/report
router.get('/:id/report', (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!shift) return res.status(404).json({ error: 'الوردية غير موجودة' });
  try {
    assertRecordTenant(req, shift);
  } catch {
    return res.status(404).json({ error: 'الوردية غير موجودة' });
  }
  const invoices = db.prepare(`SELECT status, COUNT(*) as count, SUM(total) as total FROM invoices WHERE shift_id=? GROUP BY status`).all(shift.id);
  const payments = db.prepare(`SELECT p.method, SUM(p.amount) as total, COUNT(*) as count FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.shift_id=? GROUP BY p.method`).all(shift.id);
  return res.json({ shift, invoices, payments });
});

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default router;
