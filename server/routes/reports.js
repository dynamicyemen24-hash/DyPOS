/**
 * DyPOS Reports — management aggregates over date ranges (read-only).
 * Complements the single-day Z report (GET /api/invoices/reports/daily).
 * Roles: ADMIN / MANAGER / AUDITOR (same contract as /api/export).
 */
import { Router } from 'express';
import db from '../db/schema.js';
import { requireRole } from '../middleware/auth.js';
import { rangeBounds } from '../lib/dates.js';

const router = Router();
router.use(requireRole('ADMIN', 'MANAGER', 'AUDITOR'));

function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

// GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&terminal=
router.get('/summary', (req, res) => {
  const to = String(req.query.to || req.query.from || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const from = String(req.query.from || to).slice(0, 10);
  if (!validDate(from) || !validDate(to)) return res.status(400).json({ error: 'التواريخ YYYY-MM-DD' });
  if (from > to) return res.status(400).json({ error: 'from يجب أن يسبق to' });
  const terminal = req.query.terminal ? String(req.query.terminal).slice(0, 32) : null;
  // Sargable bounds (index-seek, no date() full scan).
  const b = rangeBounds(from, to);
  const fromQ = b.from;
  const toQ = b.to;
  const tClause = terminal ? ' AND i.terminal_id=?' : '';
  const tParams = terminal ? [terminal] : [];
  const head = db.prepare(`SELECT COUNT(*) as orders, COALESCE(SUM(i.total),0) as gross,
      COALESCE(SUM(i.discount_amount),0) as discounts, COALESCE(SUM(i.tax_amount),0) as tax,
      COALESCE(SUM(i.paid_amount),0) as paid
    FROM invoices i WHERE i.created_at>=? AND i.created_at<?${tClause}`)
    .get(fromQ, toQ, ...tParams);
  const byStatus = db.prepare(`SELECT i.status, COUNT(*) as count, COALESCE(SUM(i.total),0) as total
    FROM invoices i WHERE i.created_at>=? AND i.created_at<?${terminal ? ' AND i.terminal_id=?' : ''} GROUP BY i.status`)
    .all(fromQ, toQ, ...tParams);
  const byMethod = db.prepare(`SELECT p.method, COALESCE(SUM(p.amount),0) as total, COUNT(*) as count
    FROM payments p JOIN invoices i ON p.invoice_id=i.id
    WHERE i.created_at>=? AND i.created_at<?${terminal ? ' AND i.terminal_id=?' : ''} GROUP BY p.method`)
    .all(fromQ, toQ, ...tParams);
  const top = db.prepare(`SELECT ii.product_id, MAX(ii.product_name) as product_name,
      COALESCE(SUM(ii.qty),0) as qty, COALESCE(SUM(ii.total),0) as revenue
    FROM invoice_items ii JOIN invoices i ON ii.invoice_id=i.id
    WHERE i.created_at>=? AND i.created_at<? AND i.status IN ('PAID','PARTIAL')${terminal ? ' AND i.terminal_id=?' : ''}
    GROUP BY ii.product_id ORDER BY revenue DESC LIMIT 5`)
    .all(fromQ, toQ, ...tParams);
  const orders = Number(head.orders) || 0;
  return res.json({
    from, to, terminal,
    orders,
    gross: head.gross, discounts: head.discounts, tax: head.tax, paid: head.paid,
    avgTicket: orders ? Math.round((Number(head.gross) / orders) * 100) / 100 : 0,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, { count: r.count, total: r.total }])),
    byMethod: Object.fromEntries(byMethod.map((r) => [r.method, { count: r.count, total: r.total }])),
    topProducts: top,
  });
});

export default router;
