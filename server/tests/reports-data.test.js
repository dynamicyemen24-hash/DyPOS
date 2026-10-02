/**
 * Report data contract: the numbers dashboards render must come from real
 * columns, and the denominator used to label them must be provable.
 *
 * Two silent lies were live here:
 *
 *   1. `Sales Invoice` projected neither `base_net_total` nor
 *      `outstanding_amount`, so `sumBy(invoices, "base_net_total")` summed
 *      `undefined` and "Total Revenue" showed a confident 0.00 on a healthy
 *      server. The projection now emits the real columns.
 *   2. `get_list` caps a page at 500 rows while the report layer asked for
 *      `limit: 0`, i.e. 50 rows — the oldest 50, presented as the period's
 *      totals. `get_count` is the denominator that makes pagination provable,
 *      and it MUST agree with `get_list` for the same filters.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';

import { app } from '../server.js';
import { DOCTYPES, resolveDoctype } from '../routes/method.js';
import db from '../db/schema.js';

let server;
let port;
let cashier;

before(async () => {
	server = http.createServer(app);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	port = server.address().port;
	const username = `rep_${Date.now()}`;
	await req('POST', '/api/auth/register', {
		username,
		password: 'Pass1234',
		fullName: 'Rep',
		role: 'CASHIER',
	});
	cashier = (await req('POST', '/api/auth/login', { username, password: 'Pass1234' })).body.token;
});

after(async () => {
	if (server) await new Promise((r) => server.close(r));
});

async function req(method, path, body, tok) {
	const headers = { 'Content-Type': 'application/json' };
	if (tok) headers.Authorization = `Bearer ${tok}`;
	const res = await fetch(`http://127.0.0.1:${port}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
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

/** Call a method-router verb as the seeded cashier. */
async function M(method, args) {
	return req('POST', `/api/method/${method}`, args, cashier);
}

/**
 * Insert an invoice row directly.
 *
 * The projection is what is under test, not the write path — going through
 * POST /api/invoices would drag shift/permission rules into this file and fail
 * for reasons unrelated to the contract being proved. Explicit values let the
 * assertions compare the ledger against the projection.
 */
function seedInvoice(overrides = {}) {
	const suffix = Date.now() + Math.random().toString(36).slice(2, 8);
	const id = `INV-REP-${suffix}`;
	const row = {
		id,
		number: `POS-${suffix}`,
		customer_id: 'CUST-1',
		customer_name: 'Walk-in Customer',
		subtotal: 180,
		tax_amount: 27,
		discount_amount: 7,
		total: 200,
		paid_amount: 150,
		remaining_amount: 50,
		status: 'UNPAID',
		created_at: new Date().toISOString(),
		...overrides,
	};
	db.prepare(
		`INSERT INTO invoices (id, number, customer_id, customer_name, subtotal, tax_amount,
      discount_amount, total, paid_amount, remaining_amount, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		row.id,
		row.number,
		row.customer_id,
		row.customer_name,
		row.subtotal,
		row.tax_amount,
		row.discount_amount,
		row.total,
		row.paid_amount,
		row.remaining_amount,
		row.status,
		row.created_at,
	);
	return row;
}

describe('Sales Invoice projection carries the financial facts reports sum', () => {
	it('emits net/grand/tax/discount/paid/outstanding from real columns', async () => {
		const created = seedInvoice();
		const id = created.id;

		const list = await M('dypos.client.get_list', {
			doctype: 'Sales Invoice',
			filters: [['name', '=', id]],
			limit_page_length: 10,
		});
		assert.strictEqual(list.status, 200);
		const row = list.body.message?.[0];
		assert.ok(row, 'the invoice must be readable through the router');

		// The regression: these were all absent, so every sum was 0.
		for (const field of [
			'base_net_total',
			'base_grand_total',
			'base_total_taxes_and_charges',
			'base_discount_amount',
			'base_paid_amount',
			'outstanding_amount',
		]) {
			assert.strictEqual(
				typeof row[field],
				'number',
				`${field} must be a number in the projection (undefined → every report summed 0)`,
			);
		}
		assert.ok(row.base_grand_total > 0, 'a seeded invoice has a real total');
		assert.strictEqual(row.number, created.number, 'the invoice number must be exposed');
		assert.ok('customer_name' in row && 'due_date' in row);

		// The values must match the ledger, not merely be present.
		const raw = db
			.prepare(
				'SELECT subtotal, total, tax_amount, discount_amount, paid_amount, remaining_amount FROM invoices WHERE id=?',
			)
			.get(id);
		assert.strictEqual(row.base_net_total, raw.subtotal);
		assert.strictEqual(row.base_grand_total, raw.total);
		assert.strictEqual(row.outstanding_amount, raw.remaining_amount);
	});
});

describe('dypos.client.get_count — the denominator pagination needs', () => {
	it('agrees with get_list for the same filters', async () => {
		const id = seedInvoice().id;
		const filters = [['name', '=', id]];

		const count = await M('dypos.client.get_count', { doctype: 'Sales Invoice', filters });
		assert.strictEqual(count.status, 200);
		assert.strictEqual(count.body.message, 1);

		const list = await M('dypos.client.get_list', {
			doctype: 'Sales Invoice',
			filters,
			limit_page_length: 500,
		});
		assert.strictEqual(list.body.message.length, count.body.message);
	});

	it('honours date filters (a count that ignored them would understate)', () => {
		seedInvoice();
		return (async () => {
			const all = await M('dypos.client.get_count', { doctype: 'Sales Invoice' });
			const future = await M('dypos.client.get_count', {
				doctype: 'Sales Invoice',
				filters: [['posting_date', '>=', '2999-01-01']],
			});
			assert.ok(all.body.message >= 1, 'the seeded invoice is counted');
			assert.strictEqual(future.body.message, 0);
		})();
	});

	it('unknown doctype → 0, and auth is still required', async () => {
		const unknown = await M('dypos.client.get_count', { doctype: 'No Such Doc' });
		assert.strictEqual(unknown.status, 200);
		assert.strictEqual(unknown.body.message, 0);

		const anon = await req('POST', '/api/method/dypos.client.get_count', {
			doctype: 'Sales Invoice',
		});
		assert.strictEqual(anon.status, 401);
	});
});

describe('doctype specs point at tables that exist', () => {
	it('every mapped doctype resolves to a real table', () => {
		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table'")
			.all()
			.map((r) => r.name);
		for (const [name, spec] of Object.entries(DOCTYPES)) {
			assert.ok(tables.includes(spec.table), `${name} → missing table ${spec.table}`);
		}
	});

	it('report doctypes that cannot be answered stay explicitly unmapped', () => {
		// The POS report layer must treat these as unavailable, not as "no data".
		for (const name of ['Bin', 'Payment Entry', 'Purchase Invoice']) {
			assert.strictEqual(resolveDoctype(name), null, `${name} must stay explicitly unmapped`);
		}
		assert.ok(resolveDoctype('Sales Invoice'));
		assert.ok(resolveDoctype('Item'));
	});
});
