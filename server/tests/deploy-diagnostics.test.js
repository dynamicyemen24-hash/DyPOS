/**
 * Deployment diagnostics contract.
 *
 * Twelve deploys (2026-09-25 → 27) failed on one ambiguous Cloudflare code
 * (`10000` on the Pages project GET) because the token preflight only proved
 * token *validity*, and because the diagnosis lived as inline bash inside YAML
 * where it could not be run, tested, or reasoned about. These tests pin the
 * two properties that make the next failure diagnosable:
 *
 *   1. the workflow calls a REAL script (not an inline curl in YAML);
 *   2. that script names both causes and the exact fix, so a human reading CI
 *      output never has to guess which one it is.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

const workflow = readFileSync(
  join(REPO, '.github', 'workflows', 'deploy-cloudflare.yml'),
  'utf8',
);
const preflight = readFileSync(join(REPO, 'scripts', 'pages-preflight.mjs'), 'utf8');

describe('Cloudflare Pages preflight', () => {
  it('no step name contains a bare colon (it silently kills the whole file)', () => {
    // Measured, not theoretical: an UNQUOTED YAML scalar cannot contain ": ".
    // `name: Preflight: Pages project reachable` makes GitHub reject the entire
    // workflow — the run is reported as "likely failed because of a workflow
    // file issue", the workflow loses its `workflow_dispatch` trigger, and not
    // one step ever runs. It cost two deploy attempts here.
    const offenders = [...workflow.matchAll(/^\s*- name: (.+)$/gm)]
      .map((m) => m[1].trim())
      .filter((value) => value.includes(': '));
    assert.deepStrictEqual(offenders, [], `quote or reword: ${offenders.join(' | ')}`);
  });

  it('the workflow runs the preflight script before deploying', () => {
    const scriptIndex = workflow.indexOf('node scripts/pages-preflight.mjs');
    const deployIndex = workflow.indexOf('command: pages deploy');
    assert.ok(scriptIndex > -1, 'the preflight step must invoke scripts/pages-preflight.mjs');
    assert.ok(deployIndex > -1, 'the deploy step must still exist');
    assert.ok(
      scriptIndex < deployIndex,
      'the preflight must run BEFORE the deploy, or it diagnoses nothing',
    );
  });

  it('the preflight keeps both causes distinguishable', () => {
    for (const needle of [
      '/user/tokens/verify',
      '/pages/projects',
      'Cloudflare Pages:Edit',
      'production_branch',
    ]) {
      assert.ok(preflight.includes(needle), `preflight must mention ${needle}`);
    }
    assert.ok(
      /exitCode = await main\(\)/.test(preflight),
      'the script must set an exit code so CI stops before wrangler',
    );
  });

  it('a missing secret fails fast with guidance instead of a mystery', async () => {
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(process.execPath, ['scripts/pages-preflight.mjs'], {
      cwd: REPO,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 1, 'no credentials must exit non-zero');
    assert.match(
      result.stdout,
      /CLOUDFLARE_(ACCOUNT_ID|API_TOKEN) is missing/,
      'the message must name the missing secret',
    );
  });
});

describe('live verification probe (scripts/verify-live.mjs)', () => {
  it('names the fault the edge reports, not just a status code', () => {
    // A bare 'HTTP 503' sends the operator back to curl by hand, and this is
    // the only place the 15-minute heartbeat can say WHY production is red.
    const live = readFileSync(join(REPO, 'scripts', 'verify-live.mjs'), 'utf8');
    assert.match(live, /function httpFailure\(/);
    assert.match(live, /assert\(status === 200, httpFailure\(status, body\)\)/);
  });

  it('labels the probe with the path it actually measures', () => {
    // The label said 'API /api/ping' while the probe measured '/api/health',
    // so the deploy log named an endpoint the operator could not diagnose.
    const live = readFileSync(join(REPO, 'scripts', 'verify-live.mjs'), 'utf8');
    assert.match(live, /probe\("API \/api\/health", apiPing\)/);
    assert.doesNotMatch(live, /probe\("API \/api\/ping"/);
  });
});