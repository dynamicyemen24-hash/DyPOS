/**
 * CSP Nonce Middleware
 * Generates a cryptographically secure nonce per request and injects it into CSP and HTML
 */

import crypto from 'crypto';

const NONCE_BYTES = 16;

/**
 * Generate a cryptographically secure nonce
 */
function generateNonce() {
  return crypto.randomBytes(NONCE_BYTES).toString('base64');
}

/**
 * Middleware to generate CSP nonce and attach to request/response
 */
export function cspNonceMiddleware() {
  return function (req, res, next) {
    const nonce = generateNonce();
    
    // Store nonce on response locals for use in CSP and HTML injection
    res.locals = res.locals || {};
    res.locals.cspNonce = nonce;
    
    // Add nonce to response headers for CSP
    res.setHeader('X-CSP-Nonce', nonce);
    
    next();
  };
}

/**
 * Build CSP string with nonce for styles
 */
export function buildCspWithNonce(nonce, options = {}) {
  const {
    apiOrigins = [],
    frappeOrigin = '',
    allowFraming = true,
    isProduction = process.env.NODE_ENV === 'production'
  } = options;

  const apiOriginsWhitelist = String(apiOrigins || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const frappeOriginClean = String(frappeOrigin || '').trim();
  const allowFramingFromFrappe = frappeOriginClean && allowCode;

  const connectSrc = ["'self'", ...frappeOriginClean.split(',').map(s => s.trim()).filter(Boolean), ...apiOriginsWhitelist];
  if (!connectSrc.some(o => o.startsWith('http'))) {
    connectSrc.push('https:', 'wss:');
  }

  const frameAncestors = ["'self'"];
  if (frappeOriginClean) {
    frameAncestors.push(...frappeOriginClean.split(',').map(s => s.trim()).filter(Boolean));
  }

  const nonceAttr = `'nonce-${nonce}'`;

  const directives = [
    "default-src 'self'",
    `script-src 'self' blob:`,
    `style-src 'self' ${nonceAttr}`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src ${connectSrc.join(' ')}`,
    `media-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors ${frameAncestors.join(' ')}`,
    'upgrade-insecure-requests',
  ];

  return directives.join('; ');
}

/**
 * Middleware to inject nonce into HTML responses
 * Reads index.html, injects nonce into style tags, serves modified HTML
 */
export function htmlNonceInjector(staticDir) {
  let indexHtmlCache = null;
  let cacheTime = 0;
  const CACHE_TTL = isProduction ? 3600000 : 0; // 1 hour in production, no cache in dev

  function isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  async function getIndexHtml() {
    const now = Date.now();
    if (indexHtmlCache && (now - cacheTime < CACHE_TTL)) {
      return indexHtmlCache;
    }

    const fs = await import('fs');
    const path = await import('path');
    const indexPath = path.join(staticDir, 'index.html');
    
    try {
      indexHtmlCache = await fs.promises.readFile(indexPath, 'utf-8');
      cacheTime = now;
      return indexHtmlCache;
    } catch (error) {
      console.error('[CSP Nonce] Failed to read index.html:', error);
      return null;
    }
  }

  function injectNonce(html, nonce) {
    // Inject nonce into inline style tags
    let htmlWithNonce = html.replace(
      /<style([^>]*)>/gi,
      `<style$1 nonce="${nonce}">`
    );

    // Also inject into link rel="stylesheet" if they are inline (not needed typically)
    // But we can add nonce to preload links for styles
    htmlWithNonce = htmlWithNonce.replace(
      /<link([^>]*rel=["']stylesheet["'][^>]*)>/gi,
      `<link$1 nonce="${nonce}">`
    );

    // Also inject into the theme bootstrap script if it adds styles dynamically
    // The nonce will be available via document.querySelector('style[nonce]')

    return htmlWithNonce;
  }

  return async function htmlNonceMiddleware(req, res, next) {
    // Only process GET requests for HTML
    if (req.method !== 'GET') return next();
    
    const accept = req.headers.accept || '';
    if (!accept.includes('text/html')) return next();

    // Skip API routes
    if (req.path.startsWith('/api/')) return next();

    // Skip static assets
    if (req.path.includes('.') && !req.path.endsWith('.html')) return next();

    const nonce = res.locals?.cspNonce || generateNonce();
    
    // Update CSP with nonce
    const csp = buildCspWithNonce(nonce, {
      apiOrigins: process.env.DYPOS_API_ORIGIN,
      frappeOrigin: process.env.DYPOS_FRAPPE_ORIGIN,
    });
    res.setHeader('Content-Security-Policy', csp);

    // For SPA routes, serve modified index.html
    if (req.path === '/' || req.path === '/index.html' || (!req.path.includes('.') && !req.path.startsWith('/api/'))) {
      const html = await getIndexHtml();
      if (html) {
        const modifiedHtml = injectNonce(html, nonce);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(modifiedHtml);
      }
    }

    next();
  };
}

export function cspNonceGenerator() {
  return cspNonceMiddleware();
}

export default {
  cspNonceMiddleware,
  buildCspWithNonce,
  htmlNonceInjector,
  cspNonceGenerator,
};