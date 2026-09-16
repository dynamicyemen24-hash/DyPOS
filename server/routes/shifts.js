import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { validate, shiftOpenSchema } from '../middleware/validate.js';
import { emit } from '../lib/webhooks.js';

const router = Router();

// POST /api/shifts/open
router.post('/open', validate(shiftOpenSchema), (req, res) => {
  const { terminalId, openingCash = 0 } = req.body;
  const term = String(terminalId).trim().slice(0, 32);
  const existing = db.prepare('SELECT id FROM shifts WHERE terminal_id=? AND status=?').get(term, 'OPEN');
  if (existing) return res.status(409).json({ error: 'يوجد وردية مفتوحة بالفعل', shiftId: existing.id });
  const id = uuid();
  db.prepare('INSERT INTO shifts (id,terminal_id,opened_by,opening_cash,status) VALUES (?,?,?,?,?)').run(id, term, req.user?.fullName || req.user?.username || 'System', Number(openingCash) || 0, 'OPEN');
  req.audit?.('shift.open', { shiftId: id, terminalId: term });
  return res.status(201).json({ shiftId: id, terminalId: term, openingCash: Number(openingCash) || 0, status: 'OPEN' });
});

// GET /api/shifts/open/:terminalId
router.get('/open/:terminalId', (req, res) => {
  const row = db.prepare('SELECT * FROM shifts WHERE terminal_id=? AND status=?').get(String(req.params.terminalId).slice(0, 32), 'OPEN');
  return res.json({ shift: row || null });
});

// POST /api/shifts/:id/close — atomic close (prevents double-close race)
router.post('/:id/close', (req, res) => {
  const { closingCash, varianceApproval } = req.body || {};
  const id = String(req.params.id).slice(0, 64);
  try {
    const result = db.transaction(() => {
      const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(id);
      if (!shift) throw Object.assign(new Error('الوردية غير موجودة'), { statusCode: 404 });
      if (shift.status !== 'OPEN') throw Object.assign(new Error('الوردية مغلقة بالفعل'), { statusCode: 400 });
      const stats = db.prepare(`SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as total_sales FROM invoices WHERE shift_id=? AND status IN ('PAID','PARTIAL')`).get(shift.id);
      const cashStats = db.prepare(`SELECT COALESCE(SUM(p.amount),0) as cash_total FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.shift_id=? AND p.method='CASH' AND i.status IN ('PAID','PARTIAL')`).get(shift.id);
      const expected = toNum(shift.opening_cash) + toNum(cashStats.cash_total);
      const counted = closingCash != null ? toNum(closingCash) : expected;
      const variance = Math.round((counted - expected) * 100) / 100;
      if (Math.abs(variance) > 100 && !varianceApproval) {
        throw Object.assign(new Error(`فرق كبير (${variance}) — تطلب موافقة المدير`), { statusCode: 403, needsApproval: true });
      }
      const upd = db.prepare(`UPDATE shifts SET status='CLOSED',closed_at=datetime('now'),closing_cash=?,expected_cash=?,variance=?,closed_by=?,cash_sales=?,total_sales=?,orders_count=? WHERE id=? AND status='OPEN'`)
        .run(counted, expected, variance, req.user?.fullName || req.user?.username || 'System', toNum(cashStats.cash_total), toNum(stats.total_sales), toNum(stats.orders_count), shift.id);
      if (upd.changes === 0) throw Object.assign(new Error('الوردية مغلقة بالفعل (تعارض تزامن)'), { statusCode: 409 });
      return { shiftId: shift.id, expected, counted, variance, ordersCount: stats.orders_count, totalSales: stats.total_sales };
    })();
    req.audit?.('shift.close', { shiftId: id });
    emit('shift.closed', 'SHIFT', id, { totalSales: result.totalSales, ordersCount: result.ordersCount, variance: result.variance });
    return res.json(result);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 300), needsApproval: e.needsApproval || undefined });
  }
});

// GET /api/shifts/:id/report
router.get('/:id/report', (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!shift) return res.status(404).json({ error: 'الوردية غير موجودة' });
  const invoices = db.prepare(`SELECT status, COUNT(*) as count, SUM(total) as total FROM invoices WHERE shift_id=? GROUP BY status`).all(shift.id);
  const payments = db.prepare(`SELECT p.method, SUM(p.amount) as total, COUNT(*) as count FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.shift_id=? GROUP BY p.method`).all(shift.id);
  return res.json({ shift, invoices, payments });
});

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default router;
