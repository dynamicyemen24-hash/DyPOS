/**
 * DyPOS Load Stress — k6 scenario
 *
 * Threat modeled: Ramadan/Eid asymmetric traffic — a quiet morning that
 * 30 seconds later is a wall of 150 terminals all selling at once.
 *
 * Mix (per VU iteration):
 *   - 70%  POST /api/invoices        (the money path, unique idempotency key)
 *   - 25%  GET  /api/reports/summary (management reads piling on the same DB)
 *   -  5%  GET  /api/invoices?limit= (page scans)
 *
 * The backend is a single-writer SQLite store behind busy_timeout=5000; under
 * saturation the CORRECT answer is a fast 503 (retryable), never a 500. So the
 * script tracks a dedicated "create ok" rate (201/200/retryable-deduped) and
 * keeps 503 visible as a soft signal, while http_req_failed + p95 latencies are
 * gatekept as the hard thresholds. Run against the /api base URL (the vite
 * proxy origin http://localhost:8080/api works too, end-to-end through the UI
 * stack).
 *
 * Run:
 *   cd server && k6 run -e BASE=http://127.0.0.1:8000/api scripts/load-stress.k6.js
 *
 * Prereq: a running DyPOS API (see docs/QA_ENGINEERING.md, "Load layer").
 * NB: the script self-registers a throwaway admin account on the target.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { randomString } from 'k6/crypto';
import { Rate } from 'k6/metrics';

const invoiceCreateOk = new Rate('invoice_create_ok');
const reportReadOk = new Rate('report_read_ok');
const retryableCollisions = new Rate('invoice_503_collision');

const BASE = __ENV.BASE || 'http://127.0.0.1:8000/api';

export const options = {
	scenarios: {
		ramadan_spike: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '30s', target: 50 }, // quiet morning
				{ duration: '60s', target: 50 }, // steady state
				{ duration: '30s', target: 150 }, // the wall of terminals
				{ duration: '30s', target: 150 }, // sustained peak
				{ duration: '30s', target: 0 }, // afternoon lull
			],
			gracefulRampDown: '10s',
		},
	},
	thresholds: {
		http_req_failed: [{ threshold: 'rate<0.02', abortOnFail: true }],
		http_req_duration: [
			{ threshold: 'p(95)<1500', abortOnFail: true },
			{ threshold: 'p(99)<4000', abortOnFail: true },
		],
		'invoice_create_ok': ['rate>0.90'],
		'report_read_ok': ['rate>0.98'],
	},
};

// Seeded once per k6 run (setup), shared read-only across all VUs.
const seeded = new SharedArray('dypos-load-seed', () => {
	const username = `load_${randomString(8)}`;
	const password = 'Load1234';

	const reg = http.post(
		`${BASE}/auth/register`,
		JSON.stringify({ username, password, fullName: 'Load Admin', role: 'ADMIN' }),
		{ headers: { 'Content-Type': 'application/json' } },
	);
	if (reg.status !== 201) {
		throw new Error(`seed register failed: ${reg.status} ${reg.body}`);
	}

	const login = http.post(
		`${BASE}/auth/login`,
		JSON.stringify({ username, password }),
		{ headers: { 'Content-Type': 'application/json' } },
	);
	if (login.status !== 200) {
		throw new Error(`seed login failed: ${login.status} ${login.body}`);
	}
	const token = login.json('token');
	if (!token) throw new Error('seed login returned no token');

	const prod = http.post(
		`${BASE}/products`,
		JSON.stringify({ name: 'Load-Test-Basmati', code: `LOAD-RICE-${randomString(6)}`, unitPrice: 40 }),
		{
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		},
	);
	if (prod.status !== 201) {
		throw new Error(`seed product failed: ${prod.status} ${prod.body}`);
	}
	const productId = prod.json('id');
	if (!productId) throw new Error('seed product returned no id');

	return [{ token, productId }];
});

function bearer() {
	const { token } = seeded[0];
	return { Authorization: `Bearer ${token}` };
}

export default function () {
	const { productId } = seeded[0];
	const roll = Math.random();

	if (roll < 0.7) {
		// The money path — every iteration is a unique, replay-safe sale.
		const qty = (__ITER % 3) + 1;
		const idemKey = `k6-${__VU}-${__ITER}`;
		const res = http.post(
			`${BASE}/invoices`,
			JSON.stringify({ items: [{ productId, qty }], idempotencyKey: idemKey }),
			{ headers: { 'Content-Type': 'application/json', ...bearer() } },
		);
		const accepted = res.status === 201 || res.status === 200;
		check(res, {
			'invoice accepted (201/200 idempotent)': () => accepted,
			'invoice carries an id': () => Boolean(res.json('invoiceId')),
		});
		invoiceCreateOk.add(accepted);
		retryableCollisions.add(res.status === 503);
		sleep(0.1);
		return;
	}

	if (roll < 0.95) {
		const today = new Date().toISOString().slice(0, 10);
		const res = http.get(
			`${BASE}/reports/summary?from=${today}&to=${today}`,
			{ headers: bearer() },
		);
		const readable = res.status === 200 && res.json('orders') !== undefined;
		reportReadOk.add(readable);
		check(res, {
			'report readable (200)': () => readable,
		});
		sleep(0.05);
		return;
	}

	const res = http.get(`${BASE}/invoices?limit=20`, { headers: bearer() });
	check(res, {
		'invoice list readable (200)': (r) => r.status === 200 && Array.isArray(r.json('invoices')),
	});
	sleep(0.05);
}