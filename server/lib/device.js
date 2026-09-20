/**
 * DyPOS device intelligence (server side, dependency-free).
 *
 * Classifies the caller's User-Agent (mobile / tablet / desktop / bot /
 * unknown), derives UI adaptation hints, and surfaces performance warnings —
 * in Arabic, matching the rest of the API surface.
 *
 * Shares the `type` vocabulary with POS/src/composables/useDevice.js
 * (client side, which refines the class with screen/touch/hardware signals
 * the server can never see — e.g. an iPad reporting a desktop Mac UA).
 */

const BOT_RE = /\b(bot|crawler|spider|crawl|slurp|mediapartners|baidu|yandex|sogou|exabot|facebot|ia_archiver)\b|headless|phantom|playwright|selenium|puppeteer/i;
const TABLET_RE = /ipad|tablet|playbook|kindle|silk(?!.*mobile)|sm-t\d|gt-p\d|nexus\s?(7|9)|xoom|sch-i800/i;
const MOBILE_RE = /iphone|ipod|android.*mobile|mobile|windows phone|blackberry|bb10|opera mini|iemobile|fennec/i;
const IOS_RE = /iphone|ipad|ipod|cpu (?:iphone )?os/i;
const ANDROID_RE = /android/i;
const WINDOWS_RE = /windows nt/i;
const MAC_RE = /mac os x/i;
const LINUX_RE = /linux/i;

export function detectDevice(ua) {
  const s = String(ua || '');
  if (!s.trim()) {
    return { type: 'unknown', os: 'unknown', browser: 'unknown', browserMajor: 0, touchLikely: false, bot: false };
  }
  if (BOT_RE.test(s)) {
    return { type: 'bot', os: osOf(s), browser: browserOf(s).name, browserMajor: browserOf(s).major, touchLikely: false, bot: true };
  }
  const isTablet = TABLET_RE.test(s) || (ANDROID_RE.test(s) && !/mobile/i.test(s));
  const isMobile = !isTablet && MOBILE_RE.test(s);
  const type = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';
  const { name, major } = browserOf(s);
  return {
    type,
    os: osOf(s),
    browser: name,
    browserMajor: major,
    touchLikely: type === 'mobile' || type === 'tablet',
    bot: false,
  };
}

function osOf(s) {
  if (IOS_RE.test(s)) return 'ios';
  if (ANDROID_RE.test(s)) return 'android';
  if (WINDOWS_RE.test(s)) return 'windows';
  if (MAC_RE.test(s)) return 'macos';
  if (LINUX_RE.test(s)) return 'linux';
  return 'unknown';
}

function browserOf(s) {
  let m;
  if (/edg(e|a|ios)?\//i.test(s)) {
    m = s.match(/edg(?:e|a|ios)?\/(\d+)/i);
    return { name: 'edge', major: majorOf(m) };
  }
  if (/opr\/|opera/i.test(s)) {
    m = s.match(/(?:opr|opera)[\/ ](\d+)/i);
    return { name: 'opera', major: majorOf(m) };
  }
  if (/firefox|fxios/i.test(s)) {
    m = s.match(/(?:firefox|fxios)\/(\d+)/i);
    return { name: 'firefox', major: majorOf(m) };
  }
  if (/samsungbrowser/i.test(s)) {
    m = s.match(/samsungbrowser\/(\d+)/i);
    return { name: 'samsung', major: majorOf(m) };
  }
  if (/crios|chrome|chromium/i.test(s)) {
    m = s.match(/(?:crios|chrome|chromium)\/(\d+)/i);
    return { name: 'chrome', major: majorOf(m) };
  }
  if (/trident|msie/i.test(s)) return { name: 'ie', major: 11 };
  if (/safari/i.test(s)) {
    m = s.match(/version\/(\d+)/i);
    return { name: 'safari', major: majorOf(m) };
  }
  return { name: 'unknown', major: 0 };
}

function majorOf(m) {
  const n = Number(m?.[1]);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * UI adaptation hints for the detected class. The POS shell applies these
 * (compact layout, touch targets, list page size, prefetch budget).
 */
export function adaptationFor(detection) {
  const type = detection?.type || 'unknown';
  if (type === 'mobile') {
    return { compactUi: true, largeTouchTargets: true, listPageSize: 20, prefetch: false, reduceMotion: 'respect-preference' };
  }
  if (type === 'tablet') {
    return { compactUi: false, largeTouchTargets: true, listPageSize: 30, prefetch: false, reduceMotion: 'respect-preference' };
  }
  if (type === 'bot') {
    return { compactUi: true, largeTouchTargets: false, listPageSize: 10, prefetch: false, reduceMotion: 'reduce' };
  }
  if (type === 'desktop') {
    return { compactUi: false, largeTouchTargets: false, listPageSize: 50, prefetch: true, reduceMotion: 'respect-preference' };
  }
  // unknown — conservative: usable everywhere, no prefetch spend
  return { compactUi: false, largeTouchTargets: true, listPageSize: 30, prefetch: false, reduceMotion: 'respect-preference' };
}

/**
 * UA-side warnings (old/unsupported browsers). Each warning:
 * { level: 'warning'|'critical', code, message }.
 */
export function deviceWarnings(detection) {
  const out = [];
  if (detection?.type === 'bot') {
    out.push({ level: 'warning', code: 'bot-traffic', message: 'تم رصد زاحف آلي — تم تقليل الجلب المسبق لهذه الجلسة' });
  }
  if (detection?.browser === 'ie') {
    out.push({ level: 'critical', code: 'browser-unsupported', message: 'متصفح Internet Explorer غير مدعوم — حدّث إلى Chrome أو Edge ليعمل الكاشير' });
  } else if (detection?.browser === 'chrome' && detection.browserMajor > 0 && detection.browserMajor < 80) {
    out.push({ level: 'warning', code: 'browser-outdated', message: 'إصدار المتصفح قديم — حدّثه لتفادي بطء الكاشير' });
  } else if (detection?.browser === 'firefox' && detection.browserMajor > 0 && detection.browserMajor < 75) {
    out.push({ level: 'warning', code: 'browser-outdated', message: 'إصدار المتصفح قديم — حدّثه لتفادي بطء الكاشير' });
  } else if (detection?.browser === 'safari' && detection.browserMajor > 0 && detection.browserMajor < 13) {
    out.push({ level: 'warning', code: 'browser-outdated', message: 'إصدار المتصفح قديم — حدّثه لتفادي بطء الكاشير' });
  }
  return out;
}

/**
 * Origin-side performance warnings from a memory snapshot.
 * `mem` = { rss_mb, heap_mb }. Thresholds are Tier-1 single-box values.
 */
export function serverWarnings(mem) {
  const out = [];
  const rss = Number(mem?.rss_mb) || 0;
  if (rss >= 1500) {
    out.push({ level: 'critical', code: 'server-memory-critical', message: `ذاكرة الخادم مرتفعة جدًا (${rss}MB) — أعد تشغيل الخدمة خارج الدوام وراجع السجلات` });
  } else if (rss >= 900) {
    out.push({ level: 'warning', code: 'server-memory-high', message: `ذاكرة الخادم مرتفعة (${rss}MB) — راقبها قبل ذروة البيع` });
  }
  return out;
}

export default { detectDevice, adaptationFor, deviceWarnings, serverWarnings };
