/**
 * Method coverage contract — the POS frontend must never call a
 * /api/method/* path the server doesn't handle (404 "طريقة غير معروفة").
 *
 * Scans POS/src for static frappe call("...") + createResource url:"..."
 * method strings and asserts each one is registered in routes/method.js
 * (case-sensitive handlers map, which already includes the lowercase
 * dypos.* aliases). Exit 1 with the missing list.
 *
 * Run: npm run contract (server/)
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const posSrc = join(here, '..', '..', 'POS', 'src');

const used = new Set();
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(js|vue|ts)$/.test(e)) continue;
    const text = readFileSync(p, 'utf8');
    for (const m of text.matchAll(/(?:call|url)\s*\(\s*['"]([^'"]+)['"]/g)) used.add(m[1]);
    for (const m of text.matchAll(/url\s*:\s*['"]([^'"]+)['"]/g)) used.add(m[1]);
  }
}
walk(posSrc);

const methods = [...used].filter((m) => /^(DyPOS|dypos|frappe|login|logout|upload_file|get_)[\w.]*$/.test(m));

const { handlers } = await import('../routes/method.js');

const missing = methods.filter((m) => !handlers.has(m)).sort();
console.log(`method contract: ${methods.length} static call sites, ${methods.length - missing.length} covered`);
if (missing.length) {
  console.log('MISSING handlers:');
  for (const m of missing) console.log(`  - ${m}`);
  process.exit(1);
}
console.log('OK — every POS call site resolves to a registered handler');
