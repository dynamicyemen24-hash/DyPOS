/**
 * Cross-platform test runner for the server suite.
 *
 * Why this exists: the old command passed a recursive glob (`tests/` + `**` +
 * `*.test.js`) straight to `node --test`, which does not expand it. So the
 * suite silently ran ZERO tests — including in CI, where the "API regression
 * tests" step had been green without executing a single assertion. Quoting
 * makes it worse (the shell hands the literal pattern to node); unquoting works
 * on POSIX shells only and breaks on Windows, where cmd.exe does not expand
 * globs.
 *
 * So: enumerate the files ourselves, pass them explicitly, and FAIL LOUDLY when
 * the enumeration comes up empty. A gate that cannot report "nothing ran" is
 * the only kind worth having.
 *
 * Usage: node scripts/run-tests.mjs [--reporter dot|spec|tap] [--watch] [file …]
 */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TESTS_DIR = resolve(import.meta.dirname, '..', 'tests');
const SETUP = './tests/setup.js';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = argv.indexOf(name);
	return i === -1 ? fallback : argv[i + 1];
};
const reporter = flag('--reporter', 'spec');
const watch = argv.includes('--watch');
const consumed = new Set(['--reporter', reporter, '--watch']);
const explicit = argv.filter((a) => !consumed.has(a) && !a.startsWith('--'));

const files = explicit.length
	? explicit.map((f) => resolve(process.cwd(), f))
	: readdirSync(TESTS_DIR)
			.filter((f) => f.endsWith('.test.js'))
			.sort()
			.map((f) => join(TESTS_DIR, f));

if (files.length === 0) {
	console.error('[DyPOS] no test files found — refusing to report a green run.');
	process.exit(1);
}

const args = ['--import', SETUP, ...(watch ? ['--watch'] : []), '--test', `--test-reporter=${reporter}`, ...files];
const child = spawn(process.execPath, args, {
	stdio: 'inherit',
	cwd: resolve(import.meta.dirname, '..'),
});
child.on('exit', (code, signal) => {
	if (signal) {
		console.error(`[DyPOS] test run killed by ${signal}`);
		process.exit(1);
	}
	process.exit(code ?? 1);
});
