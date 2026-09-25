/**
 * DyPOS Security Headers — production-grade response hardening.
 *
 * Complements the helmet presets already mounted in server.js with the
 * campaign's stricter contract:
 *   - Content-Security-Policy: enforced, self-hardened; connect-src allows only
 *     self + configured API/Frappe origins (falls back to https:/wss: so the
 *     POS keeps talking to its own backend when no origin is configured); the
 *     browser app frame is restricted to self + Frappe origin.
 *   - HSTS (max-age 31536000, includeSubDomains, preload): prod only — HSTS on a
 *     dev box would pin a throwaway localhost cert the operator has no way to
 *     unpin.
 *   - X-Content-Type-Options: nosniff — no MIME sniffing (image/PDF smuggling).
 *   - Referrer-Policy: strict-origin-when-cross-origin — no full URL leaks.
 *   - Permissions-Policy: deny high-value browser APIs by default.
 *   - Cross-Origin-Opener-Policy: same-origin to blunt Spectre-style window
 *     cross-origin leaks; disabled when a Frappe origin is configured (the
 *     published pos.html is a Frappe page) or DYPOS_COOP=0.
 *   - Cache-Control: no-store for /api/* unless a route already set one
 *     (invoices are financial records — they must never be cached).
 *
 * Import-safe: nothing runs on import; `registerSecurityHeaders(app)` is the
 * orchestration hook. `securityHeaders(opts)` returns a middleware for reuse.
 */
const isProduction = () => process.env.NODE_ENV === 'production';

function splitOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toOriginWhitelist(candidates) {
  return candidates.filter((o) => /^https?:\/\//.test(o));
}

/**
 * Build the production security-header middleware.
 * @param {{ apiOrigins?: string, frappeOrigin?: string, coop?: boolean }} [options]
 */
export function securityHeaders(options = {}) {
  const apiOrigins = toOriginWhitelist(splitOrigins(options.apiOrigins ?? process.env.DYPOS_API_ORIGIN));
  const frappeOrigin = String(options.frappeOrigin ?? process.env.DYPOS_FRAPPE_ORIGIN ?? '').trim();
  const allowCode = options.coop !== false && !frappeOrigin && String(process.env.DYPOS_COOP || '1') !== '0';

  return function securityHeadersMiddleware(req, res, next) {
    if (isProduction()) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    // Skip CSP if already set by nonce middleware
    if (!res.getHeader('Content-Security-Policy')) {
      const apiOrigins = toOriginWhitelist(splitOrigins(options.apiOrigins ?? process.env.DYPOS_API_ORIGIN));
      const frappeOrigin = String(options.frappeOrigin ?? process.env.DYPOS_FRAPPE_ORIGIN ?? '').trim();
      const connectSrc = ["'self'", ...toOriginWhitelist(splitOrigins(frappeOrigin)), ...apiOrigins];
      if (!connectSrc.some((o) => o.startsWith('http'))) connectSrc.push('https:', 'wss:');
      const frameAncestors = ["'self'", ...toOriginWhitelist(splitOrigins(frappeOrigin))];
      const csp = [
        "default-src 'self'",
        `script-src 'self' blob:`,
        `style-src 'self' 'unsafe-inline'`,
        `img-src 'self' data: blob: https:`,
        `font-src 'self' data: https://fonts.gstatic.com`,
        `connect-src ${connectSrc.join(' ')}`,
        `media-src 'self' blob:`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `form-action 'self'`,
        `frame-ancestors ${frameAncestors.join(' ')}`,
        'upgrade-insecure-requests',
      ].join('; ');
      res.setHeader('Content-Security-Policy', csp);
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), midi=(), sync-xhr=(), accelerometer=(), gyroscope=(), magnetometer=(), display-capture=(), fullscreen=(self), autoplay=(self)'
    );
    if (allowCode) res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (req.path.startsWith('/api/') && !res.getHeader('Cache-Control')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  };
}

/**
 * Orchestration hook: `registerSecurityHeaders(app)`. Mounted (by the
 * orchestrator) before routes so every response carries the hardened headers.
 */
export function registerSecurityHeaders(app, options = {}) {
  app.use(securityHeaders(options));
  return app;
}

export default { securityHeaders, registerSecurityHeaders };