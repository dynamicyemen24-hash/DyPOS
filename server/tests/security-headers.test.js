/**
 * Security: response-header hardening (CSP nonce + securityHeaders).
 *
 * These two middlewares previously had ZERO coverage, which let three real
 * defects ship:
 *
 *   1. `buildCspWithNonce` referenced an undeclared `allowCode`. It sat on the
 *      right-hand side of `deskOriginClean && allowCode`, so short-circuiting
 *      hid it in dev (deskOrigin empty) — but with DYPOS_DESK_ORIGIN set
 *      every single request threw ReferenceError => Express 500.
 *   2. `registerSecurityHeaders` was imported in server.js but never mounted,
 *      so COOP, Permissions-Policy, Referrer-Policy and `Cache-Control: no-store`
 *      on /api/* were never sent at all.
 *   3. `CACHE_TTL = isProduction ? ...` used the function as a value, always
 *      truthy, so index.html was cached for an hour in dev too.
 *
 * `DYPOS_FRAPPE_ORIGIN` is set at the top of this file, BEFORE server.js loads,
 * so the HTTP-level tests below run under exactly the condition that used to
 * 500. The pure-function tests pass options explicitly to cover the other paths.
 */
process.env.DYPOS_FRAPPE_ORIGIN = 'https://erp.example.com';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';

const { buildCspWithNonce, cspNonceMiddleware } = await import('../middleware/cspNonce.js');
const { securityHeaders, registerSecurityHeaders } = await import('../middleware/securityHeaders.js');
const { app } = await import('../server.js');

let server;
let port;

before(async () => {
	server = http.createServer(app);
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	port = server.address().port;
});

after(async () => {
	if (server) await new Promise((r) => server.close(r));
});

async function get(path, headers = {}) {
	const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
	return { status: res.status, headers: res.headers, body: await res.text() };
}

/** Run a middleware over a fake res and capture the headers it set. */
function runMiddleware(mw, { path = '/', method = 'GET' } = {}) {
	const set = new Map();
	const res = {
		locals: {},
		setHeader: (k, v) => set.set(k.toLowerCase(), v),
		getHeader: (k) => set.get(k.toLowerCase()),
		send: () => {},
	};
	const req = { path, method, headers: {} };
	let nexted = false;
	mw(req, res, () => {
		nexted = true;
	});
	return { headers: set, res, nexted };
}

describe('CSP nonce builder', () => {
	it('does not throw when deskOrigin is set (regression: ReferenceError allowCode)', () => {
		// This exact call used to throw, 500ing every request in production.
		assert.doesNotThrow(() => buildCspWithNonce('NONCE123', { deskOrigin: 'https://erp.example.com' }));
	});

	it('does not throw with every option combination', () => {
		const combos = [
			{},
			{ deskOrigin: '' },
			{ deskOrigin: 'https://erp.example.com' },
			{ apiOrigins: 'https://api.example.com', deskOrigin: 'https://erp.example.com' },
			{ apiOrigins: '', allowFraming: true },
			{ isProduction: true, allowFraming: false, deskOrigin: 'https://a.test' },
		];
		for (const opts of combos) {
			assert.doesNotThrow(() => buildCspWithNonce('N', opts), `options: ${JSON.stringify(opts)}`);
		}
	});

	it('binds the nonce into style-src', () => {
		const csp = buildCspWithNonce('abc123');
		assert.match(csp, /style-src 'self' 'nonce-abc123'/);
	});

	it('never allows an external font origin (self-hosted fonts only)', () => {
		const csp = buildCspWithNonce('n');
		const fontSrc = csp.split(';').find((d) => d.trim().startsWith('font-src'));
		assert.ok(fontSrc, 'font-src directive must be present');
		assert.ok(!/https?:/.test(fontSrc), `font-src must be self-only, got: ${fontSrc.trim()}`);
	});

	it('keeps frame-ancestors at self unless framing is explicitly allowed', () => {
		const frameAncestors = (csp) =>
			csp
				.split(';')
				.find((d) => d.trim().startsWith('frame-ancestors'))
				.trim();

		const denied = buildCspWithNonce('n', { deskOrigin: 'https://erp.example.com' });
		assert.strictEqual(frameAncestors(denied), "frame-ancestors 'self'");

		const allowed = buildCspWithNonce('n', {
			deskOrigin: 'https://erp.example.com',
			allowFraming: true,
		});
		assert.strictEqual(frameAncestors(allowed), "frame-ancestors 'self' https://erp.example.com");
	});

	it('rejects non-http(s) origins so a malformed env var cannot inject a directive', () => {
		const csp = buildCspWithNonce('n', {
			apiOrigins: 'https://api.example.com; script-src *',
			deskOrigin: 'javascript:alert(1)',
		});
		const directives = csp.split(';').map((d) => d.trim());

		assert.ok(!directives.includes('script-src *'), `injected directive present: ${csp}`);
		assert.ok(!/javascript:/.test(csp), `non-http scheme leaked into CSP: ${csp}`);
		// 'script-src' is a legitimate directive, so assert it appears exactly once
		// (i.e. the payload did not smuggle in a second one).
		assert.strictEqual(
			directives.filter((d) => d.startsWith('script-src')).length,
			1,
			`script-src must appear exactly once: ${csp}`,
		);
		// The whole value was rejected, so connect-src falls back to its own-backend
		// default and the payload never appears.
		assert.strictEqual(
			directives.find((d) => d.startsWith('connect-src')),
			"connect-src 'self' https: wss:",
		);
	});

	it('drops origins carrying CSP-breaking characters or non-bare URLs', () => {
		const hostile = [
			'https://a.test; script-src *',
			'https://a.test evil.test',
			"https://a.test'",
			'https://user:pass@a.test',
			'https://a.test/path',
			'https://a.test?q=1',
			'https://a.test#f',
			'data:text/html,<script>alert(1)</script>',
			'not-a-url',
		];
		for (const value of hostile) {
			const csp = buildCspWithNonce('n', { apiOrigins: value });
			const connectSrc = csp
				.split(';')
				.map((d) => d.trim())
				.find((d) => d.startsWith('connect-src'));
			assert.strictEqual(
				connectSrc,
				"connect-src 'self' https: wss:",
				`hostile origin was not dropped: ${value} -> ${connectSrc}`,
			);
		}
	});

	it('keeps legitimate origins, including ports and normalisation', () => {
		const csp = buildCspWithNonce('n', { apiOrigins: 'https://api.a.test,https://b.test:8443' });
		assert.strictEqual(
			csp
				.split(';')
				.map((d) => d.trim())
				.find((d) => d.startsWith('connect-src')),
			"connect-src 'self' https://api.a.test https://b.test:8443",
		);
	});

	it('emits a valid directive list (no empty directives, sources present where required)', () => {
		// These CSP directives legitimately carry no source list.
		const VALUELESS = new Set(['upgrade-insecure-requests', 'block-all-mixed-content']);
		const csp = buildCspWithNonce('n', { apiOrigins: 'https://api.example.com' });
		for (const raw of csp.split(';')) {
			const d = raw.trim();
			assert.ok(d.length > 0, 'empty directive');
			if (VALUELESS.has(d)) continue;
			assert.ok(d.includes(' '), `directive without a source list: ${d}`);
		}
	});
});

describe('cspNonceMiddleware', () => {
	it('keeps arity 3 — Express dispatches on fn.length', () => {
		// Dropping the unused `req` param would make this 2 and the middleware
		// would silently never run again.
		assert.strictEqual(cspNonceMiddleware().length, 3);
	});

	it('attaches a per-request nonce to res.locals and the X-CSP-Nonce header', () => {
		const a = runMiddleware(cspNonceMiddleware());
		const b = runMiddleware(cspNonceMiddleware());
		assert.ok(a.nexted, 'must call next()');
		assert.ok(a.headers.get('x-csp-nonce'), 'X-CSP-Nonce must be set');
		assert.strictEqual(a.headers.get('x-csp-nonce'), a.res.locals.cspNonce);
		assert.notStrictEqual(
			a.headers.get('x-csp-nonce'),
			b.headers.get('x-csp-nonce'),
			'nonce must be unique per request',
		);
	});
});

describe('CSP over HTTP (end-to-end, real middleware order)', () => {
	it('serves a nonce-based policy — no style-src unsafe-inline on live requests', () => {
		// The debt log listed "CSP style-src 'unsafe-inline'" as deferred work. The
		// nonce path is the one that actually runs, but nothing asserted it end to
		// end, so a middleware-order change could have silently reopened
		// unsafe-inline. This is the assertion that makes the claim checkable.
		return get('/api/ping').then(({ headers }) => {
			const csp = headers.get('content-security-policy') || '';
			assert.ok(csp, 'every response must carry a CSP');
			const styleSrc = csp
				.split(';')
				.map((d) => d.trim())
				.find((d) => d.startsWith('style-src'));
			assert.ok(styleSrc, `no style-src directive in: ${csp}`);
			assert.match(styleSrc, /'nonce-[^']+'/, `style-src must carry the per-request nonce: ${styleSrc}`);
			assert.ok(!csp.includes('unsafe-inline'), `live policy must not fall back to unsafe-inline: ${csp}`);
		});
	});

	it('the nonce in the header matches the nonce in the policy', () => {
		return get('/api/ping').then(({ headers }) => {
			const nonce = headers.get('x-csp-nonce');
			const csp = headers.get('content-security-policy') || '';
			assert.ok(nonce, 'X-CSP-Nonce must be present');
			assert.ok(csp.includes(`'nonce-${nonce}'`), 'policy and header nonce must agree');
		});
	});
});

describe('securityHeaders middleware', () => {
	it('sets COOP, Permissions-Policy, Referrer-Policy and nosniff', () => {
		// deskOrigin: '' is explicit because this file sets
		// DYPOS_FRAPPE_ORIGIN, and COOP is intentionally suppressed when a desk
		// origin exists (see the next test).
		const { headers } = runMiddleware(securityHeaders({ deskOrigin: '' }));
		assert.strictEqual(headers.get('cross-origin-opener-policy'), 'same-origin');
		assert.match(headers.get('permissions-policy') || '', /payment=\(\)/);
		assert.match(headers.get('permissions-policy') || '', /camera=\(\)/);
		assert.strictEqual(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
		assert.strictEqual(headers.get('x-content-type-options'), 'nosniff');
	});

	it('marks /api/* as no-store so financial responses are not cached', () => {
		const { headers } = runMiddleware(securityHeaders(), { path: '/api/method/ping' });
		assert.strictEqual(headers.get('cache-control'), 'no-store');
	});

	it('suppresses COOP when a desk origin is configured', () => {
		const { headers } = runMiddleware(securityHeaders({ deskOrigin: 'https://erp.example.com' }));
		assert.ok(!headers.get('cross-origin-opener-policy'), 'COOP must be suppressed with a desk origin');
	});

	it('does not clobber a CSP that was already set', () => {
		const { res } = runMiddleware(securityHeaders());
		// Re-run against a res that already carries a CSP.
		const set = new Map([['content-security-policy', "default-src 'none'"]]);
		const res2 = {
			setHeader: (k, v) => set.set(k.toLowerCase(), v),
			getHeader: (k) => set.get(k.toLowerCase()),
			locals: {},
		};
		securityHeaders()({ path: '/', method: 'GET', headers: {} }, res2, () => {});
		assert.strictEqual(set.get('content-security-policy'), "default-src 'none'");
		void res;
	});
});

describe('live server (DYPOS_FRAPPE_ORIGIN set — the config that used to 500)', () => {
	it('serves requests instead of throwing ReferenceError', async () => {
		const res = await get('/health');
		assert.notStrictEqual(res.status, 500, `server threw: ${res.status} ${res.body.slice(0, 200)}`);
		// The regression under guard is "the server answered at all". A 503 from
		// the health aggregate is a well-formed answer (some registered check
		// degraded), not a crash — asserting "non-5xx" here measured the runner's
		// disk/memory headroom instead of the middleware (AGENTS.md gotcha).
		assert.ok([200, 503].includes(res.status), `unexpected health status ${res.status}`);
	});

	it('emits a CSP header on a live response', async () => {
		const csp = (await get('/health')).headers.get('content-security-policy');
		assert.ok(csp, 'Content-Security-Policy must be present');
		assert.match(csp, /style-src 'self' 'nonce-/);
	});

	it('emits the hardened headers that were previously missing entirely', async () => {
		const h = (await get('/health')).headers;
		// COOP is intentionally suppressed here (dyposorigin is set).
		assert.match(h.get('permissions-policy') || '', /payment=\(\)/);
		assert.strictEqual(h.get('referrer-policy'), 'strict-origin-when-cross-origin');
		assert.strictEqual(h.get('x-content-type-options'), 'nosniff');
	});

	it('uses a fresh nonce on every request', async () => {
		const extract = (csp) => (csp || '').match(/nonce-([^']+)'/)?.[1];
		const a = extract((await get('/health')).headers.get('content-security-policy'));
		const b = extract((await get('/health')).headers.get('content-security-policy'));
		assert.ok(a, 'nonce must be extractable from the live CSP');
		assert.notStrictEqual(a, b, 'live nonce must differ per request');
	});
});

describe('registerSecurityHeaders', () => {
	it('mounts onto an app and returns it', () => {
		let mounted = 0;
		const fake = {
			use: () => {
				mounted += 1;
			},
		};
		const returned = registerSecurityHeaders(fake);
		assert.strictEqual(mounted, 1, 'must register exactly one middleware');
		assert.strictEqual(returned, fake, 'must return the app for chaining');
	});
});
