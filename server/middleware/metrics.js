/**
 * DyPOS Metrics — Prometheus + structured latency histograms.
 * Operational visibility for millions of daily transactions.
 * Exposed at /api/metrics (scraped by Prometheus) and /api/health (JSON).
 *
 * Cardinality-safe: dynamic ids (uuid/numbers) are normalized to :id
 * so Prometheus isn't killed by unbounded label values.
 */
import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'dypos_' });

export const httpDuration = new client.Histogram({
  name: 'dypos_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

export const dbQueryDuration = new client.Histogram({
  name: 'dypos_db_query_duration_seconds',
  help: 'DB query duration',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [register],
});

export const invoicesCounter = new client.Counter({
  name: 'dypos_invoices_created_total',
  help: 'Total invoices created',
  registers: [register],
});

export const syncCounter = new client.Counter({
  name: 'dypos_sync_operations_total',
  help: 'Total sync operations',
  labelNames: ['direction', 'status'],
  registers: [register],
});

export const authAttempts = new client.Counter({
  name: 'dypos_auth_attempts_total',
  help: 'Login attempts by outcome',
  labelNames: ['outcome'],
  registers: [register],
});

export const cacheOps = new client.Counter({
  name: 'dypos_cache_operations_total',
  help: 'Cache hits/misses by tier',
  labelNames: ['result'],
  registers: [register],
});

export const outboxPending = new client.Gauge({
  name: 'dypos_webhook_outbox_pending',
  help: 'Webhook outbox PENDING jobs (updated on /api/health)',
  registers: [register],
});

export const outboxDead = new client.Gauge({
  name: 'dypos_webhook_outbox_dead',
  help: 'Webhook outbox DEAD jobs (updated on /api/health)',
  registers: [register],
});

export const stockLow = new client.Gauge({
  name: 'dypos_stock_low_products',
  help: 'Products at/below the low-stock threshold (updated on /api/health)',
  registers: [register],
});

/** Time a sync DB operation and observe it (never throws). */
export function observeDb(operation, fn) {
  const start = process.hrtime.bigint();
  try {
    return fn();
  } finally {
    try {
      const secs = Number(process.hrtime.bigint() - start) / 1e9;
      dbQueryDuration.labels(operation).observe(secs);
    } catch { /* ignore */ }
  }
}

/** Normalize /api/invoices/<uuid> → /api/invoices/:id to bound cardinality */
export function normalizeRoute(req) {
  const base = req.baseUrl || '';
  const p = req.route?.path || req.path || '';
  let full = `${base}${p}`;
  // Fallback when route not yet matched: scrub ids from raw path
  if (!req.route?.path) {
    full = (base + (req.path || ''))
      .replace(/\/[0-9a-fA-F-]{8,}/g, '/:id')
      .replace(/\/\d+(?=\/|$)/g, '/:id');
  }
  return full.slice(0, 128);
}

export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      const route = normalizeRoute(req);
      // Skip high-frequency health probes from latency histograms to reduce overhead
      if (route === '/api/health' || route === '/api/ready') return;
      httpDuration.labels(req.method, route, String(res.statusCode)).observe(duration);
    } catch { /* metrics must never break requests */ }
  });
  next();
}

export async function metricsHandler(_req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

export { register };
export default { httpDuration, dbQueryDuration, invoicesCounter, syncCounter, authAttempts, cacheOps, outboxPending, outboxDead, stockLow, observeDb, metricsMiddleware, metricsHandler, register, normalizeRoute };
