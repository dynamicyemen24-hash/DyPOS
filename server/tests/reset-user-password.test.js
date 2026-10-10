/**
 * reset-user-password — التعيين من البيئة فقط، بلا سر في المستودع.
 *
 * يقيس العقد: سياسة الكلمة، رفض المجهول، رفض الغياب (`--confirm`)،
 * رفض الإنتاج بلا القفلين، والتعيين الفعلي (bcrypt + تفعيل + إبطال
 * جلسات) — كل ذلك بعمليات فرعية معزولة على قواعد خدش تُحذف بعدها،
 * فلا سرّ يبقى في ملف ولا في بيئة عملية الاختبار الأم.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SERVER = joinPath(import.meta.dirname, '..');

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
		rmSync(joinPath(dir, 'dypos.db'), { force: true });
	} catch {}
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch {}
}

function freshDbPath() {
	const dir = mkdtempSync(joinPath(tmpdir(), 'dypos-pw-'));
	return { dir, db: joinPath(dir, 'dypos.db') };
}

function seedUser(dbPath, username = 'yaqoub.sahel') {
	const { DatabaseSync } = require('node:sqlite');
	const { randomUUID } = require('node:crypto');
	const bcrypt = require('bcryptjs');
	const db = new DatabaseSync(dbPath);
	db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT,
    full_name TEXT, role TEXT, tenant_id TEXT, is_active INTEGER DEFAULT 1,
    must_change_password INTEGER DEFAULT 0, created_at TEXT)`);
	db.exec(`CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY, user_id TEXT, token_hash TEXT, revoked INTEGER DEFAULT 0,
    issued_at TEXT, expires_at TEXT, ip_address TEXT, user_agent TEXT)`);
	const id = randomUUID();
	db.prepare('INSERT INTO users (id,username,password_hash,full_name,role,is_active) VALUES (?,?,?,?,?,1)').run(
		id,
		username,
		bcrypt.hashSync('Old-Pass-000', 12),
		'seed',
		'CASHIER',
	);
	db.prepare('INSERT INTO user_sessions (id,user_id,token_hash) VALUES (?,?,?)').run(randomUUID(), id, 'tok');
	db.close();
	return id;
}

function runReset({ dbPath, extraEnv = {}, args = [] }) {
	return new Promise((resolve) => {
		execFile(
			process.execPath,
			['scripts/reset-user-password.mjs', ...args],
			{ cwd: SERVER, env: { ...process.env, NODE_ENV: 'test', DYPOS_DB_PATH: dbPath, ...extraEnv }, timeout: 60000 },
			(error, stdout, stderr) => resolve({ error, stdout: String(stdout), stderr: String(stderr) }),
		);
	});
}

function runResetProd({ dbPath, extraEnv = {}, args = [] }) {
	return new Promise((resolve) => {
		execFile(
			process.execPath,
			['scripts/reset-user-password.mjs', ...args],
			{
				cwd: SERVER,
				env: { ...process.env, NODE_ENV: 'production', DYPOS_DB_PATH: dbPath, ...extraEnv },
				timeout: 60000,
			},
			(error, stdout, stderr) => resolve({ error, stdout: String(stdout), stderr: String(stderr) }),
		);
	});
}

describe('reset-user-password — env-only secret, explicit single user', () => {
	const dirs = [];
	before(() => {});
	after(() => {
		for (const d of dirs) rmDir(d);
	});

	it('sets the new hash, activates, and revokes sessions', async () => {
		const { dir, db } = freshDbPath();
		dirs.push(dir);
		seedUser(db);
		const r = await runReset({
			dbPath: db,
			args: ['--username', 'yaqoub.sahel', '--confirm'],
			extraEnv: { DYPOS_RESET_PW: 'Yqoub-2026-Rgt1' },
		});
		assert.ifError(r.error);
		assert.match(r.stdout, /تم تعيين كلمة مرور جديدة/);
		assert.doesNotMatch(r.stdout + r.stderr, /Yqoub-2026-Rgt1/);
		const { DatabaseSync } = require('node:sqlite');
		const bcrypt = require('bcryptjs');
		const probe = new DatabaseSync(db);
		try {
			const row = probe
				.prepare('SELECT password_hash AS h, is_active AS a FROM users WHERE username=?')
				.get('yaqoub.sahel');
			assert.ok(bcrypt.compareSync('Yqoub-2026-Rgt1', row.h), 'new password verifies');
			assert.ok(!bcrypt.compareSync('Old-Pass-000', row.h), 'old password dead');
			assert.strictEqual(row.a, 1);
			assert.strictEqual(probe.prepare('SELECT COUNT(*) AS c FROM user_sessions WHERE revoked=1').get().c, 1);
		} finally {
			probe.close();
		}
	});

	it('refuses without --confirm', async () => {
		const { dir, db } = freshDbPath();
		dirs.push(dir);
		seedUser(db);
		const r = await runReset({
			dbPath: db,
			args: ['--username', 'yaqoub.sahel'],
			extraEnv: { DYPOS_RESET_PW: 'Yqoub-2026-Rgt1' },
		});
		assert.ok(r.error, 'must fail without --confirm');
		assert.strictEqual(r.error.code, 2);
	});

	it('refuses a weak password', async () => {
		const { dir, db } = freshDbPath();
		dirs.push(dir);
		seedUser(db);
		const r = await runReset({
			dbPath: db,
			args: ['--username', 'yaqoub.sahel', '--confirm'],
			extraEnv: { DYPOS_RESET_PW: 'short' },
		});
		assert.ok(r.error, 'weak password must fail');
		assert.match(r.stderr, /password policy/);
	});

	it('refuses an unknown user (never creates)', async () => {
		const { dir, db } = freshDbPath();
		dirs.push(dir);
		seedUser(db);
		const r = await runReset({
			dbPath: db,
			args: ['--username', 'ghost.user', '--confirm'],
			extraEnv: { DYPOS_RESET_PW: 'Ghost-Pass-99' },
		});
		assert.ok(r.error, 'unknown user must fail');
		assert.match(r.stderr, /unknown user/);
	});

	it('refuses production without the prod lock', async () => {
		const { dir, db } = freshDbPath();
		dirs.push(dir);
		seedUser(db);
		const r = await runResetProd({
			dbPath: db,
			args: ['--username', 'yaqoub.sahel', '--confirm'],
			extraEnv: { DYPOS_RESET_PW: 'Yqoub-2026-Rgt1' },
		});
		assert.ok(r.error, 'production without lock must fail');
		assert.strictEqual(r.error.code, 2);
		assert.match(r.stderr, /DYPOS_ALLOW_PROD_PROVISION/);
	});

	it('applies in production with both locks', async () => {
		const { dir, db } = freshDbPath();
		dirs.push(dir);
		seedUser(db);
		const r = await runResetProd({
			dbPath: db,
			args: ['--username', 'yaqoub.sahel', '--confirm'],
			extraEnv: { DYPOS_RESET_PW: 'Yqoub-2026-Rgt1', DYPOS_ALLOW_PROD_PROVISION: '1' },
		});
		assert.ifError(r.error);
		assert.match(r.stdout, /تم تعيين كلمة مرور جديدة/);
	});
});
