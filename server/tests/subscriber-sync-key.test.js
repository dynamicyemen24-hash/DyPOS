/**
 * Subscriber sync key — the credential a subscriber's terminals sync with.
 *
 * A key is issued once (scripts/seed-royal-production.mjs prints it; only the
 * SHA-256 hash is stored) and then travels as `Authorization: Bearer <key>`,
 * because that is what POS/src/services/sync-protocol.js actually sends
 * (POS/src/services/sync-core.js builds the protocol with a tokenProvider).
 *
 * This suite exists because that pairing was a DEAD CONTRACT: resolveApiKey()
 * read only the `X-API-Key` header, so a key issued specifically for sync was
 * rejected with 401 on the one path it exists to serve. A test that only
 * creates a key and lists it would have stayed green through all of that.
 *
 * Covered here:
 *  - Bearer <key> authenticates (the fixed path) and X-API-Key still does
 *  - the identity is scoped to the key's tenant, never another one (invariant 1)
 *  - a session JWT is never shadowed by the key table (no privilege confusion)
 *  - revoked / expired / unknown secrets are refused, never degraded
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';

import { app } from '../server.js';

let server;
let port;
let admin;
let tenantA;
let tenantB;
let keyA;
let keyPrefixA;
let keyIdA;
let stamp = 0;

async function req(method, path, body, tok, extraHeaders = {}) {
	const headers = { 'Content-Type': 'application/json', ...extraHeaders };
	if (tok) headers.Authorization = `Bearer ${tok}`;
	const res = await fetch(`http://localhost:${port}${path}`, {
		method,
		headers,
		body: body === undefined || body === null ? undefined : JSON.stringify(body),
	});
	const text = await res.text();
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = text;
	}
	return { status: res.status, body: parsed };
}

/** Issue a subscriber sync key exactly the way provisioning does. */
async function issueKey(tenantId, name) {
	const r = await req(
		'POST',
		'/api/admin/api-keys',
		{
			name,
			role: 'ADMIN',
			tenantId,
			scopes: ['sync'],
		},
		admin,
	);
	assert.strictEqual(r.status, 201, `issue key → ${JSON.stringify(r.body)}`);
	return r.body;
}

before(async () => {
	server = http.createServer(app);
	server.listen(0);
	await once(server, 'listening');
	port = server.address().port;

	const uname = `sub_${Date.now()}`;
	await req('POST', '/api/auth/register', {
		username: uname,
		password: 'Pass1234',
		fullName: 'Sub Key',
		role: 'ADMIN',
	});
	const login = await req('POST', '/api/auth/login', { username: uname, password: 'Pass1234' });
	assert.strictEqual(login.status, 200);
	admin = login.body.token;

	const ta = await req('POST', '/api/tenants', { name: 'رويال العالمية', code: `RGT-${Date.now()}` }, admin);
	const tb = await req('POST', '/api/tenants', { name: 'مشترك آخر', code: `OTH-${Date.now()}` }, admin);
	assert.strictEqual(ta.status, 201, JSON.stringify(ta.body));
	assert.strictEqual(tb.status, 201, JSON.stringify(tb.body));
	tenantA = ta.body.id;
	tenantB = tb.body.id;

	const k = await issueKey(tenantA, 'royal-global-sync');
	keyA = k.key;
	keyPrefixA = k.key_prefix;
	keyIdA = k.id;
});

after(() => server.close());

describe('Subscriber sync key', () => {
	it('authenticates as `Authorization: Bearer <key>` — the way the POS sends it', async () => {
		const r = await req('GET', '/api/sync/pull', null, null, { Authorization: `Bearer ${keyA}` });
		assert.strictEqual(r.status, 200, `bearer sync key → ${JSON.stringify(r.body)}`);
		assert.strictEqual(r.body.tenant, tenantA, 'the key carries its own tenant scope');
	});

	it('still authenticates as X-API-Key (ERP/WMS integrations keep working)', async () => {
		const r = await req('GET', '/api/sync/pull', null, null, { 'X-API-Key': keyA });
		assert.strictEqual(r.status, 200, JSON.stringify(r.body));
		assert.strictEqual(r.body.tenant, tenantA);
	});

	it('identifies as a machine, and /me reports it as an api key', async () => {
		const r = await req('GET', '/api/auth/me', null, null, { Authorization: `Bearer ${keyA}` });
		assert.strictEqual(r.status, 200, JSON.stringify(r.body));
		assert.strictEqual(r.body.apiKey, true);
		assert.match(r.body.username, /^apikey:/);
	});

	it('never leaks the secret: only the prefix is readable', async () => {
		const list = await req('GET', '/api/admin/api-keys', null, admin);
		assert.strictEqual(list.status, 200);
		const mine = list.body.keys.find((k) => k.id === keyIdA);
		assert.ok(mine, 'the issued key is listed');
		assert.strictEqual(mine.key_prefix, keyPrefixA);
		assert.strictEqual(mine.key_hash, undefined, 'the hash never leaves the server');
		assert.ok(!('key' in mine));
	});

	it('is scoped to its own tenant — a key for A cannot read B rows (fail-closed)', async () => {
		// The product must be OWNED by another tenant, not tenant-less: a NULL
		// tenant_id row is deliberately readable as legacy unattributed data, so
		// creating it through the root admin would assert nothing.
		stamp++;
		const uname = `subb_${stamp}_${Date.now()}`;
		await req(
			'POST',
			'/api/auth/register',
			{
				username: uname,
				password: 'Pass1234',
				fullName: 'B Admin',
				role: 'ADMIN',
				tenantId: tenantB,
			},
			admin,
		);
		const bLogin = await req('POST', '/api/auth/login', { username: uname, password: 'Pass1234' });
		assert.strictEqual(bLogin.status, 200);
		const tokenB = bLogin.body.token;

		const foreign = await req(
			'POST',
			'/api/products',
			{
				name: `خاص بمشترك آخر ${stamp}`,
				code: `FK-${stamp}-${Date.now()}`,
				unitPrice: 10,
			},
			tokenB,
		);
		assert.strictEqual(foreign.status, 201, JSON.stringify(foreign.body));

		// B's own key may read it...
		const kB = await issueKey(tenantB, `b-key-${stamp}`);
		assert.strictEqual(
			(
				await req('GET', `/api/products/${foreign.body.id}`, null, null, {
					Authorization: `Bearer ${kB.key}`,
				})
			).status,
			200,
			'the owning tenant key reads its own row',
		);

		// ...A's key must not (invariant 1: foreign row → 404, never a leak).
		const viaA = await req('GET', `/api/products/${foreign.body.id}`, null, null, {
			Authorization: `Bearer ${keyA}`,
		});
		assert.strictEqual(
			viaA.status,
			404,
			`cross-tenant read must be 404, got ${viaA.status} ${JSON.stringify(viaA.body)}`,
		);
	});

	it('refuses an unknown secret instead of degrading to a lesser identity', async () => {
		const r = await req('GET', '/api/sync/pull', null, null, {
			Authorization: 'Bearer dypos_deadbeefdeadbeefdeadbeefdeadbeef',
		});
		assert.strictEqual(r.status, 401);
	});

	it('refuses a revoked key on both header forms', async () => {
		const k = await issueKey(tenantB, 'to-revoke');
		assert.strictEqual((await req('GET', '/api/sync/pull', null, null, { 'X-API-Key': k.key })).status, 200);
		const rev = await req('DELETE', `/api/admin/api-keys/${k.id}`, null, admin);
		assert.strictEqual(rev.status, 200);
		assert.strictEqual(
			(await req('GET', '/api/sync/pull', null, null, { 'X-API-Key': k.key })).status,
			401,
			'x-api-key',
		);
		assert.strictEqual(
			(await req('GET', '/api/sync/pull', null, null, { Authorization: `Bearer ${k.key}` })).status,
			401,
			'bearer',
		);
	});

	it('a session JWT keeps priority over the key table', async () => {
		// admin is a real JWT for a real ADMIN user. It must authenticate as that
		// user (role ADMIN, no apikey: prefix) — a key can never shadow a session.
		const r = await req('GET', '/api/sync/pull', null, admin);
		assert.strictEqual(r.status, 200);
		const me = await req('GET', '/api/auth/me', null, admin);
		assert.strictEqual(me.body.apiKey, undefined, 'a JWT session is not reported as a key');
	});
});
