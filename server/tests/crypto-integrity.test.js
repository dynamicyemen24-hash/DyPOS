/**
 * Crypto integrity guard â€” enforces docs/LEGACY_DECISION.md.
 *
 * The abandoned `legacy/pos_next` React app contains files that CLAIM to be a
 * "ZATCA Phase 2" implementation while shipping broken primitives: a 32-bit XOR
 * roll labelled as HMAC-SHA256, a digest faked by reversing itself, a "SHA-256"
 * that differs between browser and Node, a QR "code" that is decorative noise,
 * and a Sunat/Peru XML template with no signature and no hash chain.
 *
 * Warning headers rot, so this test makes the decision enforceable:
 *   1. the bad patterns must never enter the active tree;
 *   2. the quarantine markers on the legacy files must stay in place.
 *
 * Rule scope is deliberately narrow. The active `cacheManager` legitimately uses
 * a djb2-style roll to version a *cache structure* â€” that is not a credential
 * and is not flagged here. Only high-precision, zero-false-positive patterns
 * are asserted.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SOURCE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.vue', '.tsx', '.jsx']);
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'dist-deploy', 'coverage', '.pages-site']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIR.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      const dot = entry.name.lastIndexOf('.');
      if (dot !== -1 && SOURCE_EXT.has(entry.name.slice(dot))) out.push(full);
    }
  }
  return out;
}

const ACTIVE_DIRS = ['POS/src', 'POS/tests', 'server', 'POS/scripts', 'scripts'];

// This file necessarily contains the banned needles as string literals, so it
// must never scan (or be flagged by) itself.
const SELF = resolve(import.meta.dirname, 'crypto-integrity.test.js');

/**
 * Test files are excluded from the "bad pattern" rules below.
 *
 * These rules protect SHIPPED code. A test is allowed to name a forbidden
 * pattern in order to assert its absence (e.g. `expect(xml).not.toContain(
 * "urn:sunat")`) â€” that is the guard working, not a violation. Flagging such a
 * test would make it impossible to test for the very defects we forbid.
 */
function isTestFile(file) {
	return /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

function activeFiles() {
	const files = [];
	for (const dir of ACTIVE_DIRS) files.push(...walk(join(REPO_ROOT, dir)));
	return files.filter((f) => resolve(f) !== SELF);
}

/** Shipped code only â€” used by the pattern rules. */
function shippedFiles() {
	return activeFiles().filter((f) => !isTestFile(f))
}

function readIfPresent(relPath) {
  try {
    return readFileSync(join(REPO_ROOT, relPath), 'utf8');
  } catch {
    return null;
  }
}

const LEGACY_FILES = [
  'legacy/pos_next/POS/src/security/zatca-security.ts',
  'legacy/pos_next/POS/src/pages/ZatcaIntegration.tsx',
];

describe('crypto integrity guard', () => {
  it('scans a non-empty active source set (guard is not vacuous)', () => {
    const files = activeFiles();
    assert.ok(files.length > 50, `expected a real source set, found ${files.length} files`);
  });

  it('active tree contains no fake-hash / self-padding primitives', () => {
    const banned = [
      ['paddedKey', '32-bit XOR "HMAC" from legacy zatca-security.ts'],
      ['hash += hash', 'digest padded with itself, faking key length'],
      ['scrypt-compatible', 'false algorithm label on a non-PBKDF2 hash'],
    ];
    for (const [needle, why] of banned) {
      const hits = shippedFiles().filter((f) => readFileSync(f, 'utf8').includes(needle));
      assert.deepEqual(
        hits.map((h) => relative(REPO_ROOT, h)),
        [],
        `${needle} (${why}) must not exist in the active tree`
      );
    }
  });

  it('active tree contains no wrong-country tax schema', () => {
    const hits = shippedFiles().filter((f) => readFileSync(f, 'utf8').includes('urn:sunat'));
    assert.deepEqual(
      hits.map((h) => relative(REPO_ROOT, h)),
      [],
      'urn:sunat is the Peruvian tax schema; Saudi invoices must use ZATCA UBL'
    );
  });

  it('active tree contains no decorative fake QR generator', () => {
    const hits = shippedFiles().filter((f) => readFileSync(f, 'utf8').includes('charCodeAt(idx) + y'));
    assert.deepEqual(
      hits.map((h) => relative(REPO_ROOT, h)),
      [],
      'fake QR pattern from legacy ZatcaIntegration.tsx is not scannable'
    );
  });

  it('browser code (POS/src) never uses Node Buffer APIs', () => {
    const hits = walk(join(REPO_ROOT, 'POS/src')).filter((f) => readFileSync(f, 'utf8').includes('Buffer.from('));
    assert.deepEqual(
      hits.map((h) => relative(REPO_ROOT, h)),
      [],
      'Buffer is unavailable in the browser; use TextEncoder/atob/btoa'
    );
  });
  it('no crypto material is generated from Math.random()', () => {
    const re = /Math\.random\(\).*(salt|secret|token|key|nonce)|(salt|secret|token|key|nonce).*Math\.random\(\)/i;
    const offenders = [];
    for (const file of shippedFiles()) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (re.test(line)) offenders.push(`${relative(REPO_ROOT, file)}:${i + 1}`);
        });
    }
    assert.deepEqual(offenders, [], 'use crypto.getRandomValues() for salts, keys, tokens, nonces');
  });

  it('legacy ZATCA files stay quarantined and are never imported by active code', () => {
    for (const rel of LEGACY_FILES) {
      const src = readIfPresent(rel);
      assert.ok(src, `${rel} should still exist as a historical artefact`);
      assert.ok(src.includes('QUARANTINED'), `${rel} lost its QUARANTINED marker`);
      assert.ok(src.includes('DO NOT REUSE'), `${rel} lost its DO NOT REUSE marker`);
    }

    const importers = shippedFiles().filter((f) => {
      const text = readFileSync(f, 'utf8');
      return text.includes('zatca-security') || text.includes('ZatcaIntegration');
    });
    assert.deepEqual(
      importers.map((h) => relative(REPO_ROOT, h)),
      [],
      'active code must not import the quarantined legacy ZATCA modules'
    );
  });

  it('active password hashing is a real KDF, not a roll', () => {
    const candidate = join(REPO_ROOT, 'server/lib');
    const files = walk(candidate).filter((f) => {
      const t = readFileSync(f, 'utf8');
      return /pbkdf2|scrypt|argon2/i.test(t);
    });
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      assert.ok(!text.includes('hash += hash'), `${relative(REPO_ROOT, file)} pads a digest with itself`);
    }
    assert.ok(statSync(candidate).isDirectory());
  });
});
