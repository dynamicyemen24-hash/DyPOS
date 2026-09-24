/**
 * DyPOS Feature Flags — Gradual Rollout & Experimentation
 * 
 * Targeting: percentage, user segments, tenant, geography
 * Integration: OpenTelemetry for metrics, audit for changes
 */

import { Router } from 'express';
import { db } from '../db/schema.js';
import { getTracer } from './telemetry.js';
import { writeAuditEntry } from './audit.js';

const tracer = getTracer('dypos.feature-flags');

const FLAGS_TABLE = 'feature_flags';
const OVERRIDES_TABLE = 'feature_flag_overrides';
const EXPOSURES_TABLE = 'feature_flag_exposures';

/**
 * Initialize feature flag tables
 */
export function initFeatureFlagTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${FLAGS_TABLE} (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER DEFAULT 0,
      rollout_percent INTEGER DEFAULT 0, -- 0-100
      targeting_rules TEXT, -- JSON
      variants TEXT, -- JSON: { control: 0.5, treatment: 0.5 }
      default_variant TEXT DEFAULT 'control',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT,
      tags TEXT -- JSON array
    );

    CREATE TABLE IF NOT EXISTS ${OVERRIDES_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_key TEXT NOT NULL,
      user_id TEXT,
      tenant_id TEXT,
      variant TEXT NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      FOREIGN KEY (flag_key) REFERENCES ${FLAGS_TABLE}(key)
    );

    CREATE INDEX IF NOT EXISTS idx_overrides_flag ON ${OVERRIDES_TABLE}(flag_key);
    CREATE INDEX IF NOT EXISTS idx_overrides_user ON ${OVERRIDES_TABLE}(user_id);
    CREATE INDEX IF NOT EXISTS idx_overrides_tenant ON ${OVERRIDES_TABLE}(tenant_id);

    CREATE TABLE IF NOT EXISTS ${EXPOSURES_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flag_key TEXT NOT NULL,
      variant TEXT NOT NULL,
      user_id TEXT,
      tenant_id TEXT,
      session_id TEXT,
      request_id TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_exposures_flag ON ${EXPOSURES_TABLE}(flag_key);
    CREATE INDEX IF NOT EXISTS idx_exposures_user ON ${EXPOSURES_TABLE}(user_id);
    CREATE INDEX IF NOT EXISTS idx_exposures_time ON ${EXPOSURES_TABLE}(timestamp);
  `);
}

/**
 * Get all flags
 */
export function getAllFlags() {
  return db.prepare(`SELECT * FROM ${FLAGS_TABLE}`).all().map(row => ({
    ...row,
    targeting_rules: row.targeting_rules ? JSON.parse(row.targeting_rules) : {},
    variants: row.variants ? JSON.parse(row.variants) : { control: 1 },
    tags: row.tags ? JSON.parse(row.tags) : [],
  }));
}

/**
 * Get single flag
 */
export function getFlag(key) {
  const row = db.prepare(`SELECT * FROM ${FLAGS_TABLE} WHERE key = ?`).get(key);
  if (!row) return null;
  return {
    ...row,
    targeting_rules: row.targeting_rules ? JSON.parse(row.targeting_rules) : {},
    variants: row.variants ? JSON.parse(row.variants) : { control: 1 },
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

/**
 * Create or update flag
 */
export function upsertFlag(flag, userId = 'system') {
  const {
    key, name, description, enabled = 0, rollout_percent = 0,
    targeting_rules = {}, variants = { control: 1 }, default_variant = 'control',
    tags = [],
  } = flag;

  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT * FROM ${FLAGS_TABLE} WHERE key = ?`).get(key);

  if (existing) {
    db.prepare(`
      UPDATE ${FLAGS_TABLE} SET
        name = ?, description = ?, enabled = ?, rollout_percent = ?,
        targeting_rules = ?, variants = ?, default_variant = ?,
        updated_at = ?, updated_by = ?, tags = ?
      WHERE key = ?
    `).run(
      name, description, enabled, rollout_percent,
      JSON.stringify(targeting_rules), JSON.stringify(variants), default_variant,
      now, userId, JSON.stringify(tags), key
    );
  } else {
    db.prepare(`
      INSERT INTO ${FLAGS_TABLE} (key, name, description, enabled, rollout_percent,
        targeting_rules, variants, default_variant, created_at, updated_at, updated_by, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(key, name, description, enabled, rollout_percent,
      JSON.stringify(targeting_rules), JSON.stringify(variants), default_variant,
      now, now, userId, JSON.stringify(tags));
  }

  // Audit
  writeAuditEntry({
    event_type: existing ? 'feature_flag.updated' : 'feature_flag.created',
    event_category: 'configuration',
    user_id: userId,
    resource_type: 'feature_flag',
    resource_id: key,
    action: existing ? 'update' : 'create',
    outcome: 'success',
    details: { key, name, enabled, rollout_percent },
  });

  return getFlag(key);
}

/**
 * Delete flag
 */
export function deleteFlag(key, userId = 'system') {
  const existing = getFlag(key);
  if (!existing) return false;

  db.prepare(`DELETE FROM ${FLAGS_TABLE} WHERE key = ?`).run(key);
  db.prepare(`DELETE FROM ${OVERRIDES_TABLE} WHERE flag_key = ?`).run(key);

  writeAuditEntry({
    event_type: 'feature_flag.deleted',
    event_category: 'configuration',
    user_id: userId,
    resource_type: 'feature_flag',
    resource_id: key,
    action: 'delete',
    outcome: 'success',
  });

  return true;
}

/**
 * Evaluate flag for user context
 */
export function evaluateFlag(key, context = {}) {
  const { userId, tenantId, sessionId, requestId: _requestId, attributes = {} } = context;

  return tracer.startActiveSpan('feature_flag.evaluate', async (span) => {
    try {
      const flag = getFlag(key);
      if (!flag) {
        span.setAttribute('flag.exists', false);
        return { enabled: false, variant: 'control', reason: 'flag_not_found' };
      }

      if (!flag.enabled) {
        span.setAttribute('flag.enabled', false);
        return { enabled: false, variant: flag.default_variant, reason: 'flag_disabled' };
      }

      // 1. Check user override
      const userOverride = db.prepare(`
        SELECT variant FROM ${OVERRIDES_TABLE}
        WHERE flag_key = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
      `).get(key, userId);

      if (userOverride) {
        recordExposure(key, userOverride.variant, context);
        span.setAttribute('flag.variant', userOverride.variant);
        span.setAttribute('flag.reason', 'user_override');
        return { enabled: true, variant: userOverride.variant, reason: 'user_override' };
      }

      // 2. Check tenant override
      const tenantOverride = db.prepare(`
        SELECT variant FROM ${OVERRIDES_TABLE}
        WHERE flag_key = ? AND tenant_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
      `).get(key, tenantId);

      if (tenantOverride) {
        recordExposure(key, tenantOverride.variant, context);
        span.setAttribute('flag.variant', tenantOverride.variant);
        span.setAttribute('flag.reason', 'tenant_override');
        return { enabled: true, variant: tenantOverride.variant, reason: 'tenant_override' };
      }

      // 3. Check targeting rules
      if (flag.targeting_rules && Object.keys(flag.targeting_rules).length) {
        const matched = evaluateTargetingRules(flag.targeting_rules, attributes);
        if (matched) {
          const variant = flag.variants?.[matched] ? matched : flag.default_variant;
          recordExposure(key, variant, context);
          span.setAttribute('flag.variant', variant);
          span.setAttribute('flag.reason', 'targeting_rule');
          return { enabled: true, variant, reason: 'targeting_rule' };
        }
      }

      // 4. Rollout percentage
      if (flag.rollout_percent > 0) {
        const hash = hashUser(key, userId || tenantId || sessionId || 'anonymous');
        const bucket = hash % 100;

        if (bucket < flag.rollout_percent) {
          // In rollout - assign variant based on weights
          const variant = pickVariant(flag.variants || { control: 1 });
          recordExposure(key, variant, context);
          span.setAttribute('flag.variant', variant);
          span.setAttribute('flag.reason', 'rollout');
          return { enabled: true, variant, reason: 'rollout' };
        }
      }

      // 5. Default
      recordExposure(key, flag.default_variant, context);
      span.setAttribute('flag.variant', flag.default_variant);
      span.setAttribute('flag.reason', 'default');
      return { enabled: true, variant: flag.default_variant, reason: 'default' };
    } catch (error) {
      span.setStatus({ code: 2, message: error.message });
      span.recordException(error);
      return { enabled: false, variant: 'control', reason: 'error', error: error.message };
    } finally {
      span.end();
    }
  });
}

/**
 * Evaluate targeting rules
 */
function evaluateTargetingRules(rules, attributes) {
  for (const [variant, rule] of Object.entries(rules)) {
    if (!rule) continue;

    let matches = true;

    for (const [attr, condition] of Object.entries(rule)) {
      const userValue = attributes[attr];
      if (userValue === undefined) { matches = false; break; }

      if (condition.in !== undefined) {
        if (!condition.in.includes(userValue)) { matches = false; break; }
      }
      if (condition.not_in !== undefined) {
        if (condition.not_in.includes(userValue)) { matches = false; break; }
      }
      if (condition.equals !== undefined) {
        if (userValue !== condition.equals) { matches = false; break; }
      }
      if (condition.gt !== undefined) {
        if (Number(userValue) <= Number(condition.gt)) { matches = false; break; }
      }
      if (condition.lt !== undefined) {
        if (Number(userValue) >= Number(condition.lt)) { matches = false; break; }
      }
      if (condition.contains !== undefined) {
        if (!String(userValue).includes(condition.contains)) { matches = false; break; }
      }
      if (condition.regex !== undefined) {
        if (!new RegExp(condition.regex).test(String(userValue))) { matches = false; break; }
      }
    }

    if (matches) return variant;
  }

  return null;
}

/**
 * Pick variant based on weights
 */
function pickVariant(variants) {
  const total = Object.values(variants).reduce((a, b) => a + b, 0);
  let random = Math.random() * total;

  for (const [variant, weight] of Object.entries(variants)) {
    random -= weight;
    if (random <= 0) return variant;
  }

  return Object.keys(variants)[0];
}

/**
 * Deterministic hash for consistent bucketing
 */
function hashUser(flagKey, identifier) {
  const str = `${flagKey}:${identifier}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Record exposure for analytics
 */
function recordExposure(flagKey, variant, context) {
  const { userId, tenantId, sessionId, requestId } = context;

  db.prepare(`
    INSERT INTO ${EXPOSURES_TABLE} (flag_key, variant, user_id, tenant_id, session_id, request_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(flagKey, variant, userId || null, tenantId || null, sessionId || null, requestId || null);
}

/**
 * Set user override
 */
export function setUserOverride(key, userId, variant, reason = 'manual', expiresAt = null, userIdSetter = 'system') {
  const flag = getFlag(key);
  if (!flag) throw new Error(`Flag ${key} not found`);
  if (!flag.variants[variant]) throw new Error(`Invalid variant ${variant}`);

  db.prepare(`
    INSERT OR REPLACE INTO ${OVERRIDES_TABLE} (flag_key, user_id, variant, reason, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(key, userId, variant, reason, expiresAt);

  writeAuditEntry({
    event_type: 'feature_flag.override',
    event_category: 'configuration',
    user_id: userIdSetter,
    resource_type: 'feature_flag',
    resource_id: key,
    action: 'override',
    outcome: 'success',
    details: { target_user: userId, variant, reason },
  });
}

/**
 * Remove user override
 */
export function removeUserOverride(key, userId) {
  db.prepare(`DELETE FROM ${OVERRIDES_TABLE} WHERE flag_key = ? AND user_id = ?`).run(key, userId);
}

/**
 * Get flag analytics
 */
export function getFlagAnalytics(key, timeRange = '24h') {
  const interval = timeRange === '24h' ? '-1 day' : timeRange === '7d' ? '-7 days' : '-30 days';

  const exposures = db.prepare(`
    SELECT variant, COUNT(*) as count
    FROM ${EXPOSURES_TABLE}
    WHERE flag_key = ? AND timestamp >= datetime('now', ?)
    GROUP BY variant
  `).all(key, interval);

  const total = exposures.reduce((sum, e) => sum + e.count, 0);

  return {
    flagKey: key,
    totalExposures: total,
    byVariant: exposures.map(e => ({
      variant: e.variant,
      count: e.count,
      percentage: total ? Math.round(e.count / total * 10000) / 100 : 0,
    })),
    timeRange,
  };
}

/**
 * Middleware for Express
 */
export function featureFlagMiddleware() {
  return async (req, _res, next) => {
    req.featureFlags = {
      evaluate: (key, attributes) => evaluateFlag(key, {
        userId: req.user?.id,
        tenantId: req.user?.tenantId,
        sessionId: req.sessionId,
        requestId: req.id,
        attributes: { ...req.body, ...req.query, ...attributes },
      }),
      getAll: () => getAllFlags().reduce((acc, f) => {
        acc[f.key] = { enabled: f.enabled, rollout: f.rollout_percent };
        return acc;
      }, {}),
    };
    next();
  };
}

/**
 * Express route for flag management
 */
export function createFlagRoutes() {
  const router = Router();

  router.get('/', (_req, res) => res.json(getAllFlags()));
  router.get('/:key', (req, res) => {
    const flag = getFlag(req.params.key);
    if (!flag) return res.status(404).json({ error: 'Flag not found' });
    res.json(flag);
  });
  router.get('/:key/analytics', (req, res) => {
    res.json(getFlagAnalytics(req.params.key, req.query.timeRange));
  });
  router.post('/', (req, res) => {
    try {
      const flag = upsertFlag(req.body, req.user?.id);
      res.status(201).json(flag);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  router.put('/:key', (req, res) => {
    try {
      const flag = upsertFlag({ ...req.body, key: req.params.key }, req.user?.id);
      res.json(flag);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  router.delete('/:key', (req, res) => {
    deleteFlag(req.params.key, req.user?.id);
    res.status(204).send();
  });
  router.post('/:key/override', (req, res) => {
    try {
      const { userId, variant, reason, expiresAt } = req.body;
      setUserOverride(req.params.key, userId, variant, reason, expiresAt, req.user?.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  router.delete('/:key/override', (req, res) => {
    removeUserOverride(req.params.key, req.body.userId);
    res.status(204).send();
  });

  return router;
}

// Initialize on load
initFeatureFlagTables();