/**
 * DyPOS FX & UoM — master-data math for multi-currency, multi-unit sales.
 *
 * Currencies: rate_to_base = units of the currency per 1 base unit (SAR).
 *   convert(100, 'USD', 'SAR') → 375.00  (100 / 0.26667)
 * UoMs: factor_to_base within the SAME category only (count/weight/volume/length).
 *   convertQty(2, 'KG', 'G') → 2000. Cross-category (KG→L) is rejected.
 */
import db from '../db/schema.js';

function round(n, decimals = 2) {
  const d = Math.max(0, Math.min(decimals, 6));
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
}

export function getCurrency(code) {
  return db.prepare('SELECT * FROM currencies WHERE code=? AND is_active=1').get(String(code || '').toUpperCase().slice(0, 10)) || null;
}

export function assertCurrency(code) {
  const c = getCurrency(code);
  if (!c) throw Object.assign(new Error(`العملة غير مدعومة: ${String(code || '?').slice(0, 10)}`), { statusCode: 400 });
  return c;
}

export function convert(amount, from, to) {
  const f = assertCurrency(from);
  const t = assertCurrency(to);
  const base = Number(amount) / Number(f.rate_to_base || 1);
  return round(base * Number(t.rate_to_base || 1), Number(t.decimals ?? 2));
}

export function getUom(code) {
  return db.prepare('SELECT * FROM uoms WHERE code=? AND is_active=1').get(String(code || '').trim().slice(0, 20)) || null;
}

export function assertUom(code) {
  const u = getUom(code);
  if (!u) throw Object.assign(new Error(`وحدة القياس غير مدعومة: ${String(code || '?').slice(0, 20)}`), { statusCode: 400 });
  return u;
}

export function convertQty(qty, from, to) {
  const f = assertUom(from);
  const t = assertUom(to);
  if (String(f.category) !== String(t.category)) {
    throw Object.assign(new Error(`لا يمكن التحويل بين فئتين (${f.category}→${t.category})`), { statusCode: 400 });
  }
  const base = Number(qty) * Number(f.factor_to_base || 1);
  return base / (Number(t.factor_to_base || 1) || 1);
}

export default { getCurrency, assertCurrency, convert, getUom, assertUom, convertQty };
