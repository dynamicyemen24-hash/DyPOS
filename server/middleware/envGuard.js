/**
 * DyPOS Environment Guard — fail-fast production boot validation.
 *
 * The server already refuses weak JWT secrets; this module broadens that to a
 * single, explicit boot-time contract so a misconfigured deployment fails LOUD
 * at startup with an actionable message instead of failing silently at scale:
 *   - DYPOS_JWT_SECRET present and >= 32 chars
 *   - a storage target (DYPOS_DB_PATH or DYPOS_DATABASE_URL) is set
 *   - DYPOS_CORS_ORIGIN is a real origin (wildcard '*' with credentials is a
 *     cross-site cookie exfiltration hole and is rejected outright)
 *   - NO environment variable (any key, not just DYPOS_*) holds a known leaked
 *     credential value (the repo's dev fallback secret or the test secret) — a
 *     stray secret in ANY var is an incident waiting to happen
 *
 * Import-safe: no server dependencies, nothing runs on import. Assertions run
 * only when `assertEnv()` or `registerEnvGuard(app)` is invoked. Fully inert in
 * tests (NODE_ENV=test returns { ok:true, checked:false }) so the suite is
 * unaffected.
 */
export const KNOWN_LEAKED_SECRETS = [
  'test-secret-for-testing-only-32-chars-minimum',
  'dypos-dev-secret-change-in-production',
];

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Validate required production configuration. Never throws — returns a report.
 * @param {{ failFast?: boolean }} [options]
 * @returns {{ ok: boolean, checked: boolean, mode: string, problems: string[] }}
 */
export function checkEnv(options = {}) {
  if (process.env.NODE_ENV === 'test') {
    return { ok: true, checked: false, mode: 'test', problems: [] };
  }
  const problems = [];

  const jwt = process.env.DYPOS_JWT_SECRET || '';
  if (!jwt) {
    problems.push('DYPOS_JWT_SECRET is missing — authentication is compromised without it.');
  } else if (jwt.length < 32) {
    problems.push(`DYPOS_JWT_SECRET is only ${jwt.length} chars — must be >= 32 (e.g. openssl rand -hex 32).`);
  }

  if (!process.env.DYPOS_DB_PATH && !process.env.DYPOS_DATABASE_URL) {
    problems.push('Neither DYPOS_DB_PATH nor DYPOS_DATABASE_URL is set — no storage target configured.');
  }

  const cors = String(process.env.DYPOS_CORS_ORIGIN || '').trim();
  if (!cors) {
    problems.push('DYPOS_CORS_ORIGIN is missing — browsers will block every cross-origin request.');
  } else if (cors.split(',').map((s) => s.trim()).includes('*')) {
    problems.push('DYPOS_CORS_ORIGIN contains "*" — wildcard CORS with credentials is a cross-site exfiltration hole.');
  }

  const leakedKeys = Object.entries(process.env)
    .filter(([, value]) => KNOWN_LEAKED_SECRETS.includes(String(value)))
    .map(([key, value]) => `${key}="${value}"`);
  for (const found of leakedKeys) {
    problems.push(`Environment variable ${found} holds a known leaked credential — rotate it now.`);
  }

  const ok = problems.length === 0;
  const mode = isProduction() ? 'production' : 'development';
  const failFast = options.failFast !== false && isProduction();
  if (!ok && failFast) {
    for (const p of problems) console.error(`[DyPOS SECURITY] ${p}`);
    console.error('[DyPOS FATAL] Environment guard failed — refusing to boot.');
    process.exit(1);
  }
  return { ok, checked: true, mode, problems };
}

/**
 * Assert the environment now. In production this exits(1) on failure; in
 * dev/test it returns the report so callers can surface problems gracefully.
 */
export function assertEnv(options = {}) {
  return checkEnv(options);
}

/**
 * Boot-time registration hook for the orchestrator. Returns the app untouched
 * so it composes: `registerEnvGuard(app)` -> app. Registered middleware runs
 * the guard at boot (fail fast, production only).
 */
export function registerEnvGuard(app, options = {}) {
  assertEnv(options);
  return app;
}

export default { checkEnv, assertEnv, registerEnvGuard, KNOWN_LEAKED_SECRETS };