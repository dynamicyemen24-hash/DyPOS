/**
 * DyPOS Server — Standalone REST API
 * Production-hardened for millions of subscribers:
 * dotenv, JWT validation, CSP, CORS lock-down, request-id tracing,
 * structured logging, graceful shutdown, deep health check, auth rate limit,
 * cardinality-safe metrics, optional multi-core clustering.
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

import { migrate, db, checkDbHealth, checkIntegrity } from './db/schema.js';
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
import { metricsMiddleware, metricsHandler } from './middleware/metrics.js';
import { auditMiddleware } from './middleware/audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DYPOS_PORT) || 3001;
const HOST = process.env.DYPOS_HOST || '0.0.0.0';
const VERSION = '1.3.0';

// ── Optional clustering: DYPOS_CLUSTER=1 uses all CPUs (throughput × cores) ──
// NOTE: kept outside the request path so `export` stays top-level (ESM requirement).
// Primary only forks; workers (and single-mode) continue to boot the app below.
const IS_CLUSTER_PRIMARY =
  process.env.DYPOS_CLUSTER === '1' && cluster.isPrimary && !process.argv.some((a) => a.includes('test'));
if (IS_CLUSTER_PRIMARY) {
  const cpus = Math.max(1, Math.min(os.cpus().length, Number(process.env.DYPOS_WORKERS) || os.cpus().length));
  console.log(`[DyPOS] Cluster mode: forking ${cpus} workers`);
  for (let i = 0; i < cpus; i++) cluster.fork();
  cluster.on('exit', (worker, code) => {
    console.error(`[DyPOS] Worker ${worker.process.pid} exited (${code}). Restarting...`);
    cluster.fork();
  });
}

// Validate critical config in production
if (isProduction) {
  if (!process.env.DYPOS_JWT_SECRET || process.env.DYPOS_JWT_SECRET.length < 32) {
    console.error('[DyPOS FATAL] DYPOS_JWT_SECRET is missing or shorter than 32 characters.');
    process.exit(1);
  }
  if (!process.env.DYPOS_CORS_ORIGIN || process.env.DYPOS_CORS_ORIGIN === '*') {
    console.warn('[DyPOS WARN] DYPOS_CORS_ORIGIN not set.');
  }
  console.log('[DyPOS] Running in PRODUCTION mode');
} else {
  console.log('[DyPOS] Running in DEVELOPMENT mode');
}

assertDbModeSupported();
console.log('[DyPOS] DB mode:', JSON.stringify(describeDbMode()));

mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
migrate();

// Request-ID + structured request logger (skips health probes to save I/O)
function requestLogger(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/health' || req.path === '/api/ready') return;
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    console.log(JSON.stringify({
      ts: new Date().toISOString(), level, req_id: req.id,
      method: req.method, url: req.url, status: res.statusCode,
      duration_ms: duration, ip: req.ip,
      user: req.user?.username,
    }));
  });
  next();
}

const app = express();
app.disable('x-powered-by');
// Behind nginx/LB: needed for correct req.ip → correct per-IP rate limiting
app.set('trust proxy', Number(process.env.DYPOS_TRUST_PROXY) || 1);

// Security headers (CSP enabled)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
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

app.use(compression({ threshold: 1024 }));
app.use(requestLogger);
app.use(metricsMiddleware);
app.use(auditMiddleware);

// Global rate limit — per-IP; use Redis store via DYPOS_REDIS_URL in multi-replica deploys
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, max: isProduction ? 2000 : 1000,
  standardHeaders: true, legacyHeaders: false,
  skip: (req) => req.path === '/api/health' || req.path === '/api/ready',
  message: { error: 'Too many requests. Please try again later.' },
}));

// Tight body limits: 1MB blocks DoS via huge payloads (invoices validated by zod, max 500 lines)
app.use(express.json({ limit: process.env.DYPOS_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
// JSON parse errors → clean 400 (not 500)
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'الحمولة كبيرة جدًا' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'JSON غير صالح' });
  next(err);
});
// Extra: sanitize JSON keys length to prevent DoS via huge keys
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    const keys = Object.keys(req.body);
    if (keys.length > 100) return next(Object.assign(new Error('Too many keys'), { statusCode: 400 }));
    for (const k of keys) if (k.length > 128) return next(Object.assign(new Error('Key too long'), { statusCode: 400 }));
  }
  next();
});

// Deep health check + readiness
app.get('/api/health', async (req, res) => {
  const dbHealth = await checkDbHealth();
  const status = dbHealth.healthy ? 'ok' : 'degraded';
  return res.status(dbHealth.healthy ? 200 : 503).json({
    status, version: VERSION, uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(), database: dbHealth,
    node_version: process.version, env: isProduction ? 'production' : 'development',
  });
});
// Prometheus metrics — gate with token when configured (prevents public scraping)
app.get('/api/metrics', (req, res, next) => {
  const token = process.env.DYPOS_METRICS_TOKEN;
  if (token && req.query.token !== token && req.headers['x-metrics-token'] !== token) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return metricsHandler(req, res, next);
});
app.get('/api/ready', async (_req, res) => {
  const h = await checkDbHealth();
  if (!h.healthy) return res.status(503).json({ ready: false, reason: h.error });
  return res.json({ ready: true, version: VERSION });
});

// Auth routes with stricter rate limit (brute-force protection)
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true,
});
app.use('/api/auth', authRateLimit, authRoutes);

// Write guard: read-only replicas reject mutations with 409 (retry @ primary)
app.use(requirePrimary);

// Protected routes
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/products', authMiddleware, productRoutes);
app.use('/api/customers', authMiddleware, customerRoutes);
app.use('/api/invoices', authMiddleware, invoiceRoutes);
app.use('/api/shifts', authMiddleware, shiftRoutes);
app.use('/api/stock', authMiddleware, stockRoutes);
app.use('/api/sync', authMiddleware, syncRoutes);

// API 404 (before SPA fallback — avoids returning HTML for unknown API routes)
app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود', path: req.path }));

// Serve POS frontend (SPA) — Vite builds to DyPOS/public/pos
const posDist = resolve(process.env.DYPOS_FRONTEND_DIST || join(__dirname, '..', 'DyPOS', 'public', 'pos'));
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

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(), level: 'error', req_id: req.id,
    method: req.method, url: req.url, error: err.message,
    stack: isProduction ? undefined : err.stack,
  }));
  if (res.headersSent) return next(err);
  const statusCode = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const message = statusCode < 500 ? String(err.message || 'Bad Request').slice(0, 300)
    : (isProduction ? 'Internal Server Error' : String(err.message || 'Internal Error'));
  return res.status(statusCode).json({ error: message, req_id: req.id });
});

export { app, requestLogger };

// Start server only when run directly (not when imported for testing).
// Cluster primary never listens — it only supervises workers.
const isMainModule = process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]));
if (isMainModule && !IS_CLUSTER_PRIMARY) {
  let server;
  server = app.listen(PORT, HOST, () => {
    console.log(`[DyPOS] Server v${VERSION} running on http://${HOST}:${PORT} (worker ${process.pid})`);
    console.log(`[DyPOS] Health: http://${HOST}:${PORT}/api/health`);
    console.log(`[DyPOS] Auth: http://${HOST}:${PORT}/api/auth/login`);
  });
  // Production timeouts: kill slow-loris + runaway handlers
  server.timeout = Number(process.env.DYPOS_SERVER_TIMEOUT) || 30000;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    console.log(`[DyPOS] Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
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
  process.on('unhandledRejection', (reason) => {
    console.error('[DyPOS] Unhandled Rejection:', JSON.stringify({ reason: String(reason), stack: reason?.stack }));
  });
}
