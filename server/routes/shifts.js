import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';

const router = Router();

// POST /api/shifts/open
router.post('/open', (req, res) => {
  const { terminalId, openingCash = 0 } = req.body || {};
  if (!terminalId) return res.status(400).json({ error: 'Terminal ID مطلوب' });
  const existing = db.prepare('SELECT id FROM shifts WHERE terminal_id=? AND status=?').get(String(terminalId).trim(), 'OPEN');
  if (existing) return res.status(409).json({ error: 'يوجد وردية مفتوحة بالفعل', shiftId: existing.id });
  const id = uuid();
  db.prepare('INSERT INTO shifts (id,terminal_id,opened_by,opening_cash,status) VALUES (?,?,?,?,?)').run(id, String(terminalId).trim(), req.user?.fullName || 'System', Number(openingCash), 'OPEN');
  return res.status(201).json({ shiftId: id, terminalId, openingCash: Number(openingCash), status: 'OPEN' });
});

// GET /api/shifts/open/:terminalId
router.get('/open/:terminalId', (req, res) => {
  const row = db.prepare('SELECT * FROM shifts WHERE terminal_id=? AND status=?').get(req.params.terminalId, 'OPEN');
  return res.json({ shift: row || null });
});

// POST /api/shifts/:id/close
router.post('/:id/close', (req, res) => {
  const { closingCash, varianceApproval } = req.body || {};
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(req.params.id);
  if (!shift) return res.status(404).json({ error: 'الوردية غير موجودة' });
  if (shift.status !== 'OPEN') return res.status(400).json({ error: 'الوردية مغلقة بالفعل' });
  const stats = db.prepare(`SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as total_sales FROM invoices WHERE shift_id=? AND status IN ('PAID','PARTIAL')`).get(shift.id);
  const cashStats = db.prepare(`SELECT COALESCE(SUM(p.amount),0) as cash_total FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.shift_id=? AND p.method='CASH' AND i.status IN ('PAID','PARTIAL')`).get(shift.id);
  const expected = shift.opening_cash + Number(cashStats.cash_total);
  const counted = Number(closingCash) || expected;
  const variance = Math.round((counted - expected) * 100) / 100;
  if (Math.abs(variance) > 100 && !varianceApproval) {
    return res.status(403).json({ error: `فرق كبير (${variance}) — تطلب موافقة المدير`, needsApproval: true });
  }
  db.prepare(`UPDATE shifts SET status='CLOSED',closed_at=datetime('now'),closing_cash=?,expected_cash=?,variance=?,closed_by=?,cash_sales=?,total_sales=?,orders_count=? WHERE id=?`)
    .run(counted, expected, variance, req.user?.fullName || 'System', Number(cashStats.cash_total), Number(stats.total_sales), Number(stats.orders_count), shift.id);
  return res.json({ shiftId: shift.id, expected, counted, variance, ordersCount: stats.orders_count, totalSales: stats.total_sales });
});

// GET /api/shifts/:id/report
router.get('/:id/report', (req, res) => {
  const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(req.params.id);
  if (!shift) return res.status(404).json({ error: 'الوردية غير موجودة' });
  const invoices = db.prepare(`SELECT status, COUNT(*) as count, SUM(total) as total FROM invoices WHERE shift_id=? GROUP BY status`).all(shift.id);
  const payments = db.prepare(`SELECT p.method, SUM(p.amount) as total, COUNT(*) as count FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.shift_id=? GROUP BY p.method`).all(shift.id);
  return res.json({ shift, invoices, payments });
});

export default router;