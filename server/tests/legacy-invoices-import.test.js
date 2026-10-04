/**
 * Legacy invoice import —” end-to-end over HTTP against a real database.
 *
 * ## Why this file exists beside `legacy-invoices.test.js`
 *
 * That file tests the RULES in isolation: normalization, the tax split, the
 * refusals. It never touches SQLite. So every property that only exists at the
 * database boundary was unproven while the suite reported green:
 *
 *   - do the INSERT column lists match the real schema? (`invoices` has no
 *     `branch_id` in `migrations-initial.js` —” it arrives via `addColumnIfMissing`
 *     in a later migration, so a commit written against a fresh DB fails with
 *     `no such column` while a commit written against a migrated one passes.)
 *   - does `tenant_id` actually isolate the rows?
 *   - does one transaction really roll the WHOLE batch back, or does a failure
 *     halfway leave a ledger nobody can reconcile?
 *   - does a re-run double the history?
 *
 * These are the four ways an accounting import destroys trust in a ledger while
 * every unit test still passes. Each is asserted here against HTTP + a live DB.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';

import { app } from '../server.js';
import db from '../db/schema.js';

let server;
let port;
let tokenA;
let tokenB;
let tenantA;
let tenantB;
const stamp = Date.now();
const PW = 'StrongP@55!';

/** 2 × 50 at 15% → 115.00 total, 15.00 tax. */
const CSV = [
	'number,date,total,name,qty,price,taxRate',
	'LEG-1,2025-03-04,115,صنف أ,2,50,15',
	'LEG-2,2025-03-05,230,صنف ب,4,50,15',
].join('\n');

/**
 * POST a raw CSV body, the way the route actually reads it.
 *
 * The route takes the file as a RAW body (`text/csv`), not a JSON envelope with
 * a `csv` field — a JSON body is rejected with -أرسل ملف JSON أو text/csv- and
 * the operator learns that from a 400 instead of from the docs. `dryRun` is a
 * QUERY parameter, again not part of the body.
 */
async function postCsv(csv, token, tenantId, query = '') {
	const headers = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	if (tenantId) headers['X-Tenant-Id'] = tenantId;
	headers['Content-Type'] = 'text/csv';
	const r = await fetch(`http://localhost:${port}/api/import/legacyInvoices${query}`, {
		method: 'POST',
		headers,
		body: csv,
	});
	let j;
	try {
		j = JSON.parse(await r.text());
	} catch {
		j = null;
	}
	return { status: r.status, body: j };
}

async function req(method, path, body, token, tenantId) {
	const headers = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	if (tenantId) headers['X-Tenant-Id'] = tenantId;
	if (body != null) headers['Content-Type'] = 'application/json';
	const r = await fetch(`http://localhost:${port}${path}`, {
		method,
		headers,
		body: body == null ? undefined : JSON.stringify(body),
	});
	let j;
	try {
		j = JSON.parse(await r.text());
	} catch {
		j = null;
	}
	return { status: r.status, body: j };
}

/** Rows a tenant owns —” the only thing tenant isolation may see. */
function rowsFor(tenantId) {
	return db.prepare('SELECT number, total FROM invoices WHERE tenant_id=? ORDER BY number').all(tenantId);
}

before(async () => {
	server = http.createServer(app);
	server.listen(0);
	await once(server, 'listening');
	port = server.address().port;

	const root = `leg_root_${stamp}`;
	await req('POST', '/api/auth/register', {
		username: root,
		password: PW,
		fullName: 'Legacy Root',
		role: 'ADMIN',
	});
	const admin = (await req('POST', '/api/auth/login', { username: root, password: PW })).body.token;

	// Two REAL tenants. Registering without one puts every user in the same
	// default tenant, which would make the isolation test below pass vacuously —”
	// or worse, fail for the wrong reason. The tenant is then carried on
	// `X-Tenant-Id`, which is how the route resolves scope (invariant 1).
	const ta = (await req('POST', '/api/tenants', { name: `Leg A ${stamp}` }, admin)).body.id;
	const tb = (await req('POST', '/api/tenants', { name: `Leg B ${stamp}` }, admin)).body.id;
	tenantA = ta;
	tenantB = tb;

	for (const [tag, tid] of [
		['a', ta],
		['b', tb],
	]) {
		const u = `leg_${tag}_${stamp}`;
		await req(
			'POST',
			'/api/auth/register',
			{ username: u, password: PW, fullName: `Legacy ${tag}`, role: 'ADMIN', tenantId: tid },
			admin,
		);
		const r = await req('POST', '/api/auth/login', { username: u, password: PW });
		if (tag === 'a') tokenA = r.body.token;
		else tokenB = r.body.token;
	}
	assert.ok(tenantA && tenantB && tenantA !== tenantB, 'two distinct tenants are required');
});

after(() => {
	try {
		server?.close();
		db.close();
	} catch {
		/* ignore */
	}
});
describe('POST /api/import/legacyInvoices against a real schema', () => {
	it('writes headers and lines with the invoice date, not the import date', async () => {
		const r = await postCsv(CSV, tokenA, tenantA);
		assert.equal(r.status, 201, `import failed: ${JSON.stringify(r.body)}`);
		assert.equal(r.body.created, 2);
		assert.equal(r.body.items, 2);

		const row = db.prepare('SELECT id, created_at, total, tax_amount, notes FROM invoices WHERE number=?').get('LEG-1');
		assert.ok(row, 'the invoice row is missing');
		// Back-dated: a migrated invoice belongs to the period it was issued in,
		// or every period report for the migration year reads wrong.
		assert.ok(String(row.created_at).startsWith('2025-03-04'), `created_at=${row.created_at}`);
		assert.equal(Number(row.total), 115);
		assert.equal(Number(row.tax_amount), 15);
		assert.ok(String(row.notes).length > 0, 'a migrated invoice must be marked as one');

		const items = db
			.prepare('SELECT product_name, qty, unit_price, tax_amount FROM invoice_items WHERE invoice_id=?')
			.all(row.id);
		assert.equal(items.length, 1);
		assert.equal(Number(items[0].qty), 2);
		assert.equal(Number(items[0].tax_amount), 15);
	});

	it('a second import of the same file creates nothing (idempotent)', async () => {
		const before = db.prepare('SELECT COUNT(*) c FROM invoices').get().c;
		const r = await postCsv(CSV, tokenA, tenantA);
		assert.equal(r.status, 201);
		assert.equal(r.body.created, 0, 're-import duplicated history');
		assert.equal(r.body.skipped, 2);
		assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c, before);
	});

	it('tenant isolation: the same numbers in two tenants are two ledgers', async () => {
		assert.ok(tenantA && tenantB, 'the test tenants did not resolve');
		assert.notEqual(tenantA, tenantB, 'the two fixtures collapsed into one tenant');

		const r = await postCsv(CSV, tokenB, tenantB);
		assert.equal(r.status, 201);
		// Same invoice NUMBER, different tenant. The duplicate check is scoped by
		// tenant, so B gets its own copy instead of reporting A's rows as clashes
		// —” and B cannot see A's rows through any read.
		assert.equal(r.body.created, 2, 'B was blocked by A rows —” the lookup is not tenant-scoped');
		assert.equal(r.body.skipped, 0);

		assert.deepEqual(
			rowsFor(tenantA).map((x) => x.number),
			['LEG-1', 'LEG-2'],
			'tenant A lost its own ledger',
		);
		assert.deepEqual(
			rowsFor(tenantB).map((x) => x.number),
			['LEG-1', 'LEG-2'],
			'tenant B did not get its own ledger',
		);
	});

	it('a rejected batch leaves NO rows —” an invalid row cannot half-apply', async () => {
		const marker = `ROLLBACK-${stamp}`;
		const poisoned = [
			'number,date,total,name,qty,price,taxRate',
			`${marker}-1,2025-04-01,100,صنف,1,100,15`,
			`${marker}-2,not-a-date,100,صنف,1,100,15`,
		].join('\n');

		const r = await postCsv(poisoned, tokenA, tenantA);
		assert.notEqual(r.status, 201, 'an invalid date was accepted');
		const leaked = db.prepare('SELECT COUNT(*) c FROM invoices WHERE number LIKE ?').get(`${marker}%`);
		assert.equal(leaked.c, 0, `a rejected batch still wrote ${leaked.c} rows`);
	});

	it('dryRun reports what it would do and writes nothing', async () => {
		const marker = `DRY-${stamp}`;
		const fresh = [
			'number,date,total,name,qty,price,taxRate',
			// total must be 50 + 15% = 57.5, or the parser refuses the file — a header
			// that disagrees with its own lines is exactly what a migration must not accept.
			`${marker},2025-05-01,57.5,صنف,1,50,15`,
		].join('\n');
		const before = db.prepare('SELECT COUNT(*) c FROM invoices').get().c;

		const r = await postCsv(fresh, tokenA, tenantA, '?dryRun=1');
		assert.equal(r.body.dryRun, true);
		assert.equal(r.body.invoices, 1);
		assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c, before);
		assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices WHERE number=?').get(marker).c, 0, 'dryRun wrote a row');
	});

	it('an unauthenticated import is refused', async () => {
		const r = await postCsv(CSV, null, null);
		assert.equal(r.status, 401);
	});
});
// __APPEND__
