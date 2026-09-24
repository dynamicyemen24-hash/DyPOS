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
import { getSetting, allSettings } from '../lib/settings.js';

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
async function handleUpload(req, res) {
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
