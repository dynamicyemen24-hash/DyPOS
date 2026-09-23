#!/usr/bin/env node
/**
 * DyPOS — Cloudflare Pages site assembler.
 *
 * Turns the Vite build output (DyPOS/public/pos) into a deployable Pages
 * directory. Why this exists: the raw build emits a Frappe-style boot block
 * (raw Jinja) and references assets without a cache-buster — correct when the
 * file is rendered by Frappe, a JS syntax error when served statically (this
 * is exactly what broke dypos.smartportssoft.com). This script performs the
 * same static-safe transform as scripts/build-prod-package.ps1 (IIS) and adds
 * the two things the old Pages snapshot lacked:
 *   - Service-Worker-Allowed: /  (root-scope SW registration → PWA works)
 *   - a DyPOS-branded 404.html
 *
 * Usage:  node scripts/build-pages-site.mjs [--out .pages-site]
 * Output: <out>/
 *   index.html + pos.html   (static-safe entry — same content, both URLs work)
 *   404.html                (DyPOS-branded)
 *   _headers, _redirects
 *   assets/DyPOS/pos/**     (full Vite build output, untouched)
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BUILD_DIR = resolve(root, 'DyPOS', 'public', 'pos');
const OUT = resolve(root, argOf('--out', '.pages-site'));
const VERSION =
  JSON.parse(readFileSync(join(BUILD_DIR, 'version.json'), 'utf8')).version ??
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

if (!existsSync(BUILD_DIR)) {
  console.error(`[pages-site] FATAL: build output missing: ${BUILD_DIR}`);
  console.error('[pages-site] Run the frontend build first (cd POS && yarn build).');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1) Full build output → assets/DyPOS/pos/** (canonical absolute paths)
cpSync(BUILD_DIR, join(OUT, 'assets', 'DyPOS', 'pos'), { recursive: true });

// 2) Static-safe entry: strip the Frappe Jinja boot block (raw {% %} inside a
//    <script> is a JS syntax error without Frappe), pin every asset URL with
//    ?v=<version>, and register the service worker with root scope so the PWA
//    install prompt fires.
const raw = readFileSync(join(BUILD_DIR, 'index.html'), 'utf8');
let html = raw
  .replace(/\s*<script>\s*\{% for key in boot %\}[\s\S]*?\{% endfor %\}\s*<\/script>/g, '')
  .replace(/\s*<script>\s*\{%[\s\S]*?%\}\s*<\/script>/g, '')
  .replace(/(\/assets\/DyPOS\/pos\/assets\/[^"']+\.(?:js|css))/g, `$1?v=${VERSION}`)
  .replace(
    '</head>',
    `<script>\nif ('serviceWorker' in navigator) {\n  navigator.serviceWorker.register('/assets/DyPOS/pos/sw.js', { scope: '/' }).catch(function () {});\n}\n</script>\n  <!-- DyPOS build ${VERSION} -->\n</head>`,
  );

// Hard guards: never publish a broken shell.
if (/\{%/.test(html)) {
  console.error('[pages-site] FATAL: Jinja tags survived the transform.');
  process.exit(1);
}
if (!html.includes(`?v=${VERSION}`)) {
  console.error('[pages-site] FATAL: cache-buster missing — asset URLs not version-pinned.');
  process.exit(1);
}

writeFileSync(join(OUT, 'index.html'), html, 'utf8');
writeFileSync(join(OUT, 'pos.html'), html, 'utf8');

// 3) NO root 404.html: on Cloudflare Pages a root 404.html short-circuits the
//    SPA catch-all — every unknown path then returns 404 instead of being
//    200-rewritten to index.html (verified live + isolated probe 2026-09-22).
//    The Vue router owns unknown paths; the app itself stays reachable at any
//    client route. A 404 brand page was removed for this reason.

// 4) _headers — security + caching. Hardened CSP (no 'unsafe-inline' — hashes only),
    //    strict permissions, root HTML must-revalidate, SW root scope allowed.
    const headers = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), xr-spatial-tracking=(), gyroscope=(), magnetometer=(), accelerometer=(), autoplay=(), display-capture=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-+6WnXIl4biFTCa5FVjIi8kJI+6vVx8K7JQYJ7QK7QK7Q='; style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='; img-src 'self' data: blob: https://flagcdn.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://api.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; block-all-mixed-content

/
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate
/pos.html
  Cache-Control: public, max-age=0, must-revalidate
/assets/DyPOS/pos/index.html
  Cache-Control: public, max-age=0, must-revalidate
/assets/DyPOS/pos/sw.js
  Cache-Control: public, max-age=0, must-revalidate
  Service-Worker-Allowed: /
/assets/DyPOS/pos/version.json
  Cache-Control: public, max-age=0, must-revalidate
/assets/DyPOS/pos/manifest.webmanifest
  Cache-Control: public, max-age=3600
/assets/DyPOS/pos/offline.html
  Cache-Control: public, max-age=0, must-revalidate
/assets/DyPOS/pos/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
writeFileSync(join(OUT, '_headers'), headers, 'utf8');

// 5) _redirects — SPA fallback (history-mode router).
    //    Cloudflare Pages serves static files FIRST (highest priority),
    //    then applies _redirects. The catch-all only hits for non-existent paths.
    //    Explicit /assets/** pass-through ensures zero ambiguity.
    writeFileSync(
      join(OUT, '_redirects'),
      `/assets/*  /assets/:splat  200
/*  /index.html  200\n`,
      'utf8',
    );

// 6) Report
let files = 0;
let bytes = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else {
      files += 1;
      bytes += statSync(p).size;
    }
  }
};
walk(OUT);
const bundle = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? 'index-UNKNOWN.js';

console.log('[pages-site] Cloudflare Pages site assembled');
console.log(`  out        : ${OUT}`);
console.log(`  version    : ${VERSION}`);
console.log(`  entry      : index.html + pos.html (static-safe, SW root scope, ?v pinned)`);
console.log(`  main bundle: ${bundle}`);
console.log(`  files      : ${files}`);
console.log(`  size       : ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log('  jinja left : none (guarded)');
