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
 *   require_customer_on_sale  0 | 1 (block submit without a customer)
 *   auto_save_open_invoice    0 | 1 (crash-proof autosave of the open cart)
 *   autosave_interval_seconds 1–60 (open-cart autosave cadence)
 *   desktop_recent_invoices_count 0–50 (desktop widget size, 0 hides)
 *   default_payment_method    free text ≤64 (preselect at checkout, "" = profile default)
 *   return_approval_threshold 0–10M (CASHIER returns above this need MANAGER+, 0 = disabled)
 *   allow_negative_stock   0 | 1 (oversell guard off when 1)
 *   default_warehouse      warehouse id (≤32) preselected as the POS default
 *   number_system          latn | arab (display digits; latn = default, universal)
 *   currency_precision     0–6 (money decimals; 2 = halala)
 *   float_precision        0–9 (quantity decimals)
 *   rounding_method        "Banker's Rounding" | "Commercial Rounding"
 *   number_format          display pattern (e.g. #,###.##)
 *   stock_control_mode     strict | warn | off (POS stock policy; warn = default)
 *   stock_warning_threshold 0–1,000,000 (warn when remaining qty ≤ threshold)
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
  require_customer_on_sale: {
    validate: (v) => {
      const s = String(v ?? '1').trim();
      if (s === '') return '1';
      if (s !== '0' && s !== '1') throw Object.assign(new Error('إلزام العميل 0 أو 1'), { statusCode: 400 });
      return s;
    },
  },
  auto_save_open_invoice: {
    validate: (v) => {
      const s = String(v ?? '1').trim();
      if (s === '') return '1';
      if (s !== '0' && s !== '1') throw Object.assign(new Error('الحفظ التلقائي 0 أو 1'), { statusCode: 400 });
      return s;
    },
  },
  autosave_interval_seconds: {
    validate: (v) => {
      const t = String(v ?? '2').trim();
      if (t === '') return '2';
      const n = Number(t);
      if (!Number.isFinite(n) || n < 1 || n > 60) throw Object.assign(new Error('فترة الحفظ بين 1 و 60 ثانية'), { statusCode: 400 });
      return String(Math.round(n));
    },
  },
  desktop_recent_invoices_count: {
    validate: (v) => {
      const t = String(v ?? '10').trim();
      if (t === '') return '10';
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0 || n > 50) throw Object.assign(new Error('عدد الفواتير بين 0 و 50'), { statusCode: 400 });
      return String(Math.round(n));
    },
  },
  default_payment_method: {
    validate: (v) => String(v ?? '').trim().slice(0, 64),
  },
  return_approval_threshold: {
    validate: (v) => {
      const t = String(v ?? '0').trim();
      if (t === '') return '0';
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0 || n > 10000000) throw Object.assign(new Error('عتبة اعتماد المرتجع بين 0 و 10,000,000 (0 = بدون قيد)'), { statusCode: 400 });
      return String(Math.round(n * 100) / 100);
    },
  },
  allow_negative_stock: {
    validate: (v) => {
      const s = String(v ?? '0').trim().toLowerCase();
      if (s === '') return '0';
      if (['0', '1', 'false', 'true'].includes(s)) return (s === '1' || s === 'true') ? '1' : '0';
      throw Object.assign(new Error('السماح بالمخزون السالب 0 أو 1'), { statusCode: 400 });
    },
  },
  default_warehouse: {
    validate: (v) => String(v ?? '').trim().slice(0, 32),
  },
  // ── Number & money formatting (globally configurable, no hardcoded digits) ──
  // Display digits are LATIN by default in every UI language so accounting
  // figures stay machine-comparable and parseable; `arab` is an explicit opt-in.
  number_system: {
    validate: (v) => {
      const s = String(v ?? '').trim().toLowerCase();
      if (s === '') return 'latn';
      if (['latn', 'latin', 'ascii', 'western'].includes(s)) return 'latn';
      if (['arab', 'arabic', 'ar', 'arab-ext', 'arabext'].includes(s)) return 'arab';
      throw Object.assign(new Error('نظام الأرقام latn أو arab'), { statusCode: 400 });
    },
  },
  currency_precision: {
    validate: (v) => {
      const s = String(v ?? '').trim();
      if (s === '') return '2';
      const n = Number(s);
      if (!Number.isInteger(n) || n < 0 || n > 6) throw Object.assign(new Error('دقة العملة بين 0 و 6'), { statusCode: 400 });
      return String(n);
    },
  },
  float_precision: {
    validate: (v) => {
      const s = String(v ?? '').trim();
      if (s === '') return '3';
      const n = Number(s);
      if (!Number.isInteger(n) || n < 0 || n > 9) throw Object.assign(new Error('دقة الكميات بين 0 و 9'), { statusCode: 400 });
      return String(n);
    },
  },
  rounding_method: {
    validate: (v) => {
      const s = String(v ?? '').trim().toLowerCase();
      if (s === '') return "Banker's Rounding";
      if (s.startsWith('commercial')) return 'Commercial Rounding';
      if (s.startsWith('bank')) return "Banker's Rounding";
      throw Object.assign(new Error('طريقة التقريب Banker\'s Rounding أو Commercial Rounding'), { statusCode: 400 });
    },
  },
  number_format: {
    validate: (v) => {
      const s = String(v ?? '').trim();
      if (s === '') return '#,###.##';
      if (!/^[#,.\u066B\u066C 0-9]{1,20}$/.test(s)) throw Object.assign(new Error('نمط الأرقام غير صالح'), { statusCode: 400 });
      return s;
    },
  },
  // ── Stock control at the point of sale (smart, never a dead end) ──────────
  //   strict → the sale is refused (409) when stock is short.
  //   warn   → DEFAULT: the sale goes through, the cashier sees an Arabic
  //            warning, the shortage is recorded and the ledger keeps the
  //            truth (qty may go negative → fix with a stock adjustment).
  //   off    → no availability check at all (blind decrement, legacy).
  stock_control_mode: {
    validate: (v) => {
      const s = String(v ?? '').trim().toLowerCase();
      if (s === '') return 'warn';
      if (['strict', 'block', 'hard'].includes(s)) return 'strict';
      if (['warn', 'flexible', 'soft', 'allow'].includes(s)) return 'warn';
      if (['off', 'none', 'disabled'].includes(s)) return 'off';
      throw Object.assign(new Error('وضع فحص المخزون strict أو warn أو off'), { statusCode: 400 });
    },
  },
  stock_warning_threshold: {
    validate: (v) => {
      const s = String(v ?? '').trim();
      if (s === '') return '0';
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0 || n > 1000000) throw Object.assign(new Error('عتبة تحذير المخزون بين 0 و 1,000,000'), { statusCode: 400 });
      return String(Math.round(n));
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

/**
 * Formatting contract handed to every client (bootstrap precision, POS settings,
 * receipts, reports). One shape, one source: no component may invent digits,
 * precision or rounding again.
 * @returns {{ currency: number, float: number, rounding_method: string,
 *            number_format: string, number_system: 'latn'|'arab' }}
 */
export function precisionSettings() {
  const int = (key, fallback, min, max) => {
    const n = Number.parseInt(getSetting(key, String(fallback)), 10);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const rawRounding = String(getSetting('rounding_method', '')).trim().toLowerCase();
  const ns = String(getSetting('number_system', 'latn')).trim().toLowerCase();
  const nf = String(getSetting('number_format', '#,###.##')).trim();
  return {
    currency: int('currency_precision', 2, 0, 6),
    float: int('float_precision', 3, 0, 9),
    rounding_method: rawRounding.startsWith('commercial') ? 'Commercial Rounding' : "Banker's Rounding",
    number_format: /^[#,. 0-9]{1,20}$/.test(nf) ? nf : '#,###.##',
    number_system: ns === 'arab' || ns === 'arabic' ? 'arab' : 'latn',
  };
}

/**
 * Effective stock policy for a sale.
 *
 * Precedence (deliberate): `DYPOS_STOCK_GUARD=strict` is an operator HARD FLOOR —
 * once an origin pins strict, no settings row can re-open overselling there. In
 * every other case the runtime setting wins, so a shopkeeper can flip between
 * strict / warn / off without a redeploy.
 * @returns {'strict'|'warn'|'off'}
 */
export function stockControlMode() {
  const env = String(process.env.DYPOS_STOCK_GUARD || '').trim().toLowerCase();
  if (env === 'strict') return 'strict';
  const v = String(getSetting('stock_control_mode', 'warn')).trim().toLowerCase();
  return v === 'strict' || v === 'off' ? v : 'warn';
}

/** Remaining-qty level at/below which a low-stock warning is raised (0 = only at depletion). */
export function stockWarningThreshold() {
  const n = Number(getSetting('stock_warning_threshold', '0'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
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

export default { SETTING_DEFS, getSetting, allSettings, setSetting, defaultTaxRate, invoicePrefix, precisionSettings, stockControlMode, stockWarningThreshold };
