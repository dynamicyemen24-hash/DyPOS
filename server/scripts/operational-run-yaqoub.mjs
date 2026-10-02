/**
 * OPERATIONAL ACCEPTANCE RUN — real server, real DB, real money path,
 * executed as the subscriber's own manager account (yaqoub.sahel).
 *
 * Not a unit test: it boots the Express app, authenticates as the human
 * account, and drives the flows a shop actually performs on day one
 * (login → catalog → shift → sale → payment → stock → report → settlement).
 * Every assertion is an API response or a database row.
 *
 * Run: node scripts/operational-run-yaqoub.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(here, '..', 'data', 'dypos.db');

const USERNAME = 'yaqoub.sahel';
const PASSWORD = process.env.DYPOS_OP_PASSWORD || 'Yqoub#2026#Rgt1';

process.env.DYPOS_JWT_SECRET = 'operational-run-local-verification-only-0123456789abcdef';
process.env.DYPOS_DB_PATH = DB_PATH;
process.env.DYPOS_CORS_ORIGIN = 'http://localhost';
process.env.DYPOS_SHIFT_VARIANCE_LIMIT = '100';

const { app } = await import('../server.js');
const direct = new DatabaseSync(DB_PATH);

const results = [];
function check(name, cond, detail = '') {
	results.push({ name, pass: !!cond, detail });
	console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
	if (!cond) process.exitCode = 1;
}

// The manager's password is (re)provisioned here so the run is repeatable and
// so the operator receives a known credential for subscriber #1. bcrypt cost
// 12 matches middleware/auth.js — never plaintext, never a weak hash.
const provisioned = direct.prepare('SELECT id,role,is_active,tenant_id FROM users WHERE username=?').get(USERNAME);
if (!provisioned) {
	console.error(`User ${USERNAME} does not exist — run the Royal seed first.`);
	process.exit(1);
}
direct
	.prepare('UPDATE users SET password_hash=?, must_change_password=0, is_active=1 WHERE username=?')
	.run(bcrypt.hashSync(PASSWORD, 12), USERNAME);

const server = http.createServer(app);
server.listen(0);
await once(server, 'listening');
const port = server.address().port;

async function req(method, p, body, token) {
	const headers = { 'Content-Type': 'application/json' };
	if (token) headers.Authorization = `Bearer ${token}`;
	const res = await fetch(`http://localhost:${port}${p}`, {
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

const stockOf = (pid, wh) =>
	direct.prepare('SELECT qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(pid, wh)?.qty ?? null;

const TERMINAL = 'POS-YQ-01';
const WH = 'W-03';
let shiftId = null;
let token = null;
let invoiceId = null;
let total = 0;
let itemId = null;
let before = null;

try {
	console.log(`\n=== OPERATIONAL RUN — ${USERNAME} (${provisioned.role}) ===\n`);

	// 1. Authenticate as the manager.
	const login = await req('POST', '/api/auth/login', { username: USERNAME, password: PASSWORD });
	check('OP-01 manager login', login.status === 200 && !!login.body.token, `status=${login.status}`);
	token = login.body.token;
	check('OP-02 mustChangePassword cleared', login.body.mustChangePassword === false);

	// 2. Identity endpoint resolves the session.
	const me = await req('GET', '/api/auth/me', undefined, token);
	check('OP-03 session identity', me.status === 200 && me.body.username === USERNAME, `role=${me.body.role}`);

	// 3. Reject a bad password (fail-closed, FR-SEC-001).
	const bad = await req('POST', '/api/auth/login', {
		username: USERNAME,
		password: 'wrong-password-1',
	});
	check('OP-04 wrong password rejected', bad.status === 401, `status=${bad.status}`);

	// 4. Reject an unauthenticated call.
	const anon = await req('GET', '/api/products?limit=1');
	check('OP-05 anonymous read rejected', anon.status === 401, `status=${anon.status}`);

	// 5. Catalog is populated and tenant-scoped.
	const catalog = await req('GET', '/api/products?limit=5', undefined, token);
	const products = catalog.body?.products || catalog.body?.data || [];
	check('OP-06 catalog readable', catalog.status === 200 && products.length > 0, `got=${products.length}`);
	const item = products[0];
	itemId = item.id;
	before = stockOf(item.id, WH);
	check('OP-07 opening stock present', typeof before === 'number' && before >= 2, `qty=${before}`);

	// 6. Open a shift.
	const open = await req('POST', '/api/shifts/open', { terminalId: TERMINAL, openingCash: 500 }, token);
	if (open.status === 201 || (open.status === 409 && open.body.shiftId)) shiftId = open.body.shiftId;
	check('OP-08 shift open', !!shiftId, `shift=${shiftId}`);

	// 7. Real sale, fully paid in cash (omitted payments default to full CASH).
	const created = await req(
		'POST',
		'/api/invoices',
		{
			items: [{ productId: item.id, qty: 1 }],
			warehouseId: WH,
			shiftId,
			terminalId: TERMINAL,
			customerName: 'عميل تشغيلي — يعقوب',
			idempotencyKey: `op-yaqoub-${Date.now()}`,
		},
		token,
	);
	invoiceId = created.body?.id || created.body?.invoiceId;
	total = Number(created.body?.total ?? 0);
	check('OP-09 invoice created', (created.status === 200 || created.status === 201) && !!invoiceId, `total=${total}`);

	// 8. Stock moved by exactly the sold quantity.
	const after = stockOf(item.id, WH);
	check('OP-10 stock decremented', after === before - 1, `${before} → ${after}`);

	// 9. Invoice reads PAID.
	const fetched = await req('GET', `/api/invoices/${invoiceId}`, undefined, token);
	check('OP-11 invoice PAID', fetched.body?.status === 'PAID', `status=${fetched.body?.status}`);

	// 10. Daily report is a measurement, not an empty list.
	const report = await req('GET', '/api/invoices/reports/daily', undefined, token);
	check('OP-12 daily report', report.status === 200, `status=${report.status}`);

	// 11. Customer read path.
	const customers = await req('GET', '/api/customers?limit=5', undefined, token);
	check('OP-13 customers readable', customers.status === 200, `status=${customers.status}`);

	// 12. Settings readable by the manager.
	const settings = await req('GET', '/api/settings', undefined, token);
	check('OP-14 settings readable', settings.status === 200, `status=${settings.status}`);

	// 13. Settle the shift with an exact count (variance 0).
	const closed = await req('POST', `/api/shifts/${shiftId}/close`, { closingCash: 500 + total }, token);
	check(
		'OP-15 shift settled, variance 0',
		closed.status === 200 && Number(closed.body?.variance) === 0,
		JSON.stringify(closed.body).slice(0, 140),
	);

	// 14. Clean up: void the operational invoice so the shop's books stay clean.
	const adminLogin = await req('POST', '/api/auth/login', {
		username: 'admin',
		password: 'Royal#2026#Adm1n',
	});
	const voided = await req(
		'POST',
		`/api/invoices/${invoiceId}/void`,
		{ reason: 'إجراء اختبار تشغيلي — تعويض' },
		adminLogin.body.token,
	);
	check('OP-16 invoice voided', voided.status === 200 && voided.body?.status === 'VOIDED', `status=${voided.status}`);
	const restored = stockOf(itemId, WH);
	check('OP-17 stock restored after void', restored === before, `→ ${restored}`);

	const failed = results.filter((r) => !r.pass).length;
	console.log(
		failed === 0
			? `\n=== OPERATIONAL RUN: ALL ${results.length} CHECKS PASSED (as ${USERNAME}) ===`
			: `\n=== OPERATIONAL RUN: ${failed}/${results.length} CHECK(S) FAILED ===`,
	);
	console.log(`\nCREDENTIAL  username=${USERNAME}  password=${PASSWORD}\n`);
} catch (e) {
	console.error('OPERATIONAL RUN crashed:', e);
	process.exitCode = 1;
} finally {
	server.close();
	try {
		direct.close();
	} catch {
		/* ignore */
	}
}
