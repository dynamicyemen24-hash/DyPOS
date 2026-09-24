/**
 * DyPOS Server — Standalone REST API v1.33.0
 * Production-hardened for millions of subscribers:
 * dotenv, JWT validation, CSP, CORS lock-down, request-id tracing,
 * structured logging, graceful shutdown, deep health check, auth rate limit,
 * cardinality-safe metrics, optional multi-core clustering.
 * Single source of truth: server/lib/version.js
 */
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import cluster from 'node:cluster';
import os from 'node:os';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

// Load environment variables FIRST
dotenv.config();

import { migrate, db, checkDbHealth, } from './db/schema.js';
import { assertDbModeSupported, describeDbMode } from './db/mode.js';
import { authMiddleware, isProduction } from './middleware/auth.js';
import requirePrimary from './middleware/requirePrimary.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import customerRoutes from './routes/customers.js';
import invoiceRoutes from './routes/invoices.js';
import shiftRoutes from './routes/shifts.js';
import stockRoutes from './routes/stock.js';
import syncRoutes from './routes/sync.js';
import exportRoutes from './routes/export.js';
import importRoutes from './routes/import.js';
import webhookRoutes from './routes/webhooks.js';
import printRoutes from './routes/print.js';
import offersRoutes from './routes/offers.js';
import tenantsRoutes from './routes/tenants.js';
import mastersRoutes from './routes/masters.js';
import settingsRoutes from './routes/settings.js';
import fiscalRoutes from './routes/fiscal.js';
import marketingRoutes from './routes/marketing.js';
import growthRoutes from './routes/growth.js';
import printConfigsRoutes from './routes/printConfigs.js';
import hardwareRoutes from './routes/hardware.js';
import advancedRoutes from './routes/advanced.js';
import integrationsRoutes from './routes/integrations.js';
import updatesRoutes from './routes/updates.js';
import expensesRoutes from './routes/expenses.js';
import { resolveTechnicalDebtAndOptimize } from './lib/productionRelease.js';

import reportsRoutes from './routes/reports.js';
import subscriptionsRoutes from './routes/subscriptions.js';
import openapiRoutes from './routes/openapi.js';
import deviceRoutes from './routes/device.js';
import devicesRoutes from './routes/devices.js';
import methodRoutes from './routes/method.js';
import { metricsMiddleware, metricsHandler } from './middleware/metrics.js';
import { auditMiddleware } from './middleware/audit.js';
import { startDispatcher } from './lib/webhooks.js';
import { cacheStats } from './lib/cache.js';
import { ah, isSqliteLockError } from './lib/async.js';
import { createRateStore } from './lib/rate-store.js';
import { VERSION } from './lib/version.js';
import { logger } from './lib/logger.js';
import { registerSecurityHeaders } from './middleware/securityHeaders.js';
import { registerEnvGuard } from './middleware/envGuard.js';
import { registerSseRoutes } from './lib/realtime.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerFeatures } from './routes/features.js';
import { registerErrorTracker } from './lib/errorTracker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DYPOS_PORT) || 3001;
const HOST = process.env.DYPOS_HOST || '0.0.0.0';

// ── Optional clustering: DYPOS_CLUSTER=1 uses all CPUs (throughput × cores) ──
// NOTE: kept outside the request path so `export` stays top-level (ESM requirement).
// Primary only forks; workers (and single-mode) continue to boot the app below.
const IS_CLUSTER_PRIMARY =
  process.env.DYPOS_CLUSTER === '1' && cluster.isPrimary && !process.argv.some((a) => a.includes('test'));
if (IS_CLUSTER_PRIMARY) {
  // C2 fail-fast: DYPOS_CLUSTER=1 (multi-process fork) with SQLite origin is a
  // single-writer store — forking N workers provides ZERO write scale-out and
  // spawns N independent dispatchers/timers (duplicate webhooks) plus N
  // independent WAL processes writing the same file. Refuse to boot rather
  // than silently degrade. Cluster scale-out requires PostgreSQL (Tier-2 /
  // DYPOS_DATABASE_URL=postgres://...). For SQLite, single process is the
  // correct deployment (the dispatcher lock in webhooks.js still singleton-gates
  // the outbox so a single writer is never double-delivered).
  if (describeDbMode().mode === 'sqlite') {
    console.error(
      '[DyPOS FATAL] DYPOS_CLUSTER=1 is only supported with PostgreSQL (Tier-2).\n' +
      '  SQLite is single-writer: clustering forks N workers onto one file → zero write\n' +
      '  scale-out, N duplicate webhook dispatchers, N WAL processes on one file.\n' +
      '  Fix: unset DYPOS_CLUSTER (SQLite single-process = correct Tier-1 deployment)\n' +
      '       OR switch to PostgreSQL (DYPOS_DATABASE_URL=postgres://...) then set DYPOS_CLUSTER=1.'
    );
    process.exit(1);
  }
  const cpus = Math.max(1, Math.min(os.cpus().length, Number(process.env.DYPOS_WORKERS) || os.cpus().length));
  console.log(`[DyPOS] Cluster mode: forking ${cpus} workers`);
  for (let i = 0; i < cpus; i++) cluster.fork();
  cluster.on('exit', (worker, code) => {
    console.error(`[DyPOS] Worker ${worker.process.pid} exited (${code}). Restarting...`);
    cluster.fork();
  });
  process.exit(0);
}

// Validate critical config in production
if (isProduction) {
  if (!process.env.DYPOS_JWT_SECRET || process.env.DYPOS_JWT_SECRET.length < 32) {
    console.error('[DyPOS FATAL] DYPOS_JWT_SECRET is missing or shorter than 32 characters.');
    process.exit(1);
  }
  if (!process.env.DYPOS_CORS_ORIGIN || process.env.DYPOS_CORS_ORIGIN === '*') {
    console.warn('[DyPOS WARN] DYPOS_CORS_ORIGIN not set — CORS blocks all cross-origin requests in production.');
    console.warn('  Fix: set DYPOS_CORS_ORIGIN=https://your-domain.com (comma-separated for multiple origins).');
  }
  console.log('[DyPOS] Running in PRODUCTION mode');
} else {
  console.log('[DyPOS] Running in DEVELOPMENT mode');
}

// Fail-fast env contract (production only; inert in tests/dev): required
// secrets, storage target, non-wildcard CORS, and no leaked credentials.
registerEnvGuard();

assertDbModeSupported();
console.log('[DyPOS] DB mode:', JSON.stringify(describeDbMode()));

mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
migrate();
resolveTechnicalDebtAndOptimize();

// Production startup guards — loud, actionable, never silent (SRE best practice)
if (isProduction) {
  try {
    const users = db.prepare('SELECT COUNT(*) AS c FROM users').get()?.c || 0;
    if (users === 0) {
      console.error('[DyPOS FATAL] Production database has ZERO users: first-come ADMIN bootstrap is OPEN. Create the admin account immediately and restrict network access until then.');
    }
  } catch { /* users table check is best-effort */ }
  if (!process.env.DYPOS_METRICS_TOKEN) {
    console.warn('[DyPOS WARN] DYPOS_METRICS_TOKEN unset — /api/metrics is publicly scrapable. Set a token to restrict access.');
  }
  if (!process.env.DYPOS_BACKUP_S3 && !process.env.DYPOS_BACKUP_DIR) {
    console.warn('[DyPOS WARN] No backup target configured — set DYPOS_BACKUP_S3 or DYPOS_BACKUP_DIR to enable automated backups.');
  }
  const stockGuard = String(process.env.DYPOS_STOCK_GUARD || 'legacy').trim().toLowerCase();
  if (stockGuard !== 'strict') {
    console.warn('[DyPOS WARN] DYPOS_STOCK_GUARD is not "strict" — legacy mode allows overselling untracked items. Recommended: DYPOS_STOCK_GUARD=strict');
  }
}

// Request-ID + structured request logger (skips health probes to save I/O)
// + X-Response-Time for LB observability at millions-of-requests scale.
function requestLogger(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    try { res.setHeader('X-Response-Time', `${duration}ms`); } catch { /* headers sent */ }
    if (req.path === '/api/health' || req.path === '/api/ready') return;
    const logFields = {
      req_id: req.id, method: req.method, url: req.url, status: res.statusCode,
      duration_ms: duration, ip: req.ip,
      user: req.user?.username,
      cache: res.getHeader?.('X-Cache') || undefined,
    };
    // Structured via pino (JSON in prod, levels preserved) — same fields as before.
    if (res.statusCode >= 500) logger.error(logFields, 'request');
    else if (res.statusCode >= 400) logger.warn(logFields, 'request');
    else logger.info(logFields, 'request');
  });
  next();
}

const app = express();
app.disable('x-powered-by');
// Behind nginx/LB: needed for correct req.ip → correct per-IP rate limiting
app.set('trust proxy', Number(process.env.DYPOS_TRUST_PROXY) || 1);

// Security headers (CSP hardened)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'"], // TODO: replace with nonce/hash when Vue build supports it
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https:", "wss:"],
      mediaSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  xssFilter: true,
  noSniff: true,
  hidePoweredBy: true,
}));

// CORS — never wildcard with credentials
const corsOrigin = process.env.DYPOS_CORS_ORIGIN
  ? process.env.DYPOS_CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : (isProduction ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8080']);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigin.includes(origin)) return callback(null, true);
    console.warn(`[DyPOS] CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  maxAge: 86400,
}));

// Campaign hardening: CSP/HSTS/nosniff/Permissions-Policy/COOP + no-store API.
registerSecurityHeaders(app);

// Realtime SSE hub — MUST mount BEFORE compression: gzip would buffer SSE
// frames and break live delivery. JWT-authed per-tenant stream with heartbeat
// + Last-Event-ID replay.
registerSseRoutes(app);

app.use(compression({ threshold: 1024 }));
app.use(requestLogger);
app.use(metricsMiddleware);
app.use(auditMiddleware);

// Global rate limit — shared store (memory, or Redis when DYPOS_REDIS_URL set).
// Tunable for load campaigns: DYPOS_RATE_LIMIT_MAX (default 2000 prod / 1000 dev).
// Bulk import batches are exempt (already capped at 2000 rows + ADMIN/MANAGER gate).
const GLOBAL_WINDOW_MS = 15 * 60 * 1000;
app.use(rateLimit({
  windowMs: GLOBAL_WINDOW_MS, max: Number(process.env.DYPOS_RATE_LIMIT_MAX) || (isProduction ? 2000 : 1000),
  standardHeaders: true, legacyHeaders: false,
  store: createRateStore(GLOBAL_WINDOW_MS, 'global'),
  skip: (req) => req.path === '/api/health' || req.path === '/api/ready' || req.path.startsWith('/api/import'),
  message: { error: 'Too many requests. Please try again later.' },
}));

// Tight body limits: 2MB (raised from 1MB) to support large invoices with 500+ lines,
// each carrying pricing_rules, batch/serial data, and free item rows.
// Still blocks DoS via huge payloads; invoices validated by zod, max 500 lines.
app.use(express.json({ limit: process.env.DYPOS_BODY_LIMIT || '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
// CSV imports (text/csv) — parsed by routes/import.js, row-capped there
app.use(express.text({ limit: process.env.DYPOS_CSV_LIMIT || '2mb', type: 'text/csv' }));
// JSON parse errors → clean 400 (not 500)
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'الحمولة كبيرة جدًا' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'JSON غير صالح' });
  next(err);
});
// Extra: sanitize JSON keys length to prevent DoS via huge keys
// (bulk import batches are exempt — routes/import.js enforces its own row cap)
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/import')) return next();
  if (req.body && typeof req.body === 'object') {
    const keys = Object.keys(req.body);
    if (keys.length > 100) return next(Object.assign(new Error('Too many keys'), { statusCode: 400 }));
    for (const k of keys) if (k.length > 128) return next(Object.assign(new Error('Key too long'), { statusCode: 400 }));
  }
  next();
});

// Deep health check + readiness (DB + cache + outbox + memory — SRE standard)
app.get('/api/health', ah(async (_req, res) => {
  const dbHealth = await checkDbHealth();
  let outbox = null;
  try {
    const row = db.prepare(`SELECT COUNT(*) as pending, SUM(CASE WHEN status='DEAD' THEN 1 ELSE 0 END) as dead FROM webhook_outbox WHERE status IN ('PENDING','DEAD')`).get();
    outbox = { pending: Number(row?.pending) || 0, dead: Number(row?.dead) || 0 };
    try {
      const { outboxPending, outboxDead } = await import('./middleware/metrics.js');
      outboxPending.set(outbox.pending);
      outboxDead.set(outbox.dead);
    } catch { /* gauges best-effort */ }
  } catch { outbox = { error: 'unavailable' }; }
  const mem = process.memoryUsage();
  let disk = null;
  try {
    const { statfsSync } = await import('node:fs');
    const dataDir = process.env.DYPOS_DB_PATH && process.env.DYPOS_DB_PATH !== ':memory:'
      ? dirname(process.env.DYPOS_DB_PATH)
      : join(__dirname, 'data');
    const st = statfsSync(dataDir);
    if (st && typeof st.bfree === 'number') {
      disk = { free_mb: Math.round((Number(st.bfree) * Number(st.bsize)) / 1048576) };
    }
  } catch { disk = { error: 'unavailable' }; }
  const lowThreshold = Math.max(Number(process.env.DYPOS_LOW_STOCK_THRESHOLD) || 5, 0);
  let stock = null;
  try {
    const row = db.prepare('SELECT COUNT(*) as low FROM stock_levels WHERE qty<=?').get(lowThreshold);
    stock = { low_count: Number(row?.low) || 0, threshold: lowThreshold };
    try {
      const { stockLow } = await import('./middleware/metrics.js');
      stockLow.set(stock.low_count);
    } catch { /* gauges best-effort */ }
  } catch { stock = { error: 'unavailable' }; }
  const status = dbHealth.healthy ? 'ok' : 'degraded';
  return res.status(dbHealth.healthy ? 200 : 503).json({
    status, version: VERSION, uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(), database: dbHealth,
    cache: cacheStats(),
    outbox,
    stock,
    disk,
    memory: { rss_mb: Math.round(mem.rss / 1048576), heap_mb: Math.round(mem.heapUsed / 1048576) },
    node_version: process.version, env: isProduction ? 'production' : 'development',
  });
}));
// Fleet version visibility: every API response carries the running build
// so any terminal can detect drift without a separate version call.
app.use('/api', (_req, res, next) => {
  try {
    res.setHeader('X-DyPOS-Version', VERSION);
  } catch { /* headers best-effort */ }
  next();
});
// Public contract (no auth — describes auth itself)
app.use('/api', openapiRoutes);
// Device intelligence (no auth — the login shell adapts before sign-in)
app.use('/api/device', deviceRoutes);
// Prometheus metrics — gate with token when configured (prevents public scraping)
app.get('/api/metrics', ah(async (req, res, next) => {
  const token = process.env.DYPOS_METRICS_TOKEN;
  if (token && req.query.token !== token && req.headers['x-metrics-token'] !== token) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return metricsHandler(req, res, next);
}));
app.get('/api/ready', ah(async (_req, res) => {
  const h = await checkDbHealth();
  if (!h.healthy) return res.status(503).json({ ready: false, reason: h.error });
  return res.json({ ready: true, version: VERSION });
}));

// Feature flags — public GET must stay reachable BEFORE the shared auth
// middleware blocks; admin PUT is internally gated (requireRole ADMIN).
registerFeatures(app);

// Auth routes with stricter rate limit (brute-force protection, shared store)
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const authRateLimit = rateLimit({
  windowMs: AUTH_WINDOW_MS, max: Number(process.env.DYPOS_AUTH_LIMIT_MAX) || 30,
  standardHeaders: true, legacyHeaders: false,
  store: createRateStore(AUTH_WINDOW_MS, 'auth'),
  message: { error: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true,
});
app.use('/api/auth', authRateLimit, authRoutes);

// Write guard: read-only replicas reject mutations with 409 (retry @ primary)
app.use(requirePrimary);

// Protected routes
// Frappe-compat dual GET/POST method router (localization, auth, client, items, …)
app.use('/api/method', methodRoutes);

app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/products', authMiddleware, productRoutes);
app.use('/api/customers', authMiddleware, customerRoutes);
app.use('/api/invoices', authMiddleware, invoiceRoutes);
app.use('/api/shifts', authMiddleware, shiftRoutes);
app.use('/api/stock', authMiddleware, stockRoutes);
app.use('/api/sync', authMiddleware, syncRoutes);
app.use('/api/export', authMiddleware, exportRoutes);
app.use('/api/import', authMiddleware, importRoutes);
app.use('/api/webhooks', authMiddleware, webhookRoutes);
app.use('/api/print', authMiddleware, printRoutes);
app.use('/api/offers', authMiddleware, offersRoutes);
app.use('/api', authMiddleware, tenantsRoutes);
app.use('/api', authMiddleware, mastersRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/fiscal-years', authMiddleware, fiscalRoutes);
app.use('/api/reports', authMiddleware, reportsRoutes);
app.use('/api/devices', authMiddleware, devicesRoutes);
app.use('/api/subscriptions', authMiddleware, subscriptionsRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/growth', growthRoutes);
app.use('/api/print-configs', printConfigsRoutes);
app.use('/api/hardware', hardwareRoutes);
app.use('/api/advanced', advancedRoutes);
app.use('/api/integrations', authMiddleware, integrationsRoutes);
app.use('/api/updates', updatesRoutes);
app.use('/api/expenses', expensesRoutes);

// Tamper-evident audit ledger (ADMIN-gated read/verify + annotation).
registerAuditRoutes(app);

// Webhook dispatcher (outbox → subscriber systems). No-op in tests / when DYPOS_WEBHOOKS=0.
startDispatcher();

// API 404 (before SPA fallback — avoids returning HTML for unknown API routes)
app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود', path: req.path }));

// Ops console (static single file, no build step). The HTML itself is public
// like a login page; every data call it makes is JWT-authed server-side.
// no-store: operators always get the current console, never a cached copy.
app.get('/admin', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(join(__dirname, 'public', 'admin.html'));
});

// Serve POS frontend (SPA) — Vite builds to DyPOS/public/pos
const posDist = resolve(process.env.DYPOS_FRONTEND_DIST || join(__dirname, '..', 'DyPOS', 'public', 'pos'));
// Frappe-style file uploads (upload_file method) → /uploads/*
const uploadsDir = join(__dirname, 'uploads');
if (existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir, { maxAge: '1y', etag: true, index: false }));
}
if (existsSync(posDist)) {
  app.use(express.static(posDist, { maxAge: '1y', etag: true, index: false }));
  // Express 4+5 compatible SPA fallback (no '*' pattern)
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    if (req.path.includes('.')) return next();
    res.sendFile(join(posDist, 'index.html'));
  });
} else if (!isProduction) {
  console.warn(`[DyPOS] Frontend dist not found at ${posDist}. Run "cd POS && yarn build" first.`);
}

// Error tracking (log + optional webhook) — registered BEFORE the final
// handler so every 5xx is captured without changing the response contract.
registerErrorTracker(app);

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error({
    req_id: req.id, method: req.method, url: req.url, error: err.message,
    stack: isProduction ? undefined : err.stack,
  }, 'unhandled error');
  if (res.headersSent) return next(err);
  const statusCode = isSqliteLockError(err)
    ? 503
    : (err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500);
  const message = statusCode < 500 ? String(err.message || 'Bad Request').slice(0, 300)
    : (isProduction ? 'Internal Server Error' : String(err.message || 'Internal Error'));
  if (statusCode === 503) res.set('Retry-After', '2');
  return res.status(statusCode).json({ error: message, req_id: req.id });
});

export { app, requestLogger };

let _server = null;

/**
 * Start listening. Exported so entrypoint.js (migrate → boot) can start the
 * server explicitly. The old isMainModule heuristic fails when server.js is
 * imported (argv[1] is entrypoint.js), which left production Docker
 * containers migrated but deaf — no listener, failing healthchecks.
 */
export function start() {
  if (_server) return _server;
  if (IS_CLUSTER_PRIMARY) return null; // primary only supervises workers
  _server = app.listen(PORT, HOST, () => {
    console.log(`[DyPOS] Server v${VERSION} running on http://${HOST}:${PORT} (worker ${process.pid})`);
    console.log(`[DyPOS] Health: http://${HOST}:${PORT}/api/health`);
    console.log(`[DyPOS] Auth: http://${HOST}:${PORT}/api/auth/login`);
  });
  // Production timeouts: kill slow-loris + runaway handlers
  _server.timeout = Number(process.env.DYPOS_SERVER_TIMEOUT) || 30000;
  _server.keepAliveTimeout = 65000;
  _server.headersTimeout = 66000;

  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    console.log(`[DyPOS] Received ${signal}. Shutting down gracefully...`);
    _server.close(() => {
      console.log('[DyPOS] Server closed. Closing database connection...');
      try { db.close(); console.log('[DyPOS] Database connection closed.'); }
      catch (e) { console.error('[DyPOS] Error closing database:', e.message); }
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[DyPOS] Could not close connections in time, force shutting down');
      process.exit(1);
    }, 15000).unref();
  };
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  // Fail-fast on corruption: an unhandled rejection means unknown state.
  // Production exits (supervisor restarts clean); dev/test only log so the
  // REPL and test runner survive. Never serve traffic on a possibly-poisoned
  // event loop at millions-of-requests scale.
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason: String(reason), stack: reason?.stack }, '[DyPOS] Unhandled Rejection');
    if (isProduction && !process.argv.some((a) => a.includes('test'))) {
      try { db.close(); } catch { /* already broken */ }
      process.exit(1);
    }
  });
  // Sync throws (timer callbacks, route middleware mistakes, driver edge) leave
  // the process in unknown state. Same policy as rejections: in production we
  // close the DB and die so the supervisor restarts clean, never serving
  // traffic on a poisoned loop. In dev/test we keep the handler (avoid killing
  // the REPL/test runner) but still log loudly.
  process.on('uncaughtException', (err) => {
    logger.error({ error: err?.message, stack: err?.stack }, '[DyPOS] Uncaught Exception');
    if (isProduction && !process.argv.some((a) => a.includes('test'))) {
      try { db.close(); } catch { /* already broken */ }
      process.exit(1);
    }
  });
  return _server;
}

// Start server only when run directly (not when imported for testing).
// Cluster primary never listens — it only supervises workers.
const isMainModule = process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]));
if (isMainModule) {
  start();
}
