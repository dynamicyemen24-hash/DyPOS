/**
 * DyPOS business settings — validated KV profile for any-country operation.
 *
 * Keys (allowlist enforced on write):
 *   business_name    free text (≤200)
 *   country_code     ISO-3166 alpha-2 (^[A-Z]{2}$)
 *   currency         ISO-4217, must be an ACTIVE row in currencies
 *   tax_rate_default 0–100 (inherited by products created without a taxRate)
 *   tax_inclusive    0 | 1
 *   invoice_prefix   ≤10 chars [A-Z0-9-] (used by gapless invoice_sequences)
 *
 * Reads are single indexed SELECTs (no cache layer to invalidate — writes
 * are rare admin ops, reads are per-request-cheap).
 */
import db from '../db/schema.js';

export const SETTING_DEFS = {
  business_name: { validate: (v) => String(v ?? '').trim().slice(0, 200) },
  country_code: {
    validate: (v) => {
      // Validate the FULL value first: slice-then-test would launder 'USA'→'US'.
      const c = String(v ?? '').trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(c)) throw Object.assign(new Error('رمز الدولة حرفان بالضبط (ISO-3166)'), { statusCode: 400 });
      return c;
    },
  },
  currency: {
    validate: (v) => {
      const c = String(v ?? '').trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(c)) throw Object.assign(new Error('كود العملة 3 أحرف بالضبط (ISO-4217)'), { statusCode: 400 });
      const row = db.prepare('SELECT is_active FROM currencies WHERE code=?').get(c);
      if (!row) throw Object.assign(new Error('العملة غير معرفة في العملات'), { statusCode: 400 });
      if (Number(row.is_active) !== 1) throw Object.assign(new Error('العملة موقوفة'), { statusCode: 400 });
      return c;
    },
  },
  tax_rate_default: {
    validate: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw Object.assign(new Error('الضريبة الافتراضية بين 0 و 100'), { statusCode: 400 });
      return String(n);
    },
  },
  tax_inclusive: {
    validate: (v) => {
      const s = String(v ?? '').trim();
      if (s !== '0' && s !== '1') throw Object.assign(new Error('شامل الضريبة 0 أو 1'), { statusCode: 400 });
      return s;
    },
  },
  invoice_prefix: {
    validate: (v) => {
      const p = String(v ?? 'INV').trim().toUpperCase();
      if (!/^[A-Z0-9-]{1,10}$/.test(p)) throw Object.assign(new Error('بادئة الفواتير 1-10 أحرف/أرقام/-'), { statusCode: 400 });
      return p;
    },
  },
};

export function getSetting(key, fallback = '') {
  try {
    const row = db.prepare('SELECT value FROM business_settings WHERE key=?').get(key);
    if (!row) return fallback;
    return row.value ?? fallback;
  } catch {
    return fallback; // pre-v13 DBs (migrate pending) → caller fallback applies
  }
}

export function allSettings() {
  const out = {};
  for (const key of Object.keys(SETTING_DEFS)) out[key] = getSetting(key, '');
  return out;
}

export function setSetting(key, raw) {
  const def = SETTING_DEFS[key];
  if (!def) throw Object.assign(new Error(`إعداد غير معروف: ${key}`), { statusCode: 400 });
  const value = def.validate(raw);
  db.prepare(`INSERT INTO business_settings (key,value,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')`).run(key, value);
  return value;
}

export function defaultTaxRate() {
  const n = Number(getSetting('tax_rate_default', '15'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 15;
}

export function invoicePrefix() {
  const p = String(getSetting('invoice_prefix', 'INV')).trim().toUpperCase().slice(0, 10);
  return /^[A-Z0-9-]+$/.test(p) ? p : 'INV';
}

export default { SETTING_DEFS, getSetting, allSettings, setSetting, defaultTaxRate, invoicePrefix };
