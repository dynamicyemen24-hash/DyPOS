/**
 * The `/api/health` contract, and a gate that keeps the suite honest about it.
 *
 * `/api/health` answers **503 whenever any registered check degrades** — the
 * memory and disk thresholds included, and those are environment, not code.
 * Five test files asserted a hard `200` (or "non-5xx") on it: green on a
 * developer machine, red on a loaded CI runner, for a suite whose code was
 * never wrong. AGENTS.md documented the rule for months; this file is what
 * makes it executable — it fails the build the moment a sixth one appears.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = HERE;

describe('/api/health is a contract, not an environment reading', () => {
  it('no test file asserts a hard 200 (or "non-5xx") on /api/health', () => {
    const offenders = [];
    for (const file of readdirSync(TESTS_DIR).filter((n) => n.endsWith('.test.js'))) {
      if (file === 'health-contract.test.js') continue;
      const lines = readFileSync(join(TESTS_DIR, file), 'utf8').split('\n');
      let insideHealthTest = false;
      lines.forEach((line, i) => {
        // Enter the scope of a test that talks to the health endpoint…
        if (/\/api\/health\b|get\('\/health'\)|req\('GET', '\/api\/health'\)/.test(line)) {
          insideHealthTest = true;
          return;
        }
        // …and leave it at the end of that test case.
        if (insideHealthTest && /^\s*\}\);/.test(line)) {
          insideHealthTest = false;
          return;
        }
        if (!insideHealthTest) return;
        const code = line.replace(/\/\/.*$/, '');
        if (/non-5xx/.test(code) || /status\s*<\s*500/.test(code) || /status,\s*200\)/.test(code)) {
          offenders.push(`${file}:${i + 1} — ${code.trim()}`);
        }
      });
    }
    assert.deepStrictEqual(
      offenders,
      [],
      `assert the contract (payload shape + status agreement), never a hard 200:\n${offenders.join('\n')}`,
    );
  });

  it('the probe path for containers is /api/ready, which stays unconditional', () => {
    const server = readFileSync(resolve(HERE, '..', 'server.js'), 'utf8');
    assert.match(server, /\/api\/ready/);
    assert.match(server, /\/api\/health/);
  });
});
