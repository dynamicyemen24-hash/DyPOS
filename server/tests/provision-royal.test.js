/**
 * provision:royal — هوية الإنتاج بلا بيانات عينة.
 *
 * لماذا هذا الاختبار موجود:
 * بذرة العينة `seed-royal-production.mjs` محروسة ضد الإنتاج عمدًا
 * (seed-safety)، والعميل المتعطل يحتاج حسابات دخول حقيقية لا عينة.
 * `provision-royal.mjs` هو المسار الصريح: مستأجر + فروع + مستخدمون
 * فقط — بلا أصناف ولا مخزون ولا فواتير ولا كلمات صلبة. هذا الملف
 * يقيس العقد: هوية تُنشأ، كلمة موجودة لا تُدوَّر، ورفض الإنتاج
 * بلا القفلين معًا.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const RGT = '00000000-0000-0000-0000-000000000001';
const EXPECTED_USERS = [
	'admin',
	'yaqoub.sahel',
	'sanaa.manager',
	'sanaa.cashier',
	'sanaa.cashier2',
	'aden.cashier',
	'marib.cashier',
];

function rmDir(dir) {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		try {
			rmSync(dir, { recursive: true, force: true });
			return;
		} catch {
			/* WAL sidecar still open — retry */
		}
	}
	try {
		rmSync(join(dir, 'dypos.db-wal'), { force: true });
	} catch {}
	try {
		rmSync(join(dir, 'dypos.db-shm'), { force: true });
	} catch {}
	try {
		rmSync(join(dir, 'dypos.db'), { force: true });
	} catch {}
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch {}
}

describe('provision:royal — production identity without sample data', () => {
	let db;
	let tmpDir;
	let dbPath;
	let adminHashAfterFirstRun;

	before(async () => {
		tmpDir = mkdtempSync(join(tmpdir(), 'dypos-prov-'));
		dbPath = join(tmpDir, 'dypos.db');
		process.env.DYPOS_DB_PATH = dbPath;
		process.env.DYPOS_PROVISION_PW_ADMIN = 'Test-Admin-Pass-123';
		delete process.env.DYPOS_ALLOW_PROD_PROVISION;

		const { migrate } = await import('../db/schema.js');
		migrate();

		await import('../scripts/provision-royal.mjs');

		const { DatabaseSync } = await import('node:sqlite');
		db = new DatabaseSync(dbPath);
		adminHashAfterFirstRun = db.prepare('SELECT password_hash AS h FROM users WHERE username=?').get('admin').h;
	});

	after(() => {
		try {
			db?.close();
		} catch {}
		delete process.env.DYPOS_PROVISION_PW_ADMIN;
		if (tmpDir) rmDir(tmpDir);
	});

	it('creates the RGT tenant, active and correctly named', () => {
		const t = db.prepare('SELECT id, name, code, is_active AS a FROM tenants WHERE id=?').get(RGT);
		assert.ok(t, 'RGT tenant missing after provision');
		assert.strictEqual(t.name, 'رويال العالمية لتجارة أدوات التجميل والعطور');
		assert.strictEqual(t.code, 'RGT');
		assert.strictEqual(t.a, 1);
	});

	it('creates all seven login users with tenant scope and forced rotation', () => {
		for (const u of EXPECTED_USERS) {
			const row = db
				.prepare('SELECT tenant_id AS t, is_active AS a, must_change_password AS m FROM users WHERE username=?')
				.get(u);
			assert.ok(row, `user ${u} missing after provision`);
			assert.strictEqual(row.t, RGT, `${u} not scoped to RGT`);
			assert.strictEqual(row.a, 1, `${u} not active`);
			assert.strictEqual(row.m, 1, `${u} must rotate password on first login`);
		}
	});

	it('honours the operator-pinned password (bcrypt cost 12)', () => {
		const bcrypt = require('bcryptjs');
		assert.ok(
			bcrypt.compareSync('Test-Admin-Pass-123', adminHashAfterFirstRun),
			'pinned DYPOS_PROVISION_PW_ADMIN not honoured',
		);
		assert.ok(
			String(adminHashAfterFirstRun).startsWith('$2b$12$') || String(adminHashAfterFirstRun).startsWith('$2a$12$'),
			'hash is not bcrypt cost 12',
		);
	});

	it('touches no sample data: catalog, stock, invoices, customers stay empty', () => {
		for (const table of ['products', 'stock_levels', 'invoices', 'customers', 'opening_balances']) {
			const c = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
			assert.strictEqual(c, 0, `${table} must stay empty — provision is identity only`);
		}
	});

	it('re-run keeps the existing password hash (never rotates a handed-out secret)', async () => {
		await import('../scripts/provision-royal.mjs?rerun=1');
		const now = db.prepare('SELECT password_hash AS h FROM users WHERE username=?').get('admin').h;
		assert.strictEqual(now, adminHashAfterFirstRun, 're-run rotated admin password — handed-out secret destroyed');
	});

	it('refuses production without both explicit locks', (_, done) => {
		const child = execFile(
			process.execPath,
			['scripts/provision-royal.mjs'],
			{
				cwd: join(import.meta.dirname, '..'),
				env: { ...process.env, NODE_ENV: 'production', DYPOS_DB_PATH: join(tmpDir, 'never.db') },
				timeout: 30000,
			},
			(error, stdout, stderr) => {
				assert.ok(error, 'production provision without locks must fail');
				assert.strictEqual(error.code, 2, `expected exit 2, got ${error.code}`);
				assert.match(String(stderr) + String(stdout), /Refusing production provision/);
				done();
			},
		);
		child.on('error', (e) => done(e));
	});
});
