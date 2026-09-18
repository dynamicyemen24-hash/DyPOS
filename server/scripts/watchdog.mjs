#!/usr/bin/env node
/**
 * DyPOS Backend Watchdog — self-healing supervisor (no external deps).
 *
 * Why: a dead backend means silent POS outage (sale → 500, sync stalls).
 * This supervisor owns exactly ONE child (`node entrypoint.js`) and:
 *  - probes GET /api/ready every interval (default 10s, 5s timeout)
 *  - restarts the child after N consecutive failures (default 3) with
 *    exponential backoff (1s → 60s cap), reset after 5 healthy minutes
 *  - restarts immediately if the child process itself exits/crashes
 *  - NEVER kills processes it did not spawn (safe alongside tests/dev)
 *  - if the port is already busy at boot, it monitors the existing
 *    instance (attached mode) and only spawns after that instance dies
 *
 * Run: `node scripts/watchdog.mjs` (keep it alive via Task Scheduler,
 * NSSM, pm2, or docker --restart; it logs JSON lines to data/watchdog.log).
 */
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(HERE, '..');
const LOG = join(SERVER_DIR, 'data', 'watchdog.log');

const URL = process.env.DYPOS_WATCH_URL || 'http://127.0.0.1:3001/api/ready';
const INTERVAL = Math.max(2000, Number(process.env.DYPOS_WATCH_INTERVAL_MS) || 10000);
const MAX_FAILS = Math.max(1, Number(process.env.DYPOS_WATCH_FAILS) || 3);
const PROBE_TIMEOUT = 5000;
const HEALTHY_RESET_MS = 5 * 60 * 1000;
const BACKOFF_CAP = 60000;

let child = null;
let fails = 0;
let backoff = 1000;
let lastHealthy = Date.now();
let intentionalStop = false;
let attachedLogged = false;

function log(event, detail = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), service: 'dypos-watchdog', event, ...detail });
  try { console.log(line); } catch { /* ignore */ }
  try { appendFileSync(LOG, line + '\n'); } catch { /* data dir may not exist yet */ }
}

async function probe() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
  try {
    const r = await fetch(URL, { signal: ctrl.signal });
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    return j && j.ready === true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function spawnChild() {
  log('spawn', { cmd: 'node entrypoint.js' });
  const c = spawn(process.execPath, ['entrypoint.js'], {
    cwd: SERVER_DIR,
    stdio: 'ignore',
    detached: false,
    windowsHide: true,
  });
  child = c;
  c.on('exit', (code, signal) => {
    if (child !== c) return; // superseded
    child = null;
    if (intentionalStop) return;
    log('child-exit', { code, signal });
    fails = MAX_FAILS; // recover on next tick without waiting out the streak
  });
  c.on('error', (e) => {
    if (child !== c) return;
    child = null;
    log('child-error', { message: String(e.message).slice(0, 200) });
    fails = MAX_FAILS;
  });
}

function stopChild() {
  if (child) {
    try { child.kill(); } catch { /* already dead */ }
    child = null;
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tick() {
  const ok = await probe();
  if (ok) {
    fails = 0;
    lastHealthy = Date.now();
    backoff = 1000;
    if (!child && !attachedLogged) {
      attachedLogged = true;
      log('attached', { url: URL, note: 'port busy at boot — supervising existing instance' });
    }
    return;
  }
  fails += 1;
  log('probe-fail', { fails, need: MAX_FAILS });
  if (Date.now() - lastHealthy > HEALTHY_RESET_MS) backoff = 1000;
  if (fails < MAX_FAILS) return;
  // Recover: replace (only our own child) with backoff. Re-probe after
  // the wait — another instance may have taken the port meanwhile.
  log('recover', { backoffMs: backoff });
  stopChild();
  await sleep(backoff);
  backoff = Math.min(backoff * 2, BACKOFF_CAP);
  fails = 0;
  if (await probe()) {
    lastHealthy = Date.now();
    log('attached', { url: URL, note: 'instance appeared during backoff — monitoring' });
    return;
  }
  spawnChild();
}

function shutdown(signal) {
  intentionalStop = true;
  log('shutdown', { signal });
  stopChild();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

log('start', { url: URL, intervalMs: INTERVAL, maxFails: MAX_FAILS });
// Probe BEFORE first spawn: if a healthy instance already owns the port
// (normal restart case), attach as monitor instead of crash-looping a
// second entrypoint against EADDRINUSE.
if (await probe()) {
  attachedLogged = true;
  lastHealthy = Date.now();
  log('attached', { url: URL, note: 'healthy instance already owns the port' });
} else {
  spawnChild();
}
// eslint-disable-next-line no-constant-condition
while (true) {
  await sleep(INTERVAL);
  await tick();
}
