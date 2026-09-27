/**
 * Method coverage contract — the POS frontend must never call a
 * /api/method/* path the server doesn't handle (404 "طريقة غير معروفة").
 *
 * The scanning and classification rules live in ./method-contract.mjs so they
 * can be unit-tested; this file is only the CLI surface (`npm run contract`).
 *
 * Run: npm run contract (server/)
 */
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { MIN_VERB_FLOOR, collectCallSites, evaluate } from './method-contract.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const { handlers } = await import('../routes/method.js');

const scan = collectCallSites(repoRoot);
const result = evaluate(handlers, scan);

console.log(
  `method contract: ${result.verbCount} verbs / ${result.siteCount} call sites ` +
    `in ${result.scannedFiles} files — ${result.verbCount - result.missing.length} covered, ` +
    `${result.ignoredCount} non-verb strings ignored, ${handlers.size} handlers registered`,
);

let failed = false;

if (result.vacuous) {
  failed = true;
  console.error(
    `VACUOUS SCAN: only ${result.verbCount} verbs found (floor ${MIN_VERB_FLOOR}) — ` +
      'the collector probably stopped understanding the call sites',
  );
}

if (result.missing.length) {
  failed = true;
  console.error('MISSING handlers:');
  for (const { verb, sites } of result.missing) {
    console.error(`  - ${verb}`);
    for (const site of sites) console.error(`      ${site.file}:${site.line}  (${site.form})`);
  }
}

if (failed) process.exit(1);
console.log('OK — every POS call site resolves to a registered handler');
