/**
 * DyPOS Chaos Drill #2 — Process Kill (kill -9 in the middle of the action)
 *
 * Threat modeled: a terminal loses power / the supervisor SIGKILLs the API
 * process mid-session, right after a paid invoice has been committed. Sale
 * data and the idempotency ledger live in the shared SQLite file, so the
 * process must restart cleanly (WAL auto-recovery) and an at-least-once
 * retry of the exact same request must NEVER duplicate the invoice.
 *
 * Scenario:
 *   1. boot the real server against a temp FILE DB as a child process,
 *   2. register admin → login → create product → sell one invoice (paid 115),
 *   3. SIGKILL the child immediately after that write commits,
 *   4. reboot on the identical DB, verify the sale survived intact,
 *   5. replay the same idempotency key → deduped, same invoice id, count 1.
 *
 * Run:
 *   cd server && node --test --import ./tests/setup.js scripts/chaos/process-kill.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
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

function spawnServer(dbPath, port) {
	return spawn(process.execPath, ['server.js'], {
		cwd: SERVER_DIR,
		env: {
			...process.env,
			NODE_ENV: 'test',
			DYPOS_DB_PATH: dbPath,
			DYPOS_PORT: String(port),
			DYPOS_JWT_SECRET: 'dypos-chaos-playbook-secret-0123456789abcdef',
			DYPOS_CORS_ORIGIN: 'http://localhost:8080',
			DYPOS_WEBHOOKS: '0',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

async function waitReady(port, timeoutMs = 20000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
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

async function api(port, method, path, body, tok) {
	const res = await fetch(`http://127.0.0.1:${port}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(tok ? { Authorization: `Bearer ${tok}` } : {}),
		},
		body: body === undefined || body === null ? undefined : JSON.stringify(body),
	});
	let json = null;
	try {
		json = await res.json();
	} catch {
		/* ignore */
	}
	return { status: res.status, headers: res.headers, body: json };
}

async function stopChild(child, signal = 'SIGKILL') {
	if (!child || child.exitCode !== null || child.signalCode) return;
	const exited = once(child, 'exit');
	child.kill(signal);
	await Promise.race([exited, new Promise((r) => setTimeout(r, 10000))]);
	if (child.exitCode === null && !child.signalCode) {
		child.kill('SIGKILL');
		await Promise.race([once(child, 'exit'), new Promise((r) => setTimeout(r, 5000))]);
	}
}

describe('Chaos: SIGKILL mid-session, restart, idempotent replay', () => {
	test('paid invoice survives kill -9; exact retry is deduped, never duplicated', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'dypos-chaos-kill-'));
		const dbPath = join(dir, 'kill.db');
		const port = await freePort();

		const username = `chaos_kill_${Date.now()}`;
		const password = 'Chaos1234';
		const idemKey = `kill-${Date.now()}`;
		let child = null;
		let productId;

		try {
			/* ---- Act 1: boot, register, sell one invoice ---- */
			child = spawnServer(dbPath, port);
			assert.equal(await waitReady(port), true, 'server should boot on a clean temp DB');

			const reg = await api(port, 'POST', '/api/auth/register', {
				username,
				password,
				fullName: 'Chaos Kill Admin',
				role: 'ADMIN',
			});
			assert.equal(reg.status, 201, JSON.stringify(reg.body));

			const login = await api(port, 'POST', '/api/auth/login', { username, password });
			assert.equal(login.status, 200, JSON.stringify(login.body));
			const token = login.body.token;

			const prod = await api(
				port,
				'POST',
				'/api/products',
				{ name: 'Kill-Test-Sugar', code: 'KILL-SUGAR-' + Date.now(), unitPrice: 40 },
				token,
			);
			assert.equal(prod.status, 201, JSON.stringify(prod.body));
			productId = prod.body.id;

			const invoice = await api(
				port,
				'POST',
				'/api/invoices',
				{ items: [{ productId, qty: 3 }], idempotencyKey: idemKey },
				token,
			);
			assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
			assert.equal(invoice.body.total, 138); // 120 subtotal + 18 tax (15%)
			assert.equal(invoice.body.status, 'PAID');
			const invoiceId = invoice.body.invoiceId;

			/* ---- Act 2: kill -9 immediately after the write commits ---- */
			await stopChild(child, 'SIGKILL');
			child = null;

			/* ---- Act 3: restart on the SAME DB file ---- */
			child = spawnServer(dbPath, port);
			assert.equal(await waitReady(port), true, 'server must restart cleanly after SIGKILL');

			const relogin = await api(port, 'POST', '/api/auth/login', { username, password });
			assert.equal(relogin.status, 200, 'account must survive the crash');
			const token2 = relogin.body.token;

			const got = await api(port, 'GET', `/api/invoices/${invoiceId}`, null, token2);
			assert.equal(got.status, 200, JSON.stringify(got.body));
			assert.equal(got.body.status, 'PAID');
			assert.equal(got.body.total, 138, 'committed sale must survive kill -9 intact');

			/* ---- Act 4: exact at-least-once retry must NOT duplicate ---- */
			const replay = await api(
				port,
				'POST',
				'/api/invoices',
				{ items: [{ productId, qty: 3 }], idempotencyKey: idemKey },
				token2,
			);
			assert.equal(replay.status, 200, JSON.stringify(replay.body));
			assert.equal(replay.body.deduped, true, 'replay must be served from the idempotency ledger');
			assert.equal(replay.body.invoiceId, invoiceId, 'replay must return the ORIGINAL invoice id');

			const list = await api(port, 'GET', '/api/invoices?limit=200', null, token2);
			assert.equal(list.status, 200);
			const hits = (list.body.invoices || []).filter((i) => i.id === invoiceId);
			assert.equal(hits.length, 1, 'kill -9 + retry must leave exactly ONE invoice');
		} finally {
			await stopChild(child, 'SIGKILL');
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
