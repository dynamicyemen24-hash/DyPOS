/**
 * محدِّدات المعدّل المشتركة — العام والمصادقة.
 *
 * لماذا ملف واحد: كان الاثنان في `server.js` بنفس النافذة (15 دقيقة)
 * ونفس المتجر (مشترك بين العمّال عبر Redis عند `DYPOS_REDIS_URL`) ونفس
 * ترويسة `standardHeaders`. إعدادان متطابقان مكتوبان مرتين هو بالضبط
 * كيف يُعدَّل أحدهما لاحقًا فينسى الآخر بصمت — فيخرج مسار حيّ بلا حدّ.
 *
 * كلا الحدّين قابل للضبط بالبيئة لأن حمل الاختبار يحتاج رفعه دون لمس
 * الشيفرة: `DYPOS_RATE_LIMIT_MAX` و `DYPOS_AUTH_LIMIT_MAX`.
 */

import rateLimit from 'express-rate-limit';

import { createRateStore } from '../lib/rate-store.js';
import { HEALTH_PATHS } from '../lib/health-paths.js';
import { isProduction } from './auth.js';

/** نافذة العدّ بالمللي ثانية — واحدة للاثنتين عن قصد. */
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** الحدّ العام. استثناء الاستيراد الجماعي له سقفه الخاص في `routes/import.js`. */
export const globalRateLimit = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: Number(process.env.DYPOS_RATE_LIMIT_MAX) || (isProduction ? 2000 : 1000),
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateStore(RATE_LIMIT_WINDOW_MS, 'global'),
  skip: (req) => HEALTH_PATHS.has(req.path) || req.path.startsWith('/api/import'),
  message: { error: 'Too many requests. Please try again later.' },
});

/**
 * حدّ المصادقة — أضيق، ويعرف المحاولات الناجحة فلا يُحسب على مستخدم
 * شرعي يدخل عشر مرات متتالية.
 *
 * **البصمة (passkey) ترث هذا الحدّ بلا نقطة تركيب ثانية**: مساراتها
 * مركّبة داخل `routes/auth.js` تحت `/api/auth`، فطقس مصادقة = محاولة
 * دخول. لو رُكّبت في `server.js` بجوار هذا السطر لكان نسيانها لاحقًا
 * يعني نقطة حيّة بلا حماية من التخمين.
 */
export const authRateLimit = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: Number(process.env.DYPOS_AUTH_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateStore(RATE_LIMIT_WINDOW_MS, 'auth'),
  message: { error: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true,
});