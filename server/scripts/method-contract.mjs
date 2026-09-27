/**
 * Method-router contract: the POS frontend must never call an
 * `/api/method/*` path the server does not register (404 "طريقة غير معروفة").
 *
 * This module is the *engine*; `check-method-coverage.mjs` is the CLI and
 * `tests/method-coverage.test.js` proves the engine still works.
 *
 * Why it is no longer a two-line regex over `POS/src`:
 *
 *   1. The previous version silently DROPPED 17 collected strings, 13 of which
 *      were real method calls written as literal paths
 *      (`"/api/method/DyPOS.api.ping"`) or through `methodCall()`. Two of them
 *      (`DyPOS.api.auth.register`, `dypos.ping`) were **not registered at all**:
 *      the registration page 404'd on the Express API while working against the
 *      Cloudflare worker, and a health probe burned a round-trip on a 404.
 *      A gate that filters what it cannot parse is a gate with no floor.
 *   2. The gate had no test, so a refactor that broke the collector would turn
 *      it into a green no-op — the exact failure this repo keeps paying for.
 *
 * Rules now:
 *   - every recognised form is scanned, including `methodCall(...)` and literal
 *     `"/api/method/..."` strings, across `POS/src` AND the vendored
 *     first-party kit in `POS/packages`;
 *   - a string counts as a verb when the form is unambiguous (`call`, literal
 *     path) or when it carries the `DyPOS.` / `dypos.` namespace — no silent
 *     dropping;
 *   - the scan refuses to pass below MIN_VERB_FLOOR verbs, so a broken
 *     collector fails loudly instead of reporting "0 call sites".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Repo-relative source roots that may legitimately call the method router. */
export const SCAN_ROOTS = ['POS/src', 'POS/packages'];

/**
 * Non-vacuity floor. Today the scan finds ~110 distinct verbs; a drop below this
 * means the collector stopped understanding the code, not that the code shrank.
 */
export const MIN_VERB_FLOOR = 90;

const METHOD_PREFIX = '/api/method/';
const NAMESPACE = /^(?:DyPOS|dypos)\.[\w.]+$/;

/** Bare verbs (no namespace) the router answers directly. */
const BARE_VERBS = new Set([
  'login',
  'logout',
  'upload_file',
  'get_allowed_locales',
  'get_locale_names',
  'ping',
  'health',
]);

/**
 * Recognised call forms.
 *  - `call`        : unambiguous — anything in here IS a verb.
 *  - `literal-path`: an explicit `"/api/method/x"` string.
 *  - `resource-url`: `createResource({ url: "..." })` — dotted verb or REST path.
 *  - `method-field`: `{ method: "..." }` — only trusted with a namespace prefix,
 *                    because this object shape also carries HTTP verbs and print
 *                    options ("POST", "silent", "browser").
 */
const FORMS = [
  ['call', /\b(?:methodCall|call)\s*\(\s*['"]([^'"]+)['"]/g],
  ['literal-path', /['"](\/api\/method\/[^'"]+)['"]/g],
  ['resource-url', /\burl\s*:\s*['"]([^'"]+)['"]/g],
  ['method-field', /\bmethod\s*:\s*['"]([^'"]+)['"]/g],

];

/**
 * Decide what a collected string is.
 * @returns {{kind:'verb'|'rest-path'|'other', verb?:string}}
 */
export function classify(form, rawValue) {
  const value = rawValue.trim();
  if (value.startsWith(METHOD_PREFIX)) {
    return { kind: 'verb', verb: value.slice(METHOD_PREFIX.length) };
  }
  if (NAMESPACE.test(value)) return { kind: 'verb', verb: value };
  if (form === 'call' || form === 'literal-path') {
    // Both forms only ever carry a verb, so a miss must be reported, not hidden.
    return { kind: 'verb', verb: value };
  }
  if (BARE_VERBS.has(value)) return { kind: 'verb', verb: value };
  if (value.startsWith('/')) return { kind: 'rest-path' };
  return { kind: 'other' };
}

/** Collect every call site in one source text (pure — touches no filesystem). */
export function collectFromSource(text, file) {
  const sites = [];
  for (const [form, pattern] of FORMS) {
    // Fresh regex per call: a shared global regex leaks `lastIndex` state.
    const re = new RegExp(pattern.source, 'g');
    for (const m of text.matchAll(re)) {
      sites.push({
        form,
        raw: m[1],
        file,
        line: text.slice(0, m.index).split('\n').length,
      });
    }
  }
  return sites;
}

/** Walk the source roots and classify everything it finds. */
export function collectCallSites(repoRoot, roots = SCAN_ROOTS) {
  const verbs = new Map();
  const ignored = new Map();
  let scannedFiles = 0;

  const visit = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        visit(full);
        continue;
      }
      if (!/\.(js|vue|ts|tsx)$/.test(entry.name)) continue;
      const text = readFileSync(full, 'utf8');
      scannedFiles += 1;
      const rel = full.slice(repoRoot.length + 1).replace(/\\/g, '/');
      for (const site of collectFromSource(text, rel)) {
        const verdict = classify(site.form, site.raw);
        if (verdict.kind !== 'verb') {
          const key = `${site.form}:${site.raw}`;
          if (!ignored.has(key)) ignored.set(key, { ...site, kind: verdict.kind });
          continue;
        }
        const list = verbs.get(verdict.verb) || [];
        list.push({ ...site, verb: verdict.verb });
        verbs.set(verdict.verb, list);
      }
    }
  };

  for (const root of roots) visit(join(repoRoot, root));
  return { verbs, ignored, scannedFiles };
}

/** Compare a scan against the registered handlers. */
export function evaluate(handlers, scan) {
  const missing = [];
  for (const [verb, sites] of scan.verbs) {
    if (!handlers.has(verb)) missing.push({ verb, sites });
  }
  missing.sort((a, b) => a.verb.localeCompare(b.verb));
  const totalSites = [...scan.verbs.values()].reduce((n, list) => n + list.length, 0);
  return {
    missing,
    verbCount: scan.verbs.size,
    siteCount: totalSites,
    ignoredCount: scan.ignored.size,
    scannedFiles: scan.scannedFiles,
    vacuous: scan.verbs.size < MIN_VERB_FLOOR,
  };
}

