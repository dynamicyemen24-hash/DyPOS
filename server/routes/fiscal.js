/**
 * Fiscal years — period control for any-country operation (ADMIN-gated writes).
 *
 *   GET  /api/fiscal-years               list (any authenticated role)
 *   POST /api/fiscal-years               open a year { code:'YYYY', starts_on?, ends_on? } (ADMIN)
 *   POST /api/fiscal-years/:code/close   close (ADMIN) — posting into it then 409s
 *   POST /api/fiscal-years/:code/reopen  reopen (ADMIN)
 *
 * POST /api/invoices resolves the sale's UTC year through ensureOpenFiscalYear()
 * (exported below): missing year rows are auto-provisioned OPEN (fresh DBs and
 * tests keep working with zero setup); CLOSED years refuse posting so periods
 * already reported to the tax authority stay immutable.
 */
import { Router } from 'express';
import db from '../db/schema.js';

const router = Router();
const isAdmin = (req) => req.user?.role === 'ADMIN';

export function yearOf(d = new Date()) {
  return String(d.getUTCFullYear());
}

export function ensureOpenFiscalYear(code) {
  const c = String(code || '').trim().slice(0, 4);
  if (!/^\d{4}$/.test(c)) throw Object.assign(new Error('السنة المالية 4 أرقام'), { statusCode: 400 });
  let row;
  try {
    row = db.prepare('SELECT code, status FROM fiscal_years WHERE code=?').get(c);
  } catch {
    return { code: c, status: 'OPEN' }; // pre-v14 DBs (migrate pending) → permissive
  }
  if (!row) {
    db.prepare(`INSERT OR IGNORE INTO fiscal_years (code,starts_on,ends_on,status) VALUES (?,?,?,'OPEN')`)
      .run(c, `${c}-01-01`, `${c}-12-31`);
    return { code: c, status: 'OPEN' };
  }
  if (String(row.status).toUpperCase() !== 'OPEN') {
    throw Object.assign(new Error(`السنة المالية ${c} مقفلة — الترحيل فيها مرفوض`), { statusCode: 409 });
  }
  return { code: c, status: 'OPEN' };
}

function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s)));
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT code,starts_on,ends_on,status,closed_by,closed_at FROM fiscal_years ORDER BY code DESC').all();
  return res.json({ years: rows });
});

router.post('/', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const code = String(req.body?.code || '').trim().slice(0, 4);
  if (!/^\d{4}$/.test(code)) return res.status(400).json({ error: 'السنة المالية 4 أرقام (مثال 2026)' });
  const starts = String(req.body?.starts_on || `${code}-01-01`).slice(0, 10);
  const ends = String(req.body?.ends_on || `${code}-12-31`).slice(0, 10);
  if (!validDate(starts) || !validDate(ends)) return res.status(400).json({ error: 'التاريخ YYYY-MM-DD' });
  if (starts > ends) return res.status(400).json({ error: 'البداية بعد النهاية' });
  try {
    db.prepare(`INSERT INTO fiscal_years (code,starts_on,ends_on,status) VALUES (?,?,?,'OPEN')`).run(code, starts, ends);
  } catch (e) {
    if (/UNIQUE|PRIMARY/i.test(String(e.message))) return res.status(409).json({ error: 'السنة موجودة مسبقًا' });
    throw e;
  }
  req.audit?.('fiscal.open', { code });
  return res.status(201).json({ code, starts_on: starts, ends_on: ends, status: 'OPEN' });
});

router.post('/:code/close', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const code = String(req.params.code).slice(0, 4);
  const row = db.prepare('SELECT status FROM fiscal_years WHERE code=?').get(code);
  if (!row) return res.status(404).json({ error: 'السنة غير موجودة' });
  if (String(row.status).toUpperCase() !== 'OPEN') return res.status(409).json({ error: 'السنة ليست مفتوحة' });
  db.prepare(`UPDATE fiscal_years SET status='CLOSED',closed_by=?,closed_at=datetime('now') WHERE code=?`)
    .run(req.user?.username || null, code);
  req.audit?.('fiscal.close', { code });
  return res.json({ code, status: 'CLOSED' });
});

router.post('/:code/reopen', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const code = String(req.params.code).slice(0, 4);
  const row = db.prepare('SELECT status FROM fiscal_years WHERE code=?').get(code);
  if (!row) return res.status(404).json({ error: 'السنة غير موجودة' });
  if (String(row.status).toUpperCase() !== 'CLOSED') return res.status(409).json({ error: 'السنة ليست مقفلة' });
  db.prepare(`UPDATE fiscal_years SET status='OPEN',closed_by=NULL,closed_at=NULL WHERE code=?`).run(code);
  req.audit?.('fiscal.reopen', { code });
  return res.json({ code, status: 'OPEN' });
});

export default router;
