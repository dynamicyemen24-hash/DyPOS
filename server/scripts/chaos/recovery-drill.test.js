/**
 * DyPOS Chaos Drill #3 — Recovery Drill
 *
 * Threat modeled: the operator restarts a damaged/zombie process, or the OS
 * delivers a poisoned database path. Recovery must be LOUD, deterministic and
 * self-healing: a broken boot fails fast with a clear error (never a hung,
 * half-alive container), and a healthy restart on the same DB serves again.
 *
 * Scenarios:
 *   1. CORRUPT DB file   → child process exits non-zero, stderr says the DB
 *                          is not a database (fail-fast, actionable).
 *   2. UNUSABLE LOCATION → DYPOS_DB_PATH nested under an existing FILE
 *                          (mkdir throws ENOTDIR) → same fail-fast contract.
 *   3. RESTART SERIES    → boot → ready → SIGTERM → boot again on the SAME
 *                          DB → ready + login still work (durable recovery).
 *
 * Run:
 *   cd server && node --test --import ./tests/setup.js scripts/chaos/recovery-drill.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const SERVER_DIR = fileURLToPath(new URL('../../', import.meta.url));

async function freePort() {
	const probe = net.createServer();
	probe.listen(0, '127.0.0.1');
	await once(probe, 'listening');
	const port = probe.address().port;
	probe.close();
	return port;
}

function bootEnv(dbPath) {
	return {
		...process.env,
		NODE_ENV: 'test',
		DYPOS_DB_PATH: dbPath,
		DYPOS_PORT: '0',
		DYPOS_JWT_SECRET: 'dypos-chaos-playbook-secret-0123456789abcdef',
		DYPOS_CORS_ORIGIN: 'http://localhost:8080',
		DYPOS_WEBHOOKS: '0',
	};
}

async function waitReadyOnPort(port, child, timeoutMs = 20000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (child && child.exitCode !== null) {
			return false;
		}
		try {
			const res = await fetch(`http://127.0.0.1:${port}/api/ready`);
			if (res.ok) return true;
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 150));
	}
	return false;
}

async function removeDirGracefully(dir) {
	for (let attempt = 0; attempt < 5; attempt++) {
		try {
			rmSync(dir, { recursive: true, force: true });
			return;
		} catch {
			// Windows holds file handles briefly after a child exits.
			await new Promise((r) => setTimeout(r, 300));
		}
	}
}

describe('Chaos: recovery drill', () => {
	test('corrupt DB file -> boot fails fast (non-zero) with a clear "not a database" error', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'dypos-chaos-recover-'));
		const badDb = join(dir, 'corrupt.db');
		writeFileSync(badDb, 'garbage, definitely not a sqlite database file '.repeat(64));
		try {
			const r = spawnSync(process.execPath, ['server.js'], {
				cwd: SERVER_DIR,
				env: bootEnv(badDb),
				encoding: 'utf8',
				timeout: 20000,
			});
			assert.ok(r.status !== null && r.status !== 0, 'boot must exit non-zero, got ' + r.status);
			assert.match(
				`${r.stderr}\n${r.stdout}`,
				/not a database/i,
				'stderr/stdout must name the actual cause (SQLite NOTADB)',
			);
		} finally {
			await removeDirGracefully(dir);
		}
	});

	test('DB path inside an existing FILE -> boot fails fast (non-zero) with clear error', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'dypos-chaos-recover-'));
		const blocker = join(dir, 'this-is-a-file');
		writeFileSync(blocker, 'i am a file, not a directory');
		const badDb = join(blocker, 'dypos.db');
		try {
			const r = spawnSync(process.execPath, ['server.js'], {
				cwd: SERVER_DIR,
				env: bootEnv(badDb),
				encoding: 'utf8',
				timeout: 20000,
			});
			assert.ok(r.status !== null && r.status !== 0, 'boot must exit non-zero, got ' + r.status);
			assert.match(
				`${r.stderr}\n${r.stdout}`,
				/ENOTDIR|EEXIST|not a directory/i,
				'stderr/stdout must surface the mkdir failure',
			);
		} finally {
			await removeDirGracefully(dir);
		}
	});

	test('restart series: boot -> ready -> SIGTERM -> boot again on same DB -> still serves login', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'dypos-chaos-recover-'));
		const goodDb = join(dir, 'healthy.db');
		let child = null;
		const username = `chaos_rec_${Date.now()}`;
		const password = 'Chaos1234';

		// The DB file is the durable state — the PORT is not. Rebinding the same
		// port instantly after a kill can hit TIME_WAIT on Windows, so the
		// recovery assertion re-binds a fresh port (a real supervisor/PaaS restart
		// does exactly this).
		const boot1 = async () => {
			const port = await freePort();
			child = spawn(process.execPath, ['server.js'], {
				cwd: SERVER_DIR,
				env: { ...bootEnv(goodDb), DYPOS_PORT: String(port) },
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			return { child, port };
		};

		const boot1app = await boot1();
		assert.equal(await waitReadyOnPort(boot1app.port, boot1app.child), true, 'first boot must be healthy');

		const reg = await fetch(`http://127.0.0.1:${boot1app.port}/api/auth/register`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, password, fullName: 'Chaos Rec Admin', role: 'ADMIN' }),
		});
		assert.equal(reg.status, 201, 'register must work on first boot');

		boot1app.child.kill('SIGTERM');
		await Promise.race([
			once(boot1app.child, 'exit'),
			new Promise((r) =>
				setTimeout(() => {
					boot1app.child.kill('SIGKILL');
					r();
				}, 10000),
			),
		]);

		const boot2app = await boot1();
		assert.equal(await waitReadyOnPort(boot2app.port, boot2app.child), true, 'second boot on the SAME DB must be healthy');

		const login = await fetch(`http://127.0.0.1:${boot2app.port}/api/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, password }),
		});
		assert.equal(login.status, 200, 'account must survive the restart cycle');

		const health = await fetch(`http://127.0.0.1:${boot2app.port}/api/health`);
		assert.equal(health.status, 200);
		child.kill('SIGKILL');
		await Promise.race([once(child, 'exit'), new Promise((r) => setTimeout(r, 3000))]);
		await removeDirGracefully(dir);
	});
});