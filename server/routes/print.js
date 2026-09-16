import { Router } from 'express';
import QRCode from 'qrcode';
import db from '../db/schema.js';

const router = Router();

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(n) {
  return Number(n || 0).toFixed(2);
}

function invoiceHtml(inv, items, payments, qr) {
  const dir = 'rtl';
  return `<!doctype html><html lang="ar" dir="${dir}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>فاتورة ${esc(inv.number)}</title>
<style>
  @media print { .no-print { display:none } }
  * { box-sizing:border-box } body{font-family:system-ui,Tahoma,Arial; margin:0; padding:24px; color:#111; background:#fff}
  .wrap{max-width:780px;margin:0 auto} .hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #111;padding-bottom:12px}
  .muted{color:#555;font-size:13px} .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;border:1px solid #111}
  table{width:100%;border-collapse:collapse;margin-top:16px} th,td{border:1px solid #ddd;padding:8px 6px;text-align:right;font-size:13px}
  th{background:#f6f6f6} .tot{margin-top:12px;display:grid;grid-template-columns:1fr 180px;gap:6px;font-size:14px}
  .tot b{border-top:1px solid #111;padding-top:6px} .qr{margin-top:16px;display:flex;gap:16px;align-items:center}
  .actions{margin-top:16px;display:flex;gap:8px} .btn{padding:8px 12px;border:1px solid #111;background:#111;color:#fff;border-radius:6px;cursor:pointer}
</style></head><body><div class="wrap">
<div class="hdr">
  <div><h2 style="margin:0">DyPOS</h2><div class="muted">فاتورة ضريبية مبسطة</div><div style="margin-top:6px"><span class="badge">${esc(inv.status)}</span> <span class="muted">${esc(inv.created_at)}</span></div></div>
  <div style="text-align:left"><div><b>${esc(inv.number)}</b></div><div class="muted">${esc(inv.customer_name || 'عميل نقدي')}</div><div class="muted">${esc(inv.currency || 'SAR')}</div></div>
</div>
<table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الضريبة</th><th>الإجمالي</th></tr></thead><tbody>
${items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.product_name)} <span class="muted">${esc(it.barcode || '')}</span></td><td>${fmt(it.qty)} ${esc(it.uom || '')}</td><td>${fmt(it.unit_price)}</td><td>${fmt(it.discount)}</td><td>${fmt(it.tax_amount)} (${fmt(it.tax_rate)}%)</td><td><b>${fmt(it.total)}</b></td></tr>`).join('')}
</tbody></table>
<div class="tot"><span>المجموع قبل الضريبة</span><span>${fmt(inv.subtotal)}</span><span>الخصم</span><span>${fmt(inv.discount_amount)}</span><span>الضريبة</span><span>${fmt(inv.tax_amount)}</span><span><b>الإجمالي</b></span><span><b>${fmt(inv.total)}</b></span><span>المدفوع</span><span>${fmt(inv.paid_amount)}</span><span>المتبقي</span><span>${fmt(inv.remaining_amount)}</span></div>
${payments.length ? `<div style="margin-top:12px"><b>المدفوعات</b><div class="muted">${payments.map((p) => `${esc(p.method)} ${fmt(p.amount)} ${esc(p.reference || '')}`).join(' · ')}</div></div>` : ''}
${qr ? `<div class="qr"><img src="${qr}" width="120" height="120" alt="QR"/><div class="muted">امسح للتحقق: ${esc(inv.number)} — ${fmt(inv.total)} ${esc(inv.currency || 'SAR')}</div></div>` : ''}
<div class="actions no-print"><button class="btn" onclick="window.print()">طباعة</button><button class="btn" style="background:#fff;color:#111" onclick="window.close()">إغلاق</button></div>
<div class="muted" style="margin-top:16px;font-size:11px">DyPOS v${esc(inv._version || '')} — ${esc(new Date().toLocaleString('ar-SA'))}</div>
</div></body></html>`;
}

// GET /api/print/invoice/:id — HTML printable (QR included). ADMIN/MANAGER/CASHIER.
router.get('/invoice/:id', async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY rowid').all(id);
  const pays = db.prepare('SELECT * FROM payments WHERE invoice_id=? ORDER BY created_at').all(id);
  // Best-effort QR (invoice number + total + ZATCA-style payload placeholder)
  let qr = null;
  try {
    const payload = JSON.stringify({ n: inv.number, t: inv.total, c: inv.currency || 'SAR', d: inv.created_at });
    qr = await QRCode.toDataURL(payload, { margin: 1, width: 160 });
  } catch { qr = null; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(invoiceHtml({ ...inv, _version: '1.4.1' }, items, pays, qr));
});

// GET /api/print/daily?date=YYYY-MM-DD — daily Z report (HTML)
router.get('/daily', (req, res) => {
  const raw = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return res.status(400).json({ error: 'صيغة التاريخ غير صالحة' });
  const rows = db.prepare(`SELECT status, COUNT(*) c, COALESCE(SUM(total),0) s FROM invoices WHERE date(created_at)=date(?) GROUP BY status`).all(raw);
  const pay = db.prepare(`SELECT p.method m, COALESCE(SUM(p.amount),0) s FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE date(i.created_at)=date(?) GROUP BY p.method`).all(raw);
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>تقرير ${esc(raw)}</title>
<style>body{font-family:system-ui,Tahoma;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:right}@media print{.no-print{display:none}}</style></head><body>
<h3>تقرير يومي — ${esc(raw)}</h3><h4>الفواتير حسب الحالة</h4><table><tr><th>الحالة</th><th>العدد</th><th>الإجمالي</th></tr>${rows.map((r) => `<tr><td>${esc(r.status)}</td><td>${r.c}</td><td>${fmt(r.s)}</td></tr>`).join('') || '<tr><td colspan=3>لا توجد بيانات</td></tr>'}</table>
<h4>المدفوعات حسب الطريقة</h4><table><tr><th>الطريقة</th><th>الإجمالي</th></tr>${pay.map((r) => `<tr><td>${esc(r.m)}</td><td>${fmt(r.s)}</td></tr>`).join('') || '<tr><td colspan=2>لا توجد بيانات</td></tr>'}</table>
<div class="no-print" style="margin-top:12px"><button onclick="window.print()">طباعة</button></div></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(html);
});

export default router;
