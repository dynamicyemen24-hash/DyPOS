/**
 * DyPOS k6 Load Test — invoice path at scale (millions-grade validation).
 * Run: k6 run -e BASE=http://localhost:3001 tests/load/k6-invoices.js
 * SLOs: p95 < 800ms, error rate < 1% (enforced by the thresholds below; a
 * breach makes k6 exit non-zero, so CI cannot report green over a violation).
 *
 * Flow: setup() registers one VU user + product, VUs loop POST /api/invoices
 * with unique idempotency keys (no false dedupe).
 *
 * Reporting: `handleSummary()` writes a machine-readable JSON report from the
 * built-in summary data — no `--summary-export` (deprecated in the current k6
 * line) and no third-party summary library. Set SUMMARY_PATH to also save it:
 *   k6 run -e SUMMARY_PATH=k6-summary.json -e BASE=… tests/load/k6-invoices.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

export const options = {
	stages: [
		{ duration: '30s', target: 20 }, // ramp to 20 VUs (store burst)
		{ duration: '2m', target: 50 }, // sustained 50 VUs (chain peak)
		{ duration: '30s', target: 0 }, // ramp down
	],
	thresholds: {
		http_req_duration: ['p(95)<800'],
		http_req_failed: ['rate<0.01'],
	},
};

const invoiceTrend = new Trend('dypos_invoice_ms');
const dedupeRate = new Rate('dypos_deduped');

const BASE = __ENV.BASE || 'http://localhost:3001';

export function setup() {
	const uname = `k6_${Date.now()}`;
	http.post(
		`${BASE}/api/auth/register`,
		JSON.stringify({ username: uname, password: 'K6load123', fullName: 'k6', role: 'ADMIN' }),
		{ headers: { 'Content-Type': 'application/json' } },
	);
	const login = http.post(`${BASE}/api/auth/login`, JSON.stringify({ username: uname, password: 'K6load123' }), {
		headers: { 'Content-Type': 'application/json' },
	});
	const token = login.json('token');
	const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
	http.post(`${BASE}/api/products`, JSON.stringify({ name: 'k6 Prod', code: `K6-${Date.now()}`, unitPrice: 10 }), {
		headers,
	});
	const pid = http.get(`${BASE}/api/products?limit=1`, { headers }).json('products.0.id');
	return { token, pid };
}

export default function (data) {
	const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` };
	const payload = JSON.stringify({
		items: [{ productId: data.pid, qty: 1 }],
		idempotencyKey: `k6-${__VU}-${__ITER}-${Date.now()}`,
	});
	const res = http.post(`${BASE}/api/invoices`, payload, { headers });
	invoiceTrend.add(res.timings.duration);
	check(res, { 'invoice 200/201': (r) => r.status === 200 || r.status === 201 });
	dedupeRate.add(res.json('deduped') === true ? 1 : 0);
	sleep(0.2);
}

/**
 * End-of-test report from the built-in summary data (`data.metrics.*.values`).
 * Core k6 API — no `--summary-export` flag, no external summary library, so the
 * artifact survives k6 upgrades and offline runners.
 */
export function handleSummary(data) {
	const m = data.metrics || {};
	const duration = m.http_req_duration?.values || {};
	const failed = m.http_req_failed?.values || {};
	const checks = m.checks?.values || {};
	const report = {
		base: BASE,
		p95_ms: duration['p(95)'] ?? duration.avg ?? null,
		avg_ms: duration.avg ?? null,
		http_req_failed: failed.rate ?? null,
		http_reqs: m.http_reqs?.values?.count ?? null,
		checks_passes: checks.passes ?? null,
		checks_fails: checks.fails ?? null,
		slo: { p95_ms_max: 800, http_req_failed_max: 0.01 },
	};
	const body = `${JSON.stringify(report, null, 2)}\n`;
	return __ENV.SUMMARY_PATH ? { stdout: body, [__ENV.SUMMARY_PATH]: body } : { stdout: body };
}
