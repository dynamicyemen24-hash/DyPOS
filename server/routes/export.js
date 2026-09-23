import { Router } from 'express';
import db from '../db/schema.js';
import { requireRole } from '../middleware/auth.js';
import { dayAfter } from '../lib/dates.js';
import { createJob, getJob, listJobs, runInBackground } from '../lib/jobs.js';
import { resolveTenantFilter } from '../lib/tenant.js';

const router = Router();

// Read-only integration roles. CASHIER is intentionally excluded.
router.use(requireRole('ADMIN', 'MANAGER', 'AUDITOR'));

/**
 * Every exportable entity is tenant-attributed (directly or via its parent),
 * so the SQL below is scoped to the caller's tenant: `build(q, tenant)` gets
 * the validated tenant and returns { sql, args }. Unscoped callers (legacy)
 * keep exporting everything, exactly like the in-app list endpoints.
 */
const ENTITIES = {
  products: {
    columns: ['id', 'code', 'name', 'name_ar', 'barcode', 'unit_price', 'cost', 'tax_rate', 'uom', 'category', 'brand', 'is_active'],
    build: (_q, tenant) => {
      const a = [];
      let s = 'SELECT * FROM products WHERE 1=1';
      if (tenant) { s += ' AND tenant_id=?'; a.push(tenant); }
      return { sql: s + ' ORDER BY name', args: a };
    },
  },
  customers: {
    columns: ['id', 'name', 'phone', 'email', 'tax_number', 'loyalty_tier', 'loyalty_points', 'wallet_balance', 'credit_limit', 'credit_used'],
    build: (_q, tenant) => {
      const a = [];
      let s = 'SELECT * FROM customers WHERE 1=1';
      if (tenant) { s += ' AND tenant_id=?'; a.push(tenant); }
      return { sql: s + ' ORDER BY name', args: a };
    },
  },
  invoices: {
    columns: ['id', 'number', 'customer_id', 'customer_name', 'subtotal', 'discount_amount', 'tax_amount', 'total', 'paid_amount', 'remaining_amount', 'status', 'currency', 'terminal_id', 'created_at', 'paid_at'],
    build: (q, tenant) => {
      const a = [];
      // Sargable bounds (index-seek, no date() full scan).
      let s = 'SELECT * FROM invoices WHERE 1=1';
      if (tenant) { s += ' AND tenant_id=?'; a.push(tenant); }
      if (q.from) { s += ' AND created_at>=?'; a.push(String(q.from).slice(0, 10)); }
      if (q.to) { s += ' AND created_at<?'; a.push(dayAfter(String(q.to).slice(0, 10))); }
      if (q.status) { s += ' AND status=?'; a.push(String(q.status).slice(0, 20)); }
      return { sql: s + ' ORDER BY created_at DESC', args: a };
    },
  },
  invoice_items: {
    columns: ['id', 'invoice_id', 'product_id', 'product_name', 'barcode', 'qty', 'unit_price', 'discount', 'tax_rate', 'tax_amount', 'total', 'uom', 'warehouse_id'],
    build: (_q, tenant) => {
      const a = [];
      let s = 'SELECT i.* FROM invoice_items i JOIN invoices v ON i.invoice_id=v.id WHERE 1=1';
      if (tenant) { s += ' AND v.tenant_id=?'; a.push(tenant); }
      return { sql: s + ' ORDER BY i.rowid', args: a };
    },
  },
  payments: {
    columns: ['id', 'invoice_id', 'method', 'amount', 'reference', 'created_at'],
    build: (_q, tenant) => {
      const a = [];
      let s = 'SELECT p.* FROM payments p JOIN invoices v ON p.invoice_id=v.id WHERE 1=1';
      if (tenant) { s += ' AND v.tenant_id=?'; a.push(tenant); }
      return { sql: s + ' ORDER BY p.created_at', args: a };
    },
  },
  stock: {
    columns: ['product_id', 'warehouse_id', 'qty', 'reserved_qty', 'allocated_qty', 'updated_at'],
    build: (_q, tenant) => {
      const a = [];
      let s = 'SELECT s.* FROM stock_levels s JOIN warehouses w ON s.warehouse_id=w.id WHERE 1=1';
      if (tenant) { s += ' AND w.tenant_id=?'; a.push(tenant); }
      return { sql: s + ' ORDER BY s.warehouse_id, s.product_id', args: a };
    },
  },
  shifts: {
    columns: ['id', 'terminal_id', 'opened_by', 'opening_cash', 'closing_cash', 'expected_cash', 'variance', 'status', 'opened_at', 'closed_at', 'total_sales', 'orders_count'],
    build: (_q, tenant) => {
      const a = [];
      let s = 'SELECT * FROM shifts WHERE 1=1';
      if (tenant) { s += ' AND tenant_id=?'; a.push(tenant); }
      return { sql: s + ' ORDER BY opened_at DESC', args: a };
    },
  },
};

function toCsv(def, rows) {
  const head = '﻿' + def.columns.join(',') + '\r\n';
  const body = rows.map((r) => def.columns.map((c) => {
    const v = r[c];
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n');
  return head + (body ? body + '\r\n' : '');
}

// GET /api/export/jobs — list background jobs (MUST precede /:entity or "jobs" matches as entity)
router.get('/jobs', (req, res) => {
  void req;
  return res.json({ jobs: listJobs() });
});

// GET /api/export/jobs/:id — status/progress; ?download=1 returns the payload when DONE
router.get('/jobs/:id', (req, res) => {
  const j = getJob(req.params.id);
  if (!j) return res.status(404).json({ error: 'المهمة غير موجودة' });
  if (String(req.query.download || '') !== '1') {
    return res.json({ id: j.id, kind: j.kind, status: j.status, progress: j.progress, error: j.error, createdAt: j.createdAt, finishedAt: j.finishedAt ? new Date(j.finishedAt).toISOString() : null, count: j.result?.count ?? null, params: j.params });
  }
  if (j.status !== 'DONE' || !j.result) return res.status(409).json({ error: `المهمة ${j.status} — ليست جاهزة`, status: j.status });
  if (j.params.format === 'json') return res.json({ entity: j.params.entity, exported_at: new Date().toISOString(), count: j.result.count, rows: j.result.rows });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dypos-${j.params.entity}-${j.id.slice(0, 8)}.csv"`);
  return res.send(j.result.csv);
});

// POST /api/export/:entity/jobs { format, limit?, from?, to?, status? } — background job up to 100k rows
router.post('/:entity/jobs', (req, res) => {
  const def = ENTITIES[req.params.entity];
  if (!def) return res.status(404).json({ error: 'كيان غير مدعوم', supported: Object.keys(ENTITIES) });
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId || null;
    if (scopeTenant && req.user?.tenantId && String(scopeTenant) !== String(req.user.tenantId)) {
      throw Object.assign(new Error('غير موجود'), { statusCode: 404 });
    }
    scopeTenant = scopeTenant || req.user?.tenantId || null;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const src = { ...(req.query || {}), ...((req.body && typeof req.body === 'object') ? req.body : {}) };
  const format = String(src.format || 'csv').toLowerCase();
  if (!['csv', 'json'].includes(format)) return res.status(400).json({ error: 'الصيغة csv أو json فقط' });
  const total = Math.min(Math.max(parseInt(src.limit, 10) || 20000, 1), 100000);
  const job = createJob('export', { entity: req.params.entity, format, total, tenantId: scopeTenant, from: String(src.from || '').slice(0, 10), to: String(src.to || '').slice(0, 10), status: String(src.status || '').slice(0, 20) });
  req.audit?.('export.job_create', { jobId: job.id, entity: job.params.entity, format, total });
  runInBackground(job, async (j) => {
    const q = { from: j.params.from, to: j.params.to, status: j.params.status };
    const built = def.build(q, j.params.tenantId);
    const CHUNK = 2000;
    const acc = [];
    for (let off = 0; off < total; off += CHUNK) {
      const n = Math.min(CHUNK, total - off);
      const rows = db.prepare(`${built.sql} LIMIT ? OFFSET ?`).all(...built.args, n, off);
      if (!rows.length) break;
      acc.push(...rows);
      j.progress = { processed: acc.length, total };
      await new Promise((r) => setImmediate(r)); // yield — sales never starve
      if (rows.length < n) break;
    }
    j.result = format === 'json'
      ? { entity: j.params.entity, count: acc.length, rows: acc }
      : { entity: j.params.entity, count: acc.length, csv: toCsv(def, acc) };
    j.progress = { processed: acc.length, total: acc.length };
  });
  return res.status(202).json({ jobId: job.id, status: job.status, entity: job.params.entity, format });
});

// GET /api/export/:entity?format=csv|json&limit=&offset=&from=&to=&status=&fields=a,b
router.get('/:entity', (req, res) => {
  const def = ENTITIES[req.params.entity];
  if (!def) return res.status(404).json({ error: 'كيان غير مدعوم', supported: Object.keys(ENTITIES) });
  const format = String(req.query.format || 'csv').toLowerCase();
  if (!['csv', 'json'].includes(format)) return res.status(400).json({ error: 'الصيغة csv أو json فقط' });
  // Column selection (bandwidth saver for millions-row ERP pulls). Unknown names → 400.
  let columns = def.columns;
  if (req.query.fields) {
    const want = String(req.query.fields).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
    if (!want.length) return res.status(400).json({ error: 'fields فارغة' });
    const bad = want.filter((c) => !def.columns.includes(c));
    if (bad.length) return res.status(400).json({ error: `أعمدة غير معروفة: ${bad.join(',')}`, supported: def.columns });
    columns = want;
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 1000, 1), 10000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  if (offset > 1000000) return res.status(400).json({ error: 'Offset يتجاوز الحد — استخدم فلاتر from/to' });
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId || null;
    if (scopeTenant && req.user?.tenantId && String(scopeTenant) !== String(req.user.tenantId)) {
      throw Object.assign(new Error('غير موجود'), { statusCode: 404 });
    }
    scopeTenant = scopeTenant || req.user?.tenantId || null;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }

  const built = def.build(req.query, scopeTenant);
  const full = db.prepare(`${built.sql} LIMIT ? OFFSET ?`).all(...built.args, limit, offset);
  const rows = columns === def.columns ? full : full.map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])));

  req.audit?.('export.run', { entity: req.params.entity, format, count: rows.length });
  if (format === 'json') {
    return res.json({ entity: req.params.entity, exported_at: new Date().toISOString(), count: rows.length, limit, offset, hasMore: rows.length === limit, rows });
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dypos-${req.params.entity}-${new Date().toISOString().slice(0, 10)}.csv"`);
  // Chunked write: constant memory even for 10k rows
  res.write('﻿' + columns.map((c) => (/,|"|\r|\n/.test(c) ? `"${c}"` : c)).join(',') + '\r\n');
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
      .map((r) => columns.map((c) => {
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
