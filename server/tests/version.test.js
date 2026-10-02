/**
 * Version single-source drift test (C3).
 * `server/lib/version.js` is the ONLY place the server version is defined.
 * server.js, openapi.js, print.js import it; package.json and the frontend
 * build stamp must match. Any drift fails the suite.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app } from '../server.js';
import { VERSION } from '../lib/version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

let server;
let port;

async function req(method, path) {
	const res = await fetch(`http://localhost:${port}${path}`, { method });
	const text = await res.text();
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = text;
	}
	return { status: res.status, body: parsed };
}

before(async () => {
	server = http.createServer(app);
	server.listen(0);
	await once(server, 'listening');
	port = server.address().port;
});

after(() => server.close());

describe('Version single source (C3)', () => {
	it('lib/version.js exports a semver string', () => {
		assert.match(VERSION, /^\d+\.\d+\.\d+$/);
	});

	it('server/package.json matches the single source', () => {
		assert.strictEqual(pkg.version, VERSION);
	});

	it('GET /api/health reports the single-source version', async () => {
		// Contract, not environment: /api/health answers 503 when ANY registered
		// check degrades (disk/memory thresholds included), so a hard `200` is
		// environment-dependent under a parallel suite. The version stamp is the
		// subject here, and the status must agree with the aggregate it reports.
		const r = await req('GET', '/api/health');
		assert.ok([200, 503].includes(r.status), `unexpected health status ${r.status}`);
		assert.strictEqual(r.body.status, r.status === 200 ? 'ok' : 'degraded');
		assert.strictEqual(r.body.version, VERSION);
	});

	it('GET /api/ready reports the single-source version', async () => {
		const r = await req('GET', '/api/ready');
		assert.strictEqual(r.status, 200);
		assert.strictEqual(r.body.version, VERSION);
	});

	it('GET /api/openapi.json reports the single-source version', async () => {
		const r = await req('GET', '/api/openapi.json');
		assert.strictEqual(r.status, 200);
		assert.strictEqual(r.body?.info?.version, VERSION);
	});
});
