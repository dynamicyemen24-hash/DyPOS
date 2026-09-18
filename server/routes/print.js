import { Router } from 'express';
import { VERSION } from '../lib/version.js';
import { getSetting } from '../lib/settings.js';
import QRCode from 'qrcode';
import db from '../db/schema.js';
import { ah } from '../lib/async.js';
import { dayRange } from '../lib/dates.js';
import { assertRecordTenant } from '../lib/tenant.js';

const router = Router();

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(n) {
  return Number(n || 0).toFixed(2);
}

/**
 * ZATCA e-invoicing QR (TLV + Base64) — معيار هيئة الزكاة والضريبة والجمارك.
 * Tags: 1 seller, 2 VAT number, 3 timestamp (ISO), 4 total incl. VAT, 5 VAT amount.
 * Falls back to JSON payload when seller/VAT not configured (dev).
 */
function tlv(tag, value) {
  const buf = Buffer.from(String(value ?? ''), 'utf8');
  if (buf.length > 255) throw new Error('TLV value too long');
  return Buffer.concat([Buffer.from([tag, buf.length]), buf]);
}
function zatcaQrBase64(inv) {
  // Prefer DB settings (PUT /api/admin/zatca/settings), fall back to env (12-factor).
  let seller = process.env.DYPOS_SELLER_NAME || 'DyPOS Store';
  let vat = process.env.DYPOS_VAT_NUMBER || '';
  try {
    const s = db.prepare('SELECT seller_name,vat_number FROM zatca_settings WHERE id=?').get('default');
    if (s?.seller_name) seller = s.seller_name;
    if (s?.vat_number) vat = s.vat_number;
  } catch { /* settings table missing pre-v6 — env fallback */ }
  if (!vat) return null; // not configured → caller falls back to JSON QR
  const ts = String(inv.created_at || new Date().toISOString());
  const total = Number(inv.total || 0).toFixed(2);
  const tax = Number(inv.tax_amount || 0).toFixed(2);
  const raw = Buffer.concat([tlv(1, seller), tlv(2, vat), tlv(3, ts), tlv(4, total), tlv(5, tax)]);
  return raw.toString('base64');
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
  <div><h2 style="margin:0">${esc(inv._businessName || 'DyPOS')}</h2><div class="muted">فاتورة ضريبية مبسطة</div><div style="margin-top:6px"><span class="badge">${esc(inv.status)}</span> <span class="muted">${esc(inv.created_at)}</span></div></div>
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

function escXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function sellerIdentity() {
  let seller = process.env.DYPOS_SELLER_NAME || 'DyPOS Store';
  let vat = process.env.DYPOS_VAT_NUMBER || '';
  let cr = '';
  try {
    const s = db.prepare('SELECT seller_name,vat_number,cr_number FROM zatca_settings WHERE id=?').get('default');
    if (s?.seller_name) seller = s.seller_name;
    if (s?.vat_number) vat = s.vat_number;
    if (s?.cr_number) cr = s.cr_number;
  } catch { /* pre-v6 fallback to env */ }
  return { seller, vat, cr };
}

/**
 * UBL 2.1 simplified-invoice subset (ZATCA SDF foundation, offline-capable).
 * Covers: ID/dates, supplier (name + VAT + CR), customer, lines (qty/price/
 * discount/tax/total), TaxTotal, LegalMonetaryAmount. No external dependency.
 */
function invoiceUbl(inv, items, { seller, vat, cr }) {
  const cur = escXml(inv.currency || 'SAR');
  const issueDate = String(inv.created_at || new Date().toISOString()).slice(0, 10);
  const issueTime = String(inv.created_at || new Date().toISOString()).slice(11, 19) || '00:00:00';
  const lines = items.map((it, i) => `    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${escXml(it.uom || 'PCE')}">${fmt(it.qty)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${cur}">${fmt(Number(it.qty) * Number(it.unit_price) - Number(it.discount))}</cbc:LineExtensionAmount>
      <cac:Item><cbc:Name>${escXml(it.product_name)}</cbc:Name>${it.barcode ? `<cac:SellersItemIdentification><cbc:ID>${escXml(it.barcode)}</cbc:ID></cac:SellersItemIdentification>` : ''}</cac:Item>
      <cac:Price><cbc:PriceAmount currencyID="${cur}">${fmt(it.unit_price)}</cbc:PriceAmount>${Number(it.discount) ? `<cbc:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="${cur}">${fmt(it.discount)}</cbc:Amount></cbc:AllowanceCharge>` : ''}</cac:Price>
      <cac:TaxTotal><cbc:TaxAmount currencyID="${cur}">${fmt(it.tax_amount)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="${cur}">${fmt(Number(it.qty) * Number(it.unit_price) - Number(it.discount))}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${cur}">${fmt(it.tax_amount)}</cbc:TaxAmount><cac:TaxCategory><cbc:Percent>${fmt(it.tax_rate)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
    </cac:InvoiceLine>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escXml(inv.number)}</cbc:ID>
  <cbc:UUID>${escXml(inv.id)}</cbc:UUID>
  <cbc:IssueDate>${escXml(issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${escXml(issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>${escXml(seller)}</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>${escXml(vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    ${cr ? `<cac:PartyLegalEntity><cbc:CompanyID>${escXml(cr)}</cbc:CompanyID></cac:PartyLegalEntity>` : ''}
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyName><cbc:Name>${escXml(inv.customer_name || 'Walk-in Customer')}</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="${cur}">${fmt(inv.tax_amount)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryAmount>
    <cbc:LineExtensionAmount currencyID="${cur}">${fmt(inv.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${fmt(Number(inv.subtotal) - Number(inv.discount_amount))}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${fmt(Number(inv.subtotal) + Number(inv.tax_amount) - Number(inv.discount_amount))}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${cur}">${fmt(inv.discount_amount)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${cur}">${fmt(inv.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryAmount>
${lines}
</Invoice>`;
}

// GET /api/print/invoice/:id — HTML printable (QR included). ADMIN/MANAGER/CASHIER.
router.get('/invoice/:id', ah(async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  try {
    assertRecordTenant(req, inv);
  } catch {
    return res.status(404).json({ error: 'الفاتورة غير موجودة' });
  }
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY rowid').all(id);
  const pays = db.prepare('SELECT * FROM payments WHERE invoice_id=? ORDER BY created_at').all(id);
  // ?format=xml — UBL 2.1 machine invoice (ZATCA SDF subset, offline-capable)
  if (String(req.query.format || '').toLowerCase() === 'xml') {
    const xml = invoiceUbl(inv, items, sellerIdentity());
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="${String(inv.number).replace(/[^A-Za-z0-9-_]/g, '_')}.xml"`);
    req.audit?.('print.invoice_xml', { invoiceId: id });
    return res.send(xml);
  }
  // Best-effort QR: ZATCA TLV when configured, else JSON payload (dev/compat)
  let qr = null;
  let qrKind = 'json';
  try {
    const zatca = zatcaQrBase64(inv);
    if (zatca) {
      qr = await QRCode.toDataURL(zatca, { margin: 1, width: 160 });
      qrKind = 'zatca-tlv';
    } else {
      const payload = JSON.stringify({ n: inv.number, t: inv.total, c: inv.currency || 'SAR', d: inv.created_at });
      qr = await QRCode.toDataURL(payload, { margin: 1, width: 160 });
    }
  } catch { qr = null; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-QR-Kind', qrKind);
  return res.send(invoiceHtml({ ...inv, _version: VERSION, _businessName: getSetting('business_name', '') }, items, pays, qr));
}));

// GET /api/print/daily?date=YYYY-MM-DD — daily Z report (HTML)
router.get('/daily', (req, res) => {
  const raw = String(req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return res.status(400).json({ error: 'صيغة التاريخ غير صالحة' });
  const { from, to } = dayRange(raw);
  const rows = db.prepare(`SELECT status, COUNT(*) c, COALESCE(SUM(total),0) s FROM invoices WHERE created_at>=? AND created_at<? GROUP BY status`).all(from, to);
  const pay = db.prepare(`SELECT p.method m, COALESCE(SUM(p.amount),0) s FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.created_at>=? AND i.created_at<? GROUP BY p.method`).all(from, to);
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
