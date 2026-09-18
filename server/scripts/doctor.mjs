#!/usr/bin/env node
/**
 * DyPOS Doctor — preflight / readiness probe for operators (SRE best practice).
 * Checks runtime, version consistency, database (migrates + verifies),
 * disk space, production secrets, and integration-plane backlog.
 *
 * Run: npm run doctor [-- --json]
 * Exit: 0 = ready (warnings allowed, printed) · 1 = NOT ready (a fail).
 */
import { statfsSync, accessSync, constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const checks = [];
const check = (name, level, detail = '') => checks.push({ name, level, detail });

async function main() {
  // 1) Runtime
  const [major, minor] = String(process.versions.node).split('.').map(Number);
  const nodeOk = major > 22 || (major === 22 && minor >= 5);
  check('node >= 22.5 (node:sqlite)', nodeOk ? 'ok' : 'fail', process.versions.node);

  // 2) Version single source
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    const { VERSION } = await import(pathToFileURL(join(__dirname, '..', 'lib', 'version.js')).href);
    check('version single source (package.json = lib)', pkg.version === VERSION ? 'ok' : 'fail', `pkg=${pkg.version} lib=${VERSION}`);
  } catch (e) {
    check('version single source (package.json = lib)', 'fail', String(e.message).slice(0, 120));
  }

  // 3) Database: migrate + verify (idempotent; :memory: supported for CI drill)
  const DB_PATH = process.env.DYPOS_DB_PATH || join(__dirname, '..', 'data', 'dypos.db');
  try {
    if (DB_PATH !== ':memory:') accessSync(dirname(DB_PATH), constants.W_OK);
    const schema = await import(pathToFileURL(join(__dirname, '..', 'db', 'schema.js')).href);
    schema.migrate();
    const db = schema.default;
    const latest = Number(schema.MIGRATION_VERSION) || 0;
    const ver = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
    check('db migrated to latest', Number(ver?.version) >= latest && latest > 0 ? 'ok' : 'fail', `v${ver?.version} (latest v${latest}) @ ${DB_PATH === ':memory:' ? ':memory:' : DB_PATH}`);
    for (const t of ['dispatcher_lock', 'payment_methods', 'business_settings', 'fiscal_years', 'invoice_sequences']) {
      const hit = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
      check(`table ${t}`, hit ? 'ok' : 'fail', hit ? 'present' : 'MISSING');
    }
    const integ = db.prepare('PRAGMA integrity_check').get();
    const integOk = Object.values(integ || {})[0] === 'ok';
    check('sqlite integrity_check', integOk ? 'ok' : 'fail', integOk ? 'ok' : JSON.stringify(integ).slice(0, 120));
    // 4) Outbox backlog (integration plane pressure gauge)
    try {
      const dead = db.prepare("SELECT COUNT(*) AS c FROM webhook_outbox WHERE status IN ('DEAD','FAILED')").get();
      const n = Number(dead?.c) || 0;
      check('webhook outbox backlog', n === 0 ? 'ok' : 'warn', `${n} dead/failed jobs (retry via /admin → Outbox)`);
    } catch { check('webhook outbox backlog', 'warn', 'outbox unreadable'); }
  } catch (e) {
    check('database', 'fail', String(e.message).slice(0, 160));
  }

  // 5) Disk space on the data dir
  try {
    const dir = DB_PATH === ':memory:' ? join(__dirname, '..', 'data') : dirname(DB_PATH);
    const st = statfsSync(dir);
    const freeMb = Math.round((Number(st.bfree) * Number(st.bsize)) / 1048576);
    check('disk free on data dir', freeMb >= 500 ? 'ok' : 'warn', `${freeMb}MB`);
  } catch (e) {
    check('disk free on data dir', 'warn', String(e.message).slice(0, 120));
  }

  // 6) Production secrets posture
  const isProd = process.env.NODE_ENV === 'production';
  const jwt = String(process.env.DYPOS_JWT_SECRET || '');
  if (isProd) {
    check('JWT secret >= 32 chars (production)', jwt.length >= 32 ? 'ok' : 'fail', `len=${jwt.length}`);
    const cors = String(process.env.DYPOS_CORS_ORIGIN || '');
    check('CORS origin pinned (production)', cors && cors !== '*' ? 'ok' : 'fail', cors || 'unset (fail-closed default denies cross-origin)');
    check('single-process sqlite (no DYPOS_CLUSTER)', process.env.DYPOS_CLUSTER === '1' ? 'fail' : 'ok', process.env.DYPOS_CLUSTER ? `DYPOS_CLUSTER=${process.env.DYPOS_CLUSTER}` : 'unset');
  } else {
    check('JWT/CORS/cluster posture', 'ok', 'skipped outside production (NODE_ENV=' + (process.env.NODE_ENV || 'dev') + ')');
  }

  const fails = checks.filter((c) => c.level === 'fail').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  console.log(JSON.stringify({ ok: fails === 0, fails, warns, checks }, null, 2));
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.log(JSON.stringify({ ok: false, error: String(e.message).slice(0, 200) })); process.exit(1); });
