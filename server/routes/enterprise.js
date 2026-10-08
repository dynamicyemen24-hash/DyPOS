/**
 * DyPOS Enterprise Control Plane API.
 *
 * Production rules:
 * - every tenant-sensitive read is fail-closed
 * - secrets never leave the server
 * - external AI endpoints are SSRF-hardened
 * - integration status comes from the canonical integration registry
 * - "configured" never means "compliant"
 */
import { Router } from 'express';
import net from 'node:net';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import db from '../db/schema.js';
import { ah } from '../lib/async.js';
import { resolveTenantFilter, assertRecordTenant } from '../lib/tenant.js';
import { VERSION } from '../lib/version.js';
import { getAdapter, listAdapters, redactConfig } from '../lib/integrations/index.js';

const router = Router();

const ENTERPRISE_PROVIDERS = [
  { key: 'zatca', category: 'fiscal', name: 'ZATCA / الفوترة الإلكترونية', modes: ['einvoice', 'reporting', 'clearance'], availability: 'contract' },
  { key: 'shopify', category: 'commerce', name: 'Shopify', modes: ['orders', 'products', 'inventory'], availability: 'contract' },
  { key: 'woocommerce', category: 'commerce', name: 'WooCommerce', modes: ['orders', 'products', 'inventory'], availability: 'contract' },
  { key: 'salla', category: 'commerce', name: 'سلة', modes: ['orders', 'products', 'inventory'], availability: 'contract' },
  { key: 'zid', category: 'commerce', name: 'زد', modes: ['orders', 'products', 'inventory'], availability: 'contract' },
  { key: 'whatsapp', category: 'messaging', name: 'WhatsApp Business / Cloud API', modes: ['messages', 'templates', 'webhooks'], availability: 'contract' },
  { key: 'sms', category: 'messaging', name: 'SMS Gateway', modes: ['messages', 'delivery'], availability: 'contract' },
  { key: 'email', category: 'messaging', name: 'Email Gateway / SMTP-HTTP', modes: ['email', 'templates'], availability: 'contract' },
  { key: 'telegram', category: 'messaging', name: 'Telegram Bot', modes: ['messages', 'alerts'], availability: 'contract' },
  { key: 'openai', category: 'ai', name: 'OpenAI-compatible model gateway', modes: ['assistant', 'forecasting', 'classification'], availability: 'contract' },
  { key: 'azure_ai', category: 'ai', name: 'Azure AI / Model gateway', modes: ['assistant', 'forecasting', 'classification'], availability: 'contract' },
  { key: 'generic_webhook', category: 'automation', name: 'Generic HTTPS Webhook', modes: ['events', 'commands'], availability: 'contract' },
];

function scopedTenant(req) {
  try {
    return resolveTenantFilter(req).tenantId || req.user?.tenantId || null;
  } catch (error) {
    throw Object.assign(new Error(String(error.message || 'غير موجود')), {
      statusCode: error.statusCode || 404,
    });
  }
}

function dateRange(req) {
  const today = new Date().toISOString().slice(0, 10);
  const to = String(req.query.to || today).slice(0, 10);
  const from = String(req.query.from || to).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw Object.assign(new Error('نطاق التاريخ غير صالح'), { statusCode: 400 });
  }
  return { from, to };
}

function hasColumn(table, column) {
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  } catch {
    return false;
  }
}

function tenantWhere(table, tenantId, params) {
  if (!tenantId || !hasColumn(table, 'tenant_id')) return '';
  params.push(tenantId);
  return ' AND ' + table + '.tenant_id=?';
}

function assertSafeModelEndpoint(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 500) throw Object.assign(new Error('رابط نموذج الذكاء غير صالح'), { statusCode: 400 });
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw Object.assign(new Error('رابط نموذج الذكاء غير صالح'), { statusCode: 400 });
  }
  if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw Object.assign(new Error('مزود الذكاء يجب أن يستخدم HTTPS'), { statusCode: 400 });
  }
  const host = parsed.hostname.toLowerCase();
  const allowlist = String(process.env.DYPOS_AI_ALLOWED_HOSTS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length && !allowlist.some((allowed) => host === allowed || host.endsWith('.' + allowed))) {
    throw Object.assign(new Error('مضيف مزود الذكاء غير مسموح'), { statusCode: 403 });
  }
  if (
    host === 'localhost' ||
    host === 'localhost.localdomain' ||
    host.endsWith('.localhost') ||
    host === 'metadata.google.internal' ||
    host === 'metadata.google.internal.'
  ) {
    throw Object.assign(new Error('الوصول إلى المضيف الداخلي محظور'), { statusCode: 403 });
  }
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      throw Object.assign(new Error('الوصول إلى شبكة داخلية محظور'), { statusCode: 403 });
    }
  }
  if (ipVersion === 6 && (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:'))) {
    throw Object.assign(new Error('الوصول إلى شبكة داخلية محظور'), { statusCode: 403 });
  }
  return value.replace(/\/$/, '');
}

router.get('/catalog', authMiddleware, (_req, res) =>
  res.json({
    success: true,
    providers: ENTERPRISE_PROVIDERS,
    adapters: listAdapters(),
    version: VERSION,
  }),
);

router.get(
  '/overview',
  authMiddleware,
  ah(async (req, res) => {
    const tenantId = scopedTenant(req);
    const { from, to } = dateRange(req);
    const headParams = [from, to];
    const invoiceScope = tenantWhere('invoices', tenantId, headParams);
    const head = db
      .prepare(
        `SELECT COUNT(*) orders,
                COALESCE(SUM(total),0) gross,
                COALESCE(SUM(paid_amount),0) paid,
                COALESCE(SUM(discount_amount),0) discounts,
                COALESCE(SUM(tax_amount),0) tax
           FROM invoices
          WHERE substr(created_at,1,10)>=?
            AND substr(created_at,1,10)<=?
            AND status<>'EXPIRED'${invoiceScope}`,
      )
      .get(...headParams);

    const dailyParams = [from, to];
    const dailyScope = tenantWhere('invoices', tenantId, dailyParams);
    const daily = db
      .prepare(
        `SELECT substr(created_at,1,10) day, COUNT(*) orders, COALESCE(SUM(total),0) gross
           FROM invoices
          WHERE substr(created_at,1,10)>=?
            AND substr(created_at,1,10)<=?
            AND status<>'EXPIRED'${dailyScope}
          GROUP BY day ORDER BY day`,
      )
      .all(...dailyParams);

    const topParams = [from, to];
    const topScope = tenantWhere('i', tenantId, topParams);
    const top = db
      .prepare(
        `SELECT ii.product_id, MAX(ii.product_name) product_name,
                COALESCE(SUM(ii.qty),0) qty, COALESCE(SUM(ii.total),0) revenue
           FROM invoice_items ii
           JOIN invoices i ON i.id=ii.invoice_id
          WHERE substr(i.created_at,1,10)>=?
            AND substr(i.created_at,1,10)<=?
            AND i.status IN ('PAID','PARTIAL')${topScope}
          GROUP BY ii.product_id
          ORDER BY revenue DESC LIMIT 8`,
      )
      .all(...topParams);

    const stockParams = [];
    const stockScope = tenantWhere('stock_levels', tenantId, stockParams);
    const low = db.prepare(`SELECT COUNT(*) low FROM stock_levels WHERE qty<=5${stockScope}`).get(...stockParams);

    const runParams = tenantId ? [tenantId] : [];
    const runScope = tenantId && hasColumn('integration_runs', 'tenant_id') ? ' AND tenant_id=?' : '';
    const queue = db
      .prepare(`SELECT COUNT(*) pending FROM integration_runs WHERE status IN ('PENDING','RETRY')${runScope}`)
      .get(...runParams);
    const dead = db
      .prepare(`SELECT COUNT(*) dead FROM integration_runs WHERE status='DEAD'${runScope}`)
      .get(...runParams);

    const orders = Number(head?.orders) || 0;
    return res.json({
      success: true,
      version: VERSION,
      range: { from, to },
      kpis: {
        orders,
        gross: Number(head?.gross) || 0,
        paid: Number(head?.paid) || 0,
        discounts: Number(head?.discounts) || 0,
        tax: Number(head?.tax) || 0,
        avgTicket: orders ? Number(head.gross) / orders : 0,
        lowStock: Number(low?.low) || 0,
        integrationQueue: Number(queue?.pending) || 0,
        integrationDead: Number(dead?.dead) || 0,
      },
      series: daily.map((row) => ({ day: row.day, orders: Number(row.orders) || 0, gross: Number(row.gross) || 0 })),
      topProducts: top.map((row) => ({
        product_id: row.product_id,
        product_name: row.product_name,
        qty: Number(row.qty) || 0,
        revenue: Number(row.revenue) || 0,
      })),
      liveAt: new Date().toISOString(),
    });
  }),
);

router.get(
  '/live',
  authMiddleware,
  ah(async (req, res) => {
    const tenantId = scopedTenant(req);
    const params = tenantId ? [tenantId] : [];
    const scope = tenantId ? ' WHERE tenant_id=?' : '';
    const sales = db
      .prepare(
        `SELECT id, invoice_no, total, status, created_at, terminal_id
           FROM invoices${scope}
          ORDER BY created_at DESC LIMIT 12`,
      )
      .all(...params);
    const runParams = tenantId ? [tenantId] : [];
    const runScope = tenantId && hasColumn('integration_runs', 'tenant_id') ? ' AND tenant_id=?' : '';
    const queue = db
      .prepare(`SELECT COUNT(*) pending FROM integration_runs WHERE status IN ('PENDING','RETRY')${runScope}`)
      .get(...runParams);
    const dead = db.prepare(`SELECT COUNT(*) dead FROM integration_runs WHERE status='DEAD'${runScope}`).get(...runParams);
    return res.json({
      success: true,
      version: VERSION,
      liveAt: new Date().toISOString(),
      sales,
      activity: {
        recentSales: sales.length,
        integrationQueue: Number(queue?.pending) || 0,
        integrationDead: Number(dead?.dead) || 0,
      },
    });
  }),
);

router.get(
  '/integrations',
  authMiddleware,
  ah(async (req, res) => {
    const tenantId = scopedTenant(req);
    const rows = tenantId
      ? db.prepare('SELECT * FROM integration_configs WHERE tenant_id=? OR tenant_id=? ORDER BY updated_at DESC LIMIT 200').all(tenantId, 'STD')
      : db.prepare('SELECT * FROM integration_configs ORDER BY updated_at DESC LIMIT 200').all();
    return res.json({
      success: true,
      integrations: rows.map((row) => ({
        ...redactConfig(row),
        adapter_meta: getAdapter(row.adapter)
          ? {
              implemented: true,
              key: getAdapter(row.adapter).key,
              displayName: getAdapter(row.adapter).displayName,
            }
          : { implemented: false, key: row.adapter },
      })),
    });
  }),
);

router.post(
  '/integrations/:id/test',
  authMiddleware,
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const id = String(req.params.id || '').slice(0, 64);
    const row = db.prepare('SELECT * FROM integration_configs WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'التكامل غير موجود' });
    const tenantId = scopedTenant(req);
    if (tenantId && row.tenant_id !== 'STD' && String(row.tenant_id) !== String(tenantId)) {
      return res.status(404).json({ error: 'التكامل غير موجود' });
    }
    const adapter = getAdapter(row.adapter);
    if (!adapter) return res.status(409).json({ error: 'هذا الموصل مسجل كعقد تكامل ولم ينفذ محوله بعد' });
    let credentials = {};
    try {
      credentials = JSON.parse(row.credentials || '{}');
    } catch {
      return res.status(409).json({ error: 'بيانات اعتماد التكامل غير صالحة' });
    }
    const started = Date.now();
    const result = await adapter.connect({ ...credentials, base_url: row.base_url });
    return res.json({
      success: true,
      ok: Boolean(result?.ok),
      detail: result?.detail || '',
      latency_ms: Date.now() - started,
      adapter: adapter.key,
      version: VERSION,
    });
  }),
);

router.get(
  '/zakat/status',
  authMiddleware,
  ah(async (req, res) => {
    const tenantId = scopedTenant(req);
    const rows = tenantId
      ? db
          .prepare(
            "SELECT id,adapter,name,base_url,is_active,updated_at FROM integration_configs WHERE adapter IN ('zatca','zakat') AND (tenant_id=? OR tenant_id='STD') ORDER BY updated_at DESC",
          )
          .all(tenantId)
      : db
          .prepare(
            "SELECT id,adapter,name,base_url,is_active,updated_at FROM integration_configs WHERE adapter IN ('zatca','zakat') ORDER BY updated_at DESC",
          )
          .all();
    return res.json({
      success: true,
      configured: rows.length > 0,
      connections: rows.map((row) => ({
        id: row.id,
        adapter: row.adapter,
        name: row.name,
        base_url: row.base_url,
        active: Boolean(row.is_active),
        updated_at: row.updated_at,
      })),
      standard: 'ZATCA-compatible integration boundary',
      note: 'تفعيل الموصل لا يثبت الامتثال الضريبي؛ يلزم التحقق والشهادة والتهيئة الفعلية.',
    });
  }),
);

router.post(
  '/ai/ask',
  authMiddleware,
  requireRole('ADMIN', 'MANAGER', 'AUDITOR'),
  ah(async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim().slice(0, 4000);
    if (!prompt) return res.status(400).json({ error: 'السؤال مطلوب' });
    const tenantId = scopedTenant(req);
    const row = tenantId
      ? db
          .prepare(
            "SELECT * FROM integration_configs WHERE adapter IN ('openai','azure_ai') AND is_active=1 AND (tenant_id=? OR tenant_id='STD') ORDER BY CASE WHEN tenant_id=? THEN 0 ELSE 1 END, updated_at DESC LIMIT 1",
          )
          .get(tenantId, tenantId)
      : db
          .prepare(
            "SELECT * FROM integration_configs WHERE adapter IN ('openai','azure_ai') AND is_active=1 ORDER BY updated_at DESC LIMIT 1",
          )
          .get();
    if (!row) return res.json({ success: true, mode: 'rules', answer: 'لا يوجد مزود ذكاء اصطناعي مفعّل. أضف موصلًا من مركز التكاملات.' });

    let credentials = {};
    let options = {};
    try {
      credentials = JSON.parse(row.credentials || '{}');
      options = JSON.parse(row.options || '{}');
    } catch {
      return res.status(409).json({ error: 'إعداد مزود الذكاء غير صالح' });
    }
    const endpoint = assertSafeModelEndpoint(options.chat_endpoint || row.base_url);
    const token = String(credentials.api_key || credentials.token || '');
    if (!token) return res.status(409).json({ error: 'إعداد مزود الذكاء الاصطناعي غير مكتمل' });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        model: options.model || 'default',
        messages: [
          { role: 'system', content: 'أنت مساعد أعمال داخل DyPOS. استخدم فقط المعلومات المعطاة. لا تخترع أرقامًا أو عمليات تمت.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const raw = await response.text();
    if (!response.ok) return res.status(502).json({ error: 'مزود الذكاء الاصطناعي رفض الطلب', status: response.status });
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { output: raw };
    }
    return res.json({
      success: true,
      mode: 'model',
      answer: data.choices?.[0]?.message?.content || data.output || data.answer || raw,
    });
  }),
);

router.post(
  '/sync/preview',
  authMiddleware,
  requireRole('ADMIN', 'MANAGER'),
  ah(async (req, res) => {
    const adapterKey = String(req.body?.adapter || '').toLowerCase();
    const registered = getAdapter(adapterKey);
    if (!registered) {
      return res.status(409).json({ error: 'الموصل غير مسجل كمحول تنفيذي؛ لا يمكن تشغيل مزامنة إنتاجية له' });
    }
    return res.json({
      success: true,
      adapter: registered.key,
      mode: 'capability-preview',
      executable: typeof registered.pushInvoice === 'function' || typeof registered.pullCatalog === 'function',
      warning: 'المعاينة لا تكتب إلى النظام الخارجي. التشغيل الإنتاجي يمر عبر سجل integration_runs والمحول المسجل.',
    });
  }),
);

export default router;
