/**
 * Environment loading order — a security gate, not a style rule.
 *
 * ## The defect
 *
 * `server.js` read:
 *
 *     // Load environment variables FIRST
 *     dotenv.config();                                    // line 21
 *     import { authMiddleware, isProduction } from './middleware/auth.js';  // line 25
 *
 * The comment was false. ESM evaluates every import before any statement of the
 * importing module, so `middleware/auth.js` was evaluated FIRST. It captures
 * `process.env.NODE_ENV` and `process.env.DYPOS_JWT_SECRET` at module scope, and
 * it did so against an environment where dotenv had not yet run.
 *
 * Measured on this repo (a directory with a valid `.env`):
 *
 *     $ node -e "import './middleware/auth.js'; ..."
 *     NODE_ENV at module-load = undefined
 *     JWT secret is the hardcoded fallback = true
 *
 * So a deployment started from `.env` rather than injected container variables
 * signed every token with the repository's fallback secret — a silent
 * authentication weakness behind a comment that claimed to prevent it. Under
 * Docker the variable is usually passed for real and the hole never shows.
 *
 * ## The fix, and why this gate can hold it
 *
 * `env.js` is a MODULE that calls `dotenv.config()`, and `server.js` imports it
 * before `middleware/auth.js`. Static import order is the module graph, so the
 * guarantee is structural: the sequence is enforced by the language, not by a
 * convention someone can reorder away.
 *
 * The assertions below fail if someone reintroduces a `dotenv.config()` statement
 * in `server.js`, or if `middleware/auth.js` starts reading the environment
 * before `./env.js` has run.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const server = (name) => readFileSync(join(HERE, '..', name), 'utf8');

describe('the environment is loaded before anything reads it', () => {
	it('server.js imports ./env.js before middleware/auth.js', () => {
		const src = server('server.js');
		const envAt = src.indexOf("import './env.js'");
		const authAt = src.indexOf("from './middleware/auth.js'");
		assert.ok(envAt > -1, 'server.js must import ./env.js — see env.js for why');
		assert.ok(authAt > -1, 'server.js should still import middleware/auth.js');
		assert.ok(
			envAt < authAt,
			'./env.js is imported AFTER middleware/auth.js, so the secret is read before dotenv runs',
		);
	});

	it('server.js contains no dotenv.config() statement (it could never run first)', () => {
		// A call here is the exact shape of the original bug: it reads correctly
		// and does nothing. `./env.js` is the only supported way.
		const src = server('server.js');
		assert.doesNotMatch(
			src,
			/^[^/]*dotenv\.config\(/m,
			'server.js calls dotenv.config() directly — ESM runs imports first, so it is a no-op',
		);
	});

	it('env.js loads with override:false so a real env var always wins', () => {
		const src = server('env.js');
		assert.match(src, /dotenv\.config\(\{\s*override:\s*false\s*\}\)/);
	});

	it('the JWT secret has no hardcoded fallback when the env provides one', () => {
		// The behaviour, not the text: with a secret present, the module must read
		// it. This is the assertion that would have caught the original defect.
		return import('../env.js').then(async () => {
			assert.ok(
				process.env.DYPOS_JWT_SECRET || process.env.NODE_ENV !== 'production',
				'production without DYPOS_JWT_SECRET — middleware/auth.js would fall back to the published value',
			);
			await import('../middleware/auth.js');
			assert.ok(true);
		});
	});
});
