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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

const workflow = readFileSync(join(REPO, '.github', 'workflows', 'deploy-cloudflare.yml'), 'utf8');
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
		assert.ok(scriptIndex < deployIndex, 'the preflight must run BEFORE the deploy, or it diagnoses nothing');
	});

	it('the preflight keeps both causes distinguishable', () => {
		for (const needle of ['/user/tokens/verify', '/pages/projects', 'Cloudflare Pages:Edit', 'production_branch']) {
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
	it('reports optional sync-backend faults without gating the offline release', () => {
		const live = readFileSync(join(REPO, 'scripts', 'verify-live.mjs'), 'utf8');
		assert.match(live, /function httpFailure\(/);
		assert.match(live, /async function optionalSyncBackend\(/);
		assert.match(live, /offline POS release is unaffected/);
		assert.doesNotMatch(live, /probe\("API \/api\/health"/);
	});

	it('gates the deployed Worker version and readiness, not an optional backend', () => {
		const live = readFileSync(join(REPO, 'scripts', 'verify-live.mjs'), 'utf8');
		assert.match(live, /probe\("API edge release \+ readiness", apiEdge\)/);
		assert.match(live, /\/api\/edge-health/);
		assert.match(live, /\/api\/ready/);
		assert.match(live, /ready\.database_bound === true/);
	});

	it('is a real Release Gate: CSRF, auth, session, tenant, logout, sync + offline durability under an explicit contract', () => {
		const live = readFileSync(join(REPO, 'scripts', 'verify-live.mjs'), 'utf8');
		for (const needle of [
			'RELEASE_CONTRACT',
			'OFFLINE_ONLY',
			'ONLINE_REQUIRED',
			'UPSTREAM_MISCONFIGURED',
			'/api/csrf_token',
			'/api/auth/login',
			'/api/auth/me',
			'/api/tenants',
			'/api/auth/logout',
			'offline durability',
			'contractProbe',
		]) {
			assert.ok(live.includes(needle), `verify-live must cover ${needle}`);
		}
		// A required Auth/Sync dependency that is unready must fail the gate —
		// never a 7/7 pass with a warning standing in for a blocker.
		assert.match(live, /BLOCKER/);
	});
});

/**
 * The nightly load test spent its whole run measuring the rate limiter.
 *
 * server/middleware/rate-limiters.js promises in its own header that both
 * limits are env-tunable "BECAUSE the load test needs them raised without
 * touching code" — and the workflow never passed them. Result: 996 successes
 * then 429 for the remaining 24,813 requests, reported as "96% error rate"
 * while the API was perfectly healthy. A gate that cries wolf is worse than no
 * gate, so the promise in the code header is now pinned HERE, where it is read.
 */
describe('nightly load-test budgets', () => {
	const nightly = readFileSync(join(REPO, '.github', 'workflows', 'nightly-load-test.yml'), 'utf8');

	it("boots the API with a global rate limit above the run's request budget", () => {
		const budget = Number(nightly.match(/DYPOS_RATE_LIMIT_MAX=(\d+)/)?.[1]);
		assert.ok(Number.isFinite(budget), 'the boot step must set DYPOS_RATE_LIMIT_MAX');
		// The k6 stages issue ~25,813 requests; 100k leaves ~4x headroom while
		// staying finite so flood protection is NOT disabled by the test.
		assert.ok(
			budget >= 100000,
			`DYPOS_RATE_LIMIT_MAX=${budget} is below the ~25,813-request budget — the SLOs would measure the limiter, not the invoice path`,
		);
		assert.ok(budget <= 1e9, 'a finite budget keeps flood protection alive during the run');
	});

	it('names the reproduction that proves the limiter was the wall', () => {
		// Without this, the number looks arbitrary and the next person "tidies"
		// it back to the default. The repro is the evidence.
		assert.match(nightly, /repro-rate-wall\.mjs/);
		assert.ok(
			existsSync(join(REPO, 'server', 'tests', 'load', 'repro-rate-wall.mjs')),
			'the repro script referenced by the workflow must exist',
		);
	});

	it('keeps the auth limiter at its default on purpose', () => {
		// setup() logs in once per run and successful logins are not counted, so
		// raising this would be silencing a protection that is not in the way.
		assert.doesNotMatch(nightly, /DYPOS_AUTH_LIMIT_MAX=/);
	});
});
