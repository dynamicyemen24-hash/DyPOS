/**
 * Tests for the method-coverage GATE ITSELF.
 *
 * The gate existed for two releases with no test, which meant a broken
 * collector would have reported "0 call sites, all covered" and gone green —
 * exactly the silent-gap class this suite keeps paying to eliminate. These
 * tests assert the engine's FAILURE paths, not just its happy path.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  MIN_VERB_FLOOR,
  SCAN_ROOTS,
  classify,
  collectCallSites,
  collectFromSource,
  evaluate,
} from '../scripts/method-contract.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
let handlers;
let liveScan;
let liveResult;

before(async () => {
  ({ handlers } = await import('../routes/method.js'));
  liveScan = collectCallSites(REPO_ROOT);
  liveResult = evaluate(handlers, liveScan);
});

/** Verbs the collector finds in a real file, with non-verb strings dropped. */
function verbsIn(relPath) {
  const text = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  return collectFromSource(text, relPath)
    .map((s) => classify(s.form, s.raw))
    .filter((v) => v.kind === 'verb')
    .map((v) => v.verb);
}

describe('method-contract engine: recognition', () => {
  it('sees every call form, including the ones the old gate dropped', () => {
    const source = [
      'call("DyPOS.api.invoices.submit_invoice")',
      'methodCall("dypos.client.get_list")',
      'createResource({ url: "DyPOS.api.bootstrap.get_initial_data" })',
      'const r = await fetch("/api/method/DyPOS.api.ping")',
    ].join('\n');
    const verbs = new Set(verbsIn.length ? [] : []);
    for (const site of collectFromSource(source, 'fixture.js')) {
      const v = classify(site.form, site.raw);
      if (v.kind === 'verb') verbs.add(v.verb);
    }
    assert.deepEqual([...verbs].sort(), [
      'DyPOS.api.bootstrap.get_initial_data',
      'DyPOS.api.invoices.submit_invoice',
      'DyPOS.api.ping',
      'dypos.client.get_list',
    ]);
  });

  it('reports the file and line of every site', () => {
    const sites = collectFromSource('\n\ncall("DyPOS.api.ping")\n', 'x.js');
    const hit = sites.find((s) => s.raw === 'DyPOS.api.ping');
    assert.equal(hit.line, 3);
    assert.equal(hit.file, 'x.js');
    assert.equal(hit.form, 'call');
  });

  it('treats an explicit call() argument as a verb even without a namespace', () => {
    // "call()" only ever carries a verb: dropping it would be a silent hole.
    assert.deepEqual(classify('call', 'upload_file'), { kind: 'verb', verb: 'upload_file' });
  });

describe('method-contract engine: failure paths (the gate must be able to fail)', () => {
  it('reports a verb the server does not register, with its call site', () => {
    const verbs = new Map([
      ['DyPOS.api.ping', [{ verb: 'DyPOS.api.ping', file: 'a.js', line: 3, form: 'call' }]],
      ['DyPOS.api.nope', [{ verb: 'DyPOS.api.nope', file: 'b.js', line: 9, form: 'call' }]],
    ]);
    const result = evaluate(handlers, { verbs, ignored: new Map(), scannedFiles: 2 });
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].verb, 'DyPOS.api.nope');
    assert.equal(result.missing[0].sites[0].file, 'b.js');
  });

  it('refuses to pass a vacuous scan (collector stopped understanding the code)', () => {
    const one = new Map([
      ['DyPOS.api.ping', [{ verb: 'DyPOS.api.ping', file: 'a', line: 1, form: 'call' }]],
    ]);
    const result = evaluate(handlers, { verbs: one, ignored: new Map(), scannedFiles: 1 });
    assert.equal(result.vacuous, true, 'a 1-verb scan must never be reported as a pass');
    assert.ok(MIN_VERB_FLOOR > 1, 'the floor must be meaningful');
  });
});

describe('method-contract: the live POS tree', () => {
  it('scans both POS/src and the vendored first-party kit', () => {
    assert.deepEqual(SCAN_ROOTS, ['POS/src', 'POS/packages']);
    const files = [...liveScan.verbs.values()].flat().map((s) => s.file);
    assert.ok(
      files.some((f) => f.startsWith('POS/packages/')),
      'the kit speaks the same contract and must be covered',
    );
    assert.ok(files.some((f) => f.startsWith('POS/src/')));
  });

  it('is not vacuous and finds no unregistered verb', () => {
    assert.equal(liveResult.vacuous, false, `only ${liveResult.verbCount} verbs found`);
    assert.deepEqual(
      liveResult.missing.map((m) => `${m.verb} (${m.sites[0].file}:${m.sites[0].line})`),
      [],
    );
    // The scan found 107 verbs while POS/src still carried ~60k lines of
    // unreachable UI; pruning it took the live surface to 53, all covered.
    // The guard now sits above the shared MIN_VERB_FLOOR (45) rather than on a
    // number inflated by code that never shipped.
    assert.ok(
      liveResult.verbCount > MIN_VERB_FLOOR,
      `expected more than ${MIN_VERB_FLOOR} verbs, found ${liveResult.verbCount}`,
    );
  });

  it('covers the literal-path form the old gate silently dropped', () => {
    const literals = [...liveScan.verbs.values()]
      .flat()
      .filter((s) => s.form === 'literal-path')
      .map((s) => s.verb);
    assert.ok(literals.includes('DyPOS.api.ping'));
    // The literal-path form must stay *collected*, whatever verbs happen to use
    // it: naming a specific verb here used to mean the check passed vacuously
    // once that one call site moved (upload_file went with the deleted print
    // spool). The real contract is that no literal-path verb is unregistered.
    assert.deepEqual(
      literals.filter((verb) => !handlers.has(verb)),
      [],
      'every literal-path verb must be registered by the server',
    );
  });

  it('every health probe in offline detection resolves (regression)', () => {
    // `/api/method/dypos.ping` was never registered: the probe burned a
    // round-trip on a 404 and flapped the online signal. The probes live in
    // POS/src/utils/offline/{offlineState,sync}.js now — the old
    // utils/offline/detection.js was unreachable from any entry point and was
    // deleted as dead code, so the guard follows the surviving surface.
    for (const relPath of [
      'POS/src/utils/offline/offlineState.js',
      'POS/src/utils/offline/sync.js',
    ]) {
      const verbs = verbsIn(relPath);
      assert.ok(verbs.length >= 1, `${relPath} must still declare its endpoints`);
      for (const verb of verbs) {
        assert.ok(handlers.has(verb), `health probe ${verb} is not registered by the server`);
      }
    }
  });

  it('registration is reachable under both spellings (deployment split-brain)', () => {
    // The POS + Cloudflare worker call the capitalised verb, the bridge uses the
    // lowercase one. Only the lowercase name existed, so subscribing 404'd on
    // the Express API while working on Pages.
    assert.ok(handlers.has('DyPOS.api.auth.register'));
    assert.ok(handlers.has('dypos.auth.register'));
    for (const verb of verbsIn('POS/src/pages/Register.vue')) {
      assert.ok(handlers.has(verb), `Register.vue calls ${verb} which the server does not register`);
    }
  });
});


  it('ignores REST paths and non-verb option values instead of misclassifying', () => {
    assert.equal(classify('resource-url', '/api/invoices').kind, 'rest-path');
    assert.equal(classify('method-field', 'POST').kind, 'other');
    assert.equal(classify('method-field', 'silent').kind, 'other');
    // …but a namespaced value in the same slot IS a verb.
    assert.equal(classify('method-field', 'DyPOS.api.ping').verb, 'DyPOS.api.ping');
  });
});
