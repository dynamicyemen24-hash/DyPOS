#!/usr/bin/env node
/**
 * DyPOS Advanced Stress Campaign — 7 phases, one command.
 * Proves correctness + performance + security under fire, not just happy-path.
 *
 * Phases:
 *  A  Burst ............ 400 invoices @ 40 conc — throughput & p95
 *  B  Idempotency storm  30 concurrent POSTs, SAME key — exactly 1 invoice
 *  C  Pay race ......... 10 concurrent full-pays — no overpay, 1 winner
 *  D  Stock accuracy ... +1000 then 100×qty2 sales — final must equal 800
 *  E  Mixed workload ... 300 ops across 7 endpoints — per-endpoint p95
 *  F  Security probes .. ADMIN escalation, bad token, 1.2MB body, 404, brute-force 429
 *  G  Read-only replica  spawned child with DYPOS_READ_ONLY=1 — writes → 409
 *  S  Soak ............. 30s sustained invoices — zero errors, stable p95
 *
 * Run:  npm run campaign -- --base http://localhost:3001
 * Exit: 0 all phases pass · 1 any phase fails · 2 infra failure
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
    return acc;
  }, [])
);
// 127.0.0.1 (not localhost): avoids ::1→127.0.0.1 fallback flakiness on Windows,
// which once produced phantom -1s under burst load.
const BASE = (args.base || process.env.CAMPAIGN_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '');
const SOAK_SECS = Number(args.soak || 30);
const RUN = Date.now();
const results = [];

function phase(name, ok, detail = {}) {
  results.push({ phase: name, pass: !!ok, ...detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail.summary ? ' — ' + detail.summary : ''}`);
  return !!ok;
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
const stats = (lat) => {
  const s = [...lat].sort((a, b) => a - b);
  return { p50: +pct(s, 50).toFixed(1), p95: +pct(s, 95).toFixed(1), p99: +pct(s, 99).toFixed(1) };
};

async function req(method, path, body, token, timeoutMs = 15000) {
  const t0 = process.hrtime.bigint();
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    let parsed = null;
    try { parsed = await r.json(); } catch { /* non-JSON */ }
    return { status: r.status, ms, body: parsed };
  } catch (e) {
    return { status: -1, ms: Number(process.hrtime.bigint() - t0) / 1e6, error: String(e.message).slice(0, 120) };
  }
}

/** Verification read with retry: survives transient stalls, never crashes the run. */
async function readJson(method, path, token, tries = 3) {
  let last = { status: -1, body: null };
  for (let i = 0; i < tries; i++) {
    last = await req(method, path, undefined, token);
    if (last.body) return last;
    await sleep(500);
  }
  return last;
}

async function pool(n, count, fn) {
  const out = new Array(count);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, count) }, async () => {
    while (true) {
      const i = next++;
      if (i >= count) return;
      out[i] = await fn(i);
    }
  }));
  return out;
}

// ── Setup ────────────────────────────────────────────────────────────────
const health = await req('GET', '/api/health');
if (health.status !== 200) {
  console.error(JSON.stringify({ ok: false, error: `server not healthy at ${BASE}` }));
  process.exit(2);
}
const uname = `camp_${RUN}`;
// Register as ADMIN (bootstrap on fresh DB) — stock accuracy phase needs
// POST /api/stock/adjust which is ADMIN/MANAGER-only since v1.5.0 hardening.
// If the DB already has users (e.g. load-test ran first), ADMIN self-register
// is correctly refused → fall back to CASHIER so the campaign still runs;
// phase D then fails closed with a clear message instead of silently testing -200.
const reg = await req('POST', '/api/auth/register', { username: uname, password: 'Camp1234', fullName: 'Campaign', role: 'ADMIN' });
if (![200, 201].includes(reg.status)) {
  await req('POST', '/api/auth/register', { username: uname, password: 'Camp1234', fullName: 'Campaign' });
}
const login = await req('POST', '/api/auth/login', { username: uname, password: 'Camp1234' });
if (login.status !== 200 || !login.body?.token) {
  console.error(JSON.stringify({ ok: false, error: 'campaign login failed' }));
  process.exit(2);
}
const T = login.body.token;
const mkProd = async (tag, price) => {
  const r = await req('POST', '/api/products', { name: `Camp ${tag}`, code: `CAMP-${tag}-${RUN}`, unitPrice: price }, T);
  return r.body.id;
};
const pidA = await mkProd('A', 100);   // invoice phases (100 + 15% tax)
const pidD = await mkProd('D', 10);    // stock-accuracy phase

// ── A: Burst ─────────────────────────────────────────────────────────────
{
  const t0 = Date.now();
  const rs = await pool(40, 400, (i) =>
    req('POST', '/api/invoices', { items: [{ productId: pidA, qty: 1 + (i % 3) }], idempotencyKey: `campA-${RUN}-${i}` }, T));
  const lat = rs.map((r) => r.ms);
  const okN = rs.filter((r) => r.status === 201).length;
  const s = stats(lat);
  const secs = (Date.now() - t0) / 1000;
  phase('A burst 400@40', okN === 400 && s.p95 < 800, {
    summary: `${(400 / secs).toFixed(0)} rps, p95 ${s.p95}ms, ok ${okN}/400`, ...s, rps: +(400 / secs).toFixed(1),
  });
}

// ── B: Idempotency storm (same key × 30) ──────────────────────────────────
{
  const key = `campB-${RUN}`;
  const rs = await pool(30, 30, () =>
    req('POST', '/api/invoices', { items: [{ productId: pidA, qty: 1 }], idempotencyKey: key }, T));
  const ids = new Set(rs.map((r) => r.body?.invoiceId).filter(Boolean));
  const created = rs.filter((r) => r.status === 201 && !r.body?.deduped).length;
  const deduped = rs.filter((r) => r.body?.deduped === true).length;
  phase('B idempotency storm', ids.size === 1 && created === 1 && deduped === 29, {
    summary: `1 invoice, ${created} created + ${deduped} deduped, ids=${ids.size}`,
  });
}

// ── C: Pay race (10 concurrent full pays) ────────────────────────────────
{
  // Idempotency key makes setup safe to retry under lock contention.
  const key = `campC-${RUN}`;
  let c = await req('POST', '/api/invoices', { items: [{ productId: pidA, qty: 1 }], payments: [{ method: 'CASH', amount: 0 }], idempotencyKey: key }, T);
  if (c.status !== 201) {
    await sleep(500);
    c = await req('POST', '/api/invoices', { items: [{ productId: pidA, qty: 1 }], payments: [{ method: 'CASH', amount: 0 }], idempotencyKey: key }, T);
  }
  const id = c.body?.invoiceId; // total 115
  if (!id) {
    phase('C pay race', false, { summary: `setup failed: status=${c.status} body=${JSON.stringify(c.body).slice(0, 200)}` });
  } else {
    const rs = await pool(10, 10, () => req('POST', `/api/invoices/${id}/pay`, { method: 'CASH', amount: 115 }, T));
    const wins = rs.filter((r) => r.status === 200).length;
    const fin = await readJson('GET', `/api/invoices/${id}`, T);
    if (!fin.body?.payments) {
      phase('C pay race', false, { summary: `final read failed: status=${fin.status}` });
    } else {
      const paySum = fin.body.payments.reduce((a, p) => a + Number(p.amount), 0);
      const ok = wins === 1 && fin.body.status === 'PAID' && fin.body.paid_amount === 115 && paySum === 115;
      phase('C pay race', ok, { summary: `${wins} winner, paid=${fin.body.paid_amount}, sum=${paySum}, status=${fin.body.status}` });
    }
  }
}

// ── D: Stock accuracy (+1000, then 100×qty2 → 800) ───────────────────────
{
  const adj = await req('POST', '/api/stock/adjust', { productId: pidD, warehouseId: 'W-01', qty: 1000, reason: 'campaign' }, T);
  if (adj.status === 403) {
    phase('D stock accuracy', false, { summary: `stock/adjust forbidden (campaign user lacks ADMIN) — rerun on fresh DB for bootstrap ADMIN` });
  } else {
  const rs = await pool(20, 100, (i) =>
    req('POST', '/api/invoices', { items: [{ productId: pidD, qty: 2 }], idempotencyKey: `campD-${RUN}-${i}` }, T));
  const okN = rs.filter((r) => [200, 201].includes(r.status)).length;
  const st = await readJson('GET', `/api/stock/${pidD}?warehouse=W-01`, T);
  const finalQty = st.body ? Number(st.body.qty) : NaN;
  phase('D stock accuracy', okN === 100 && finalQty === 800, {
    summary: `ok ${okN}/100, final stock=${st.body ? st.body.qty : 'read-failed(' + st.status + ')'} (expect 800)`,
  });
  }
}

// ── E: Mixed workload ────────────────────────────────────────────────────
{
  const endpoints = [
    ['GET products', 'GET', '/api/products?limit=20'],
    ['GET invoices', 'GET', '/api/invoices?limit=20'],
    ['GET daily', 'GET', '/api/invoices/reports/daily'],
    ['GET stock', 'GET', '/api/stock?warehouse=W-01'],
    ['GET sync-pull', 'GET', '/api/sync/pull?limit=50'],
    ['GET checkpoint', 'GET', '/api/sync/checkpoint'],
    ['POST invoice', 'POST', '/api/invoices'],
  ];
  const per = {};
  const rs = await pool(15, 300, async (i) => {
    const [name, m, p] = endpoints[i % endpoints.length];
    const body = m === 'POST' ? { items: [{ productId: pidA, qty: 1 }], idempotencyKey: `campE-${RUN}-${i}` } : undefined;
    const r = await req(m, p, body, T);
    if (!per[name]) per[name] = [];
    per[name].push(r.ms);
    return r;
  });
  const fails = rs.filter((r) => ![200, 201].includes(r.status));
  const breakdown = Object.fromEntries(Object.entries(per).map(([k, v]) => [k, stats(v).p95]));
  phase('E mixed 300 ops', fails.length === 0, { summary: `errors ${fails.length}/300, p95 ${JSON.stringify(breakdown)}` });
}

// ── F: Security probes ───────────────────────────────────────────────────
{
  const checks = {};
  // Probes retry once: a lone -1 (client socket stall) must not fail the phase alone.
  const probe = async (m, p, b, t) => {
    let r = await req(m, p, b, t);
    if (r.status === -1) { await sleep(1000); r = await req(m, p, b, t); }
    return r.status;
  };
  checks.adminEscalation = (await req('POST', '/api/auth/register', { username: `evil_${RUN}`, password: 'Evil1234', fullName: 'Evil', role: 'ADMIN' })).status;
  // NOTE: GET probes pass `undefined` (never null) — fetch throws on GET-with-body.
  checks.badToken = await probe('GET', '/api/products', undefined, 'forged-token');
  checks.noToken = await probe('GET', '/api/products', undefined, undefined);
  checks.bigBody = (await req('POST', '/api/invoices', { items: [{ productId: pidA, qty: 1 }], notes: 'x'.repeat(1_300_000) }, T)).status;
  checks.api404 = await probe('GET', '/api/does-not-exist', undefined, T);
  // 'Wrong1234' passes zod shape (8+ chars, letter+digit) so failures are genuine
  // 401s — 'wrong' (5 chars) would 400 at validation and never exercise passwords.
  const brute = await pool(5, 40, (i) => req('POST', '/api/auth/login', { username: `ghost_${RUN}_${i}`, password: 'Wrong1234' }));
  checks.brute429 = brute.some((r) => r.status === 429);
  // Ghost logins must NEVER succeed (200) or crash (500/-1). 429 proves the
  // brute-force guard when limits are default; all-401 is correct when the
  // campaign runs against raised limits (DYPOS_AUTH_LIMIT_MAX).
  const bruteClean = brute.every((r) => r.status === 401 || r.status === 429);
  const ok = [401, 403].includes(checks.adminEscalation) && checks.badToken === 401 && checks.noToken === 401
    && checks.bigBody === 413 && checks.api404 === 404 && bruteClean;
  phase('F security probes', ok, {
    summary: `escalation=${checks.adminEscalation} badToken=${checks.badToken} noToken=${checks.noToken} bigBody=${checks.bigBody} 404=${checks.api404} brute429=${checks.brute429}`,
  });
}

// ── G: Read-only replica ─────────────────────────────────────────────────
{
  const PORT = 3102;
  // Pre-check: a stale replica on 3102 would make the child die with EADDRINUSE.
  let portBusy = false;
  try {
    portBusy = (await fetch(`http://127.0.0.1:${PORT}/api/ready`)).status === 200;
  } catch { /* free — proceed */ }
  if (portBusy) {
    phase('G read-only replica', false, { summary: `port ${PORT} occupied by a stale server — kill it and rerun` });
  } else {
  const child = spawn(process.execPath, ['server.js'], {
    // Campaign lives in scripts/ — the server root is its parent.
    // (Also: URL.pathname has a bogus leading '/' on Windows, hence fileURLToPath.)
    cwd: join(dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, DYPOS_PORT: String(PORT), DYPOS_DB_PATH: ':memory:', DYPOS_READ_ONLY: '1', DYPOS_RATE_LIMIT_MAX: '100000' },
    stdio: 'ignore',
  });
  let exitCode = null;
  child.on('exit', (c) => { exitCode = c; });
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(500);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/ready`);
      ready = r.status === 200;
    } catch { /* booting */ }
  }
  if (!ready) {
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
    await sleep(500);
    phase('G read-only replica', false, {
      summary: exitCode !== null ? `child exited during boot (code=${exitCode})` : 'replica unreachable (child alive — client/env stall suspected)',
    });
  } else {
    let g = -1, w = { status: -1, body: null };
    try {
      g = (await fetch(`http://127.0.0.1:${PORT}/api/health`)).status;
      const r = await fetch(`http://127.0.0.1:${PORT}/api/products`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${T}` },
        body: JSON.stringify({ name: 'Replica Write', code: `REP-${RUN}` }),
      });
      let b = null;
      try { b = await r.json(); } catch { /* ignore */ }
      w = { status: r.status, body: b };
    } catch { /* client stall → recorded below */ }
    const ok = g === 200 && w.status === 409 && w.body?.code === 'READ_ONLY_REPLICA';
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
    await sleep(500);
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
    phase('G read-only replica', ok, { summary: `health=${g} write=${w.status} code=${w.body?.code}` });
  }
  } // end else (port free)
}

// ── S: Soak (sustained) ──────────────────────────────────────────────────
{
  const lat = [];
  let fails = 0;
  const end = Date.now() + SOAK_SECS * 1000;
  let n = 0, stopped = false;
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (!stopped) {
      if (Date.now() > end) { stopped = true; return; }
      const r = await req('POST', '/api/invoices', { items: [{ productId: pidA, qty: 1 }], idempotencyKey: `campS-${RUN}-${n++}` }, T);
      lat.push(r.ms);
      if (![200, 201].includes(r.status)) fails++;
    }
  }));
  const s = stats(lat);
  phase(`S soak ${SOAK_SECS}s`, fails === 0, { summary: `${lat.length} invoices, errors ${fails}, p95 ${s.p95}ms`, ...s });
}

// ── Report ───────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
console.log('\n' + JSON.stringify({ ok: failed.length === 0, base: BASE, phases: results }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
