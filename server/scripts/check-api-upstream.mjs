#!/usr/bin/env node
/**
 * DyPOS API-upstream config gate — shift the UPSTREAM_MISCONFIGURED outage
 * left, from a red 15-minute heartbeat to a red build.
 *
 * What it settles: `wrangler.api.toml` once shipped
 * `[vars] BACKEND_URL = "https://dypos-api.smartportssoft.com"` while that
 * very hostname is listed in `worker-edge-hosts.mjs#DYPOS_EDGE_HOSTS`, so the
 * edge's fail-closed `isSelfProxy` guard answered every `/api/*` call with
 * `503 UPSTREAM_MISCONFIGURED` — on every deploy, since 1.40.0. The heartbeat
 * could only report the outage, never prevent it.
 *
 * The contract enforced here (deterministic, offline — safe for CI):
 *   - a checked-in `[vars] BACKEND_URL` must be an absolute URL AND must not
 *     be self-referential per `isSelfProxy` (the exact outage, as a test);
 *   - absence of `[vars] BACKEND_URL` is PASS: the upstream is then a
 *     `wrangler secret put BACKEND_URL` value (secret-only, never in repo —
 *     see DEPLOYMENT_GUIDE.md «إحياء الـAPI الحيّ»).
 *
 * Optional `--resolve` also DNS-resolves the effective upstream
 * (`$BACKEND_URL` env override wins, for operators) and fails on NXDOMAIN.
 * It is OFF by default because CI runners must not depend on DNS.
 *
 * Run:  npm run upstream [-- --resolve] [-- --json]
 * Exit: 0 = deploy may proceed · 1 = blocked (message names the fix).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve4 } from 'node:dns/promises';
import { DYPOS_EDGE_HOSTS, isSelfProxy } from '../../worker-edge-hosts.mjs';

const SERVER = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(SERVER, '..');
const PRIMARY_EDGE_HOST = 'dypos.smartportssoft.com';

/** Extract `[vars] BACKEND_URL` from wrangler.api.toml, or null when absent. */
export function readCheckedInBackendUrl(tomlText) {
	const varsSection =
		String(tomlText)
			.split(/^\[vars\]/m)[1]
			?.split(/^\[/m)[0] ?? '';
	const hit = varsSection.match(/^\s*BACKEND_URL\s*=\s*"([^"]*)"/m);
	return hit ? hit[1].trim() : null;
}

export function assessUpstream(checkedIn) {
	if (checkedIn === null || checkedIn === '') {
		return {
			ok: true,
			code: 'SECRET_ONLY',
			detail: 'لا BACKEND_URL في [vars] — الأصل من secret النشر (العقد الصحيح).',
		};
	}
	let url = null;
	try {
		url = new URL(checkedIn);
	} catch {
		return {
			ok: false,
			code: 'INVALID_URL',
			detail: `BACKEND_URL مدقق («${checkedIn}») ليس عنوانًا مطلقًا صالحًا.`,
		};
	}
	if (!['http:', 'https:'].includes(url.protocol)) {
		return {
			ok: false,
			code: 'INVALID_URL',
			detail: `BACKEND_URL يجب أن يكون http(s)، وليس «${url.protocol}».`,
		};
	}
	if (isSelfProxy(PRIMARY_EDGE_HOST, url)) {
		return {
			ok: false,
			code: 'SELF_REFERENCE',
			detail:
				`BACKEND_URL («${url.origin}») يُحلّ إلى الحافة نفسها ` +
				`(${DYPOS_EDGE_HOSTS.join('، ')}) — كل /api/* سترد 503 UPSTREAM_MISCONFIGURED. ` +
				'احذفه من [vars] وزوّد الأصل الحقيقي عبر: wrangler secret put BACKEND_URL --config wrangler.api.toml',
		};
	}
	return { ok: true, code: 'OK', detail: `BACKEND_URL المدقق («${url.origin}») خارج الحافة.` };
}

async function main() {
	const argv = process.argv.slice(2);
	const wantResolve = argv.includes('--resolve');
	const wantJson = argv.includes('--json');
	const tomlPath = join(REPO, 'wrangler.api.toml');
	let toml = '';
	try {
		toml = readFileSync(tomlPath, 'utf8');
	} catch (e) {
		const out = {
			ok: false,
			code: 'TOML_MISSING',
			detail: `تعذّر قراءة wrangler.api.toml: ${e.message}`,
		};
		console.log(wantJson ? JSON.stringify(out) : `❌ ${out.detail}`);
		return 1;
	}
	const checkedIn = readCheckedInBackendUrl(toml);
	const verdict = assessUpstream(checkedIn);
	if (!verdict.ok) {
		console.log(wantJson ? JSON.stringify(verdict) : `❌ بوابة الأصل الخلفي: ${verdict.detail}`);
		return 1;
	}
	// `--resolve`: operator-grade DNS proof for the effective upstream.
	const override = String(process.env.BACKEND_URL || '').trim();
	if (wantResolve) {
		const raw = override || checkedIn;
		if (!raw) {
			const out = {
				ok: false,
				code: 'NOTHING_TO_RESOLVE',
				detail: 'لا أصل فعّال لحلّه: لا secret ولا قيمة مدققة.',
			};
			console.log(wantJson ? JSON.stringify(out) : `❌ ${out.detail}`);
			return 1;
		}
		const host = new URL(raw).hostname;
		try {
			const addrs = await resolve4(host);
			const out = { ...verdict, resolved: addrs, host };
			console.log(wantJson ? JSON.stringify(out) : `✅ ${verdict.detail} ويُحلّ في DNS إلى ${addrs.join('، ')}.`);
			return 0;
		} catch {
			const out = {
				ok: false,
				code: 'UNRESOLVED',
				detail: `الأصل «${host}» لا يحلّ في DNS (NXDOMAIN) — الـAPI ميت حيًّا. ثبّت سجل DNS ثم أعد النشر.`,
			};
			console.log(wantJson ? JSON.stringify(out) : `❌ ${out.detail}`);
			return 1;
		}
	}
	console.log(wantJson ? JSON.stringify(verdict) : `✅ بوابة الأصل الخلفي: ${verdict.detail}`);
	return 0;
}

const invokedAsCli = (() => {
	try {
		return import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
	} catch {
		return false;
	}
})();
if (invokedAsCli) process.exitCode = await main();
