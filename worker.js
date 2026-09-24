/**
 * dypos-pos Worker — static frontend + same-origin /api reverse proxy.
 *
 * Why the proxy exists: frappe-ui hardcodes same-origin `/api/method/…`
 * calls, so the POS cannot boot against a cross-origin backend without CORS
 * pain. The Worker forwards `/api/*` to the Node backend configured via the
 * DYPOS_BACKEND_URL Worker variable (e.g. https://api.example.com), keeping
 * cookies + Arabic error shapes intact end-to-end.
 * Everything else is served from Static Assets (SPA fallback included).
 *
 * Security headers: with a custom Worker script Cloudflare ignores the
 * `_headers` file for Worker-handled responses, so the Worker attaches the
 * policy itself. The CSP value is generated per build (hashes of the actual
 * inline blocks) by scripts/build-pages-site.mjs → .pages-site/csp.mjs.
 */

// Fail-closed minimal policy until the assembler injects the real one.
let CSP_POLICY = "default-src 'self'; frame-ancestors 'none'";
try {
  const generated = await import('./.pages-site/csp.mjs');
  if (generated && typeof generated.CSP_POLICY === 'string' && generated.CSP_POLICY) {
    CSP_POLICY = generated.CSP_POLICY;
  }
} catch {
  // Assembly not run (local wrangler dev) — minimal policy, never nothing.
}

const BASELINE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), xr-spatial-tracking=(), gyroscope=(), magnetometer=(), accelerometer=(), autoplay=(), display-capture()',
};

const MUST_REVALIDATE = new Set([
  '/index.html',
  '/pos.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/sw.js',
  '/version.json',
]);

/** Hashed build output (index-HASH.js) is immutable; entry files revalidate. */
function cacheControlFor(pathname) {
  const base = pathname.split('/').pop() || '';
  if (MUST_REVALIDATE.has(pathname) || MUST_REVALIDATE.has(`/${base}`)) {
    return 'public, max-age=0, must-revalidate';
  }
  if (/-[A-Za-z0-9_-]{6,}\.(js|css|woff2?|ttf|png|jpe?g|svg|ico|webp)$/.test(base)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=0, must-revalidate';
}

function withSecurityHeaders(response, url) {
  const pathname = url.pathname;
  const contentType = response.headers.get('content-type') || '';
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(BASELINE_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  headers.set('cache-control', cacheControlFor(pathname));
  if (contentType.includes('text/html')) {
    headers.set('content-security-policy', CSP_POLICY);
  }
  if (pathname.endsWith('/sw.js') || pathname === '/sw.js') {
    headers.set('Service-Worker-Allowed', '/');
  }
  return new Response(response.body, { status: response.status, headers });
}
const HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function proxyApi(request, env) {
  const backend = String(env.DYPOS_BACKEND_URL || '').trim().replace(/\/+$/, '');
  if (!backend) {
    // Diagnosable 503 (Arabic) instead of the assets layer's bare 405.
    return json(503, { error: 'الخادم الخلفي غير مهيأ — تواصل مع الإدارة', code: 'BACKEND_UNCONFIGURED' });
  }
  let target;
  try {
    const url = new URL(request.url);
    target = new URL(url.pathname + url.search, backend + '/');
  } catch {
    return json(400, { error: 'طلب غير صالح', code: 'BAD_REQUEST' });
  }
  const headers = new Headers();
  request.headers.forEach((v, k) => {
    if (!HOP_HEADERS.has(k.toLowerCase())) {
      try { headers.set(k, v); } catch { /* skip pathological headers */ }
    }
  });
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    // Buffer the body: portable across Workers + Node fetch (streaming bodies
    // need undici's duplex:'half', which workerd rejects). Bodies are capped
    // at 2MB by the backend's own limit, so buffering is safe.
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      signal: ctrl.signal,
    });
    const outHeaders = new Headers();
    upstream.headers.forEach((v, k) => {
      if (!HOP_HEADERS.has(k.toLowerCase())) {
        try { outHeaders.set(k, v); } catch { /* skip */ }
      }
    });
    outHeaders.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  } catch (e) {
    const timedOut = e && e.name === 'AbortError';
    return json(timedOut ? 504 : 502, {
      error: timedOut ? 'انتهت مهلة الخادم الخلفي' : 'تعذر الوصول إلى الخادم الخلفي',
      code: timedOut ? 'BACKEND_TIMEOUT' : 'BACKEND_UNREACHABLE',
    });
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(request, env) {
    let url = null;
    try {
      url = new URL(request.url);
    } catch {
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return await proxyApi(request, env);
    }
    const response = await env.ASSETS.fetch(request);
    try {
      return withSecurityHeaders(response, url);
    } catch {
      return response;
    }
  },
};
