/**
 * Dead-code gate — every shipped server module must be reachable.
 *
 * Methodology (mirrors POS/tests/deadCode.test.js): start from true entry
 * points (server, workers, tests, scripts, npm-script paths) and walk literal
 * `import`/`require` chains. A module that nothing imports never executes, so
 * it cannot be "harmless" — it is untested, unshipped code that rots silently.
 *
 * Why a gate and not a one-off sweep: 11 modules (lib/telemetry.js,
 * lib/feature-flags.js, routes/localization.js, …) had already drifted out of
 * the graph while every suite stayed green. A single audit finds them once;
 * this test finds them the day someone stops wiring something up.
 *
 * Rules:
 *   - roots = tests, scripts, server/entrypoint/worker files, plus every
 *     path named in server/package.json scripts (node db/migrate.js …);
 *   - only LITERAL specifiers count — require(variable) is not a chain;
 *   - a non-vacuity floor fails the test if the walk silently degenerates.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '..');
const REPO = resolve(SERVER, '..');

/** Candidate directories: code that must be imported by something. */
const CANDIDATE_DIRS = [
	join(SERVER, 'lib'),
	join(SERVER, 'routes'),
	join(SERVER, 'middleware'),
	join(SERVER, 'monitoring'),
	join(SERVER, 'services'),
	join(SERVER, 'db'),
];

const SKIP_DIRS = new Set(['node_modules', 'data', 'backups', 'uploads']);

function walk(dir, out = []) {
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (/\.(m?js)$/.test(entry.name)) out.push(full);
	}
	return out;
}

function resolveSpecifier(fromFile, spec) {
	if (!spec.startsWith('.')) return null;
	const target = resolve(dirname(fromFile), spec);
	for (const candidate of [
		target,
		`${target}.js`,
		`${target}.mjs`,
		join(target, 'index.js'),
		join(target, 'index.mjs'),
	]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	return null;
}

const SPECIFIER_RE = /(?:require\(|import\(\s*|from\s*|import\s*)["'](\.{1,2}\/[^"']+)["']/g;

function importsOf(file) {
	const text = readFileSync(file, 'utf8');
	const found = [];
	for (const match of text.matchAll(SPECIFIER_RE)) {
		const resolved = resolveSpecifier(file, match[1]);
		if (resolved) found.push(resolved);
	}
	return found;
}

/** Entry points: the files that exist to be run, not to be imported. */
function rootsOf(candidates) {
	const roots = new Set();

	for (const file of walk(join(SERVER, 'tests'))) roots.add(file);
	for (const file of walk(join(SERVER, 'scripts'))) roots.add(file);
	roots.add(join(SERVER, 'server.js'));
	roots.add(join(SERVER, 'entrypoint.js'));
	roots.add(join(REPO, 'worker-api.js'));
	roots.add(join(REPO, 'worker.js'));

	// Every path the package scripts launch (node db/migrate.js, node scripts/x).
	const pkg = JSON.parse(readFileSync(join(SERVER, 'package.json'), 'utf8'));
	for (const value of Object.values(pkg.scripts ?? {})) {
		for (const m of String(value).matchAll(/\b((?:db|scripts|lib|routes|middleware)\/[\w./-]+\.m?js)\b/g)) {
			const file = join(SERVER, m[1]);
			if (existsSync(file)) roots.add(file);
		}
	}

	return [...roots].filter((file) => candidates.includes(file) || existsSync(file));
}

describe('server dead-code gate', () => {
	const candidates = CANDIDATE_DIRS.flatMap((dir) => walk(dir));

	it('walks a real source set (non-vacuous)', () => {
		assert.ok(candidates.length >= 80, `expected >= 80 candidate modules, found ${candidates.length}`);
	});

	it('every candidate module is reachable from an entry point', () => {
		const roots = rootsOf(candidates);
		assert.ok(roots.length >= 20, `expected >= 20 roots, found ${roots.length}`);

		const seen = new Set();
		const queue = [...roots];
		while (queue.length) {
			const file = queue.pop();
			if (seen.has(file)) continue;
			seen.add(file);
			for (const next of importsOf(file)) if (!seen.has(next)) queue.push(next);
		}

		const unreachable = candidates
			.filter((file) => !seen.has(file))
			.map((file) => relative(REPO, file).replaceAll('\\', '/'));

		assert.deepStrictEqual(
			unreachable,
			[],
			'these server modules are not imported by any entry point — ' +
				'delete them, or wire them up on purpose:\n  ' +
				unreachable.join('\n  '),
		);
	});
});
