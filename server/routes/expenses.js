/** DyPOS Expenses Ledger v1.32.0 — daily costs for true net-profit accounting.
 *
 * The accountant's missing half of P&L: every riyal leaving the drawer that
 * is NOT a refund (rent, salaries, supplies, utilities) is recorded here
 * with date + category, so net profit = sales − refunds − expenses.
 */
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db/schema.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { ah } from '../lib/async.js';
import { VERSION } from '../lib/version.js';
import { assertTenantScope, resolveTenantFilter } from '../lib/tenant.js';

const router = Router();

function ensureExpensesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      tenant_id TEXT,
      branch_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_expenses_cat ON expenses(category, date DESC);
  `);
}

// POST /api/expenses — record a daily expense (any cashier role; ADMIN/MANAGER approve by policy)
router.post('/', authMiddleware, ah(async (req, res) => {
  ensureExpensesTable();
  const b = req.body || {};
  const date = String(b.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'صيغة التاريخ غير صالحة (YYYY-MM-DD)' });
  const category = String(b.category || '').trim().slice(0, 64);
  if (!category) return res.status(400).json({ error: 'فئة المصروف مطلوبة' });
  const amount = Number(b.amount);
  if (!(amount > 0) || amount > 10000000) return res.status(400).json({ error: 'مبلغ المصروف يجب أن يكون أكبر من صفر' });
  const notes = String(b.notes || '').trim().slice(0, 500);
  let scope = { tenantId: null, branchId: null };
  try {
    scope = assertTenantScope(req);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const id = String(b.id || uuid()).slice(0, 64);
  try {
    db.prepare(`INSERT INTO expenses (id,date,category,amount,notes,tenant_id,branch_id,created_by)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, date, category, Math.round(amount * 100) / 100, notes, scope.tenantId, scope.branchId, req.user?.username || null);
  } catch (e) {
    if (/UNIQUE|CONFLICT/i.test(String(e.message))) {
      const dup = db.prepare('SELECT * FROM expenses WHERE id=?').get(id);
      if (dup) return res.json({ deduped: true, expense: dup, version: VERSION });
    }
    throw e;
  }
  req.audit?.('expense.create', { expenseId: id, amount, category });
  return res.status(201).json({ expenseId: id, date, category, amount, version: VERSION });
}));

// GET /api/expenses — list newest first (date/category filters + capped pagination)
router.get('/', authMiddleware, ah(async (req, res) => {
  ensureExpensesTable();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const { from, to, category } = req.query;
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  let base = 'FROM expenses WHERE 1=1';
  const params = [];
  if (scopeTenant) { base += ' AND tenant_id=?'; params.push(scopeTenant); }
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(from))) return res.status(400).json({ error: 'صيغة from غير صالحة' });
    base += ' AND date>=?'; params.push(from);
  }
  if (to) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(to))) return res.status(400).json({ error: 'صيغة to غير صالحة' });
    base += ' AND date<=?'; params.push(to);
  }
  if (category) { base += ' AND category=?'; params.push(String(category).slice(0, 64)); }
  const total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
  const rows = db.prepare(`SELECT * ${base} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return res.json({ expenses: rows, total, limit, offset, hasMore: rows.length === limit, version: VERSION });
}));

// GET /api/expenses/summary — totals by category + grand total for P&L
router.get('/summary', authMiddleware, ah(async (req, res) => {
  ensureExpensesTable();
  const { from, to } = req.query;
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  let base = 'FROM expenses WHERE 1=1';
  const params = [];
  if (scopeTenant) { base += ' AND tenant_id=?'; params.push(scopeTenant); }
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(from))) return res.status(400).json({ error: 'صيغة from غير صالحة' });
    base += ' AND date>=?'; params.push(from);
  }
  if (to) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(to))) return res.status(400).json({ error: 'صيغة to غير صالحة' });
    base += ' AND date<=?'; params.push(to);
  }
  const byCategory = db.prepare(`SELECT category, COUNT(*) as count, COALESCE(SUM(amount),0) as total ${base} GROUP BY category ORDER BY total DESC`).all(...params);
  const grand = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total ${base}`).get(...params);
  return res.json({ from: from || null, to: to || null, byCategory, total: grand?.total || 0, count: grand?.count || 0, version: VERSION });
}));

// DELETE /api/expenses/:id — void a wrongly recorded expense (ADMIN/MANAGER only)
router.delete('/:id', authMiddleware, requireRole('ADMIN', 'MANAGER'), ah(async (req, res) => {
  ensureExpensesTable();
  const id = String(req.params.id).slice(0, 64);
  const del = db.prepare('DELETE FROM expenses WHERE id=?').run(id);
  if (del.changes === 0) return res.status(404).json({ error: 'المصروف غير موجود' });
  req.audit?.('expense.delete', { expenseId: id });
  return res.json({ deleted: true, expenseId: id, version: VERSION });
}));

export default router;
