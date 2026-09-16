/**
 * DyPOS Server — Standalone REST API
 * Production-hardened: dotenv, JWT validation, CSP, CORS lock-down,
 * structured logging, graceful shutdown, deep health check, auth rate limit.
 */
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

// Load environment variables FIRST
dotenv.config();

import { migrate, db, checkDbHealth } from './db/schema.js';
import { authMiddleware, isProduction } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import customerRoutes from './routes/customers.js';
import invoiceRoutes from './routes/invoices.js';
import shiftRoutes from './routes/shifts.js';
import stockRoutes from './routes/stock.js';
import syncRoutes from './routes/sync.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.DYPOS_PORT || 3001;
const HOST = process.env.DYPOS_HOST || '0.0.0.0';

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

mkdirSync(join(__dirname, '..', 'data'), { recursive: true });
migrate();

// Structured request logger
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'error' : 'info';
    console.log(JSON.stringify({
      ts: new Date().toISOString(), level,
      method: req.method, url: req.url, status: res.statusCode,
      duration_ms: duration, ip: req.ip,
      user_agent: req.get('user-agent') || '',
    }));
  });
  next();
}

const app = express();

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
  ? process.env.DYPOS_CORS_ORIGIN.split(',').map(s => s.trim())
  : (isProduction ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8080']);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigin.includes(origin) || corsOrigin.includes('*')) return callback(null, true);
    console.warn(`[DyPOS] CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  maxAge: 86400,
}));

app.use(compression());
app.use(requestLogger);

// Global rate limit
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, max: 1000,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Deep health check
app.get('/api/health', async (req, res) => {
  const dbHealth = await checkDbHealth();
  const status = dbHealth.healthy ? 'ok' : 'degraded';
  return res.status(dbHealth.healthy ? 200 : 503).json({
    status, version: '1.2.0', uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(), database: dbHealth,
    node_version: process.version, env: isProduction ? 'production' : 'development',
  });
});

// Auth routes with stricter rate limit (brute-force protection)
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true,
});
app.use('/api/auth', authRateLimit, authRoutes);

// Protected routes
app.use('/api/products', authMiddleware, productRoutes);
app.use('/api/customers', authMiddleware, customerRoutes);
app.use('/api/invoices', authMiddleware, invoiceRoutes);
app.use('/api/shifts', authMiddleware, shiftRoutes);
app.use('/api/stock', authMiddleware, stockRoutes);
app.use('/api/sync', authMiddleware, syncRoutes);

// Serve POS frontend (SPA) — Vite builds to DyPOS/public/pos
const posDist = resolve(process.env.DYPOS_FRONTEND_DIST || join(__dirname, '..', 'DyPOS', 'public', 'pos'));
if (existsSync(posDist)) {
  app.use(express.static(posDist, { maxAge: '1y', etag: true }));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(join(posDist, 'index.html'));
    }
  });
} else if (!isProduction) {
  console.warn(`[DyPOS] Frontend dist not found at ${posDist}. Run "cd POS && yarn build" first.`);
}

// Error handler
app.use((err, req, res, next) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(), level: 'error',
    method: req.method, url: req.url, error: err.message,
    stack: isProduction ? undefined : err.stack,
  }));
  const statusCode = err.statusCode || 500;
  const message = isProduction ? 'Internal Server Error' : String(err.message || 'Internal Error');
  return res.status(statusCode).json({ error: message });
});

export { app, requestLogger };

// Start server only when run directly (not when imported for testing)
const isMainModule = process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]));
if (isMainModule) {
  let server;
  server = app.listen(PORT, HOST, () => {
    console.log(`[DyPOS] Server running on http://${HOST}:${PORT}`);
    console.log(`[DyPOS] Health: http://${HOST}:${PORT}/api/health`);
    console.log(`[DyPOS] Auth: http://${HOST}:${PORT}/api/auth/login`);
  });

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
    }, 30000);
  };
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('[DyPOS] Unhandled Rejection:', JSON.stringify({ reason: String(reason), stack: reason?.stack }));
  });
}
