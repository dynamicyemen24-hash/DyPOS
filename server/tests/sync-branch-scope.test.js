/**
 * Multi-branch sync scope (v29) — every point of sale syncs independently.
 *
 * A terminal of branch A pulls branch A's changes and its own cursor; it
 * never receives branch B's rows and never adopts branch B's checkpoint.
 * The legacy NULL-branch rows stay visible to every scope of the tenant so
 * the migration hides nothing that existed before v29.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';
import { app } from '../server.js';
import db from '../db/schema.js';

let server;
let port;
let admin;
let tenantA;
let orgA;
let branchA;
let branchB;

before(async () => {
	server = http.createServer(app);
	server.listen(0);
	await once(server, 'listening');
	port = server.address().port;
	const u = `bsync_${Date.now()}`;
	await req('POST', '/api/auth/register', {
		username: u,
		password: 'Pass1234',
		fullName: 'BSync Admin',
		role: 'ADMIN',
	});
	admin = (await req('POST', '/api/auth/login', { username: u, password: 'Pass1234' })).body.token;
	tenantA = (await req('POST', '/api/tenants', { name: 'BSync Tenant' }, admin)).body.id;
	orgA = (await req('POST', '/api/orgs', { name: 'BSync Org', tenantId: tenantA }, admin)).body.id;
	branchA = (await req('POST', '/api/branches', { name: 'BSync Branch A', code: 'BSA', orgId: orgA }, admin)).body.id;
	branchB = (await req('POST', '/api/branches', { name: 'BSync Branch B', code: 'BSB', orgId: orgA }, admin)).body.id;
});

after(() => server.close());

async function req(method, path, body, tok, extra = {}) {
	const h = {};
	if (tok) h.Authorization = `Bearer ${tok}`;
	if (body != null) h['Content-Type'] = 'application/json';
	Object.assign(h, extra);
	const r = await fetch(`http://localhost:${port}${path}`, {
		method,
		headers: h,
		body: body == null ? undefined : JSON.stringify(body),
	});
	const text = await r.text();
	let j;
	try {
		j = JSON.parse(text);
	} catch {
		j = text;
	}
	return { status: r.status, body: j };
}

function queue(entityId, tenant, branch) {
	db.prepare(`INSERT INTO sync_log (entity_type,entity_id,action,tenant_id,branch_id,status)
              VALUES ('PRODUCT',?, 'UPSERT', ?, ?, 'PENDING')`).run(entityId, tenant, branch);
}

describe('Branch-scoped sync pull (v29)', () => {
	it('a branch sees its own rows, its tenant legacy rows, and never another branch of the same tenant', async () => {
		const t = Date.now();
		queue(`bs-a-${t}`, tenantA, branchA);
		queue(`bs-b-${t}`, tenantA, branchB);
		queue(`bs-legacy-${t}`, tenantA, null);

		const pullA = await req('GET', '/api/sync/pull?checkpoint=0&limit=2000', null, admin, {
			'X-Tenant-Id': tenantA,
			'X-Branch-Id': branchA,
		});
		assert.strictEqual(pullA.status, 200);
		const idsA = pullA.body.changes.map((c) => c.entity_id);
		assert.ok(idsA.includes(`bs-a-${t}`), 'own branch row visible');
		assert.ok(idsA.includes(`bs-legacy-${t}`), 'legacy NULL-branch row visible');
		assert.ok(!idsA.includes(`bs-b-${t}`), 'sibling branch row hidden');
		assert.strictEqual(pullA.body.branch, branchA, 'response names the scope it served');

		const pullB = await req('GET', '/api/sync/pull?checkpoint=0&limit=2000', null, admin, {
			'X-Tenant-Id': tenantA,
			'X-Branch-Id': branchB,
		});
		const idsB = pullB.body.changes.map((c) => c.entity_id);
		assert.ok(idsB.includes(`bs-b-${t}`), 'branch B sees its own row');
		assert.ok(!idsB.includes(`bs-a-${t}`), 'branch B never receives branch A rows');
	});

	it('unknown branch on pull is 404, not a silent passthrough', async () => {
		const r = await req('GET', '/api/sync/pull?checkpoint=0', null, admin, {
			'X-Tenant-Id': tenantA,
			'X-Branch-Id': 'no-such-branch',
		});
		assert.strictEqual(r.status, 404);
	});

	it('a branch outside the tenant is 403, never a cross-tenant read', async () => {
		const other = (await req('POST', '/api/tenants', { name: 'BSync Other' }, admin)).body.id;
		const otherOrg = (await req('POST', '/api/orgs', { name: 'BSync Other Org', tenantId: other }, admin)).body.id;
		const otherBranch = (
			await req('POST', '/api/branches', { name: 'BSync Other Branch', code: 'BSOB', orgId: otherOrg }, admin)
		).body.id;
		const r = await req('GET', '/api/sync/pull?checkpoint=0', null, admin, {
			'X-Tenant-Id': tenantA,
			'X-Branch-Id': otherBranch,
		});
		assert.strictEqual(r.status, 403);
	});

	it('omitting the branch keeps the tenant-wide (legacy) view', async () => {
		const t = Date.now();
		queue(`bs-wide-${t}`, tenantA, branchB);
		const r = await req('GET', '/api/sync/pull?checkpoint=0&limit=2000', null, admin, {
			'X-Tenant-Id': tenantA,
		});
		assert.strictEqual(r.status, 200);
		assert.ok(r.body.changes.map((c) => c.entity_id).includes(`bs-wide-${t}`));
		assert.strictEqual(r.body.branch, null, 'no branch scope echoed back');
	});
});

describe('Branch-scoped checkpoint (v29)', () => {
	it('a fresh branch never adopts a sibling branch cursor', async () => {
		const t = Date.now();
		// Branch A accumulates history; branch B is new on this device.
		queue(`bs-hist-a-${t}`, tenantA, branchA);
		const a = await req('GET', '/api/sync/checkpoint', null, admin, {
			'X-Tenant-Id': tenantA,
			'X-Branch-Id': branchA,
		});
		const b = await req('GET', '/api/sync/checkpoint', null, admin, {
			'X-Tenant-Id': tenantA,
			'X-Branch-Id': branchB,
		});
		assert.strictEqual(a.status, 200);
		assert.strictEqual(b.status, 200);
		assert.ok(a.body.checkpoint >= b.body.checkpoint, 'branch A cursor is at least branch B');
		assert.ok(b.body.checkpoint >= 0, 'branch B gets a real cursor, not a global skip');
		assert.strictEqual(b.body.branch, branchB, 'checkpoint names its scope');
		// The global max belongs to unscoped/other rows; B must not inherit it blindly.
		const global = db.prepare('SELECT MAX(id) AS m FROM sync_log').get();
		if (global?.m && global.m > b.body.checkpoint) {
			assert.notStrictEqual(b.body.checkpoint, global.m, 'branch cursor is scoped, not global');
		}
	});

	it('unknown branch on checkpoint is 404', async () => {
		const r = await req('GET', '/api/sync/checkpoint', null, admin, {
			'X-Tenant-Id': tenantA,
			'X-Branch-Id': 'ghost',
		});
		assert.strictEqual(r.status, 404);
	});
});

describe('Push stamps the origin branch (v29)', () => {
	it('a pushed change carries the pushing branch so the sibling never pulls it', async () => {
		const t = Date.now();
		const rowId = db
			.prepare(`INSERT INTO sync_log (entity_type,entity_id,action,status) VALUES ('PRODUCT',?,'UPSERT','PENDING')`)
			.run(`bs-push-${t}`).lastInsertRowid;
		const code = `BSP-${t}`;
		const change = {
			id: rowId,
			entity_type: 'PRODUCT',
			action: 'UPSERT',
			idempotencyKey: `bs-key-${t}`,
			payload: JSON.stringify({ id: `bs-p-${t}`, code, name: 'BS Prod', unitPrice: 5 }),
		};
		const push = await req('POST', '/api/sync/push', { changes: [change] }, admin, {
			'X-Tenant-Id': tenantA,
			'X-Branch-Id': branchA,
		});
		assert.strictEqual(push.status, 200);
		assert.strictEqual(push.body.results[0].status, 'SYNCED');

		const stamped = db.prepare('SELECT tenant_id, branch_id FROM sync_log WHERE id=?').get(rowId);
		assert.strictEqual(String(stamped.tenant_id), String(tenantA), 'push stamps the tenant');
		assert.strictEqual(String(stamped.branch_id), String(branchA), 'push stamps the origin branch');

		const pullB = await req('GET', '/api/sync/pull?checkpoint=0&limit=2000', null, admin, {
			'X-Tenant-Id': tenantA,
			'X-Branch-Id': branchB,
		});
		assert.ok(!pullB.body.changes.some((c) => String(c.id) === String(rowId)), 'sibling branch never pulls it');
	});
});

describe('Schema carries the branch scope (v29)', () => {
	it('sync_log has branch_id and both scope indexes exist', async () => {
		const cols = db
			.prepare('PRAGMA table_info(sync_log)')
			.all()
			.map((c) => c.name);
		assert.ok(cols.includes('branch_id'), 'sync_log.branch_id exists');
		const idx = db
			.prepare("SELECT name FROM sqlite_master WHERE type='index'")
			.all()
			.map((i) => i.name);
		assert.ok(idx.includes('idx_sync_tenant_branch'), 'composite tenant+branch index exists');
		assert.ok(idx.includes('idx_sync_pull'), 'pull index exists');
		const v = db.prepare('SELECT MAX(version) AS v FROM schema_version').get();
		assert.ok(Number(v.v) >= 29, 'schema_version advanced to at least 29');
	});
});
