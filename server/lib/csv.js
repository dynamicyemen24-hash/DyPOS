/**
 * DyPOS CSV — zero-dependency RFC-4180 reader/writer for import/export.
 * Handles quoted fields, embedded commas/newlines/doubled quotes, BOM.
 */

export function escapeCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns) {
  const head = columns.map(escapeCell).join(',');
  const lines = rows.map((r) => columns.map((c) => escapeCell(r[c])).join(','));
  return '﻿' + [head, ...lines].join('\r\n') + '\r\n';
}

/** Parse CSV text → { headers, rows[] }. Throws on structural errors. */
export function parseCsv(text, { maxRows = 5000, maxCols = 50 } = {}) {
  const src = String(text).replace(/^﻿/, '');
  const rows = [];
  let cur = [], field = '', inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { cur.push(field); field = ''; }
    else if (ch === '\r') { /* wait for \n */ }
    else if (ch === '\n') { cur.push(field); field = ''; rows.push(cur); cur = []; }
    else field += ch;
  }
  if (inQ) throw new Error('CSV غير صالح: علامة اقتباس غير مغلقة');
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  const nonEmpty = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  if (!headers.length || headers.length > maxCols) throw new Error('CSV غير صالح: عدد الأعمدة خارج الحد');
  if (new Set(headers).size !== headers.length) throw new Error('CSV غير صالح: أعمدة مكررة');
  const out = nonEmpty.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
  if (out.length > maxRows) throw new Error(`تجاوز الحد الأقصى للصفوف (${maxRows})`);
  return { headers, rows: out };
}

export default { escapeCell, toCsv, parseCsv };
