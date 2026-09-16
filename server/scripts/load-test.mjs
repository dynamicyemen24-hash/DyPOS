#!/usr/bin/env node
/**
 * DyPOS Load Test — zero-dependency (Node 22+).
 * Hammers the REAL invoice path (auth → product → POST /api/invoices)
 * with configurable concurrency and reports p50/p95/p99 + throughput.
 *
 * Run: npm run load -- --base http://localhost:3001 --concurrency 20 --requests 400
 * CI thresholds (env): LOAD_P95_MS=800 LOAD_MIN_RPS=20 LOAD_MAX_ERR=0.01
 * Exit code: 0 pass, 1 threshold breach, 2 infra failure.
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
    return acc;
  }, [])
);
const BASE = (args.base || process.env.LOAD_BASE || 'http://localhost:3001').replace(/\/$/, '');
const CONCURRENCY = Number(args.concurrency || process.env.LOAD_CONCURRENCY || 20);
const REQUESTS = Number(args.requests || process.env.LOAD_REQUESTS || 400);
const P95_BUDGET = Number(process.env.LOAD_P95_MS || 800);
const MIN_RPS = Number(process.env.LOAD_MIN_RPS || 20);
const MAX_ERR = Number(process.env.LOAD_MAX_ERR || 0.01);

async function req(method, path, body, token) {
  const t0 = process.hrtime.bigint();
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  let parsed = null;
  try { parsed = await res.json(); } catch { /* ignore */ }
  return { status: res.status, ms, body: parsed };
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const boot = await req('GET', '/api/health');
if (boot.status !== 200) {
  console.error(JSON.stringify({ ok: false, error: `server not healthy at ${BASE} (status ${boot.status}) — start it first` }));
  process.exit(2);
}
const uname = `load_${Date.now()}`;
await req('POST', '/api/auth/register', { username: uname, password: 'Load1234', fullName: 'Load Test' });
const login = await req('POST', '/api/auth/login', { username: uname, password: 'Load1234' });
if (login.status !== 200 || !login.body?.token) {
  console.error(JSON.stringify({ ok: false, error: 'login failed', detail: login.body }));
  process.exit(2);
}
const token = login.body.token;
await req('POST', '/api/products', { name: 'Load Prod', code: `LOAD-${Date.now()}`, unitPrice: 10 }, token);
const list = await req('GET', '/api/products?limit=1', null, token);
const pid = list.body?.products?.[0]?.id;
if (!pid) {
  console.error(JSON.stringify({ ok: false, error: 'no product for load test' }));
  process.exit(2);
}

const lat = [];
let ok = 0, fail = 0, deduped = 0;
const tStart = Date.now();
let next = 0;
async function worker() {
  while (true) {
    const i = next++;
    if (i >= REQUESTS) return;
    const r = await req('POST', '/api/invoices', { items: [{ productId: pid, qty: 1 }], idempotencyKey: `load-${Date.now()}-${i}` }, token);
    lat.push(r.ms);
    if (r.status === 200 || r.status === 201) { ok++; if (r.body?.deduped) deduped++; }
    else fail++;
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, REQUESTS) }, worker));
const secs = (Date.now() - tStart) / 1000;
lat.sort((a, b) => a - b);
const report = {
  ok: true, base: BASE, concurrency: CONCURRENCY, requests: REQUESTS,
  seconds: Number(secs.toFixed(2)), rps: Number((REQUESTS / secs).toFixed(1)),
  ok_count: ok, fail_count: fail, error_rate: Number((fail / REQUESTS).toFixed(4)),
  p50_ms: Number(pct(lat, 50).toFixed(1)), p95_ms: Number(pct(lat, 95).toFixed(1)),
  p99_ms: Number(pct(lat, 99).toFixed(1)), deduped,
  budgets: { p95_ms: P95_BUDGET, min_rps: MIN_RPS, max_err: MAX_ERR },
};
const breach = [];
if (report.p95_ms > P95_BUDGET) breach.push(`p95 ${report.p95_ms}ms > ${P95_BUDGET}ms`);
if (report.rps < MIN_RPS) breach.push(`rps ${report.rps} < ${MIN_RPS}`);
if (report.error_rate > MAX_ERR) breach.push(`error_rate ${report.error_rate} > ${MAX_ERR}`);
report.pass = breach.length === 0;
report.breach = breach;
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
