/**
 * Environment loading — must be the FIRST import in the process.
 *
 * ## Why this module exists at all
 *
 * `server.js` used to call `dotenv.config()` on line 21, directly under a
 * comment reading "Load environment variables FIRST", and then import
 * `middleware/auth.js` on line 25. That comment was false, and it cost a real
 * security property:
 *
 * ESM evaluates (and runs) EVERY import before ANY statement in the importing
 * module. So `middleware/auth.js` — and every router it pulls in — was fully
 * evaluated BEFORE `dotenv.config()` ever ran. `middleware/auth.js` captures
 * `process.env.NODE_ENV` and `process.env.DYPOS_JWT_SECRET` at module scope:
 *
 *     export const isProduction = process.env.NODE_ENV === 'production';
 *     const JWT_SECRET = process.env.DYPOS_JWT_SECRET || 'dypos-dev-secret-...';
 *
 * Measured, not assumed (`node -e "import './middleware/auth.js'"` from a
 * directory holding a valid `.env`): both read as `undefined`, so `JWT_SECRET`
 * silently became the hardcoded fallback. Under Docker the secret is usually
 * passed as a real env var and the hole is invisible; started from `.env` alone,
 * the API signed tokens with a secret that is published in the repository.
 *
 * ## The fix
 *
 * `env.js` runs `dotenv.config()` inside a module, and because it is imported
 * first, the evaluation order guarantees it completes before any consumer is
 * evaluated. Static-import order is the dependency graph, so "first" is
 * enforceable — which a comment was not.
 *
 * `doesNotOverride` is deliberate: a real environment variable (a container
 * secret, a CI injection) always wins over the file. dotenv's default behaviour
 * already does this; it is stated here because the ordering fix must not
 * become a way to make a file shadow the environment.
 */
import dotenv from 'dotenv';

// `override: false` — a real environment variable (a container secret, a CI
// injection) always wins over the file. dotenv's default already does this; it
// is stated here because the ordering fix must not become a way to let a file
// shadow the environment.
const result = dotenv.config({ override: false });

/** True when a `.env` file was found and read, as opposed to a bare process. */
export const envFileLoaded = Boolean(result.parsed);

export default { envFileLoaded };
