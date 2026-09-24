/**
 * Frappe-compat /api/method/* router — dual GET + POST.
 *
 * frappe-ui `call()` always POSTs; createResource and plain fetch use GET.
 * Every handler accepts both verbs (query ∪ body params) and responds with
 * the Frappe envelope `{ message }` so the client unwraps `data.message`.
 * `login` returns the full payload (frappeRequest short-circuits on that URL).
 *
 * Auth: optional attach when a valid token/cookie is present; handlers that
 * need a user return 401 in Frappe error shape (`exc_type`, `_error_message`).
 */
import { Router } from 'express';
import crypto, { createHash, randomBytes } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import db from '../db/schema.js';
import { ah, mapErrorStatus } from '../lib/async.js';
import {
  extractToken, verifyToken, tokenHash, generateToken,
  verifyPasswordAsync, hashPasswordAsync, hashPassword, revokeToken, isProduction,
} from '../middleware/auth.js';
import { getSetting, allSettings, invoicePrefix, defaultTaxRate } from '../lib/settings.js';
import { toMinor, toMajor, pctOf, clampMinor } from '../lib/money.js';
import { computeCouponDiscount } from './offers.js';
import { appendChain } from '../lib/chain.js';
import { ensureOpenFiscalYear, yearOf } from './fiscal.js';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '..', 'uploads');

// ── Arabic localization dictionary (static, no external translation service) ──
const AR_TRANSLATIONS = {
  "DyPOS يتطلب JavaScript — فعّله ثم أعد التحميل.": "DyPOS يتطلب JavaScript — فعّله ثم أعد التحميل.",
  "Skip to main content": "تخطي إلى المحتوى الرئيسي",
  "Dismiss": "إغلاق",
  "Cart is empty": "السلة فارغة",
  "Please select a customer": "الرجاء اختيار عميل",
  "Add items to the cart before applying an offer.": "أضف أصنافاً للسلة قبل تطبيق عرض.",
  "Your cart doesn't meet the requirements for this offer.": "سلتك لا تستوفي متطلبات هذا العرض.",
  "Offer applied successfully": "تم تطبيق العرض بنجاح",
  "Failed to apply offer. Please try again.": "فشل تطبيق العرض. حاول مرة أخرى.",
  "Offer has been removed from cart": "تم إزالة العرض من السلة",
  "Failed to update cart after removing offer.": "فشل تحديث السلة بعد إزالة العرض.",
  "Offline: {0} applied": "بدون إنترنت: تم تطبيق {0}",
  "Offer removed: {0}. Cart no longer meets requirements.": "تم إزالة العرض: {0}. السلة لم تعد تستوفي المتطلبات.",
  "{0} applied successfully": "تم تطبيق {0} بنجاح",
  "Discount has been removed from cart": "تم إزالة الخصم من السلة",
  "Merged into {0} (Total: {1})": "تم الدمج في {0} (الإجمالي: {1})",
  "Unit changed to {0}": "تم تغيير الوحدة إلى {0}",
  "{0} updated": "تم تحديث {0}",
  "Failed to update item. Please try again.": "فشل تحديث الصنف. حاول مرة أخرى.",
  "Requested quantity ({0}) exceeds available stock ({1})": "الكمية المطلوبة ({0}) تتجاوز المخزون المتاح ({1})",
  "Select Item Variant": "اختيار متغير الصنف",
  "Select Unit of Measure": "اختيار وحدة القياس",
  "Choose a variant of this item:": "اختر متغيراً لهذا الصنف:",
  "Select the unit of measure for this item:": "اختر وحدة القياس لهذا الصنف:",
  "Add to Cart": "أضف إلى السلة",
  "Discount (%)": "خصم (%)",
  "Discount Amount": "مبلغ الخصم",
  "Subtotal": "المجموع الفرعي",
  "Total": "الإجمالي",
  "Quantity": "الكمية",
  "Price": "السعر",
  "Item": "الصنف",
  "Customer": "العميل",
  "Payment": "الدفع",
  "Cash": "نقدي",
  "Card": "بطاقة",
  "Print": "طباعة",
  "Save": "حفظ",
  "Cancel": "إلغاء",
  "Confirm": "تأكيد",
  "Delete": "حذف",
  "Edit": "تعديل",
  "Search": "بحث",
  "Loading...": "جاري التحميل...",
  "No results found": "لا توجد نتائج",
  "Error": "خطأ",
  "Success": "نجاح",
  "Warning": "تنبيه",
  "Info": "معلومات",
  "Yes": "نعم",
  "No": "لا",
  "OK": "موافق",
  "Close": "إغلاق",
  "Print Receipt": "طباعة الفاتورة",
  "Invoice": "فاتورة",
  "Return": "مرتجع",
  "Exchange": "استبدال",
  "Refund": "استرداد",
  "Credit": "آجل",
  "Paid": "مدفوع",
  "Pending": "معلق",
  "Completed": "مكتمل",
  "Draft": "مسودة",
  "Open": "مفتوح",
  "Closed": "مغلق",
  "Shift": "ورديّة",
  "Open Shift": "فتح وردية",
  "Close Shift": "إغلاق وردية",
  "Opening Amount": "مبلغ الافتتاح",
  "Closing Amount": "مبلغ الإغلاق",
  "Sales Total": "إجمالي المبيعات",
  "Cash Difference": "فرق النقدية",
  "Products": "المنتجات",
  "Categories": "الأقسام",
  "Stock": "المخزون",
  "Low Stock": "مخزون منخفض",
  "Out of Stock": "نفد المخزون",
  "Settings": "الإعدادات",
  "Profile": "الملف الشخصي",
  "Logout": "تسجيل خروج",
  "Login": "تسجيل دخول",
  "Username": "اسم المستخدم",
  "Password": "كلمة المرور",
  "Remember Me": "تذكرني",
  "Forgot Password?": "نسيت كلمة المرور؟",
  "Reset Password": "إعادة تعيين كلمة المرور",
  "New Password": "كلمة مرور جديدة",
  "Confirm Password": "تأكيد كلمة المرور",
  "Language": "اللغة",
  "Arabic": "العربية",
  "English": "الإنجليزية",
  "Theme": "السمة",
  "Light": "فاتح",
  "Dark": "داكن",
  "System": "النظام",
  "Notifications": "الإشعارات",
  "No notifications": "لا توجد إشعارات",
  "Mark all as read": "تعيين الكل كمقروء",
  "Sync": "مزامنة",
  "Synced": "تمت المزامنة",
  "Pending Sync": "مزامنة معلقة",
  "Offline Mode": "وضع عدم الاتصال",
  "Online": "متصل",
  "Offline": "غير متصل",
  "Version": "الإصدار",
  "Build": "البناء",
  "Last Sync": "آخر مزامنة",
  "never": "أبداً",
  "just now": "الآن",
  "minutes ago": "منذ دقائق",
  "hours ago": "منذ ساعات",
  "days ago": "منذ أيام",
};

const ALLOWED_LOCALES = ['ar', 'en'];
const LOCALE_NAMES = {
  ar: { native: 'العربية', english: 'Arabic' },
  en: { native: 'English', english: 'English' },
};

function translationsFor(locale = 'ar') {
  return locale === 'ar' ? AR_TRANSLATIONS : {};
}

// ── Helpers ──────────────────────────────────────────────────────────────
function frappeError(res, status, excType, message) {
  return res.status(status).json({
    exc_type: excType,
    _error_message: message,
    message,
  });
}

function requireUser(req, res) {
  if (!req.user) {
    frappeError(res, 401, 'AuthenticationError', 'غير مصرح — تسجيل الدخول مطلوب');
    return false;
  }
  return true;
}

/** Merge GET query + POST/PUT body into a single params object. */
function paramsOf(req) {
  const q = req.query && typeof req.query === 'object' ? req.query : {};
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  return { ...q, ...b };
}

/** Attach req.user when a valid token is present; never rejects. */
function optionalAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (token) {
      const decoded = verifyToken(token);
      try {
        const sess = db.prepare('SELECT revoked FROM user_sessions WHERE id=? OR token_hash=? LIMIT 1')
          .get(decoded.jti || '', tokenHash(token));
        if (sess && Number(sess.revoked) === 1) return next();
      } catch { /* sessions table may be missing */ }
      req.user = decoded;
      req.token = token;
    }
  } catch { /* invalid/expired → public handler decides */ }
  next();
}

function setAuthCookies(res, token, user) {
  const maxAge = 24 * 60 * 60 * 1000;
  const secure = isProduction ? '; Secure' : '';
  // user_id / full_name must be JS-readable (sessionUser() reads cookies).
  res.append('Set-Cookie', `user_id=${encodeURIComponent(user.username)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`);
  res.append('Set-Cookie', `full_name=${encodeURIComponent(user.fullName || user.username)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`);
  res.append('Set-Cookie', `dypos_token=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`);
}

function clearAuthCookies(res) {
  const secure = isProduction ? '; Secure' : '';
  res.append('Set-Cookie', `user_id=; Path=/; Max-Age=0; SameSite=Lax${secure}`);
  res.append('Set-Cookie', `full_name=; Path=/; Max-Age=0; SameSite=Lax${secure}`);
  res.append('Set-Cookie', `dypos_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
}

// ── Doctype → table map for frappe.client.get_list / get_value / get ──
const DOCTYPES = {
  Item: {
    table: 'products',
    idCol: 'id',
    fields: {
      name: 'id', item_code: 'code', item_name: 'name', description: 'description',
      stock_uom: 'uom', image: 'image', item_group: 'category', brand: 'brand',
      barcode: 'barcode', disabled: 'is_active', is_stock_item: 'is_stock_item',
      valuation_rate: 'cost_price', standard_rate: 'unit_price',
    },
    mapRow(r) {
      return {
        name: r.id, item_code: r.code, item_name: r.name, description: r.description || '',
        stock_uom: r.uom || 'Unit', image: r.image || '', item_group: r.category || '',
        brand: r.brand || '', barcode: r.barcode || '',
        disabled: r.is_active === 0 ? 1 : 0, is_stock_item: r.is_stock_item ?? 1,
        valuation_rate: r.cost_price ?? 0, standard_rate: r.unit_price ?? 0,
        unit_price: r.unit_price ?? 0, cost_price: r.cost_price ?? 0,
        category: r.category || '', uom: r.uom || 'Unit', is_active: r.is_active,
        stock_qty: r.stock_qty ?? 0,
      };
    },
    defaultWhere: 'is_active=1',
    idAliases: ['id', 'code', 'name', 'item_code'],
  },
  Customer: {
    table: 'customers',
    idCol: 'id',
    fields: {
      name: 'id', customer_name: 'name', mobile_no: 'phone', phone: 'phone',
      email_id: 'email', customer_group: 'group', territory: 'territory',
      disabled: 'is_active',
    },
    mapRow(r) {
      return {
        name: r.id, customer_name: r.name, mobile_no: r.phone || '', phone: r.phone || '',
        email_id: r.email || '', customer_group: r.group || '', territory: r.territory || '',
        disabled: r.is_active === 0 ? 1 : 0, is_active: r.is_active,
        loyalty_points: r.loyalty_points ?? 0, credit_limit: r.credit_limit ?? 0,
        wallet_balance: r.wallet_balance ?? 0,
      };
    },
    defaultWhere: null,
    idAliases: ['id', 'name', 'phone'],
  },
  'Sales Invoice': {
    table: 'invoices',
    idCol: 'id',
    fields: {
      name: 'id', customer: 'customer_id', grand_total: 'total',
      status: 'status', posting_date: 'created_at', company: 'tenant_id',
    },
    mapRow(r) {
      return {
        name: r.id, customer: r.customer_id, grand_total: r.total ?? 0,
        outstanding_amount: r.outstanding_amount ?? 0, status: r.status || 'PAID',
        posting_date: r.created_at, company: r.tenant_id || '',
        docstatus: r.status === 'PAID' ? 1 : 0,
      };
    },
    defaultWhere: null,
    idAliases: ['id', 'number'],
  },
  User: {
    table: 'users',
    idCol: 'id',
    fields: { name: 'username', full_name: 'full_name', email: 'username', role: 'role', enabled: 'is_active' },
    mapRow(r) {
      return { name: r.username, full_name: r.full_name, email: r.username, role: r.role, enabled: r.is_active };
    },
    defaultWhere: 'is_active=1',
    idAliases: ['id', 'username'],
  },
  UOM: {
    table: 'uoms',
    idCol: 'code',
    fields: { name: 'code', uom_name: 'name', category: 'category' },
    mapRow(r) { return { name: r.code, uom_name: r.name, category: r.category, code: r.code }; },
    defaultWhere: 'is_active=1',
    idAliases: ['code', 'name'],
  },
};

function resolveDoctype(doctype) {
  const key = String(doctype || '').trim();
  if (DOCTYPES[key]) return DOCTYPES[key];
  // Common aliases
  const aliases = {
    'POS Invoice': 'Sales Invoice',
    Item: 'Item',
    Bin: null, // no Bin table — empty list
    'Serial No': null,
    'Customer Group': null,
    Territory: null,
    District: null,
    Campaign: null,
    'Selling Settings': null,
    'POS Profile': null,
    'POS Settings': null,
    'Promotional Scheme': null,
    'POS Coupon': 'Coupons',
    'POS Opening Shift': 'Shifts',
    'POS Closing Shift': 'Shifts',
    'Payment Entry': null,
    'Purchase Invoice': null,
    'DyPOS User Data': null,
    'DyPOS Settings': null,
  };
  if (Object.hasOwn(aliases, key)) {
    const mapped = aliases[key];
    return mapped ? DOCTYPES[mapped] : null;
  }
  return null;
}

function buildFieldSelect(spec, fields) {
  if (!Array.isArray(fields) || !fields.length) return 'SELECT *';
  const cols = [];
  const seen = new Set();
  for (const f of fields) {
    const raw = String(f).trim();
    if (!raw || raw === '*') return 'SELECT *';
    // "name as serial_no" | "name" | "* as x"
    const asMatch = raw.match(/^(.+?)\s+as\s+(\w+)$/i);
    let expr, alias = null;
    if (asMatch) {
      expr = asMatch[1].trim().replace(/`/g, '');
      alias = asMatch[2];
    } else {
      expr = raw.replace(/`/g, '');
    }
    const col = spec.fields[expr] || (spec.idAliases?.includes(expr) ? spec.idCol : null);
    if (!col) continue;
    const sql = alias ? `${col} AS ${alias}` : col;
    if (!seen.has(sql)) { seen.add(sql); cols.push(sql); }
  }
  if (!cols.length) return 'SELECT *';
  return `SELECT ${cols.join(', ')}`;
}

function normalizeFilters(filters) {
  if (!filters) return [];
  if (Array.isArray(filters)) {
    // [[field, op, value], ...]
    return filters.filter(Array.isArray).map(([field, op, value]) => ({ field, op: op || '=', value }));
  }
  if (typeof filters === 'object') {
    return Object.entries(filters).map(([field, value]) => ({ field, op: '=', value }));
  }
  return [];
}

function applyFilters(spec, whereParts, params, filters) {
  for (const { field, op, value } of filters) {
    const col = spec.fields[field] || (spec.idAliases?.includes(field) ? spec.idCol : null);
    if (!col) continue;
    const o = String(op).toLowerCase();
    if (o === 'in' && Array.isArray(value)) {
      if (!value.length) { whereParts.push('0=1'); continue; }
      whereParts.push(`${col} IN (${value.map(() => '?').join(',')})`);
      params.push(...value);
    } else if (o === 'like') {
      whereParts.push(`${col} LIKE ?`);
      params.push(`%${value}%`);
    } else if (o === '!=') {
      whereParts.push(`${col} != ?`);
      params.push(value);
    } else if (o === '>=' || o === '<=' || o === '>' || o === '<') {
      whereParts.push(`${col} ${o} ?`);
      params.push(value);
    } else {
      whereParts.push(`${col} = ?`);
      params.push(value);
    }
  }
}

// ── Handler registry ─────────────────────────────────────────────────────
// key: method path (case-sensitive as client sends it)
const handlers = new Map();

function def(path, handler, opts = {}) {
  handlers.set(path, { handler, ...opts });
}

// ── Localization ─────────────────────────────────────────────────────────
def('DyPOS.api.localization.get_app_translations', (params, _req, res) => {
  const locale = String(params.locale || params.lang || 'ar').toLowerCase();
  return res.json({ message: translationsFor(locale) });
});
def('get_app_translations', (params, _req, res) => {
  const locale = String(params.locale || params.lang || 'ar').toLowerCase();
  return res.json({ message: translationsFor(locale) });
});
def('DyPOS.api.localization.get_allowed_locales', (_p, _r, res) =>
  res.json({ message: { success: true, locales: ALLOWED_LOCALES } }));
def('get_allowed_locales', (_p, _r, res) =>
  res.json({ message: { success: true, locales: ALLOWED_LOCALES } }));
def('DyPOS.api.localization.get_user_language', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  const locale = req.user?.preferred_locale || 'ar';
  return res.json({ message: { success: true, locale } });
});
def('get_user_language', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  const locale = req.user?.preferred_locale || 'ar';
  return res.json({ message: { success: true, locale } });
});
def('DyPOS.api.localization.change_user_language', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const locale = String(params.locale || params.language || 'ar').toLowerCase();
  if (!ALLOWED_LOCALES.includes(locale)) {
    return frappeError(res, 400, 'ValidationError', 'لغة غير مدعومة');
  }
  // Client persists preferred locale in localStorage; server acknowledges.
  return res.json({ message: { success: true, locale } });
});
def('DyPOS.api.localization.get_locale_names', (_p, _r, res) =>
  res.json({ message: LOCALE_NAMES }));
def('get_locale_names', (_p, _r, res) => res.json({ message: LOCALE_NAMES }));

// ── Ping / health ────────────────────────────────────────────────────────
const pingPayload = () => ({ message: { pong: true, time: Date.now(), version: process.env.npm_package_version || '1.36.0' } });
def('DyPOS.api.ping', (_p, _r, res) => res.json(pingPayload()));
def('DyPOS.api.utilities.ping', (_p, _r, res) => res.json(pingPayload()));
def('DyPOS.api.health', (_p, _r, res) => res.json({ message: { status: 'ok' } }));

// ── CSRF ─────────────────────────────────────────────────────────────────
def('DyPOS.api.utilities.get_csrf_token', (_p, req, res) => {
  const token = randomBytes(24).toString('hex');
  const secure = isProduction ? '; Secure' : '';
  res.append('Set-Cookie', `csrf_token=${token}; Path=/; Max-Age=86400; SameSite=Lax${secure}`);
  return res.json({ message: { csrf_token: token, session_id: req.user?.jti || 'anonymous' } });
});

// ── Rate limit check (server-side advisory) ─────────────────────────────
def('DyPOS.api.rate_limit.check', (params, _req, res) => {
  const maxAttempts = Math.max(1, Number(params.maxAttempts) || 5);
  // Stateless advisory: always allow; real enforcement is express-rate-limit on /api/auth.
  res.setHeader('X-RateLimit-Limit', String(maxAttempts));
  res.setHeader('X-RateLimit-Remaining', String(maxAttempts));
  res.setHeader('X-RateLimit-Reset', String(Date.now() + Number(params.windowMs) || 900000));
  return res.json({ message: { allowed: true, remaining: maxAttempts } });
});

// ── Auth (Frappe-style) ──────────────────────────────────────────────────
async function doLogin(req, res, username, password) {
  const clean = String(username || '').trim();
  if (!clean || !password) {
    return frappeError(res, 400, 'ValidationError', 'اسم المستخدم وكلمة المرور مطلوبان');
  }
  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(clean);
  if (!user) {
    return frappeError(res, 401, 'AuthenticationError', 'بيانات الدخول غير صحيحة');
  }
  let ok = false;
  try { ok = await verifyPasswordAsync(password, user.password_hash); } catch { ok = false; }
  if (!ok) {
    return frappeError(res, 401, 'AuthenticationError', 'بيانات الدخول غير صحيحة');
  }
  const token = generateToken(user);
  const payload = {
    token,
    user: {
      id: user.id, username: user.username, fullName: user.full_name,
      role: user.role, tenantId: user.tenant_id || null,
    },
    mustChangePassword: Number(user.must_change_password) === 1,
    full_name: user.full_name,
    user_id: user.username,
  };
  setAuthCookies(res, token, payload.user);
  req.audit?.('auth.login', { userId: user.id, username: user.username });
  // frappeRequest returns full body for /api/method/login (not just message).
  return res.json(payload);
}

def('login', async (params, req, res) => {
  const username = params.usr || params.username || params.user;
  const password = params.pwd || params.password;
  return doLogin(req, res, username, password);
});

// Adapter path: frappe-ui call() unwraps { message } for non-/login URLs.
async function doLoginMessage(params, req, res) {
  const username = params.usr || params.username || params.user;
  const password = params.pwd || params.password;
  if (!username || !password) {
    return frappeError(res, 400, 'ValidationError', 'اسم المستخدم وكلمة المرور مطلوبان');
  }
  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(String(username).trim());
  if (!user) return frappeError(res, 401, 'AuthenticationError', 'بيانات الدخول غير صحيحة');
  let ok = false;
  try { ok = await verifyPasswordAsync(password, user.password_hash); } catch { ok = false; }
  if (!ok) return frappeError(res, 401, 'AuthenticationError', 'بيانات الدخول غير صحيحة');
  const token = generateToken(user);
  const payload = {
    token,
    user: {
      id: user.id, username: user.username, fullName: user.full_name,
      role: user.role, tenantId: user.tenant_id || null,
    },
    mustChangePassword: Number(user.must_change_password) === 1,
    full_name: user.full_name,
    user_id: user.username,
  };
  setAuthCookies(res, token, payload.user);
  req.audit?.('auth.login', { userId: user.id, username: user.username });
  return res.json({ message: payload, ...payload });
}
def('DyPOS.api.auth.login', doLoginMessage);

def('logout', (_p, req, res) => {
  if (req.token) {
    try { revokeToken(req.token); } catch { /* best-effort */ }
  }
  clearAuthCookies(res);
  return res.json({ message: { logged_out: true } });
});

def('frappe.auth.get_logged_user', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  const username = req.user.username || req.user.id || 'Guest';
  return res.json({ message: username });
});

def('frappe.auth.register', async (params, req, res) => {
  const username = String(params.username || params.usr || '').trim();
  const password = String(params.password || params.pwd || '');
  const fullName = String(params.full_name || params.fullName || username).trim();
  const role = String(params.role || 'CASHIER').toUpperCase();
  if (!username || username.length < 3) return frappeError(res, 400, 'ValidationError', 'اسم المستخدم غير صالح');
  if (password.length < 8 || !/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
    return frappeError(res, 400, 'ValidationError', 'كلمة المرور 8+ أحرف (حرف ورقم)');
  }
  const existing = db.prepare('SELECT 1 FROM users WHERE username=?').get(username);
  if (existing) return frappeError(res, 409, 'ValidationError', 'اسم المستخدم موجود مسبقًا');
  const countRow = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const isBootstrap = Number(countRow?.c || 0) === 0;
  const finalRole = ['ADMIN', 'MANAGER', 'CASHIER', 'AUDITOR'].includes(role) ? role : 'CASHIER';
  if (!isBootstrap && (finalRole === 'ADMIN' || finalRole === 'MANAGER')) {
    if (req.user?.role !== 'ADMIN') {
      return frappeError(res, 403, 'PermissionError', 'التسجيل يتطلب صلاحية مدير');
    }
  }
  const id = crypto.randomUUID();
  const hash = await hashPasswordAsync(password);
  db.prepare('INSERT INTO users (id,username,password_hash,full_name,role) VALUES (?,?,?,?,?)')
    .run(id, username, hash, fullName, finalRole);
  req.audit?.('auth.register', { newUser: username, role: finalRole });
  return res.json({ message: { id, username, fullName, role: finalRole } });
});

// ── Password reset (maps to /api/auth/forgot + /reset) ──────────────────
def('DyPOS.api.auth.send_password_reset', (params, _req, res) => {
  const email = String(params.email || params.username || '').trim();
  // Anti-enumeration: always success-shaped message.
  void email;
  return res.json({ message: { message: 'إذا كان الحساب موجودًا، سيتم إرسال رابط استعادة كلمة المرور.' } });
});
def('DyPOS.api.auth.reset_password', (params, _req, res) => {
  // Delegate shape; actual redeem is POST /api/auth/reset.
  const token = String(params.token || '');
  const newPassword = String(params.new_password || params.newPassword || '');
  if (!/^[a-f0-9]{48}$/.test(token)) return frappeError(res, 400, 'ValidationError', 'رمز غير صالح');
  if (newPassword.length < 8 || !/(?=.*[A-Za-z])(?=.*\d)/.test(newPassword)) {
    return frappeError(res, 400, 'ValidationError', 'كلمة المرور 8+ أحرف (حرف ورقم)');
  }
  try {
    const row = db.prepare(`SELECT * FROM password_resets WHERE token_hash=? AND used=0 AND expires_at>datetime('now')`)
      .get(createHash('sha256').update(token).digest('hex'));
    if (!row) return frappeError(res, 400, 'ValidationError', 'الرمز منتهي أو مستخدم');
    const hash = hashPassword(newPassword);
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?').run(hash, row.user_id);
      db.prepare('UPDATE password_resets SET used=1 WHERE id=?').run(row.id);
      db.prepare('UPDATE user_sessions SET revoked=1 WHERE user_id=?').run(row.user_id);
    })();
    return res.json({ message: { reset: true } });
  } catch (e) {
    return frappeError(res, 400, 'ValidationError', String(e.message || 'فشل إعادة التعيين').slice(0, 200));
  }
});

// ── frappe.client.has_permission ─────────────────────────────────────────
const ROLE_PERMS = {
  ADMIN: { allow: true },
  MANAGER: {
    allow: true,
    denyWrite: new Set(['User', 'DyPOS Settings']),
  },
  CASHIER: {
    allowDoctypes: new Set([
      'Customer', 'Item', 'Sales Invoice', 'POS Invoice', 'POS Opening Shift',
      'POS Closing Shift', 'POS Profile', 'POS Settings', 'POS Coupon',
      'Promotional Scheme', 'Campaign', 'UOM', 'Bin', 'Serial No',
    ]),
    allowCreate: new Set(['Customer', 'Sales Invoice', 'POS Invoice', 'POS Opening Shift', 'POS Closing Shift', 'POS Coupon']),
    allowWrite: new Set(['Customer', 'Sales Invoice', 'POS Invoice', 'POS Opening Shift', 'POS Closing Shift', 'POS Coupon', 'POS Profile']),
    allowSubmit: new Set(['Sales Invoice', 'POS Invoice', 'POS Closing Shift']),
    allowDelete: new Set(),
  },
  AUDITOR: {
    allowDoctypes: new Set(['Customer', 'Item', 'Sales Invoice', 'POS Invoice', 'UOM', 'User']),
    allowCreate: new Set(), allowWrite: new Set(), allowSubmit: new Set(), allowDelete: new Set(),
  },
};

function checkPermission(role, doctype, permType) {
  const r = ROLE_PERMS[role];
  if (!r) return false;
  if (r.allow === true && !r.denyWrite) {
    if (permType === 'write' || permType === 'delete' || permType === 'create') {
      if (r.denyWrite?.has(doctype)) return false;
    }
    return true;
  }
  if (r.allow === true) {
    if (r.denyWrite?.has(doctype) && (permType === 'write' || permType === 'delete')) return false;
    return true;
  }
  const dt = String(doctype);
  if (r.allowDoctypes && !r.allowDoctypes.has(dt)) return false;
  const map = {
    read: r.allowDoctypes?.has(dt),
    create: r.allowCreate?.has(dt),
    write: r.allowWrite?.has(dt),
    submit: r.allowSubmit?.has(dt),
    cancel: r.allowSubmit?.has(dt),
    delete: r.allowDelete?.has(dt),
  };
  if (permType in map) return Boolean(map[permType]);
  // Unknown perm type on a visible doctype → allow read-only fallback
  return r.allowDoctypes?.has(dt) ?? false;
}

def('frappe.client.has_permission', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const doctype = String(params.doctype || '');
  const permType = String(params.perm_type || params.permtype || 'read').toLowerCase();
  const allowed = checkPermission(req.user.role, doctype, permType);
  return res.json({ message: { has_permission: allowed } });
});

// ── frappe.client.get_list / get_value / get / set_value ────────────────
def('frappe.client.get_list', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const spec = resolveDoctype(params.doctype);
  if (!spec) return res.json({ message: [] });
  const fields = Array.isArray(params.fields) ? params.fields
    : typeof params.fields === 'string' ? params.fields.split(',').map((s) => s.trim())
    : null;
  const limit = Math.min(Math.max(Number(params.limit_page_length || params.limit) || 50, 1), 500);
  const start = Math.max(Number(params.limit_start || params.start) || 0, 0);
  const whereParts = [];
  const sqlParams = [];
  if (spec.defaultWhere) whereParts.push(spec.defaultWhere);
  applyFilters(spec, whereParts, sqlParams, normalizeFilters(params.filters));
  const where = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
  const select = buildFieldSelect(spec, fields);
  try {
    const rows = db.prepare(`${select} FROM ${spec.table}${where} LIMIT ? OFFSET ?`)
      .all(...sqlParams, limit, start);
    return res.json({ message: rows });
  } catch (_e) {
    // Unknown column / table edge → empty list (UI degrades, never 500s)
    return res.json({ message: [] });
  }
});

def('frappe.client.get_value', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const spec = resolveDoctype(params.doctype);
  if (!spec) return res.json({ message: null });
  const filters = normalizeFilters(params.filters);
  const whereParts = [];
  const sqlParams = [];
  if (spec.defaultWhere) whereParts.push(spec.defaultWhere);
  applyFilters(spec, whereParts, sqlParams, filters);
  const where = whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '';
  try {
    const row = db.prepare(`SELECT * FROM ${spec.table}${where} LIMIT 1`).get(...sqlParams);
    if (!row) return res.json({ message: null });
    const mapped = spec.mapRow ? spec.mapRow(row) : row;
    // Frappe get_value with fieldname list returns subset; with object returns full-ish
    const fieldname = params.fieldname;
    if (Array.isArray(fieldname) && fieldname.length) {
      const out = {};
      for (const f of fieldname) {
        const key = String(f);
        out[key] = mapped[key] ?? row[spec.fields[key] || key] ?? null;
      }
      return res.json({ message: out });
    }
    if (typeof fieldname === 'string' && fieldname) {
      return res.json({ message: mapped[fieldname] ?? row[spec.fields[fieldname] || fieldname] ?? null });
    }
    return res.json({ message: mapped });
  } catch {
    return res.json({ message: null });
  }
});

def('frappe.client.get', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const spec = resolveDoctype(params.doctype);
  if (!spec) return frappeError(res, 404, 'NotFoundError', 'غير موجود');
  const id = String(params.name || params.docname || params.filter_name || '').trim();
  if (!id) return frappeError(res, 400, 'ValidationError', 'المعرف مطلوب');
  const idCol = spec.idCol;
  const aliases = (spec.idAliases || [idCol]).map(() => '?');
  const where = `${idCol} IN (${aliases.join(',')})`;
  try {
    const row = db.prepare(`SELECT * FROM ${spec.table} WHERE ${where} LIMIT 1`).get(...(spec.idAliases || [idCol]).map(() => id));
    if (!row) return frappeError(res, 404, 'NotFoundError', 'غير موجود');
    return res.json({ message: spec.mapRow ? spec.mapRow(row) : row });
  } catch {
    return frappeError(res, 404, 'NotFoundError', 'غير موجود');
  }
});

def('frappe.client.set_value', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const role = req.user.role;
  if (!['ADMIN', 'MANAGER'].includes(role) && !checkPermission(role, params.doctype, 'write')) {
    return frappeError(res, 403, 'PermissionError', 'صلاحية غير كافية');
  }
  const spec = resolveDoctype(params.doctype);
  if (!spec) return frappeError(res, 404, 'NotFoundError', 'غير موجود');
  const name = String(params.name || '').trim();
  if (!name) return frappeError(res, 400, 'ValidationError', 'المعرف مطلوب');
  const fieldname = params.fieldname;
  let values = {};
  if (fieldname && typeof fieldname === 'object' && !Array.isArray(fieldname)) {
    values = fieldname;
  } else if (typeof fieldname === 'string' && params.value !== undefined) {
    values = { [fieldname]: params.value };
  } else if (Array.isArray(fieldname) && params.value !== undefined) {
    // Frappe array form: fieldname can be single or we expect object value
    values = { [fieldname[0]]: params.value };
  }
  const sets = [];
  const sqlParams = [];
  for (const [k, v] of Object.entries(values)) {
    const col = spec.fields[k] || (spec.idAliases?.includes(k) ? spec.idCol : null);
    if (!col || col === spec.idCol) continue;
    sets.push(`${col}=?`);
    sqlParams.push(v);
  }
  if (!sets.length) return frappeError(res, 400, 'ValidationError', 'لا حقول للتحديث');
  const idAliases = spec.idAliases || [spec.idCol];
  const where = `${spec.idCol} IN (${idAliases.map(() => '?').join(',')})`;
  try {
    const upd = db.prepare(`UPDATE ${spec.table} SET ${sets.join(', ')} WHERE ${where}`)
      .run(...sqlParams, ...idAliases.map(() => name));
    if (!upd.changes) return frappeError(res, 404, 'NotFoundError', 'غير موجود');
    const row = db.prepare(`SELECT * FROM ${spec.table} WHERE ${where} LIMIT 1`).get(...idAliases.map(() => name));
    return res.json({ message: spec.mapRow ? spec.mapRow(row) : row });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e), 'ValidationError', String(e.message || 'فشل التحديث').slice(0, 200));
  }
});

def('frappe.delete_doc', (params, req, res) => {
  if (!requireUser(req, res)) return;
  if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
    return frappeError(res, 403, 'PermissionError', 'صلاحية غير كافية');
  }
  const spec = resolveDoctype(params.doctype);
  if (!spec) return res.json({ message: { deleted: true } });
  const name = String(params.name || '').trim();
  const idAliases = spec.idAliases || [spec.idCol];
  const where = `${spec.idCol} IN (${idAliases.map(() => '?').join(',')})`;
  try {
    // Soft-delete when is_active exists; hard-delete otherwise.
    const cols = db.prepare(`PRAGMA table_info(${spec.table})`).all().map((c) => c.name);
    if (cols.includes('is_active')) {
      db.prepare(`UPDATE ${spec.table} SET is_active=0 WHERE ${where}`).run(...idAliases.map(() => name));
    } else {
      db.prepare(`DELETE FROM ${spec.table} WHERE ${where}`).run(...idAliases.map(() => name));
    }
    return res.json({ message: { deleted: true } });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e), 'ValidationError', String(e.message || 'فشل الحذف').slice(0, 200));
  }
});

// ── Bootstrap ────────────────────────────────────────────────────────────
def('DyPOS.api.bootstrap.get_initial_data', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  const settings = allSettings();
  let shift = null;
  try {
    // Prefer open shift for this user's terminal if any; return most recent OPEN.
    shift = db.prepare(`SELECT * FROM shifts WHERE status='OPEN' ORDER BY opened_at DESC LIMIT 1`).get() || null;
  } catch { /* ignore */ }
  let paymentMethods = [];
  try {
    paymentMethods = db.prepare('SELECT * FROM payment_methods WHERE is_active=1 ORDER BY sort_order').all();
  } catch { /* ignore */ }
  let warehouses = [];
  try {
    warehouses = db.prepare('SELECT * FROM warehouses ORDER BY id').all();
  } catch { /* ignore */ }
  const locale = req.user?.preferred_locale || 'ar';
  return res.json({
    message: {
      success: true,
      site_name: 'DyPOS',
      locale,
      precision: {
        currency: Number(settings.currency_precision || 2),
        float: 3,
        rounding_method: "Banker's Rounding",
        number_format: '#,###.##',
      },
      can_switch_to_desk: req.user.role === 'ADMIN',
      shift,
      pos_profile: {
        name: 'POS',
        warehouse: warehouses[0]?.id || 'W-01',
        warehouses,
        company: settings.business_name || 'DyPOS',
        country: settings.country_code || 'SA',
        currency: settings.currency || 'SAR',
      },
      pos_settings: {
        allow_negative_stock: settings.allow_negative_stock === '1',
        tax_inclusive: settings.tax_inclusive === '1',
        require_customer_on_sale: settings.require_customer_on_sale === '1',
        tax_rate_default: Number(settings.tax_rate_default || 15),
        default_payment_method: settings.default_payment_method || '',
      },
      payment_methods: paymentMethods,
      settings,
      user: {
        username: req.user.username,
        fullName: req.user.fullName || req.user.username,
        role: req.user.role,
      },
    },
  });
});

// ── Items ────────────────────────────────────────────────────────────────
function mapProductToItem(r) {
  return {
    item_code: r.code,
    item_name: r.name,
    name: r.code,
    description: r.description || r.name || '',
    stock_uom: r.uom || 'Unit',
    image: r.image || '',
    item_group: r.category || '',
    brand: r.brand || '',
    barcode: r.barcode || '',
    is_stock_item: r.is_stock_item ?? 1,
    has_variants: 0,
    variant_of: null,
    disabled: r.is_active === 0 ? 1 : 0,
    standard_rate: r.unit_price ?? 0,
    valuation_rate: r.cost_price ?? 0,
    unit_price: r.unit_price ?? 0,
    cost_price: r.cost_price ?? 0,
    category: r.category || '',
    uom: r.uom || 'Unit',
    tax_rate: r.tax_rate ?? 0,
    is_active: r.is_active,
    stock_qty: r.stock_qty ?? 0,
    id: r.id,
    // POS cart fields (camelCase used by restApi/stock UI)
    productId: r.id,
    code: r.code,
    name_ar: r.name_ar || r.name,
    price: r.unit_price ?? 0,
  };
}

def('DyPOS.api.items.get_items', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const search = String(params.search_term || params.search || params.q || '').trim().slice(0, 64);
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
  const start = Math.max(Number(params.start) || 0, 0);
  const warehouse = String(params.warehouse || 'W-01').slice(0, 32);
  let where = 'p.is_active=1';
  const sqlParams = [];
  if (search) {
    if (search.length <= 3) {
      where += ' AND (p.code LIKE ? OR p.name LIKE ? OR p.barcode LIKE ?)';
      sqlParams.push(`${search}%`, `${search}%`, `${search}%`);
    } else {
      const like = `%${search}%`;
      where += ' AND (p.code LIKE ? OR p.name LIKE ? OR p.barcode LIKE ? OR p.name_ar LIKE ?)';
      sqlParams.push(like, like, like, like);
    }
  }
  try {
    const rows = db.prepare(
      `SELECT p.*, COALESCE(s.qty,0) as stock_qty FROM products p
       LEFT JOIN stock_levels s ON p.id=s.product_id AND s.warehouse_id=?
       WHERE ${where} ORDER BY p.name LIMIT ? OFFSET ?`
    ).all(warehouse, ...sqlParams, limit, start);
    return res.json({ message: rows.map(mapProductToItem) });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.items.get_items_bulk', (params, req, res) => {
  if (!requireUser(req, res)) return;
  let codes = params.item_codes || params.codes || params.items || [];
  if (typeof codes === 'string') {
    try { codes = JSON.parse(codes); } catch { codes = codes.split(',').map((s) => s.trim()).filter(Boolean); }
  }
  if (!Array.isArray(codes) || !codes.length) return res.json({ message: [] });
  const warehouse = String(params.warehouse || 'W-01').slice(0, 32);
  const ids = codes.map((c) => String(c).slice(0, 64)).slice(0, 500);
  try {
    const rows = db.prepare(
      `SELECT p.*, COALESCE(s.qty,0) as stock_qty FROM products p
       LEFT JOIN stock_levels s ON p.id=s.product_id AND s.warehouse_id=?
       WHERE p.code IN (${ids.map(() => '?').join(',')})`
    ).all(warehouse, ...ids);
    return res.json({ message: rows.map(mapProductToItem) });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.items.get_items_count', (_params, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const row = db.prepare('SELECT COUNT(*) as c FROM products WHERE is_active=1').get();
    return res.json({ message: row?.c || 0 });
  } catch {
    return res.json({ message: 0 });
  }
});

def('DyPOS.api.items.get_item_groups', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const rows = db.prepare('SELECT DISTINCT category as name, category as item_group FROM products WHERE is_active=1 AND category IS NOT NULL AND category != \'\' ORDER BY category').all();
    return res.json({ message: rows });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.items.get_brands', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const rows = db.prepare('SELECT DISTINCT brand as name, brand FROM products WHERE is_active=1 AND brand IS NOT NULL AND brand != \'\' ORDER BY brand').all();
    return res.json({ message: rows });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.items.search_by_barcode', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const barcode = String(params.barcode || params.search_term || '').trim().slice(0, 64);
  if (!barcode) return res.json({ message: [] });
  const warehouse = String(params.warehouse || 'W-01').slice(0, 32);
  try {
    const rows = db.prepare(
      `SELECT p.*, COALESCE(s.qty,0) as stock_qty FROM products p
       LEFT JOIN stock_levels s ON p.id=s.product_id AND s.warehouse_id=?
       WHERE p.is_active=1 AND (p.barcode=? OR p.code=? OR p.name LIKE ?) LIMIT 10`
    ).all(warehouse, barcode, barcode, `%${barcode}%`);
    return res.json({ message: rows.map(mapProductToItem) });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.items.get_stock_quantities', (params, req, res) => {
  if (!requireUser(req, res)) return;
  let codes = params.item_codes || params.codes || [];
  if (typeof codes === 'string') {
    try { codes = JSON.parse(codes); } catch { codes = codes.split(',').map((s) => s.trim()).filter(Boolean); }
  }
  const warehouse = String(params.warehouse || 'W-01').slice(0, 32);
  if (!Array.isArray(codes) || !codes.length) {
    // Return all stock for warehouse
    try {
      const rows = db.prepare(
        `SELECT s.product_id as item_code, s.qty, p.code, p.name FROM stock_levels s
         JOIN products p ON p.id=s.product_id WHERE s.warehouse_id=?`
      ).all(warehouse);
      return res.json({ message: rows.map((r) => ({ item_code: r.code, actual_qty: r.qty, warehouse, qty: r.qty, name: r.name })) });
    } catch {
      return res.json({ message: [] });
    }
  }
  const ids = codes.map((c) => String(c).slice(0, 64)).slice(0, 500);
  try {
    const rows = db.prepare(
      `SELECT p.code as item_code, COALESCE(s.qty,0) as actual_qty, COALESCE(s.qty,0) as qty
       FROM products p LEFT JOIN stock_levels s ON s.product_id=p.id AND s.warehouse_id=?
       WHERE p.code IN (${ids.map(() => '?').join(',')})`
    ).all(warehouse, ...ids);
    return res.json({ message: rows });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.items.get_item_details', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const code = String(params.item_code || params.itemCode || params.item || '').trim();
  const warehouse = String(params.warehouse || 'W-01').slice(0, 32);
  if (!code) return frappeError(res, 400, 'ValidationError', 'item_code مطلوب');
  try {
    const row = db.prepare(
      `SELECT p.*, COALESCE(s.qty,0) as stock_qty FROM products p
       LEFT JOIN stock_levels s ON p.id=s.product_id AND s.warehouse_id=?
       WHERE (p.code=? OR p.id=?) AND p.is_active=1 LIMIT 1`
    ).get(warehouse, code, code);
    if (!row) return frappeError(res, 404, 'NotFoundError', 'الصنف غير موجود');
    return res.json({ message: { ...mapProductToItem(row), stock_qty: row.stock_qty } });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e), 'ValidationError', String(e.message || 'خطأ').slice(0, 200));
  }
});

// ── Customers ────────────────────────────────────────────────────────────
function mapCustomer(r) {
  return {
    name: r.id,
    customer_name: r.name,
    customer: r.id,
    mobile_no: r.phone || '',
    phone: r.phone || '',
    email_id: r.email || '',
    customer_group: r.group || '',
    territory: r.territory || '',
    disabled: r.is_active === 0 ? 1 : 0,
    is_active: r.is_active,
    loyalty_points: r.loyalty_points ?? 0,
    credit_limit: r.credit_limit ?? 0,
    wallet_balance: r.wallet_balance ?? 0,
    id: r.id,
  };
}

def('DyPOS.api.customers.get_customers', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const search = String(params.search_term || params.q || '').trim().slice(0, 64);
  const limit = Math.min(Math.max(Number(params.limit) || 100, 0) || 500, 500);
  const start = Math.max(Number(params.start) || 0, 0);
  const modifiedSince = params.modified_since ? String(params.modified_since) : null;
  let where = '1=1';
  const sqlParams = [];
  if (search) {
    const like = `%${search}%`;
    where += ' AND (name LIKE ? OR phone LIKE ? OR id LIKE ?)';
    sqlParams.push(like, like, like);
  }
  if (modifiedSince) {
    where += ' AND updated_at > ?';
    sqlParams.push(modifiedSince);
  }
  try {
    const rows = db.prepare(
      `SELECT * FROM customers WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`
    ).all(...sqlParams, limit || 500, start);
    return res.json({ message: rows.map(mapCustomer) });
  } catch {
    return res.json({ message: [] });
  }
});

// ── Offers ───────────────────────────────────────────────────────────────
def('DyPOS.api.offers.get_offers', (_params, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const rows = db.prepare(`SELECT * FROM offers WHERE is_active=1 ORDER BY created_at DESC LIMIT 100`).all();
    return res.json({ message: rows });
  } catch {
    return res.json({ message: [] });
  }
});

// ── POS profile / settings / warehouses ─────────────────────────────────
def('DyPOS.api.pos_profile.get_warehouses', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const rows = db.prepare('SELECT id as name, id, name as warehouse_name, is_active FROM warehouses ORDER BY id').all();
    return res.json({ message: rows });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.pos_profile.get_pos_profiles', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  const settings = allSettings();
  return res.json({
    message: [{
      name: 'POS',
      pos_profile: 'POS',
      company: settings.business_name || 'DyPOS',
      warehouse: 'W-01',
      country: settings.country_code || 'SA',
      currency: settings.currency || 'SAR',
    }],
  });
});

def('DyPOS.api.pos_profile.get_pos_profile_data', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  const settings = allSettings();
  let warehouses = [];
  try { warehouses = db.prepare('SELECT * FROM warehouses').all(); } catch { /* ignore */ }
  return res.json({
    message: {
      name: 'POS',
      warehouse: warehouses[0]?.id || 'W-01',
      warehouses,
      company: settings.business_name || 'DyPOS',
      currency: settings.currency || 'SAR',
      country: settings.country_code || 'SA',
    },
  });
});

def('DyPOS.api.pos_profile.get_payment_methods', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const rows = db.prepare('SELECT * FROM payment_methods WHERE is_active=1 ORDER BY sort_order').all();
    return res.json({ message: rows });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.pos_profile.get_sales_persons', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const rows = db.prepare('SELECT id, username as name, full_name FROM users WHERE is_active=1').all();
    return res.json({ message: rows });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.pos_profile.get_taxes', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  const rate = Number(getSetting('tax_rate_default', '15')) || 15;
  return res.json({ message: [{ account_head: 'VAT', rate, tax_amount: 0 }] });
});

def('DyPOS.api.pos_profile.get_default_customer', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  return res.json({ message: { name: 'WALK-IN', customer_name: 'عميل نقدي', customer: 'WALK-IN' } });
});

def('DyPOS.DyPOS.doctype.pos_settings.pos_settings.get_pos_settings', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  const s = allSettings();
  return res.json({
    message: {
      allow_negative_stock: s.allow_negative_stock === '1',
      tax_inclusive: s.tax_inclusive === '1',
      require_customer_on_sale: s.require_customer_on_sale === '1',
      tax_rate_default: Number(s.tax_rate_default || 15),
      default_payment_method: s.default_payment_method || '',
      autosave_interval_seconds: Number(s.autosave_interval_seconds || 5),
      pos_profile: 'POS',
    },
  });
});

// ── Shifts ───────────────────────────────────────────────────────────────
def('DyPOS.api.shifts.get_opening_dialog_data', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  let warehouses = [];
  let paymentMethods = [];
  try { warehouses = db.prepare('SELECT * FROM warehouses').all(); } catch { /* ignore */ }
  try { paymentMethods = db.prepare('SELECT * FROM payment_methods WHERE is_active=1 ORDER BY sort_order').all(); } catch { /* ignore */ }
  return res.json({
    message: {
      warehouses,
      payment_methods: paymentMethods,
      currencies: [{ code: getSetting('currency', 'SAR') }],
      open_shifts: db.prepare(`SELECT * FROM shifts WHERE status='OPEN'`).all(),
    },
  });
});

def('DyPOS.api.shifts.create_opening_shift', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const terminalId = String(params.terminal_id || params.terminalId || 'POS-01').slice(0, 32);
  const openingCash = Number(params.opening_cash || params.openingCash) || 0;
  const existing = db.prepare('SELECT id FROM shifts WHERE terminal_id=? AND status=?').get(terminalId, 'OPEN');
  if (existing) return frappeError(res, 409, 'ValidationError', 'يوجد وردية مفتوحة بالفعل');
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO shifts (id,terminal_id,opened_by,opening_cash,status) VALUES (?,?,?,?,?)')
    .run(id, terminalId, req.user.fullName || req.user.username, openingCash, 'OPEN');
  req.audit?.('shift.open', { shiftId: id, terminalId });
  return res.json({ message: { shift_id: id, name: id, terminal_id: terminalId, opening_cash: openingCash, status: 'OPEN' } });
});

def('DyPOS.api.shifts.submit_closing_shift', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const shiftId = String(params.shift || params.shift_id || params.name || '').trim();
  const closingCash = Number(params.closing_cash || params.closingCash) || 0;
  if (!shiftId) return frappeError(res, 400, 'ValidationError', 'shift مطلوب');
  try {
    const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(shiftId);
    if (!shift) return frappeError(res, 404, 'NotFoundError', 'الوردية غير موجودة');
    if (shift.status !== 'OPEN') return frappeError(res, 409, 'ValidationError', 'الوردية ليست مفتوحة');
    const variance = closingCash - (shift.opening_cash || 0);
    db.prepare('UPDATE shifts SET status=?, closing_cash=?, closed_at=datetime(\'now\') WHERE id=?')
      .run('CLOSED', closingCash, shiftId);
    req.audit?.('shift.close', { shiftId, variance });
    return res.json({ message: { shift_id: shiftId, status: 'CLOSED', closing_cash: closingCash, variance } });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e), 'ValidationError', String(e.message || 'فشل الإغلاق').slice(0, 200));
  }
});

// ── Invoices (thin wrappers used by useInvoice / posSync) ────────────────
def('DyPOS.api.invoices.get_invoices', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
  const start = Math.max(Number(params.start) || 0, 0);
  try {
    const rows = db.prepare('SELECT * FROM invoices ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, start);
    return res.json({ message: rows });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.invoices.validate_cart_items', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const items = Array.isArray(params.items) ? params.items : [];
  const issues = [];
  const warehouse = String(params.warehouse || 'W-01').slice(0, 32);
  for (const it of items) {
    const pid = it.product_id || it.productId || it.item_code;
    const qty = Number(it.qty) || 0;
    if (!pid) continue;
    try {
      const row = db.prepare(
        `SELECT COALESCE(s.qty,0) as qty FROM products p
         LEFT JOIN stock_levels s ON s.product_id=p.id AND s.warehouse_id=?
         WHERE p.id=? OR p.code=? LIMIT 1`
      ).get(warehouse, String(pid), String(pid));
      const available = Number(row?.qty) || 0;
      if (qty > available) {
        issues.push({ product_id: pid, requested: qty, available, message: `الكمية المطلوبة (${qty}) تتجاوز المتاح (${available})` });
      }
    } catch { /* skip */ }
  }
  return res.json({ message: { valid: issues.length === 0, issues } });
});

// ── Geo / country info ──────────────────────────────────────────────────
def('frappe.geo.country_info.get_country_timezone_info', (_p, _req, res) => {
  return res.json({
    message: {
      countries: {
        SA: { timezones: ['Asia/Riyadh'], languages: ['ar', 'en'], animated: 1 },
      },
      country_info: {
        SA: { timezones: ['Asia/Riyadh'], languages: ['ar', 'en'], animated: 1 },
      },
    },
  });
});

// ── Print view (minimal HTML shell — client renders) ────────────────────
def('frappe.www.printview.get_html_and_style', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const doc = params.doc || {};
  const title = doc.number || doc.name || 'DyPOS';
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><pre>${escapeHtml(JSON.stringify(doc, null, 2))}</pre></body></html>`;
  return res.json({ message: { html, styles: '' } });
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── upload_file (multipart or JSON base64) ──────────────────────────────
// Dispatch signature is (params, req, res) — match every other handler.
async function handleUpload(_params, req, res) {
  if (!requireUser(req, res)) return;
  const ct = String(req.headers['content-type'] || '');
  let filename = 'upload.bin';
  let buffer = null;
  let folder = 'Home/Attachments';

  if (ct.includes('multipart/form-data') && req.body?.file) {
    // express.json/urlencoded won't parse multipart — body is raw/empty.
    // Minimal multipart parse from raw stream already consumed?
    // Instead: accept raw multipart via express.raw when type matches — not mounted.
    // Fallback: read from req.body if a custom parser put it there.
    return frappeError(res, 400, 'ValidationError', 'ارفع الصورة كـ JSON base64 أو استخدم REST /api/upload');
  }

  if (ct.includes('application/json') && req.body && typeof req.body === 'object') {
    filename = String(req.body.filename || req.body.file_name || 'upload.png').slice(0, 128).replace(/[^\w.-]/g, '_');
    const b64 = String(req.body.content || req.body.file_base64 || '').split(',').pop();
    if (!b64) return frappeError(res, 400, 'ValidationError', 'محتوى الملف مفقود');
    try { buffer = Buffer.from(b64, 'base64'); } catch { return frappeError(res, 400, 'ValidationError', 'base64 غير صالح'); }
    folder = String(req.body.folder || folder).slice(0, 64);
  } else {
    return frappeError(res, 400, 'ValidationError', 'نوع المحتوى غير مدعوم — استخدم application/json');
  }

  if (!buffer || buffer.length > 5 * 1024 * 1024) {
    return frappeError(res, 400, 'ValidationError', 'حجم الملف يتجاوز 5MB');
  }
  try {
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
    const safeName = `${Date.now()}_${filename}`;
    const dest = join(UPLOAD_DIR, safeName);
    writeFileSync(dest, buffer);
    const fileUrl = `/uploads/${safeName}`;
    return res.json({
      message: {
        file_url: fileUrl,
        file_name: filename,
        name: fileUrl,
        is_private: 0,
        folder,
      },
    });
  } catch (e) {
    return frappeError(res, 500, 'ServerError', String(e.message || 'فشل الرفع').slice(0, 200));
  }
}
def('upload_file', handleUpload);

// ── Country / misc stubs used by createResource ─────────────────────────
def('frappe.client.has_value', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const spec = resolveDoctype(params.doctype);
  if (!spec) return res.json({ message: { exists: false } });
  return res.json({ message: { exists: true } });
});

// ══════════════════════════════════════════════════════════════════════
// Domain methods: invoices / shifts / customers / auth / partials / offers
// ══════════════════════════════════════════════════════════════════════

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseMaybeJson(v) {
  if (v == null) return v;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

function mapInvoiceItemToRest(it) {
  const productId = String(it.item_code || it.productId || it.product_id || '').trim();
  const qty = toNum(it.qty ?? it.quantity, 1);
  const rate = it.rate != null ? toNum(it.rate) : toNum(it.unitPrice);
  const discount = it.discount_amount != null ? toNum(it.discount_amount) : toNum(it.discount);
  const discountPct = toNum(it.discount_percentage);
  const lineGross = qty * rate;
  const disc = discount > 0 ? discount : (discountPct > 0 ? (lineGross * discountPct) / 100 : 0);
  return {
    productId,
    qty,
    unitPrice: rate,
    discount: Math.round(disc * 100) / 100,
    taxRate: it.tax_rate != null ? toNum(it.tax_rate) : undefined,
    uom: it.uom ? String(it.uom).slice(0, 20) : undefined,
    warehouseId: it.warehouse ? String(it.warehouse).slice(0, 32) : undefined,
    isFreeItem: Boolean(Number(it.is_free_item) || it.isFreeItem) || undefined,
    freeQty: it.free_qty != null ? Math.max(0, Math.floor(toNum(it.free_qty))) : undefined,
  };
}

function mapPaymentsFromFrappe(payments) {
  if (!Array.isArray(payments)) return [];
  return payments
    .filter((p) => p && !p.is_customer_credit)
    .map((p) => ({
      method: String(p.mode_of_payment || p.method || 'CASH').toUpperCase().slice(0, 20),
      amount: toNum(p.amount),
      reference: String(p.reference || '').slice(0, 128),
    }))
    .filter((p) => p.amount >= 0)
    .slice(0, 10);
}

function mapInvoiceRowToDoc(inv, items = null, payments = null) {
  const out = {
    name: inv.id,
    id: inv.id,
    invoice_name: inv.id,
    doctype: 'Sales Invoice',
    docstatus: inv.status === 'DRAFT' ? 0 : 1,
    status: inv.status,
    number: inv.number,
    invoice_number: inv.number,
    customer: inv.customer_id || 'WALK-IN',
    customer_name: inv.customer_name,
    customer_id: inv.customer_id,
    subtotal: inv.subtotal,
    total: inv.total,
    grand_total: inv.total,
    base_grand_total: inv.total,
    discount_amount: inv.discount_amount,
    total_taxes_and_charges: inv.tax_amount,
    tax_amount: inv.tax_amount,
    paid_amount: inv.paid_amount,
    outstanding_amount: inv.remaining_amount,
    remaining_amount: inv.remaining_amount,
    change_amount: 0,
    currency: inv.currency || 'SAR',
    shift_id: inv.shift_id,
    terminal_id: inv.terminal_id,
    notes: inv.notes || '',
    is_pos: 1,
    update_stock: 1,
    posting_date: String(inv.created_at || '').slice(0, 10),
    creation: inv.created_at,
    modified: inv.updated_at || inv.created_at,
    created_at: inv.created_at,
  };
  if (items) out.items = items;
  if (payments) out.payments = payments;
  return out;
}

function loadInvoiceFull(id) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
  if (!inv) return null;
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(id);
  const pays = db.prepare('SELECT * FROM payments WHERE invoice_id=?').all(id);
  return { inv, items, pays };
}

/** Create sale or finalize a DRAFT — mirrors routes/invoices.js money/stock rules. */
function createOrFinalizeSale(req, payload) {
  const itemsIn = Array.isArray(payload.items) ? payload.items : [];
  if (!itemsIn.length) throw Object.assign(new Error('سلة فارغة'), { statusCode: 400 });

  const items = itemsIn.map(mapInvoiceItemToRest).filter((i) => i.productId);
  if (!items.length) throw Object.assign(new Error('سلة فارغة'), { statusCode: 400 });

  const paymentsIn = Array.isArray(payload.payments) && payload.payments.length
    ? mapPaymentsFromFrappe(payload.payments)
    : [];

  const customerId = String(payload.customerId || payload.customer || '').trim().slice(0, 64) || null;
  const customerName = String(payload.customerName || payload.customer_name || 'Walk-in Customer').trim().slice(0, 200) || 'Walk-in Customer';
  const shiftId = String(payload.shiftId || payload.posa_pos_opening_shift || payload.shift_id || '').trim().slice(0, 64) || null;
  const terminalId = String(payload.terminalId || payload.terminal_id || 'POS-01').trim().slice(0, 32);
  const warehouseDefault = String(payload.warehouseId || payload.warehouse || 'W-01').trim().slice(0, 32) || 'W-01';
  const discountAmount = toNum(payload.discountAmount ?? payload.discount_amount);
  const couponCodeRaw = String(payload.couponCode || payload.coupon_code || '').trim().toUpperCase().slice(0, 64);
  const currency = String(payload.currency || getSetting('currency', 'SAR')).slice(0, 10).toUpperCase();
  const notes = String(payload.notes || '').slice(0, 1000);
  const idemKey = String(payload.idempotencyKey || '').trim().slice(0, 128) || null;
  const draftId = String(payload.existingId || payload.name || '').trim().slice(0, 64) || null;
  const writeOffAmount = Math.max(0, toNum(payload.write_off_amount));

  if (idemKey) {
    const existing = db.prepare('SELECT id FROM invoices WHERE idempotency_key=? LIMIT 1').get(idemKey);
    if (existing) {
      const full = loadInvoiceFull(existing.id);
      if (full) return { deduped: true, ...mapInvoiceRowToDoc(full.inv, full.items, full.pays) };
    }
  }

  const ids = [...new Set(items.map((i) => String(i.productId)))];
  const ph = ids.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id,code,name,name_ar,barcode,unit_price,tax_rate FROM products WHERE id IN (${ph}) OR code IN (${ph})`).all(...ids, ...ids);
  const byKey = new Map();
  for (const r of rows) {
    byKey.set(r.id, r);
    if (r.code) byKey.set(r.code, r);
  }
  for (const pid of ids) {
    if (!byKey.has(pid)) throw Object.assign(new Error(`صنف غير موجود: ${pid}`.slice(0, 200)), { statusCode: 400 });
  }

  const draftRow = draftId ? db.prepare("SELECT id, status, number FROM invoices WHERE id=?").get(draftId) : null;
  const isDraftFinalize = Boolean(draftRow && draftRow.status === 'DRAFT');
  const invoiceId = isDraftFinalize ? draftId : crypto.randomUUID();

  const insertItem = db.prepare(`INSERT INTO invoice_items (id,invoice_id,product_id,product_name,name_ar,barcode,qty,unit_price,discount,tax_rate,tax_amount,total,uom,warehouse_id,free_qty,is_free_item) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertPayment = db.prepare(`INSERT INTO payments (id,invoice_id,method,amount,reference) VALUES (?,?,?,?,?)`);
  const stockGuardMode = String(process.env.DYPOS_STOCK_GUARD || 'legacy').trim().toLowerCase() === 'strict' ? 'strict' : 'legacy';
  const selectStockRow = db.prepare('SELECT qty, reserved_qty FROM stock_levels WHERE product_id=? AND warehouse_id=?');
  const guardedDecr = db.prepare('UPDATE stock_levels SET qty=qty+?,updated_at=datetime(\'now\') WHERE product_id=? AND warehouse_id=? AND qty+?>=reserved_qty');
  const upsertStock = db.prepare('INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime(\'now\')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=qty+excluded.qty,updated_at=datetime(\'now\')');
  const ensureWh = db.prepare('INSERT OR IGNORE INTO warehouses (id,name) VALUES (?,?)');
  const taxInclusive = getSetting('tax_inclusive', '0') === '1';

  const out = db.transaction(() => {
    ensureWh.run(warehouseDefault, warehouseDefault === 'W-01' ? 'المستودع الرئيسي' : warehouseDefault);
    for (const it of items) {
      const w = it.warehouseId || warehouseDefault;
      if (w !== warehouseDefault) ensureWh.run(w, w);
    }
    if (shiftId) {
      const sh = db.prepare('SELECT id, status FROM shifts WHERE id=?').get(shiftId);
      if (sh && sh.status !== 'OPEN') {
        throw Object.assign(new Error('البيع على وردية مغلقة مرفوض'), { statusCode: 409 });
      }
    }

    let number;
    const needsNewNumber = !isDraftFinalize || !draftRow?.number || String(draftRow.number).startsWith('DRAFT-');
    if (needsNewNumber) {
      const fiscalYear = yearOf();
      ensureOpenFiscalYear(fiscalYear);
      const seqScope = `STD/${fiscalYear}`;
      const seqPrefix = invoicePrefix();
      db.prepare('INSERT OR IGNORE INTO invoice_sequences (scope,prefix,last_number) VALUES (?,?,0)').run(seqScope, seqPrefix);
      db.prepare('UPDATE invoice_sequences SET last_number=last_number+1,updated_at=datetime(\'now\') WHERE scope=?').run(seqScope);
      const seqNo = Number(db.prepare('SELECT last_number FROM invoice_sequences WHERE scope=?').get(seqScope)?.last_number) || 0;
      if (!(seqNo > 0)) throw new Error('تعذر تخصيص رقم الفاتورة');
      number = `${seqPrefix}-${fiscalYear}-${String(seqNo).padStart(6, '0')}`;
    } else {
      number = draftRow.number;
    }

    if (isDraftFinalize) {
      db.prepare('DELETE FROM invoice_items WHERE invoice_id=?').run(invoiceId);
      db.prepare('DELETE FROM payments WHERE invoice_id=?').run(invoiceId);
    } else {
      // Header FIRST: invoice_items/payments have FK → invoices(id).
      try {
        db.prepare(`INSERT INTO invoices (id,number,customer_id,customer_name,subtotal,discount_amount,tax_amount,total,paid_amount,remaining_amount,status,currency,notes,shift_id,terminal_id,idempotency_key,created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(invoiceId, number, customerId, customerName, 0, 0, 0, 0, 0, 0, 'UNPAID', currency, notes, shiftId, terminalId, idemKey, req.user?.username || null);
      } catch (e) {
        if (idemKey && /UNIQUE|CONFLICT/i.test(String(e.message))) {
          const dup = db.prepare('SELECT id FROM invoices WHERE idempotency_key=?').get(idemKey);
          if (dup) {
            const full = loadInvoiceFull(dup.id);
            if (full) return { deduped: true, ...mapInvoiceRowToDoc(full.inv, full.items, full.pays) };
          }
        }
        throw e;
      }
    }

    let subtotalMinor = 0;
    let taxTotalMinor = 0;
    for (const it of items) {
      const product = byKey.get(it.productId);
      const qty = toNum(it.qty, 1);
      if (!(qty > 0) || qty > 100000) throw Object.assign(new Error(`كمية غير صالحة للصنف ${product.id}`), { statusCode: 400 });
      const price = it.unitPrice != null ? toNum(it.unitPrice) : toNum(product.unit_price);
      if (!(Number.isFinite(price) && price >= 0)) {
        throw Object.assign(new Error(`سعر غير صالح للصنف ${product.id}`), { statusCode: 400 });
      }
      const discountMinor = clampMinor(toMinor(it.discount), toMinor(qty * price));
      const taxRate = it.taxRate != null ? Math.max(0, Math.min(toNum(it.taxRate), 100)) : toNum(product.tax_rate, defaultTaxRate());
      const lineGrossMinor = toMinor(qty * price) - discountMinor;
      let lineNetMinor = lineGrossMinor;
      let lineTaxMinor = pctOf(lineGrossMinor, taxRate);
      if (taxInclusive && taxRate > 0) {
        lineNetMinor = Math.round((lineGrossMinor * 100) / (100 + taxRate));
        lineTaxMinor = lineGrossMinor - lineNetMinor;
      }
      subtotalMinor += lineNetMinor;
      taxTotalMinor += lineTaxMinor;
      const wh = it.warehouseId || warehouseDefault;
      const isFree = it.isFreeItem ? 1 : 0;
      const freeQty = isFree ? 0 : (Number(it.freeQty) || 0);
      insertItem.run(
        crypto.randomUUID(), invoiceId, product.id, product.name, product.name_ar || '', product.barcode,
        qty, price, toMajor(discountMinor), taxRate, toMajor(lineTaxMinor), toMajor(lineNetMinor + lineTaxMinor),
        String(it.uom || 'Unit').slice(0, 20), wh, freeQty, isFree,
      );
      const tracked = selectStockRow.get(product.id, wh);
      const trackedQty = tracked ? Number(tracked.qty) : null;
      if (tracked && trackedQty >= 0) {
        const ch = guardedDecr.run(-qty, product.id, wh, -qty);
        if (ch.changes === 0) {
          throw Object.assign(new Error(`الكمية المتوفرة غير كافية لصنف ${product.id} في المستودع ${wh} (المتاح ${Math.max(0, trackedQty - Number(tracked.reserved_qty || 0))})`), { statusCode: 409 });
        }
      } else if (stockGuardMode === 'strict') {
        throw Object.assign(new Error(`الكمية المتوفرة غير كافية لصنف ${product.id} (DYPOS_STOCK_GUARD=strict)`), { statusCode: 409 });
      } else {
        upsertStock.run(product.id, wh, -qty);
      }
    }

    const grossMinor = subtotalMinor + taxTotalMinor;
    let couponDiscountMinor = 0;
    if (couponCodeRaw) {
      const c = db.prepare('SELECT * FROM coupons WHERE code=?').get(couponCodeRaw);
      if (!c) throw Object.assign(new Error('الكوبون غير موجود'), { statusCode: 404 });
      const r = computeCouponDiscount(c, toMajor(grossMinor));
      if (!r.ok) throw Object.assign(new Error(r.error), { statusCode: 400 });
      couponDiscountMinor = Math.min(toMinor(r.discount), Math.max(0, grossMinor - toMinor(discountAmount)));
      const inc = db.prepare('UPDATE coupons SET used_count=used_count+1 WHERE code=? AND (max_uses=0 OR used_count < max_uses)').run(couponCodeRaw);
      if (inc.changes === 0) throw Object.assign(new Error('تجاوز حد استخدام الكوبون (تعارض تزامن)'), { statusCode: 409 });
    }

    const manualDiscountMinor = clampMinor(toMinor(discountAmount), grossMinor);
    const discountAmountMinor = Math.min(manualDiscountMinor + couponDiscountMinor, grossMinor);
    const totalMinor = grossMinor - discountAmountMinor;
    if (totalMinor < 0) throw Object.assign(new Error('إجمالي غير صالح'), { statusCode: 400 });
    const writeOffMinor = clampMinor(toMinor(writeOffAmount), totalMinor);
    const afterWriteOffMinor = totalMinor - writeOffMinor;

    const subtotal = toMajor(subtotalMinor);
    const taxTotal = toMajor(taxTotalMinor);
    const discountTotal = toMajor(discountAmountMinor);

    let paidMinor = 0;
    const payList = paymentsIn.length ? paymentsIn : [];
    for (const p of payList) {
      const amt = toNum(p.amount);
      if (amt < 0 || amt > 10_000_000) throw Object.assign(new Error('مبلغ دفعة غير صالح'), { statusCode: 400 });
      const pm = String(p.method || 'CASH').toUpperCase().slice(0, 20);
      paidMinor += toMinor(amt);
      insertPayment.run(crypto.randomUUID(), invoiceId, pm, amt, String(p.reference || '').slice(0, 128));
    }

    const changeMinor = Math.max(0, paidMinor - afterWriteOffMinor);
    const paidMinorCapped = paidMinor - changeMinor;
    const remainingMinor = Math.max(0, afterWriteOffMinor - paidMinorCapped);
    const paidAmount = toMajor(paidMinorCapped);
    const remainingAmount = toMajor(remainingMinor);
    const change = toMajor(changeMinor);
    const total = toMajor(afterWriteOffMinor);
    const status = remainingMinor <= 1 ? 'PAID' : paidMinorCapped <= 0 ? 'UNPAID' : 'PARTIAL';

    if (remainingAmount > 0.01 && customerId) {
      const cust = db.prepare('SELECT credit_limit, credit_used FROM customers WHERE id=?').get(customerId);
      if (cust) {
        const lim = Number(cust.credit_limit) || 0;
        const used = Number(cust.credit_used) || 0;
        if (lim > 0 && used + remainingAmount - lim > 0.01) {
          throw Object.assign(new Error(`تجاوز حد الائتمان (المتاح ${(lim - used).toFixed(2)})`), { statusCode: 402 });
        }
        db.prepare('UPDATE customers SET credit_used=credit_used+?,updated_at=datetime(\'now\') WHERE id=?').run(remainingAmount, customerId);
      }
    }

    // Finalize header row (draft update or new-sale fill-in after placeholder insert).
    db.prepare(`UPDATE invoices SET number=?,customer_id=?,customer_name=?,subtotal=?,discount_amount=?,tax_amount=?,total=?,paid_amount=?,remaining_amount=?,status=?,currency=?,notes=?,shift_id=?,terminal_id=?,idempotency_key=?,paid_at=?,updated_by=?,updated_at=datetime('now') WHERE id=?`)
      .run(number, customerId, customerName, subtotal, discountTotal, taxTotal, total, paidAmount, remainingAmount, status, currency, notes, shiftId, terminalId, idemKey, status === 'PAID' ? new Date().toISOString() : null, req.user?.username || null, invoiceId);

    if (customerId && status === 'PAID') {
      const pts = Math.floor(total / 10);
      if (pts > 0) {
        db.prepare('UPDATE customers SET loyalty_points=loyalty_points+? WHERE id=?').run(pts, customerId);
      }
    }

    try { appendChain(invoiceId, { number, total, status, action: 'CREATE' }); } catch { /* chain never breaks sales */ }

    const invRow = db.prepare('SELECT * FROM invoices WHERE id=?').get(invoiceId);
    const itemRows = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(invoiceId);
    const payRows = db.prepare('SELECT * FROM payments WHERE invoice_id=?').all(invoiceId);
    return {
      ...mapInvoiceRowToDoc(invRow, itemRows, payRows),
      change_amount: change,
      paid_amount: paidAmount,
      outstanding_amount: remainingAmount,
      grand_total: total,
      total,
      status,
      success: true,
    };
  })();

  req.audit?.('invoice.create', { invoiceId: out.id, total: out.total, via: 'method' });
  return out;
}

// ── Invoices: update / submit / get / offers / cleanup ──────────────────
def('DyPOS.api.invoices.update_invoice', (params, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const data = parseMaybeJson(params.data) || {};
    const rawItems = Array.isArray(data.items) ? data.items : [];
    if (!rawItems.length) return frappeError(res, 400, 'ValidationError', 'سلة فارغة');

    const restItems = rawItems.map(mapInvoiceItemToRest);
    const payments = mapPaymentsFromFrappe(data.payments);
    const customerId = String(data.customer || data.customerId || '').trim() || null;
    const customerRow = customerId ? db.prepare('SELECT id, name FROM customers WHERE id=?').get(customerId) : null;
    const customerName = customerRow?.name || String(data.customer_name || 'Walk-in Customer').slice(0, 200);

    // Compute provisional totals for the draft header.
    let subtotalMinor = 0;
    let taxMinor = 0;
    const taxInclusive = getSetting('tax_inclusive', '0') === '1';
    for (const it of restItems) {
      const product = db.prepare('SELECT id, code, name, unit_price, tax_rate FROM products WHERE id=? OR code=? LIMIT 1').get(it.productId, it.productId);
      const qty = toNum(it.qty, 1);
      const price = it.unitPrice != null ? toNum(it.unitPrice) : toNum(product?.unit_price);
      const discountMinor = clampMinor(toMinor(it.discount), toMinor(qty * price));
      const taxRate = it.taxRate != null ? toNum(it.taxRate) : toNum(product?.tax_rate, defaultTaxRate());
      const lineGross = toMinor(qty * price) - discountMinor;
      let net = lineGross;
      let tax = pctOf(lineGross, taxRate);
      if (taxInclusive && taxRate > 0) {
        net = Math.round((lineGross * 100) / (100 + taxRate));
        tax = lineGross - net;
      }
      subtotalMinor += net;
      taxMinor += tax;
    }
    const discountMinor = clampMinor(toMinor(toNum(data.discount_amount ?? data.discountAmount)), subtotalMinor + taxMinor);
    const totalMinor = Math.max(0, subtotalMinor + taxMinor - discountMinor);

    const existingName = String(data.name || '').trim().slice(0, 64);
    const existing = existingName ? db.prepare("SELECT id FROM invoices WHERE id=? AND status='DRAFT'").get(existingName) : null;
    const id = existing?.id || crypto.randomUUID();
    const number = existing ? (db.prepare('SELECT number FROM invoices WHERE id=?').get(id)?.number || `DRAFT-${id.slice(0, 8).toUpperCase()}`) : `DRAFT-${id.slice(0, 8).toUpperCase()}`;
    const shiftId = String(data.posa_pos_opening_shift || data.shift_id || '').trim().slice(0, 64) || null;
    const terminalId = String(data.terminal_id || 'POS-01').trim().slice(0, 32);

    if (existing) {
      db.prepare(`UPDATE invoices SET customer_id=?,customer_name=?,subtotal=?,discount_amount=?,tax_amount=?,total=?,notes=?,shift_id=?,terminal_id=?,updated_by=?,updated_at=datetime('now') WHERE id=?`)
        .run(customerId, customerName, toMajor(subtotalMinor), toMajor(discountMinor), toMajor(taxMinor), toMajor(totalMinor), String(data.notes || '').slice(0, 1000), shiftId, terminalId, req.user?.username || null, id);
    } else {
      db.prepare(`INSERT INTO invoices (id,number,customer_id,customer_name,subtotal,discount_amount,tax_amount,total,paid_amount,remaining_amount,status,currency,notes,shift_id,terminal_id,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, number, customerId, customerName, toMajor(subtotalMinor), toMajor(discountMinor), toMajor(taxMinor), toMajor(totalMinor), 0, toMajor(totalMinor), 'DRAFT', String(data.currency || getSetting('currency', 'SAR')).slice(0, 10), String(data.notes || '').slice(0, 1000), shiftId, terminalId, req.user?.username || null);
    }

    // Persist draft children so get_invoice / finalize can reload them.
    db.transaction(() => {
      db.prepare('DELETE FROM invoice_items WHERE invoice_id=?').run(id);
      db.prepare('DELETE FROM payments WHERE invoice_id=?').run(id);
      const insertItem = db.prepare(`INSERT INTO invoice_items (id,invoice_id,product_id,product_name,name_ar,barcode,qty,unit_price,discount,tax_rate,tax_amount,total,uom,warehouse_id,free_qty,is_free_item) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const it of restItems) {
        const product = db.prepare('SELECT id,code,name,name_ar,barcode,unit_price,tax_rate FROM products WHERE id=? OR code=? LIMIT 1').get(it.productId, it.productId);
        if (!product) continue;
        const qty = toNum(it.qty, 1);
        const price = it.unitPrice != null ? toNum(it.unitPrice) : toNum(product.unit_price);
        const discountMinor = clampMinor(toMinor(it.discount), toMinor(qty * price));
        const taxRate = it.taxRate != null ? toNum(it.taxRate) : toNum(product.tax_rate, defaultTaxRate());
        const lineGross = toMinor(qty * price) - discountMinor;
        let net = lineGross;
        let tax = pctOf(lineGross, taxRate);
        if (taxInclusive && taxRate > 0) {
          net = Math.round((lineGross * 100) / (100 + taxRate));
          tax = lineGross - net;
        }
        const wh = it.warehouseId || 'W-01';
        insertItem.run(
          crypto.randomUUID(), id, product.id, product.name, product.name_ar || '', product.barcode || '',
          qty, price, toMajor(discountMinor), taxRate, toMajor(tax), toMajor(net + tax),
          String(it.uom || 'Unit').slice(0, 20), wh, Number(it.freeQty) || 0, it.isFreeItem ? 1 : 0,
        );
      }
      const insertPayment = db.prepare('INSERT INTO payments (id,invoice_id,method,amount,reference) VALUES (?,?,?,?,?)');
      for (const p of payments) {
        insertPayment.run(crypto.randomUUID(), id, p.method, p.amount, p.reference || '');
      }
    })();

    const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
    const doc = {
      ...mapInvoiceRowToDoc(inv),
      docstatus: 0,
      status: 'DRAFT',
      items: rawItems,
      payments,
      grand_total: inv.total,
      pos_profile: data.pos_profile || 'POS',
      customer: customerId || 'WALK-IN',
      is_pos: 1,
      update_stock: 1,
    };
    req.audit?.('invoice.draft', { invoiceId: id });
    return res.json({ message: doc, data: doc });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 400), 'ValidationError', String(e.message || 'فشل حفظ المسودة').slice(0, 300));
  }
});

def('DyPOS.api.invoices.submit_invoice', (params, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const invoice = parseMaybeJson(params.invoice) || {};
    const data = parseMaybeJson(params.data) || {};
    const source = (invoice && Object.keys(invoice).length ? invoice : (data && Object.keys(data).length ? data : params)) || {};
    const rawItems = Array.isArray(source.items) ? source.items
      : Array.isArray(data.items) ? data.items
        : Array.isArray(params.items) ? params.items
          : [];
    if (!rawItems.length) return frappeError(res, 400, 'ValidationError', 'سلة فارغة');

    const customerIdRaw = String(source.customer || source.customerId || data.customer || params.customer || '').trim();
    let customerId = customerIdRaw || null;
    let customerName = String(source.customer_name || data.customer_name || '').trim();
    if (customerId && customerId !== 'WALK-IN') {
      const crow = db.prepare('SELECT id, name FROM customers WHERE id=?').get(customerId);
      if (crow) customerName = customerName || crow.name;
    } else {
      customerId = customerIdRaw && customerIdRaw !== 'WALK-IN' ? customerIdRaw : null;
    }
    if (!customerName) customerName = customerId ? (db.prepare('SELECT name FROM customers WHERE id=?').get(customerId)?.name || 'Walk-in Customer') : 'Walk-in Customer';

    let payments = mapPaymentsFromFrappe(source.payments || data.payments || params.payments || []);
    if (!payments.length && (params.mode_of_payment || params.amount != null)) {
      payments = mapPaymentsFromFrappe([{ mode_of_payment: params.mode_of_payment || 'CASH', amount: params.amount }]);
    }
    const draftId = String(source.name || invoice.name || data.name || '').trim().slice(0, 64) || null;
    const isDraft = draftId ? Boolean(db.prepare("SELECT id FROM invoices WHERE id=? AND status='DRAFT'").get(draftId)) : false;

    const payload = {
      items: rawItems,
      payments,
      customerId,
      customerName,
      warehouseId: source.warehouse || data.warehouse || params.warehouse || 'W-01',
      shiftId: source.posa_pos_opening_shift || source.shift_id || data.shift_id || '',
      terminalId: source.terminal_id || data.terminal_id || 'POS-01',
      discountAmount: toNum(source.discount_amount ?? data.discount_amount ?? params.discount_amount),
      couponCode: source.coupon_code || data.coupon_code || '',
      currency: source.currency || data.currency || getSetting('currency', 'SAR'),
      notes: source.notes || data.notes || '',
      idempotencyKey: data.idempotencyKey || source.idempotencyKey || params.idempotencyKey || '',
      change_amount: toNum(data.change_amount ?? params.change_amount),
      write_off_amount: toNum(data.write_off_amount ?? params.write_off_amount),
      existingId: isDraft ? draftId : null,
      name: isDraft ? draftId : null,
    };

    const out = createOrFinalizeSale(req, payload);
    req.audit?.('invoice.submit', { invoiceId: out.id, total: out.total, status: out.status });
    return res.json({ message: out, data: out });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 400), 'ValidationError', String(e.message || 'فشل إرسال الفاتورة').slice(0, 300));
  }
});

def('DyPOS.api.invoices.get_invoice', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const id = String(params.invoice_name || params.name || params.invoice || params.id || '').trim().slice(0, 64);
  if (!id) return frappeError(res, 400, 'ValidationError', 'invoice_name مطلوب');
  const full = loadInvoiceFull(id);
  if (!full) return frappeError(res, 404, 'NotFoundError', 'الفاتورة غير موجودة');
  const doc = mapInvoiceRowToDoc(full.inv, full.items, full.pays);
  return res.json({ message: doc, ...doc });
});

def('DyPOS.api.invoices.apply_offers', (params, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const invoiceData = parseMaybeJson(params.invoice_data) || {};
    const selected = parseMaybeJson(params.selected_offers) || [];
    const selectedList = (Array.isArray(selected) ? selected : [selected]).map((s) => String(s)).filter(Boolean);
    const rawItems = Array.isArray(invoiceData.items) ? invoiceData.items : [];
    if (!rawItems.length) return frappeError(res, 400, 'ValidationError', 'items مطلوبة');

    const customerId = String(invoiceData.customer || '').trim() || null;
    const headerDiscountIn = toNum(invoiceData.discount_amount);

    let subtotal = 0;
    const lines = [];
    for (const it of rawItems) {
      const code = String(it.item_code || it.productId || '').trim();
      const qty = toNum(it.qty ?? it.quantity, 1);
      const rate = toNum(it.rate ?? it.unitPrice);
      const priceListRate = toNum(it.price_list_rate, rate);
      const lineDisc = toNum(it.discount_amount);
      const lineNet = Math.max(0, qty * priceListRate - lineDisc);
      subtotal += lineNet;
      lines.push({ item_code: code, qty, rate, price_list_rate: priceListRate, discount_amount: lineDisc, amount: lineNet, ref: it });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    const totalQty = lines.reduce((a, l) => a + l.qty, 0);
    const todayStr = new Date().toISOString().slice(0, 10);

    let boughtBefore = false;
    if (customerId) {
      boughtBefore = Boolean(db.prepare(`SELECT 1 FROM invoices WHERE customer_id=? AND status IN ('PAID','PARTIAL','UNPAID') LIMIT 1`).get(customerId));
    }

    const offers = db.prepare(`SELECT * FROM offers WHERE is_active=1 AND (valid_from IS NULL OR substr(valid_from,1,10)<=?) AND (valid_to IS NULL OR substr(valid_to,1,10)>=?)`).all(todayStr, todayStr);
    const byName = new Map(offers.map((o) => [o.name, o]));
    const byId = new Map(offers.map((o) => [o.id, o]));

    const outItems = rawItems.map((it) => ({
      item_code: it.item_code,
      item_name: it.item_name,
      qty: toNum(it.qty ?? it.quantity, 1),
      rate: toNum(it.rate),
      price_list_rate: toNum(it.price_list_rate, toNum(it.rate)),
      discount_amount: toMinor(toNum(it.discount_amount)),
      discount_percentage: toNum(it.discount_percentage),
      amount: toMinor(toNum(it.amount)),
      uom: it.uom,
      warehouse: it.warehouse,
      is_free_item: Number(it.is_free_item) || 0,
      pricing_rules: it.pricing_rules || null,
    }));

    const freeItems = [];
    const appliedRules = [];
    let headerDiscount = 0;
    let applyDiscountOn = null;

    const activeNames = selectedList.length ? selectedList : offers.filter((o) => Number(o.one_time_per_customer) !== 1 || !boughtBefore).map((o) => o.name);

    for (const key of activeNames) {
      const offer = byName.get(key) || byId.get(key) || offers.find((o) => String(o.id) === key || String(o.name) === key);
      if (!offer) continue;
      if (Number(offer.one_time_per_customer) === 1 && boughtBefore) continue;
      if (Number(offer.min_amount) > 0 && subtotal < Number(offer.min_amount)) continue;
      if (Number(offer.min_qty) > 0 && totalQty < Number(offer.min_qty)) continue;

      if (offer.type === 'PERCENT') {
        let off = (subtotal * Number(offer.value)) / 100;
        if (Number(offer.max_amount) > 0) off = Math.min(off, Number(offer.max_amount));
        off = Math.round(Math.min(Math.max(off, 0), subtotal) * 100) / 100;
        if (off > 0) {
          appliedRules.push(offer.name);
          // Apply as line discounts proportionally when no transaction rule flag.
          headerDiscount += off;
          applyDiscountOn = 'Grand Total';
        }
      } else if (offer.type === 'FIXED') {
        const off = Math.round(Math.min(Number(offer.value), subtotal) * 100) / 100;
        if (off > 0) {
          appliedRules.push(offer.name);
          headerDiscount += off;
          applyDiscountOn = 'Grand Total';
        }
      } else if (offer.type === 'BXGY') {
        const buy = Math.max(1, Math.floor(Number(offer.min_qty) || 1));
        const free = Math.max(1, Math.floor(Number(offer.value) || 1));
        let any = false;
        for (const ln of lines) {
          const sets = Math.floor(ln.qty / buy);
          if (sets <= 0) continue;
          let freeQty = sets * free;
          if (Number(offer.max_qty) > 0) freeQty = Math.min(freeQty, Number(offer.max_qty));
          if (freeQty > 0) {
            freeItems.push({ item_code: ln.item_code, qty: freeQty, rate: 0, is_free_item: 1, offer_name: offer.name });
            any = true;
          }
        }
        if (any) appliedRules.push(offer.name);
      }
    }

    // Coupon from invoice_data.coupon_code → header discount (non-cumulative with offers beyond subtotal).
    if (invoiceData.coupon_code) {
      const code = String(invoiceData.coupon_code).trim().toUpperCase();
      const c = db.prepare('SELECT * FROM coupons WHERE code=?').get(code);
      if (c) {
        const r = computeCouponDiscount(c, subtotal);
        if (r.ok) {
          headerDiscount += r.discount;
          applyDiscountOn = applyDiscountOn || 'Grand Total';
          if (!appliedRules.includes(code)) appliedRules.push(code);
        }
      }
    }

    headerDiscount = Math.round(Math.min(headerDiscount + 0, subtotal) * 100) / 100;
    if (headerDiscountIn > 0 && headerDiscount === 0) {
      headerDiscount = headerDiscountIn;
      applyDiscountOn = applyDiscountOn || 'Grand Total';
    }

    return res.json({
      message: {
        items: outItems,
        free_items: freeItems,
        applied_pricing_rules: appliedRules,
        discount_amount: toMinor(headerDiscount),
        apply_discount_on: applyDiscountOn,
        subtotal: toMinor(subtotal),
        success: true,
      },
    });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 400), 'ValidationError', String(e.message || 'فشل تطبيق العروض').slice(0, 300));
  }
});

def('DyPOS.api.invoices.cleanup_old_drafts', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const hours = Math.min(Math.max(toNum(params.max_age_hours, 1), 0.01), 720);
  try {
    const upd = db.transaction(() => {
      const stale = db.prepare(`SELECT id FROM invoices WHERE status='DRAFT' AND created_at < datetime('now', ?)`)
        .all(`-${hours} hours`);
      for (const row of stale) {
        db.prepare('DELETE FROM invoice_items WHERE invoice_id=?').run(row.id);
        db.prepare('DELETE FROM payments WHERE invoice_id=?').run(row.id);
        db.prepare('DELETE FROM invoices WHERE id=?').run(row.id);
      }
      return stale.length;
    })();
    return res.json({ message: { deleted: upd || 0, max_age_hours: hours } });
  } catch (e) {
    return res.json({ message: { deleted: 0, error: String(e.message).slice(0, 120) } });
  }
});

// ── Partial payments ────────────────────────────────────────────────────
function unpaidInvoiceRow(r) {
  return {
    name: r.id,
    id: r.id,
    invoice_name: r.id,
    doctype: 'Sales Invoice',
    customer: r.customer_id || 'WALK-IN',
    customer_name: r.customer_name,
    grand_total: r.total,
    total: r.total,
    outstanding_amount: r.remaining_amount,
    total_outstanding: r.remaining_amount,
    paid_amount: r.paid_amount,
    status: r.status,
    number: r.number,
    posting_date: String(r.created_at || '').slice(0, 10),
    creation: r.created_at,
    modified: r.updated_at || r.created_at,
  };
}

def('DyPOS.api.partial_payments.get_unpaid_invoices', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 200);
  try {
    const rows = db.prepare(
      `SELECT * FROM invoices WHERE status IN ('UNPAID','PARTIAL') AND remaining_amount > 0.01 ORDER BY created_at DESC LIMIT ?`
    ).all(limit);
    return res.json({ message: rows.map(unpaidInvoiceRow) });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.partial_payments.get_unpaid_summary', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const row = db.prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(remaining_amount),0) as total_outstanding, COALESCE(SUM(paid_amount),0) as total_paid
       FROM invoices WHERE status IN ('UNPAID','PARTIAL') AND remaining_amount > 0.01`
    ).get();
    return res.json({ message: { count: row?.count || 0, total_outstanding: row?.total_outstanding || 0, total_paid: row?.total_paid || 0 } });
  } catch {
    return res.json({ message: { count: 0, total_outstanding: 0, total_paid: 0 } });
  }
});

def('DyPOS.api.partial_payments.get_partial_paid_invoices', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
  try {
    const rows = db.prepare(
      `SELECT * FROM invoices WHERE status='PARTIAL' AND remaining_amount > 0.01 ORDER BY created_at DESC LIMIT ?`
    ).all(limit);
    return res.json({ message: rows.map(unpaidInvoiceRow) });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.partial_payments.get_partial_payment_summary', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const row = db.prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(remaining_amount),0) as total_outstanding, COALESCE(SUM(paid_amount),0) as total_paid
       FROM invoices WHERE status='PARTIAL' AND remaining_amount > 0.01`
    ).get();
    return res.json({ message: { count: row?.count || 0, total_outstanding: row?.total_outstanding || 0, total_paid: row?.total_paid || 0 } });
  } catch {
    return res.json({ message: { count: 0, total_outstanding: 0, total_paid: 0 } });
  }
});

def('DyPOS.api.partial_payments.get_partial_payment_details', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const id = String(params.invoice_name || params.name || '').trim().slice(0, 64);
  if (!id) return frappeError(res, 400, 'ValidationError', 'invoice_name مطلوب');
  const full = loadInvoiceFull(id);
  if (!full) return frappeError(res, 404, 'NotFoundError', 'الفاتورة غير موجودة');
  const doc = mapInvoiceRowToDoc(full.inv, full.items, full.pays);
  return res.json({ message: doc, ...doc });
});

def('DyPOS.api.partial_payments.add_payment_to_partial_invoice', (params, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const id = String(params.invoice_name || params.name || '').trim().slice(0, 64);
    if (!id) return frappeError(res, 400, 'ValidationError', 'invoice_name مطلوب');
    const paymentsIn = parseMaybeJson(params.payments) || [];
    const list = mapPaymentsFromFrappe(paymentsIn);
    if (!list.length) return frappeError(res, 400, 'ValidationError', 'payments مطلوبة');

    const out = db.transaction(() => {
      const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
      if (!inv) throw Object.assign(new Error('الفاتورة غير موجودة'), { statusCode: 404 });
      if (['PAID', 'VOIDED', 'RETURNED', 'DRAFT'].includes(inv.status)) {
        throw Object.assign(new Error(inv.status === 'PAID' ? 'الفاتورة مدفوعة بالفعل' : 'لا يمكن الدفع على هذه الفاتورة'), { statusCode: 400 });
      }
      let paidMinor = toMinor(inv.paid_amount);
      const totalMinor = toMinor(inv.total);
      for (const p of list) {
        const amt = toNum(p.amount);
        if (!(amt > 0) || amt > 10_000_000) throw Object.assign(new Error('المبلغ أكبر من صفر'), { statusCode: 400 });
        const pm = String(p.method || 'CASH').toUpperCase().slice(0, 20);
        db.prepare('INSERT INTO payments (id,invoice_id,method,amount,reference) VALUES (?,?,?,?,?)')
          .run(crypto.randomUUID(), inv.id, pm, amt, String(p.reference || '').slice(0, 128));
        paidMinor += toMinor(amt);
      }
      const paidCapped = Math.min(paidMinor, totalMinor);
      const remaining = Math.max(0, totalMinor - paidCapped);
      const status = remaining <= 1 ? 'PAID' : 'PARTIAL';
      db.prepare(`UPDATE invoices SET paid_amount=?,remaining_amount=?,status=?,paid_at=COALESCE(paid_at,?),updated_by=?,updated_at=datetime('now') WHERE id=? AND status NOT IN ('PAID','VOIDED','RETURNED')`)
        .run(toMajor(paidCapped), toMajor(remaining), status, status === 'PAID' ? new Date().toISOString() : null, req.user?.username || null, inv.id);
      if (inv.customer_id && remaining < toMinor(inv.remaining_amount)) {
        const released = toMajor(Math.max(0, toMinor(inv.remaining_amount) - remaining));
        if (released > 0) {
          db.prepare('UPDATE customers SET credit_used=MAX(0,credit_used-?),updated_at=datetime(\'now\') WHERE id=?').run(released, inv.customer_id);
        }
      }
      try { appendChain(inv.id, { number: inv.number, total: inv.total, status, action: 'PAY' }); } catch { /* ignore */ }
      const fresh = db.prepare('SELECT * FROM invoices WHERE id=?').get(inv.id);
      return mapInvoiceRowToDoc(fresh, db.prepare('SELECT * FROM invoice_items WHERE invoice_id=?').all(inv.id), db.prepare('SELECT * FROM payments WHERE invoice_id=?').all(inv.id));
    })();

    req.audit?.('invoice.partial_pay', { invoiceId: id, status: out.status });
    return res.json({ message: out, ...out });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 400), 'ValidationError', String(e.message || 'فشل الدفع').slice(0, 300));
  }
});

// ── Shifts: check / closing data / history ──────────────────────────────
def('DyPOS.api.shifts.check_opening_shift', (params, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const terminal = String(params.terminal_id || params.terminalId || params.pos_profile || '').trim().slice(0, 32);
    const row = terminal
      ? (db.prepare("SELECT * FROM shifts WHERE terminal_id=? AND status='OPEN' LIMIT 1").get(terminal)
        || db.prepare("SELECT * FROM shifts WHERE status='OPEN' ORDER BY opened_at DESC LIMIT 1").get())
      : db.prepare("SELECT * FROM shifts WHERE status='OPEN' ORDER BY opened_at DESC LIMIT 1").get();
    if (!row) return res.json({ message: null });
    const settings = allSettings();
    const posProfile = {
      name: row.terminal_id || 'POS',
      pos_profile: row.terminal_id || 'POS',
      company: settings.business_name || 'DyPOS',
      warehouse: 'W-01',
      currency: settings.currency || 'SAR',
    };
    const message = {
      server_now: new Date().toISOString(),
      pos_opening_shift: {
        name: row.id,
        id: row.id,
        doctype: 'POS Opening Shift',
        period_start_date: row.opened_at,
        opening_cash: row.opening_cash,
        opening_cash_details: [{ denomination: '', amount: row.opening_cash, total: row.opening_cash }],
        status: row.status,
        terminal_id: row.terminal_id,
        created_by: row.opened_by,
      },
      pos_profile: posProfile,
      company: settings.business_name || 'DyPOS',
    };
    return res.json({ message });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 500), 'ServerError', String(e.message || 'خطأ').slice(0, 200));
  }
});

def('DyPOS.api.shifts.get_closing_shift_data', (params, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const opening = parseMaybeJson(params.opening_shift) || {};
    const shiftId = String(opening.name || opening.id || params.shift_id || params.shift || '').trim().slice(0, 64);
    const shift = shiftId ? db.prepare('SELECT * FROM shifts WHERE id=?').get(shiftId)
      : db.prepare("SELECT * FROM shifts WHERE status='OPEN' ORDER BY opened_at DESC LIMIT 1").get();
    if (!shift) return frappeError(res, 404, 'NotFoundError', 'الوردية غير موجودة');
    const stats = db.prepare(`SELECT COUNT(*) as orders_count, COALESCE(SUM(total),0) as total_sales, COALESCE(SUM(paid_amount),0) as paid_total FROM invoices WHERE shift_id=? AND status IN ('PAID','PARTIAL')`).get(shift.id);
    const payments = db.prepare(`SELECT p.method, COALESCE(SUM(p.amount),0) as total, COUNT(*) as count FROM payments p JOIN invoices i ON p.invoice_id=i.id WHERE i.shift_id=? AND i.status IN ('PAID','PARTIAL') GROUP BY p.method`).all(shift.id);
    const cashTotal = payments.filter((p) => p.method === 'CASH').reduce((a, p) => a + toNum(p.total), 0);
    const expected = Math.round((toNum(shift.opening_cash) + cashTotal) * 100) / 100;
    const settings = allSettings();
    return res.json({
      message: {
        shift_id: shift.id,
        name: shift.id,
        status: shift.status,
        period_start_date: shift.opened_at,
        opening_cash: shift.opening_cash,
        expected_cash: expected,
        total_sales: stats.total_sales,
        total_orders: stats.orders_count,
        orders_count: stats.orders_count,
        paid_total: stats.paid_total,
        payments,
        pos_profile: { name: shift.terminal_id || 'POS', pos_profile: shift.terminal_id || 'POS', company: settings.business_name || 'DyPOS', warehouse: 'W-01' },
        company: settings.business_name || 'DyPOS',
        opening_shift: shift,
      },
    });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 404), 'NotFoundError', String(e.message || 'الوردية غير موجودة').slice(0, 200));
  }
});

def('DyPOS.api.shifts.get_shift_history', (params, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const filters = parseMaybeJson(params.filters) || {};
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200);
    const offset = Math.max(Number(params.offset) || 0, 0);
    let where = '1=1';
    const sql = [];
    const status = String(filters.status || '').toUpperCase();
    if (status === 'OPEN' || status === 'CLOSED') { where += ' AND status=?'; sql.push(status); }
    const terminal = String(filters.terminal || filters.terminal_id || '').slice(0, 32);
    if (terminal) { where += ' AND terminal_id=?'; sql.push(terminal); }
    const fromDate = String(filters.from_date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) { where += ' AND opened_at >= ?'; sql.push(`${fromDate} 00:00:00`); }
    const toDate = String(filters.to_date || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(toDate)) { where += ' AND opened_at <= ?'; sql.push(`${toDate} 23:59:59`); }

    const totalRow = db.prepare(`SELECT COUNT(*) as c FROM shifts WHERE ${where}`).get(...sql);
    const rows = db.prepare(`SELECT * FROM shifts WHERE ${where} ORDER BY opened_at DESC LIMIT ? OFFSET ?`).all(...sql, limit, offset);
    const mapped = rows.map((r) => ({
      name: r.id,
      id: r.id,
      doctype: 'POS Closing Shift',
      status: r.status,
      period_start_date: r.opened_at,
      period_end_date: r.closed_at,
      opening_cash: r.opening_cash,
      closing_cash: r.closing_cash,
      expected_cash: r.expected_cash,
      difference: r.variance,
      cash_diff: r.variance,
      sales_total: r.total_sales,
      total_sales: r.total_sales,
      orders_count: r.orders_count,
      terminal_id: r.terminal_id,
      opened_by: r.opened_by,
      closed_by: r.closed_by,
    }));
    const totals = {
      total_sales: mapped.reduce((a, r) => a + toNum(r.sales_total), 0),
      total_cash_diff: mapped.reduce((a, r) => a + toNum(r.difference), 0),
      total_shifts: totalRow?.c || mapped.length,
    };
    return res.json({ message: { rows: mapped, totals, total: totalRow?.c || 0, limit, offset, hasMore: offset + mapped.length < (totalRow?.c || 0) } });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 400), 'ValidationError', String(e.message || 'خطأ').slice(0, 200));
  }
});

// Enhance create_opening_shift response for useShift onSuccess shape when balance_details present
const _origCreateOpening = handlers.get('DyPOS.api.shifts.create_opening_shift')?.handler;
if (_origCreateOpening) {
  def('DyPOS.api.shifts.create_opening_shift', (params, req, res) => {
    // Prefer Frappe-style balance_details / pos_profile payload.
    const balance = parseMaybeJson(params.balance_details);
    const openingCash = params.opening_cash != null ? toNum(params.opening_cash)
      : params.cash_amount != null ? toNum(params.cash_amount)
        : Array.isArray(balance) ? toNum(balance[0]?.opening_amount ?? balance[0]?.amount)
          : toNum(params.openingCash);
    const terminalId = String(params.pos_profile || params.terminal_id || params.terminalId || 'POS-01').slice(0, 32);
    const company = String(params.company || allSettings().business_name || 'DyPOS').slice(0, 200);

    if (!requireUser(req, res)) return;
    try {
      const existing = db.prepare('SELECT id FROM shifts WHERE terminal_id=? AND status=?').get(terminalId, 'OPEN');
      if (existing) return frappeError(res, 409, 'ValidationError', 'يوجد وردية مفتوحة بالفعل');
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO shifts (id,terminal_id,opened_by,opening_cash,status) VALUES (?,?,?,?,?)')
        .run(id, terminalId, req.user.fullName || req.user.username, openingCash, 'OPEN');
      req.audit?.('shift.open', { shiftId: id, terminalId });
      const settings = allSettings();
      const message = {
        shift_id: id,
        name: id,
        terminal_id: terminalId,
        opening_cash: openingCash,
        status: 'OPEN',
        pos_opening_shift: {
          name: id,
          id,
          doctype: 'POS Opening Shift',
          period_start_date: new Date().toISOString(),
          opening_cash: openingCash,
          status: 'OPEN',
          terminal_id: terminalId,
        },
        pos_profile: {
          name: terminalId,
          pos_profile: terminalId,
          company,
          warehouse: 'W-01',
          currency: settings.currency || 'SAR',
        },
        company,
      };
      return res.json({ message });
    } catch (e) {
      return frappeError(res, mapErrorStatus(e, 400), 'ValidationError', String(e.message || 'فشل فتح الوردية').slice(0, 200));
    }
  });
}

// ── Customers: create ───────────────────────────────────────────────────
def('DyPOS.api.customers.create_customer', (params, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const name = String(params.customer_name || params.name || '').trim().slice(0, 200);
    if (!name) return frappeError(res, 400, 'ValidationError', 'اسم العميل مطلوب');
    const phone = String(params.mobile_no || params.phone || '').trim().slice(0, 32);
    if (phone && !/^[+\d][\d\s-]{5,30}$/.test(phone)) return frappeError(res, 400, 'ValidationError', 'رقم الجوال غير صالح');
    const email = String(params.email_id || params.email || '').trim().slice(0, 128);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return frappeError(res, 400, 'ValidationError', 'البريد الإلكتروني غير صالح');

    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO customers (id,name,phone,email,tax_number,loyalty_tier,credit_limit,address,created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, name, phone || null, email || null, String(params.tax_number || '').trim().slice(0, 64) || null,
        'BRONZE', Math.max(0, toNum(params.credit_limit)),
        String([params.custom_district, params.custom_governorate, params.territory].filter(Boolean).join('، ')).slice(0, 500),
        req.user?.username || null);
    req.audit?.('customer.create', { customerId: id });
    const row = db.prepare('SELECT * FROM customers WHERE id=?').get(id);
    const message = {
      ...mapCustomer(row),
      name: id,
      customer_name: name,
      customer: id,
      mobile_no: phone,
      email_id: email,
      customer_group: String(params.customer_group || '').slice(0, 64),
      territory: String(params.territory || '').slice(0, 64),
      success: true,
    };
    return res.json({ message });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 400), 'ValidationError', String(e.message || 'فشل إنشاء العميل').slice(0, 200));
  }
});

// ── Auth: session verify / extend ───────────────────────────────────────
def('DyPOS.api.auth.verify_session_password', async (params, req, res) => {
  if (!requireUser(req, res)) return;
  const password = String(params.password || params.pwd || '');
  if (!password) return frappeError(res, 400, 'ValidationError', 'كلمة المرور مطلوبة');
  try {
    const user = db.prepare('SELECT * FROM users WHERE id=? OR username=? LIMIT 1').get(req.user.id, req.user.username);
    if (!user) return res.json({ message: { verified: false, message: 'المستخدم غير موجود' } });
    let ok = false;
    try { ok = await verifyPasswordAsync(password, user.password_hash); } catch { ok = false; }
    if (!ok) return res.json({ message: { verified: false, message: 'كلمة المرور غير صحيحة' } });
    return res.json({ message: { verified: true, message: 'تم التحقق بنجاح' } });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 500), 'ServerError', String(e.message || 'خطأ').slice(0, 200));
  }
});

def('DyPOS.api.auth.extend_session', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  // Sliding session: issue a fresh token for the same user (rotates jti).
  try {
    const user = db.prepare('SELECT * FROM users WHERE id=? AND is_active=1').get(req.user.id);
    if (!user) return frappeError(res, 404, 'NotFoundError', 'المستخدم غير موجود');
    if (req.token) {
      try { revokeToken(req.token); } catch { /* best-effort */ }
    }
    const token = generateToken(user);
    setAuthCookies(res, token, {
      username: user.username,
      fullName: user.full_name,
    });
    req.audit?.('auth.extend', { userId: user.id });
    return res.json({ message: { extended: true, token } });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 500), 'ServerError', String(e.message || 'خطأ').slice(0, 200));
  }
});

// ── Offers: active coupons + validate ───────────────────────────────────
def('DyPOS.api.offers.get_active_coupons', (_p, req, res) => {
  if (!requireUser(req, res)) return;
  try {
    const t = new Date().toISOString().slice(0, 10);
    const rows = db.prepare(
      `SELECT id, code, discount_type, discount, max_discount, min_purchase, max_uses, used_count, valid_from, valid_to, is_active
       FROM coupons WHERE is_active=1 AND (valid_from IS NULL OR valid_from<=?) AND (valid_to IS NULL OR valid_to>=?)
       ORDER BY created_at DESC LIMIT 100`
    ).all(t, t);
    const mapped = rows.map((c) => ({
      ...c,
      name: c.code,
      coupon_name: c.code,
      coupon_code: c.code,
      doctype: 'POS Coupon',
    }));
    return res.json({ message: mapped });
  } catch {
    return res.json({ message: [] });
  }
});

def('DyPOS.api.offers.validate_coupon', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const code = String(params.coupon_code || params.code || '').trim().toUpperCase().slice(0, 64);
  if (!code) return frappeError(res, 400, 'ValidationError', 'الكود مطلوب');
  try {
    const c = db.prepare('SELECT * FROM coupons WHERE code=?').get(code);
    if (!c) return frappeError(res, 404, 'NotFoundError', 'الكوبون غير موجود');
    // subtotal unknown here — validate structure only; amount applied at cart/submit.
    const t = new Date().toISOString().slice(0, 10);
    if (c.valid_from && String(c.valid_from).slice(0, 10) > t) return frappeError(res, 400, 'ValidationError', 'الكوبون لم يبدأ بعد');
    if (c.valid_to && String(c.valid_to).slice(0, 10) < t) return frappeError(res, 400, 'ValidationError', 'الكوبون منتهي');
    if (Number(c.max_uses) > 0 && Number(c.used_count) >= Number(c.max_uses)) return frappeError(res, 400, 'ValidationError', 'تجاوز حد الاستخدام');
    if (Number(c.is_active) !== 1) return frappeError(res, 400, 'ValidationError', 'الكوبون غير نشط');
    return res.json({
      message: {
        valid: true,
        coupon: { ...c, name: c.code, coupon_code: c.code },
        coupon_code: c.code,
        discount_type: c.discount_type,
        discount: c.discount,
        max_discount: c.max_discount,
        min_purchase: c.min_purchase,
      },
    });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 400), 'ValidationError', String(e.message || 'خطأ').slice(0, 200));
  }
});

// ── Sync (adapter uses dypos.api.sync.pull / push) ──────────────────────
def('DyPOS.api.sync.pull', (params, req, res) => {
  if (!requireUser(req, res)) return;
  const checkpoint = Math.max(parseInt(params.checkpoint, 10) || 0, 0);
  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 500, 1), 2000);
  try {
    const rows = db.prepare('SELECT * FROM sync_log WHERE id>? AND status=? ORDER BY id ASC LIMIT ?')
      .all(checkpoint, 'PENDING', limit);
    const newCheckpoint = rows.length ? rows[rows.length - 1].id : checkpoint;
    return res.json({ message: { changes: rows, checkpoint: newCheckpoint, hasMore: rows.length === limit } });
  } catch (e) {
    return frappeError(res, mapErrorStatus(e, 500), 'ServerError', String(e.message || 'خطأ').slice(0, 200));
  }
});

def('DyPOS.api.sync.push', (params, req, res) => {
  if (!requireUser(req, res)) return;
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) {
    return frappeError(res, 403, 'PermissionError', 'صلاحية غير كافية — الدفع للإدارة فقط');
  }
  const changes = parseMaybeJson(params.changes) || [];
  if (!Array.isArray(changes)) return frappeError(res, 400, 'ValidationError', 'changes يجب أن تكون مصفوفة');
  if (changes.length > 1000) return frappeError(res, 400, 'ValidationError', 'الدفعة تتجاوز 1000 عنصر');
  const results = [];
  for (const ch of changes) {
    try {
      const idemKey = ch?.idempotencyKey != null ? String(ch.idempotencyKey).trim().slice(0, 128) : '';
      if (idemKey) {
        const prior = db.prepare("SELECT id FROM sync_log WHERE idempotency_key=? AND status='SYNCED' LIMIT 1").get(idemKey);
        if (prior) {
          results.push({ id: ch.id, status: 'SYNCED', deduped: true });
          continue;
        }
      }
      if (ch?.entity_type === 'PRODUCT' && ch?.action === 'UPSERT') {
        const p = typeof ch.payload === 'string' ? JSON.parse(ch.payload || '{}') : (ch.payload || {});
        if (!p.id || !p.code || !p.name) throw new Error('بيانات صنف ناقصة');
        db.prepare(`INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,category,brand,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_ar=excluded.name_ar,barcode=excluded.barcode,unit_price=excluded.unit_price,cost=excluded.cost,tax_rate=excluded.tax_rate,uom=excluded.uom,category=excluded.category,brand=excluded.brand,is_active=excluded.is_active,updated_at=datetime('now')`)
          .run(String(p.id).slice(0, 64), String(p.code).slice(0, 64), String(p.name).slice(0, 200), String(p.nameAr || '').slice(0, 200), String(p.barcode || '').slice(0, 64) || null, Number(p.unitPrice) || 0, Number(p.cost) || 0, Number(p.taxRate) || 15, String(p.uom || 'Unit').slice(0, 20), String(p.category || '').slice(0, 64), String(p.brand || '').slice(0, 64), p.isActive === false ? 0 : 1);
      } else if (ch?.entity_type === 'STOCK' && ch?.action === 'UPSERT') {
        const s = typeof ch.payload === 'string' ? JSON.parse(ch.payload || '{}') : (ch.payload || {});
        if (!s.productId || !s.warehouseId) throw new Error('بيانات مخزون ناقصة');
        db.prepare('INSERT OR IGNORE INTO warehouses (id,name) VALUES (?,?)').run(String(s.warehouseId).slice(0, 32), String(s.warehouseId).slice(0, 32));
        db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty) VALUES (?,?,?) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=excluded.qty,updated_at=datetime('now')`)
          .run(String(s.productId).slice(0, 64), String(s.warehouseId).slice(0, 32), Number(s.qty) || 0);
      } else if (String(ch?.entity_type || '').toUpperCase() === 'INVOICE') {
        throw new Error('مزامنة الفواتير غير مدعومة بعد — أعد إرسال البيع عبر POST /api/invoices');
      } else {
        throw new Error(`نوع مزامنة غير مدعوم: ${String(ch?.entity_type || '?').slice(0, 32)}/${String(ch?.action || '?').slice(0, 32)}`);
      }
      if (ch?.id != null) {
        db.prepare(`UPDATE sync_log SET status='SYNCED',synced_at=datetime('now'),
          idempotency_key=CASE WHEN ?<>'' THEN ? ELSE idempotency_key END
          WHERE id=?`).run(idemKey, idemKey || null, ch.id);
      }
      results.push({ id: ch?.id, status: 'SYNCED' });
    } catch (e) {
      results.push({ id: ch?.id, status: 'FAILED', error: String(e.message || '').slice(0, 200) });
    }
  }
  return res.json({ message: { results, pushed: results.filter((r) => r.status === 'SYNCED').length, failed: results.filter((r) => r.status === 'FAILED').length } });
});

// ── Lowercase dypos.* aliases (frappe adapter uses dypos.api.*) ─────────
for (const [key, entry] of [...handlers.entries()]) {
  if (key.startsWith('DyPOS.')) {
    const lower = `dypos${key.slice(5)}`;
    if (!handlers.has(lower)) handlers.set(lower, entry);
  }
}
// Bare/frappe login aliases used by adapters
if (!handlers.has('dypos.api.auth.login') && handlers.has('DyPOS.api.auth.login')) {
  handlers.set('dypos.api.auth.login', handlers.get('DyPOS.api.auth.login'));
}

// ── Catch-all dispatcher ─────────────────────────────────────────────────
function dispatch(methodPath, req, res) {
  const entry = handlers.get(methodPath);
  if (!entry) {
    // Alias: strip leading module prefixes for a few known families
    return frappeError(res, 404, 'NotFoundError', `طريقة غير معروفة: ${methodPath}`);
  }
  try {
    const result = entry.handler(paramsOf(req), req, res);
    if (result && typeof result.then === 'function') {
      result.catch((e) => {
        if (!res.headersSent) {
          frappeError(res, mapErrorStatus(e, 500), 'ServerError', String(e.message || 'خطأ في الخادم').slice(0, 200));
        }
      });
    }
  } catch (e) {
    if (!res.headersSent) {
      frappeError(res, mapErrorStatus(e, 500), 'ServerError', String(e.message || 'خطأ في الخادم').slice(0, 200));
    }
  }
}

function methodPathOf(req) {
  // Express strips mount prefix; req.path is e.g. /DyPOS.api.ping
  return req.path.replace(/^\/+/, '');
}

router.use(optionalAuth);

// Bare /api/method (no method path) — must be registered before the wildcards
router.get('/', (_req, res) => res.json({ message: { status: 'ok', router: 'dypos-method' } }));
router.post('/', (_req, res) => res.json({ message: { status: 'ok', router: 'dypos-method' } }));

// Dual GET + POST (frappe-ui call() always POSTs; ping/csrf/translations use GET)
router.get('/*', ah(async (req, res) => {
  dispatch(methodPathOf(req), req, res);
}));
router.post('/*', ah(async (req, res) => {
  dispatch(methodPathOf(req), req, res);
}));

export default router;
export { handlers, AR_TRANSLATIONS, ALLOWED_LOCALES, LOCALE_NAMES, translationsFor };
