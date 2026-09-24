/**
 * dypos-pos Worker — static frontend + same-origin /api reverse proxy.
 *
 * Why the proxy exists: frappe-ui hardcodes same-origin `/api/method/…`
 * calls, so the POS cannot boot against a cross-origin backend without CORS
 * pain. The Worker forwards `/api/*` to the Node backend configured via the
 * DYPOS_BACKEND_URL Worker variable (e.g. https://api.example.com), keeping
 * cookies + Arabic error shapes intact end-to-end.
 * Everything else is served from Static Assets (SPA fallback included).
 */
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
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        return await proxyApi(request, env);
      }
    } catch {
      // Fall through to static assets on malformed URLs.
    }
    return env.ASSETS.fetch(request);
  },
};
