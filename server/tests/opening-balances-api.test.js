/**
 * Opening balances — end-to-end over HTTP.
 *
 * The unit tests in `opening-balances.test.js` prove the parsing and money
 * rules in isolation. These prove the parts that only exist once the wiring is
 * real, and that are the ones which actually cost a business money:
 *
 *   - MONEY: an amount round-trips as integer minor units, never a float.
 *   - IDEMPOTENCE: importing the same file twice must converge on ONE row, not
 *     double the customer's debt. This is the single most destructive possible
 *     bug in an import path, and the UNIQUE index is the only thing preventing it.
 *   - TENANT: another tenant's balances are invisible on read, undeletable by
 *     id, and a spoofed tenant header fails closed (403).
 *   - AUTHORISATION: a CASHIER cannot write a ledger row.
 *   - HONESTY: a dry run reports what WOULD change without changing anything.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';
import { app } from '../server.js';

let server, port, tokenA, tokenB, cashierToken, tenantA, tenantB;

const stamp = Date.now();
const YEAR = '2026';

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const root = `ob_root_${stamp}`;
  await req('POST', '/api/auth/register', { username: root, password: 'Pass1234', fullName: 'OB Root', role: 'ADMIN' });
  const admin = (await req('POST', '/api/auth/login', { username: root, password: 'Pass1234' })).body.token;

  tenantA = (await req('POST', '/api/tenants', { name: `OB A ${stamp}` }, admin)).body.id;
  tenantB = (await req('POST', '/api/tenants', { name: `OB B ${stamp}` }, admin)).body.id;

  const ua = `ob_a_${stamp}`;
  await req('POST', '/api/auth/register', { username: ua, password: 'Pass1234', fullName: 'OB A', role: 'ADMIN', tenantId: tenantA }, admin);
  tokenA = (await req('POST', '/api/auth/login', { username: ua, password: 'Pass1234' })).body.token;

  const ub = `ob_b_${stamp}`;
  await req('POST', '/api/auth/register', { username: ub, password: 'Pass1234', fullName: 'OB B', role: 'ADMIN', tenantId: tenantB }, admin);
  tokenB = (await req('POST', '/api/auth/login', { username: ub, password: 'Pass1234' })).body.token;

  const uc = `ob_c_${stamp}`;
  await req('POST', '/api/auth/register', { username: uc, password: 'Pass1234', fullName: 'OB Cashier', role: 'CASHIER', tenantId: tenantA }, admin);
  cashierToken = (await req('POST', '/api/auth/login', { username: uc, password: 'Pass1234' })).body.token;
});

after(() => server?.close());

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
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, body: j, text, headers: r.headers };
}

const call = async (verb, params, token, tenant) =>
  req('POST', `/api/method/${verb}`, params, token, { 'X-Tenant-Id': tenant });

describe('opening balances — REST', () => {
  it('stores money as integer minor units and returns both representations', async () => {
    const r = await req('PUT', '/api/opening-balances', {
      fiscalYear: YEAR,
      accountType: 'customer',
      accountId: `c-${stamp}`,
      accountName: 'عميل افتتاحي',
      amount: '1234.56',
    }, tokenA, { 'X-Tenant-Id': tenantA });

    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    // 1234.56 → exactly 123456 halalas. A float round-trip would give 123455 or
    // 123457 and the ledger would be permanently off by a halala.
    assert.strictEqual(r.body.row.amount_minor, 123456);
    assert.strictEqual(Number.isInteger(r.body.row.amount_minor), true);
    assert.strictEqual(r.body.row.amount, 1234.56);
  });

  it('summarises the opening position by account type', async () => {
    await req('PUT', '/api/opening-balances', {
      fiscalYear: YEAR, accountType: 'cash', accountName: 'صندوق', amount: '500.00',
    }, tokenA, { 'X-Tenant-Id': tenantA });

    const r = await req('GET', `/api/opening-balances?fiscalYear=${YEAR}`, null, tokenA, { 'X-Tenant-Id': tenantA });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.summary.cash.amountMinor >= 50000, 'cash position must be summarised');
    assert.ok(r.body.summary.customer.amountMinor >= 123456, 'customer position must be summarised');
  });

  it('exports CSV in MAJOR units (a halala export would re-import 100×)', async () => {
    const r = await req('GET', `/api/opening-balances/export?fiscalYear=${YEAR}`, null, tokenA, { 'X-Tenant-Id': tenantA });
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /text\/csv/);
    // The header row must be present, and the amount written as 1234.56.
    assert.match(r.text, /fiscalYear,accountType/);
    assert.ok(r.text.includes('1234.56'), `expected major units in CSV, got: ${r.text.slice(0, 400)}`);
    assert.ok(!r.text.includes('123456'), 'must not export minor units');
  });

  it('serves a template that round-trips through its own parser', async () => {
    const r = await req('GET', '/api/opening-balances/template', null, tokenA, { 'X-Tenant-Id': tenantA });
    assert.strictEqual(r.status, 200);
    assert.match(r.text, /fiscalYear/);
    // A template that the importer rejects is a template nobody uses. The shipped
    // example used to be a `customer` row with a blank account id, which
    // `normaliseOpeningBalance` refuses — the file could not import itself.
    const imported = await call('DyPOS.api.opening_balances.import_opening_balances',
      { csv: r.text, dryRun: 1 }, tokenA, tenantA);
    assert.strictEqual(imported.status, 200);
    assert.strictEqual(imported.body.message.valid, 1, JSON.stringify(imported.body));
    assert.strictEqual(imported.body.message.invalid, 0, 'the example row must validate');
  });
});

describe('opening balances — a blank amount is an ERROR, never a zero', () => {
  it('rejects a blank amount on the method verb (form path)', async () => {
    // Regression: the verb used to coerce `amount: ''` through `Number() || 0`,
    // which wrote a real 0.00 balance — exactly the "confident zero" that
    // distinguishes an unknown opening position from a genuinely empty one.
    const r = await call('DyPOS.api.opening_balances.save_opening_balance', {
      fiscalYear: YEAR, accountType: 'cash', accountName: 'صندوق فارغ', amount: '',
    }, tokenA, tenantA);
    assert.strictEqual(r.body.exc_type, 'ValidationError', JSON.stringify(r.body));
    assert.strictEqual(String(r.body.message).includes('مطلوب'), true, r.body.message);
  });

  it('rejects a blank amount on REST too', async () => {
    const r = await req('PUT', '/api/opening-balances', {
      fiscalYear: YEAR, accountType: 'cash', amount: '   ',
    }, tokenA, { 'X-Tenant-Id': tenantA });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  });

  it('and wrote no row for the rejected save', async () => {
    const list = await call('DyPOS.api.opening_balances.get_opening_balances', {}, tokenA, tenantA);
    const names = list.body.message.rows.map((r) => r.account_name);
    assert.ok(!names.includes('صندوق فارغ'), 'a rejected save must not leave a row');
  });

  it('an explicit 0 IS accepted (zero is a real, known position)', async () => {
    const r = await call('DyPOS.api.opening_balances.save_opening_balance', {
      fiscalYear: YEAR, accountType: 'cash', accountName: 'صندوق صفري', amount: '0',
    }, tokenA, tenantA);
    assert.strictEqual(r.body.message.row.amount_minor, 0, JSON.stringify(r.body));
  });
});

describe('opening balances — idempotence', () => {
  const csv = () =>
    `fiscalYear,accountType,accountId,accountName,amount\r\n${YEAR},customer,idem-${stamp},عميل,250.00\r\n`;

  it('importing the same file twice yields ONE row, not 500.00', async () => {
    const first = await call('DyPOS.api.opening_balances.import_opening_balances', { csv: csv() }, tokenA, tenantA);
    assert.strictEqual(first.body.message.applied, 1);

    const second = await call('DyPOS.api.opening_balances.import_opening_balances', { csv: csv() }, tokenA, tenantA);
    assert.strictEqual(second.body.message.applied, 1);

    const list = await call('DyPOS.api.opening_balances.get_opening_balances',
      { fiscalYear: YEAR }, tokenA, tenantA);
    const matching = list.body.message.rows.filter((r) => r.account_id === `idem-${stamp}`);
    assert.strictEqual(matching.length, 1, 'a repeated import must correct, not duplicate');
    assert.strictEqual(matching[0].amount_minor, 25000, 'and must not accumulate the amount');
  });

  it('a dry run changes nothing', async () => {
    const before = await call('DyPOS.api.opening_balances.get_opening_balances', {}, tokenA, tenantA);
    const dry = await call('DyPOS.api.opening_balances.import_opening_balances', {
      csv: `fiscalYear,accountType,accountId,amount\r\n${YEAR},customer,dry-${stamp},999.00\r\n`,
      dryRun: 1,
    }, tokenA, tenantA);
    assert.strictEqual(dry.body.message.dryRun, true);
    assert.strictEqual(dry.body.message.valid, 1);

    const after = await call('DyPOS.api.opening_balances.get_opening_balances', {}, tokenA, tenantA);
    assert.strictEqual(after.body.message.count, before.body.message.count, 'dry run must not write');
  });

  it('reports bad rows by line number while applying the good ones', async () => {
    const mixed =
      `fiscalYear,accountType,accountId,amount\r\n` +
      `${YEAR},customer,good-${stamp},100.00\r\n` +
      `${YEAR},customer,bad-${stamp},not-a-number\r\n` +
      `${YEAR},customer,good2-${stamp},200.00\r\n`;
    const r = await call('DyPOS.api.opening_balances.import_opening_balances', { csv: mixed }, tokenA, tenantA);
    assert.strictEqual(r.body.message.valid, 2, 'valid rows must be applied');
    assert.strictEqual(r.body.message.invalid, 1);
    assert.strictEqual(r.body.message.errors[0].row, 3, 'the header is line 1');
  });
});

describe('opening balances — tenant isolation', () => {
  it('tenant B never sees tenant A balances', async () => {
    const list = await call('DyPOS.api.opening_balances.get_opening_balances', {}, tokenB, tenantB);
    const names = list.body.message.rows.map((r) => r.account_name);
    assert.ok(!names.includes('عميل افتتاحي'), 'cross-tenant balance leaked');
  });

  it('tenant A still sees its own', async () => {
    const list = await call('DyPOS.api.opening_balances.get_opening_balances', {}, tokenA, tenantA);
    const names = list.body.message.rows.map((r) => r.account_name);
    assert.ok(names.includes('عميل افتتاحي'));
  });

  it('a spoofed tenant header fails closed (403)', async () => {
    const r = await call('DyPOS.api.opening_balances.get_opening_balances', {}, tokenB, tenantA);
    assert.strictEqual(r.status, 403);
  });

  it('deleting another tenant row is 404, not 403 (existence must not leak)', async () => {
    const mine = await call('DyPOS.api.opening_balances.get_opening_balances', {}, tokenA, tenantA);
    const target = mine.body.message.rows.find((r) => r.account_name === 'عميل افتتاحي');
    assert.ok(target, 'fixture row exists');
    const r = await req('DELETE', `/api/opening-balances/${target.id}`, null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 404);
  });
});

describe('opening balances — authorisation', () => {
  it('a CASHIER cannot write a ledger row', async () => {
    const r = await call('DyPOS.api.opening_balances.save_opening_balance', {
      fiscalYear: YEAR, accountType: 'cash', amount: '1',
    }, cashierToken, tenantA);
    assert.ok(r.body.message && String(r.body.message).includes('صلاحية'), JSON.stringify(r.body));
  });

  it('a CASHIER cannot import', async () => {
    const r = await call('DyPOS.api.opening_balances.import_opening_balances',
      { csv: `fiscalYear,accountType,amount\r\n${YEAR},cash,1\r\n` }, cashierToken, tenantA);
    assert.ok(String(r.body.message).includes('صلاحية'), JSON.stringify(r.body));
  });

  it('a CASHIER can still READ (reporting stays open)', async () => {
    const r = await call('DyPOS.api.opening_balances.get_opening_balances', {}, cashierToken, tenantA);
    assert.ok(Array.isArray(r.body.message.rows));
  });

  it('an unauthenticated call is refused', async () => {
    const r = await req('POST', '/api/method/DyPOS.api.opening_balances.get_opening_balances', {}, null, null);
    assert.ok(r.status === 401 || String(r.body.message).includes('غير مصرح'), `got ${r.status}`);
  });
});

describe('opening balances — the doctype list', () => {
  it('is reachable through dypos.client.get_list with minor units intact', async () => {
    const r = await call('dypos.client.get_list', {
      doctype: 'Opening Balance', fields: ['name', 'fiscal_year', 'account_type', 'amount_minor'],
      filters: { fiscal_year: YEAR }, limit_page_length: 50, limit_start: 0,
    }, tokenA, tenantA);
    assert.ok(Array.isArray(r.body.message), JSON.stringify(r.body));
    for (const row of r.body.message) {
      assert.ok(Number.isInteger(Number(row.amount_minor)), 'minor units must stay integral');
    }
  });

  it('is SCOPED on the generic list plane (not every tenant\'s balances)', async () => {
    // Regression guard for the tenant plane: `opening_balances` must be in the
    // router's TENANT_TABLES, or this list answers with every tenant's money.
    const mine = await call('dypos.client.get_list', {
      doctype: 'Opening Balance', fields: ['name', 'account_name'], limit_page_length: 200,
    }, tokenA, tenantA);
    const theirs = await call('dypos.client.get_list', {
      doctype: 'Opening Balance', fields: ['name', 'account_name'], limit_page_length: 200,
    }, tokenB, tenantB);
    const namesA = mine.body.message.map((r) => r.account_name);
    const namesB = theirs.body.message.map((r) => r.account_name);
    assert.ok(namesA.includes('عميل افتتاحي'), 'tenant A must see its own row');
    assert.ok(!namesB.includes('عميل افتتاحي'), 'tenant B must not see tenant A money');
  });
});
describe('opening balances — a stock row is LINKED to its item', () => {
	// The point of v26: a stock balance must name an item that exists, so the
	// movement can be joined (and approved). A row that merely SPELLS an item
	// code is a balance nothing can reconcile against.
	const code = `LINK-${stamp}`;
	let productId = '';

	it('creates the item first (the order the work must happen in)', async () => {
		const r = await req('POST', '/api/products', {
			code, name: 'صنف افتتاحي', uom: 'Unit', unitPrice: 18, cost: 12.254,
		}, tokenA, { 'X-Tenant-Id': tenantA });
		assert.strictEqual(r.status, 201, JSON.stringify(r.body));
		productId = r.body.id;
	});

	it('links an imported stock row to that item (code → id)', async () => {
		const r = await call('DyPOS.api.opening_balances.import_opening_balances', {
			csv: `fiscalYear,accountType,accountCode,accountName,quantity,amount\r\n${YEAR},stock,${code},صنف افتتاحي,108,1323.43\r\n`,
		}, tokenA, tenantA);
		assert.strictEqual(r.body.message.applied, 1, JSON.stringify(r.body));

		const list = await call('DyPOS.api.opening_balances.get_opening_balances', { fiscalYear: YEAR }, tokenA, tenantA);
		const row = list.body.message.rows.find((x) => x.account_code === code);
		assert.ok(row, 'the imported row must come back');
		assert.strictEqual(row.product_id, productId, 'the row must carry the ITEM id, not just the code');
	});

	it('REFUSES a stock row whose item does not exist, by line number', async () => {
		const ghost = `GHOST-${stamp}`;
		const csv =
			`fiscalYear,accountType,accountCode,accountName,amount\r\n` +
			`${YEAR},stock,${code},صنف موجود,10.00\r\n` +
			`${YEAR},stock,${ghost},صنف غير موجود,20.00\r\n`;
		const r = await call('DyPOS.api.opening_balances.import_opening_balances', { csv }, tokenA, tenantA);
		assert.strictEqual(r.body.message.valid, 1, JSON.stringify(r.body));
		assert.strictEqual(r.body.message.invalid, 1);
		assert.strictEqual(r.body.message.errors[0].row, 3, 'the header is line 1');
		assert.match(r.body.message.errors[0].message, new RegExp(ghost));

		// And nothing was written for the rejected row: an unlinked movement must
		// never exist, not even as a side effect of a partially good file.
		const list = await call('DyPOS.api.opening_balances.get_opening_balances', { fiscalYear: YEAR }, tokenA, tenantA);
		assert.ok(!list.body.message.rows.some((x) => x.account_code === ghost));
	});

	it('a dry run reports the missing item without writing anything', async () => {
		const ghost = `DRY-${stamp}`;
		const r = await call('DyPOS.api.opening_balances.import_opening_balances', {
			csv: `fiscalYear,accountType,accountCode,amount\r\n${YEAR},stock,${ghost},5.00\r\n`,
			dryRun: 1,
		}, tokenA, tenantA);
		assert.strictEqual(r.body.message.valid, 0, JSON.stringify(r.body));
		assert.strictEqual(r.body.message.invalid, 1);
	});

	it('exposes product_id on the generic list plane too', async () => {
		const r = await call('dypos.client.get_list', {
			doctype: 'Opening Balance', fields: ['name', 'account_code', 'product_id'],
			filters: { fiscal_year: YEAR }, limit_page_length: 200, limit_start: 0,
		}, tokenA, tenantA);
		const linked = r.body.message.find((x) => x.account_code === code);
		assert.ok(linked, 'the linked row must be listed');
		assert.strictEqual(linked.product_id, productId);
	});

	it('the REST import path links the item as well', async () => {
		const r = await req('POST', '/api/opening-balances/import', {
			rows: [{ fiscalYear: YEAR, accountType: 'stock', accountCode: code, accountName: 'صنف افتتاحي', amount: '5.00' }],
		}, tokenA, { 'X-Tenant-Id': tenantA });
		assert.strictEqual(r.status, 201, JSON.stringify(r.body));
		assert.strictEqual(r.body.applied, 1);
	});
});
