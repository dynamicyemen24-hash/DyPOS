/**
 * Expense void — retire, never destroy.
 *
 * End-to-end over HTTP against a fresh in-memory DB: a wrongly recorded
 * expense is VOIDED (status + who/when/why kept), drops out of the list and
 * the P&L summary, stays in the supervisory register, and leaves one VOID
 * trail row. A foreign id answers 404 without leaking existence.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';

import { app } from '../server.js';

let server;
let port;
let tokenA;
let tokenB;
let tenantA;
let tenantB;

const stamp = Date.now();
const PW = 'StrongP@55!';

async function req(method, path, body, token, extra) {
	const headers = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	if (body != null) headers['Content-Type'] = 'application/json';
	Object.assign(headers, extra);
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

before(async () => {
	server = http.createServer(app);
	server.listen(0);
	await once(server, 'listening');
	port = server.address().port;

	const root = `exp_root_${stamp}`;
	await req('POST', '/api/auth/register', { username: root, password: PW, fullName: 'Exp Root', role: 'ADMIN' });
	const admin = (await req('POST', '/api/auth/login', { username: root, password: PW })).body.token;

	tenantA = (await req('POST', '/api/tenants', { name: `Exp A ${stamp}` }, admin)).body.id;
	tenantB = (await req('POST', '/api/tenants', { name: `Exp B ${stamp}` }, admin)).body.id;

	const ua = `exp_a_${stamp}`;
	await req(
		'POST',
		'/api/auth/register',
		{ username: ua, password: PW, fullName: 'Exp A', role: 'ADMIN', tenantId: tenantA },
		admin,
	);
	tokenA = (await req('POST', '/api/auth/login', { username: ua, password: PW })).body.token;

	const ub = `exp_b_${stamp}`;
	await req(
		'POST',
		'/api/auth/register',
		{ username: ub, password: PW, fullName: 'Exp B', role: 'ADMIN', tenantId: tenantB },
		admin,
	);
	tokenB = (await req('POST', '/api/auth/login', { username: ub, password: PW })).body.token;
});

after(() => server?.close());

describe('expense void', () => {
	it('void retires the row: excluded by default, kept in the register + trail', async () => {
		const created = await req(
			'POST',
			'/api/expenses',
			{ date: '2026-01-15', category: 'إيجار', amount: 1500 },
			tokenA,
			{ 'X-Tenant-Id': tenantA },
		);
		assert.strictEqual(created.status, 201);
		const id = created.body.expenseId;

		const del = await req('DELETE', `/api/expenses/${id}`, { reason: 'قيد مكرر' }, tokenA, {
			'X-Tenant-Id': tenantA,
		});
		assert.strictEqual(del.status, 200);
		assert.strictEqual(del.body.deleted, true);

		const list = await req('GET', '/api/expenses', null, tokenA, { 'X-Tenant-Id': tenantA });
		assert.ok(!list.body.expenses.some((e) => e.id === id), 'voided expense leaked into the list');

		const summary = await req('GET', '/api/expenses/summary', null, tokenA, { 'X-Tenant-Id': tenantA });
		assert.strictEqual(summary.body.total, 0, 'voided expense leaked into the P&L summary');

		const register = await req('GET', '/api/expenses?includeVoided=1', null, tokenA, {
			'X-Tenant-Id': tenantA,
		});
		const kept = register.body.expenses.find((e) => e.id === id);
		assert.ok(kept, 'voided expense retained in the register');
		assert.strictEqual(kept.status, 'VOIDED');
		assert.ok(kept.voided_at, 'void timestamp recorded');
		assert.strictEqual(kept.void_reason, 'قيد مكرر');

		const trail = await req('GET', '/api/admin/trail?entity=EXPENSE&action=VOID', null, tokenA, {
			'X-Tenant-Id': tenantA,
		});
		assert.strictEqual(trail.status, 200);
		assert.ok(
			trail.body.trail.some((t) => t.entity_id === id),
			'void recorded in the audit trail',
		);
	});

	it('voiding a foreign expense is 404, not 403', async () => {
		const created = await req('POST', '/api/expenses', { date: '2026-01-15', category: 'رواتب', amount: 500 }, tokenA, {
			'X-Tenant-Id': tenantA,
		});
		const r = await req('DELETE', `/api/expenses/${created.body.expenseId}`, null, tokenB, {
			'X-Tenant-Id': tenantB,
		});
		assert.strictEqual(r.status, 404);
	});
});
