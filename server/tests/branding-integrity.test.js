/**
 * Brand/naming integrity guard — enforces the "no third-party framework in the
 * runtime" decision (docs/LEGACY_DECISION.md, AGENTS.md invariant 8).
 *
 * The de-branding campaign replaced the old third-party UI kit with the
 * first-party `dypos-ui` kit. That sweep was done with a blind find/replace and
 * left two classes of damage behind, both invisible to the unit tests:
 *
 *   1. glued words — "dyposerror", "dyposturned", "dyposis", "dyposdoctypes":
 *      prose and identifiers where the brand got welded onto an English word;
 *   2. dead globals — `dypos.session.user` / `dypos.user_roles` (the old desk
 *      global) survived in shipped code, where they are a guaranteed
 *      ReferenceError: there is no such global in the standalone offline PWA.
 *
 * Both rot silently, so this file makes them fail loudly in CI.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const SOURCE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.vue', '.tsx', '.jsx', '.css']);
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'dist-deploy', 'coverage', '.pages-site']);
const ACTIVE_DIRS = ['POS/src', 'POS/tests', 'POS/packages', 'POS/scripts', 'server', 'scripts', 'e2e'];

/** Single files worth reading as shipped code. */
const EXTRA_FILES = ['worker-api.js', 'POS/vite.config.js', 'POS/tailwind.config.js'];

const SELF = resolve(import.meta.dirname, 'branding-integrity.test.js');

function walk(dir, out = []) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry.name.startsWith('.') || SKIP_DIR.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else {
			const dot = entry.name.lastIndexOf('.');
			if (dot !== -1 && SOURCE_EXT.has(entry.name.slice(dot))) out.push(full);
		}
	}
	return out;
}

const isTestFile = (file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);

function activeFiles() {
	const files = [];
	for (const dir of ACTIVE_DIRS) files.push(...walk(join(REPO_ROOT, dir)));
	for (const rel of EXTRA_FILES) {
		try {
			readFileSync(join(REPO_ROOT, rel));
			files.push(join(REPO_ROOT, rel));
		} catch {
			/* optional */
		}
	}
	return files.filter((f) => resolve(f) !== SELF);
}

/** Shipped code only: a test may name a banned pattern in order to assert it. */
const shippedFiles = () => activeFiles().filter((f) => !isTestFile(f));

/**
 * Tokens that legitimately start with the brand. Everything else shaped like
 * `dypos<word>` is find/replace damage.
 *
 * `snake_case` prefixes (`dypos_token`, `dypos_print_jobs`,
 * `dypos_http_request_duration_seconds`) are a deliberate storage/metric/table
 * naming convention, not prose, so they are never flagged.
 */
const ALLOWED_TOKENS = new Set([
	// method-router namespace (a protocol name, not prose)
	'dypos',
	'dyposclient',
	'dyposapi',
	'dypossession',
	'dyposauth',
	'dyposwww',
	'dyposdb',
	'dyposwhitelist',
	'dyposget_value',
	'dyposdelete_doc',
	'dyposuser_roles',
	'dyposrate_limit',
	'dyposlocalization',
	'dyposutilities',
	'dyposinvoices',
	'dyposadd_to_allow_list',
	'dyposapp',
	'dyposdesk',
	'dyposuser',
	'dyposversion',
	'dyposdoctor',
	'dyposorm',
]);

const GLUED = /\bdypos[A-Za-z0-9]+/g;

describe('brand integrity guard', () => {
	it('scans a non-empty active source set (guard is not vacuous)', () => {
		const files = activeFiles();
		assert.ok(files.length > 50, `expected a real source set, found ${files.length} files`);
	});

	it('no brand-glued words (find/replace damage) in shipped code', () => {
		assert.deepEqual(gluedHits(), [], 'glued brand tokens must be repaired, not renamed again');
	});

	it('no dead desk-global references in the offline PWA', () => {
		const hits = [];
		for (const file of walk(join(REPO_ROOT, 'POS/src'))) {
			const rel = relative(REPO_ROOT, file);
			readFileSync(file, 'utf8')
				.split(/\r?\n/)
				.forEach((line, i) => {
					if (/window\.dypos\./.test(line)) return; // the sanctioned runtime global
					if (!/(?<![.\w$])dypos\.(session|user_roles|boot|conf)\b/.test(line)) return;
					hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
				});
		}
		assert.deepEqual(
			hits,
			[],
			'`dypos.session.user` (and friends) do not exist in the standalone PWA — use the local session',
		);
	});

	it('no legacy third-party identifiers in shipped code', () => {
		const banned = [
			'frappeError',
			'frappeRequest',
			'frappeClient',
			'getFrappeBoot',
			'NO_FRAPPE',
			'X-Frappe-CSRF-Token',
			'from "frappe-ui"',
			"from 'frappe-ui'",
			'window.frappe',
		];
		for (const needle of banned) {
			const hits = [];
			for (const file of shippedFiles()) {
				const rel = relative(REPO_ROOT, file);
				readFileSync(file, 'utf8')
					.split(/\r?\n/)
					.forEach((line, i) => {
						if (!line.includes(needle)) return;
						hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
					});
			}
			assert.deepEqual(hits, [], `${needle} must not exist in the active tree`);
		}
	});

	it('the two documented legacy escapes stay deliberate, not accidental', () => {
		// 1) VITE_DYPOS_BACKEND=frappe is still accepted so an old .env boots.
		const adapters = readFileSync(join(REPO_ROOT, 'POS/src/adapters/index.js'), 'utf8');
		assert.match(adapters, /backend === "method" \|\| backend === "frappe"/);

		// 2) DYPOS_FRAPPE_ORIGIN is still read as a fallback for DYPOS_DESK_ORIGIN.
		const server = readFileSync(join(REPO_ROOT, 'server/server.js'), 'utf8');
		assert.match(server, /DYPOS_DESK_ORIGIN \|\| process\.env\.DYPOS_FRAPPE_ORIGIN/);
	});

	it('the method bridge is reachable under its modern name only', () => {
		const facade = readFileSync(join(REPO_ROOT, 'POS/src/adapters/index.js'), 'utf8');
		assert.match(facade, /adapters\/method\/api\.js/);
		assert.doesNotMatch(facade, /adapters\/frappe\/api\.js/);
		// A path passed as a *variable* to import() is invisible to Rollup: the
		// chunk never reaches dist/ and the lazy import 404s in production while
		// dev keeps working. Both adapters must therefore be static specifiers.
		assert.doesNotMatch(facade, /import\(\s*[A-Za-z_$]/);
	});
});

/**
 * Every line of shipped code, flagged when the brand got welded to an English
 * word ("dyposerror", "dyposturned", "dyposis", "dyposdoctypes").
 */
function gluedHits() {
	const hits = [];
	for (const file of shippedFiles()) {
		const rel = relative(REPO_ROOT, file);
		readFileSync(file, 'utf8')
			.split(/\r?\n/)
			.forEach((line, i) => {
				for (const match of line.matchAll(GLUED)) {
					const token = match[0];
					if (token.includes('_')) continue; // deliberate snake_case prefix
					if (ALLOWED_TOKENS.has(token)) continue;
					// camelCase compounds (dyposApi, dyposMetrics, dyposId) are a
					// deliberate, readable brand prefix — not glued prose.
					if (/^dypos[A-Z]/.test(token)) continue;
					hits.push(`${rel}:${i + 1}  ${token}  |  ${line.trim().slice(0, 100)}`);
				}
			});
	}
	return hits;
}
