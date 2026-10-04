/**
 * Deployment environment contract.
 *
 * `server/docker-compose.yml` shipped four variable names the runtime never
 * reads — `PORT`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` — beside the
 * `DYPOS_*` ones it does. Nothing caught it: no module enumerates the variables
 * the server wants, so a compose file is exactly the kind of file a gate that
 * reads code cannot see. And the failure mode is the worst kind, because it
 * stays silent until production: `NODE_ENV=production` meets the envGuard in
 * `middleware/envGuard.js`, which exits(1) on a missing `DYPOS_JWT_SECRET`, a
 * missing storage target and a missing CORS origin. The container crash-loops
 * and the log names three symptoms of one cause.
 *
 * This gate makes the dependency explicit instead: the server's variable
 * vocabulary is the `process.env.X` reads across `server/`, and every variable
 * any compose file hands this server must come from it. Add the name to the
 * runtime and it becomes legal here in the same commit.
 *
 * The later assertions are the inverse and the sharper ones: the variables the
 * envGuard DEMANDS must actually be set by the production compose file, because
 * a legal-but-incomplete environment still boots into a crash-loop.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '..');
const REPO = resolve(SERVER, '..');

const SKIP_DIRS = new Set(['node_modules', 'data', 'backups', 'uploads', 'tests']);

/** Every runtime file: this is where the variable vocabulary actually lives. */
function runtimeFiles(dir = SERVER, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) runtimeFiles(full, out);
		else if (/\.(m?js)$/.test(entry.name)) out.push(full);
	}
	return out;
}

const KNOWN_HOST_VARS = new Set([
	'NODE_ENV',
	// Read by the container runtime / platform, not by application code.
	'PORT',
	'HOME',
	'PATH',
	'HOSTNAME',
	'PWD',
	'SHELL',
	'TERM',
	'USER',
	'npm_config_cache',
	'npm_package_name',
	'npm_package_version',
	'npm_lifecycle_event',
	'npm_lifecycle_script',
	'INIT_CWD',
	'SKIP_ENV_VALIDATION',
]);

/** process.env.X (dot or bracket form) across every runtime module. */
const envVocabulary = () => {
	const names = new Set();
	for (const file of runtimeFiles()) {
		const source = readFileSync(file, 'utf8');
		for (const m of source.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1]);
		for (const m of source.matchAll(/process\.env\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g)) names.add(m[1]);
	}
	return names;
};

/** The names a compose file hands the server: its `environment:` entries. */
function composeVariables(file) {
	const lines = readFileSync(file, 'utf8').split(/\r?\n/);
	const found = [];
	let inEnvironment = false;
	let environmentIndent = 0;
	for (const line of lines) {
		if (/^\s*environment:\s*$/.test(line)) {
			inEnvironment = true;
			environmentIndent = line.length - line.trimStart().length;
			continue;
		}
		if (!inEnvironment) continue;
		if (!line.trim()) continue;
		const indent = line.length - line.trimStart().length;
		if (indent <= environmentIndent) break; // dedented: the block ended
		const entry = line.trim().replace(/^-\s*/, '');
		const name = entry.split('=')[0].trim();
		// The mapping form (`VAR: value`) names the same variable.
		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) found.push({ name, file });
	}
	return found;
}

const COMPOSE_FILES = [join(SERVER, 'docker-compose.yml'), join(REPO, 'docker-compose.yml')].filter(
	(file) => existsSync(file) && statSync(file).isFile(),
);

describe('deployment environment contract', () => {
	it('every compose variable handed to the server is one the server reads', () => {
		const known = envVocabulary();
		const offenders = [];
		for (const file of COMPOSE_FILES) {
			for (const { name } of composeVariables(file)) {
				if (KNOWN_HOST_VARS.has(name) || known.has(name)) continue;
				offenders.push(`${file.slice(REPO.length + 1)} → ${name} (no process.env.${name} in server/)`);
			}
		}
		assert.deepEqual(offenders, [], `compose names the server never reads:\n${offenders.join('\n')}`);
	});

	it('the server vocabulary is non-empty (the gate above cannot be vacuous)', () => {
		const known = envVocabulary();
		assert.ok(
			known.has('DYPOS_JWT_SECRET') && known.has('DYPOS_DB_PATH') && known.has('DYPOS_CORS_ORIGIN'),
			`expected the core DYPOS_* vocabulary in the scan, got ${[...known].sort().join(', ')}`,
		);
		assert.ok(known.size >= 8, `only ${known.size} variables found — the scan is too narrow to be evidence`);
	});

	it('the production compose file satisfies everything the envGuard demands', () => {
		const compose = join(SERVER, 'docker-compose.yml');
		assert.ok(existsSync(compose), 'server/docker-compose.yml is the documented VPS deploy path');
		const passed = new Set(composeVariables(compose).map((v) => v.name));

		// The exact contract enforced at boot by middleware/envGuard.js.
		for (const required of ['DYPOS_JWT_SECRET', 'DYPOS_DB_PATH', 'DYPOS_CORS_ORIGIN']) {
			assert.ok(passed.has(required), `server/docker-compose.yml must set ${required} or production refuses to boot`);
		}
		assert.ok(!passed.has('JWT_SECRET'), 'JWT_SECRET is not a variable this server reads — it is a silent no-op');
	});

	it('no compose file ships a fallback value for the JWT secret', () => {
		// `${JWT_SECRET:-CHANGE_ME}` is the classic: the deploy succeeds, the
		// container boots on a public key, and the first login is where anyone
		// finds out. A missing secret must stop the deploy instead — which is
		// what `${VAR:?message}` does, and what the compose file uses.
		//
		// The two operators are distinct: `:-` supplies a DEFAULT when unset,
		// `:?` FAILS the deploy. Only the second is safe.
		const offenders = [];
		for (const file of COMPOSE_FILES) {
			for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
				if (!line.includes('DYPOS_JWT_SECRET')) continue;
				const substitutions = line.match(/\$\{[^}]*\}/g) || [];
				const weak = substitutions.find((s) => s.includes(':-') || /DYPOS_JWT_SECRET-/.test(s));
				if (weak) offenders.push(`${file.slice(REPO.length + 1)}: ${line.trim()}`);
			}
		}
		assert.deepEqual(offenders, [], `DYPOS_JWT_SECRET must have no fallback value:\n${offenders.join('\n')}`);
	});
});
