import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessUpstream, readCheckedInBackendUrl } from '../scripts/check-api-upstream.mjs';

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(SERVER, '..');
// The exact dead default that kept the production API at
// 503 UPSTREAM_MISCONFIGURED from 1.40.0 until it was removed from
// wrangler.api.toml (secret-only contract since).
const DEAD_DEFAULT = 'https://dypos-api.smartportssoft.com';

test('the checked-in wrangler.api.toml carries no self-referential BACKEND_URL', () => {
	const toml = readFileSync(resolve(REPO, 'wrangler.api.toml'), 'utf8');
	const verdict = assessUpstream(readCheckedInBackendUrl(toml));
	assert.equal(verdict.ok, true, verdict.detail);
});

test('the historical dead default is still recognised as a self-loop', () => {
	// If this ever stops failing, the edge-host list changed and the outage
	// this gate exists for can no longer be detected — investigate, do not
	// just update the expectation.
	const verdict = assessUpstream(DEAD_DEFAULT);
	assert.equal(verdict.ok, false);
	assert.equal(verdict.code, 'SELF_REFERENCE');
});

test('a genuinely external backend passes the gate', () => {
	const verdict = assessUpstream('https://api.example.com');
	assert.equal(verdict.ok, true);
	assert.equal(verdict.code, 'OK');
});

test('secret-only (no checked-in value) passes the gate', () => {
	for (const empty of [null, '']) {
		const verdict = assessUpstream(empty);
		assert.equal(verdict.ok, true);
		assert.equal(verdict.code, 'SECRET_ONLY');
	}
});

test('a malformed BACKEND_URL fails closed with a named fault', () => {
	for (const bad of ['not-a-url', 'ftp://backend.example.com', '://missing-scheme']) {
		const verdict = assessUpstream(bad);
		assert.equal(verdict.ok, false, bad);
		assert.equal(verdict.code, 'INVALID_URL', bad);
	}
});

test('the [vars] parser reads the value and tolerates its absence', () => {
	assert.equal(readCheckedInBackendUrl('[vars]\nBACKEND_URL = "https://x.example.com"\n'), 'https://x.example.com');
	assert.equal(readCheckedInBackendUrl('[vars]\nOTHER = "1"\n'), null);
	assert.equal(readCheckedInBackendUrl('# no vars section\n'), null);
});
