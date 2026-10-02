/**
 * Nightly load-test gate reproduction (no k6 needed).
 *
 * The nightly job reports http_req_failed 96% while the API is healthy, and the
 * histogram says it stopped after ~1000 successes. server/middleware/rate-limiters.js
 * states the contract in its own header: "both limits are env-tunable BECAUSE the
 * load test needs them raised without touching code" — but the workflow's boot
 * step never passes DYPOS_RATE_LIMIT_MAX. So the job measures the rate limiter,
 * not the invoice path.
 *
 * This fires the same request shape k6 does (setup + POST /api/invoices) and
 * reports the first status that is neither 200/201 nor 429, so the wall is named
 * instead of guessed.
 *
 * The target is an ARGUMENT or an env var, never a literal baked into the tool:
 * a diagnostic that only works on the port someone happened to boot is a
 * diagnostic that silently stops working. Point it at any reachable API —
 * localhost, a LAN address, a tunnel, a staging origin — and it measures the
 * same thing. `DYPOS_PORT` matches how the server itself is configured.
 *
 *   node server/tests/load/repro-rate-wall.mjs <base-url> [count]
 *   DYPOS_BASE_URL=https://api.example.com node .../repro-rate-wall.mjs
 */
// argv[2] is a URL and argv[3] a count; a lone leading NUMBER is the count, so
// `… 300` means "300 requests against the default/env target", not "the URL 300".
const args = process.argv.slice(2);
const countArg = args.find((a) => /^\d+$/.test(a));
const urlArg = args.find((a) => /^[a-z][a-z0-9+.-]*:\/\//i.test(a));
const BASE = (urlArg || process.env.DYPOS_BASE_URL || `http://127.0.0.1:${process.env.DYPOS_PORT || 3001}`).replace(
	/\/$/,
	'',
);
const N = Number(countArg || 1200);

console.log(`target: ${BASE}  requests: ${N}`);

const j = (body) => JSON.stringify(body);
const H = { 'Content-Type': 'application/json' };

const uname = `repro_${Date.now()}`;
const reg = await fetch(`${BASE}/api/auth/register`, {
	method: 'POST',
	headers: H,
	body: j({ username: uname, password: 'K6load123', fullName: 'repro', role: 'ADMIN' }),
});
// Drain every response body. An undici response whose body is never read keeps
// its socket in the pool, and Windows libuv then trips
// `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` during teardown —
// the diagnostic dies with an access violation instead of printing its reading.
await reg.text();

const login = await fetch(`${BASE}/api/auth/login`, {
	method: 'POST',
	headers: H,
	body: j({ username: uname, password: 'K6load123' }),
});
const lb = await login.json();
const token = lb.token ?? lb.message?.token;
if (!token) {
	console.log('login failed', login.status, JSON.stringify(lb).slice(0, 200));
	process.exit(2);
}
const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

await (
	await fetch(`${BASE}/api/products`, {
		method: 'POST',
		headers: auth,
		body: j({ name: 'repro Prod', code: `REPRO-${Date.now()}`, unitPrice: 10 }),
	})
).text();
const pl = await (await fetch(`${BASE}/api/products?limit=1`, { headers: auth })).json();
const pid = pl.products?.[0]?.id;

const tally = new Map();
let firstOther = null;
let firstOtherAt = null;
for (let i = 0; i < N; i++) {
	const res = await fetch(`${BASE}/api/invoices`, {
		method: 'POST',
		headers: auth,
		body: j({
			items: [{ productId: pid, qty: 1 }],
			idempotencyKey: `repro-${Date.now()}-${i}`,
		}),
	});
	tally.set(res.status, (tally.get(res.status) ?? 0) + 1);
	if (firstOther === null && res.status !== 429 && (res.status < 200 || res.status > 201)) {
		firstOther = res.status;
		firstOtherAt = i;
	}
	// Drain the invoice bodies too (see above): N sockets left unread is exactly
	// how this script crashed on Windows after printing a correct measurement.
	await res.text();
	if (i === 0 && res.status === 429) {
		console.log('ALREADY 429 on the FIRST invoice — the limiter is closed at boot');
		break;
	}
}

const ok = (tally.get(200) ?? 0) + (tally.get(201) ?? 0);
console.log(`register=${reg.status} login=${login.status}`);
console.log(`sent=${N} 2xx=${ok} 429=${tally.get(429) ?? 0}`);
console.log(`statuses=${JSON.stringify([...tally].sort((a, b) => a[0] - b[0]))}`);
if (firstOther !== null) console.log(`first non-2xx/429 status: ${firstOther} at request #${firstOtherAt}`);
console.log(ok === N ? 'VERDICT: invoice path is clean at this volume' : 'VERDICT: the request volume hit a wall');

// No explicit process.exit() here. Calling it while undici still holds pooled
// sockets trips a libuv assert on Windows AND discards the buffered stdout, so
// the run printed nothing at all. Draining every response body (above) lets the
// loop finish and the process exit cleanly on its own.
