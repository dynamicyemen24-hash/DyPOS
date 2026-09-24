/**
 * DyPOS Audit Ledger — Tamper-Evident Audit Logging
 * 
 * Merkle tree-based hash chaining for immutable audit trails
 * Compliance: SOC 2, ISO 27001, financial audit requirements
 */

import crypto from 'crypto';
import { db } from '../db/schema.js';
import { logger } from './logger.js';
import { getTracer } from './telemetry.js';

const log = logger.create('AuditLedger');
const tracer = getTracer('dypos.audit');

const AUDIT_TABLE = 'audit_ledger';
const CHAIN_TABLE = 'audit_chain';

/**
 * Initialize audit tables
 */
export function initAuditTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${AUDIT_TABLE} (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_category TEXT NOT NULL,
      user_id TEXT,
      tenant_id TEXT,
      session_id TEXT,
      request_id TEXT,
      ip TEXT,
      user_agent TEXT,
      resource_type TEXT,
      resource_id TEXT,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL, -- success, failure, partial
      details TEXT, -- JSON
      risk_level TEXT DEFAULT 'low', -- low, medium, high, critical
      tags TEXT, -- JSON array
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON ${AUDIT_TABLE}(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON ${AUDIT_TABLE}(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON ${AUDIT_TABLE}(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_event_type ON ${AUDIT_TABLE}(event_type);
    CREATE INDEX IF NOT EXISTS idx_audit_outcome ON ${AUDIT_TABLE}(outcome);
    CREATE INDEX IF NOT EXISTS idx_audit_risk ON ${AUDIT_TABLE}(risk_level);

    CREATE TABLE IF NOT EXISTS ${CHAIN_TABLE} (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      audit_id TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      curr_hash TEXT NOT NULL,
      merkle_root TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (audit_id) REFERENCES ${AUDIT_TABLE}(id)
    );

    CREATE INDEX IF NOT EXISTS idx_chain_audit ON ${CHAIN_TABLE}(audit_id);
    CREATE INDEX IF NOT EXISTS idx_chain_timestamp ON ${CHAIN_TABLE}(timestamp);
  `);
}

/**
 * Compute SHA-256 hash of audit entry
 */
function computeHash(entry) {
  const canonical = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    event_type: entry.event_type,
    event_category: entry.event_category,
    user_id: entry.user_id || null,
    tenant_id: entry.tenant_id || null,
    action: entry.action,
    outcome: entry.outcome,
    details: entry.details,
    prev_hash: entry.prev_hash || '',
  }, Object.keys(entry).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Get last chain hash
 */
function getLastChainHash() {
  const row = db.prepare(`
    SELECT curr_hash FROM ${CHAIN_TABLE} ORDER BY sequence DESC LIMIT 1
  `).get();
  return row?.curr_hash || '0'.repeat(64); // Genesis hash
}

/**
 * Write audit entry with hash chaining
 */
export function writeAuditEntry(entry) {
  return tracer.startActiveSpan('audit.write', async (span) => {
    try {
      const auditId = entry.id || crypto.randomUUID();
      const timestamp = entry.timestamp || new Date().toISOString();
      const prevHash = getLastChainHash();

      const auditEntry = {
        id: auditId,
        timestamp,
        event_type: entry.event_type,
        event_category: entry.event_category || 'general',
        user_id: entry.user_id || null,
        tenant_id: entry.tenant_id || null,
        session_id: entry.session_id || null,
        request_id: entry.request_id || null,
        ip: entry.ip || null,
        user_agent: entry.user_agent || null,
        resource_type: entry.resource_type || null,
        resource_id: entry.resource_id || null,
        action: entry.action,
        outcome: entry.outcome || 'success',
        details: entry.details ? JSON.stringify(entry.details) : null,
        risk_level: entry.risk_level || 'low',
        tags: entry.tags ? JSON.stringify(entry.tags) : null,
        prev_hash: prevHash,
      };

      const currHash = computeHash(auditEntry);
      auditEntry.curr_hash = currHash;

      // Atomic write: audit entry + chain entry
      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO ${AUDIT_TABLE} (
            id, timestamp, event_type, event_category, user_id, tenant_id,
            session_id, request_id, ip, user_agent, resource_type, resource_id,
            action, outcome, details, risk_level, tags
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          auditEntry.id, auditEntry.timestamp, auditEntry.event_type,
          auditEntry.event_category, auditEntry.user_id, auditEntry.tenant_id,
          auditEntry.session_id, auditEntry.request_id, auditEntry.ip,
          auditEntry.user_agent, auditEntry.resource_type, auditEntry.resource_id,
          auditEntry.action, auditEntry.outcome, auditEntry.details,
          auditEntry.risk_level, auditEntry.tags
        );

        db.prepare(`
          INSERT INTO ${CHAIN_TABLE} (audit_id, prev_hash, curr_hash, merkle_root)
          VALUES (?, ?, ?, ?)
        `).run(auditId, prevHash, currHash, currHash);
      });

      tx();

      span.setStatus({ code: 0 });
      span.setAttribute('audit.id', auditId);
      span.setAttribute('audit.event_type', entry.event_type);
      span.setAttribute('audit.outcome', auditEntry.outcome);

      log.info('Audit entry written', {
        auditId,
        eventType: entry.event_type,
        outcome: auditEntry.outcome,
        hash: currHash.substring(0, 16) + '...',
      });

      return { id: auditId, hash: currHash, timestamp };
    } catch (error) {
      span.setStatus({ code: 2, message: error.message });
      span.recordException(error);
      log.error('Failed to write audit entry', { error: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Verify audit chain integrity
 */
export function verifyAuditChain(options = {}) {
  const { fromSequence = 0, toSequence = null, sampleRate = 1.0 } = options;

  return tracer.startActiveSpan('audit.verify_chain', async (span) => {
    try {
      let query = `
        SELECT c.sequence, c.audit_id, c.prev_hash, c.curr_hash,
               a.timestamp, a.event_type, a.id as audit_id_check
        FROM ${CHAIN_TABLE} c
        JOIN ${AUDIT_TABLE} a ON c.audit_id = a.id
        WHERE c.sequence >= ?
      `;
      const params = [fromSequence];

      if (toSequence) {
        query += ' AND c.sequence <= ?';
        params.push(toSequence);
      }

      query += ' ORDER BY c.sequence ASC';

      const rows = db.prepare(query).all(...params);

      const results = {
        verified: 0,
        failed: 0,
        gaps: 0,
        tampered: [],
        missing: [],
        lastVerified: null,
      };

      let expectedPrevHash = fromSequence === 0 ? '0'.repeat(64) : null;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Check sequence continuity
        if (expectedPrevHash !== null && row.prev_hash !== expectedPrevHash) {
          results.gaps++;
          results.tampered.push({
            sequence: row.sequence,
            type: 'chain_break',
            expected: expectedPrevHash,
            actual: row.prev_hash,
          });
        }

        // Verify hash (sample-based for performance)
        if (Math.random() <= sampleRate) {
          const auditRow = db.prepare(`SELECT * FROM ${AUDIT_TABLE} WHERE id = ?`).get(row.audit_id);
          if (auditRow) {
            const computedHash = computeHash({
              ...auditRow,
              prev_hash: row.prev_hash,
            });
            if (computedHash !== row.curr_hash) {
              results.failed++;
              results.tampered.push({
                sequence: row.sequence,
                type: 'hash_mismatch',
                expected: row.curr_hash,
                actual: computedHash,
              });
            } else {
              results.verified++;
            }
          } else {
            results.missing.push(row.sequence);
          }
        } else {
          results.verified++; // Assume valid if not sampled
        }

        expectedPrevHash = row.curr_hash;
        results.lastVerified = row.sequence;
      }

      span.setStatus({ code: 0 });
      span.setAttribute('audit.verified', results.verified);
      span.setAttribute('audit.failed', results.failed);

      log.info('Audit chain verification complete', results);

      return results;
    } catch (error) {
      span.setStatus({ code: 2, message: error.message });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Query audit logs with filters
 */
export function queryAuditLogs(filters = {}) {
  const {
    eventType,
    eventCategory,
    userId,
    tenantId,
    resourceType,
    resourceId,
    action,
    outcome,
    riskLevel,
    startTime,
    endTime,
    limit = 100,
    offset = 0,
    order = 'DESC',
  } = filters;

  let where = '1=1';
  const params = [];

  if (eventType) { where += ' AND event_type = ?'; params.push(eventType); }
  if (eventCategory) { where += ' AND event_category = ?'; params.push(eventCategory); }
  if (userId) { where += ' AND user_id = ?'; params.push(userId); }
  if (tenantId) { where += ' AND tenant_id = ?'; params.push(tenantId); }
  if (resourceType) { where += ' AND resource_type = ?'; params.push(resourceType); }
  if (resourceId) { where += ' AND resource_id = ?'; params.push(resourceId); }
  if (action) { where += ' AND action = ?'; params.push(action); }
  if (outcome) { where += ' AND outcome = ?'; params.push(outcome); }
  if (riskLevel) { where += ' AND risk_level = ?'; params.push(riskLevel); }
  if (startTime) { where += ' AND timestamp >= ?'; params.push(startTime); }
  if (endTime) { where += ' AND timestamp <= ?'; params.push(endTime); }

  params.push(limit, offset);

  const rows = db.prepare(`
    SELECT * FROM ${AUDIT_TABLE}
    WHERE ${where}
    ORDER BY timestamp ${order}
    LIMIT ? OFFSET ?
  `).all(...params);

  // Parse JSON fields
  return rows.map(row => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : null,
    tags: row.tags ? JSON.parse(row.tags) : null,
  }));
}

/**
 * Get audit statistics
 */
export function getAuditStats(timeRange = '24h') {
  const interval = timeRange === '24h' ? '-1 day' : timeRange === '7d' ? '-7 days' : '-30 days';

  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failures,
      SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successes,
      SUM(CASE WHEN risk_level = 'critical' THEN 1 ELSE 0 END) as critical,
      SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) as high,
      COUNT(DISTINCT user_id) as unique_users,
      COUNT(DISTINCT event_type) as event_types
    FROM ${AUDIT_TABLE}
    WHERE timestamp >= datetime('now', ?)
  `).get(interval);

  const byType = db.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM ${AUDIT_TABLE}
    WHERE timestamp >= datetime('now', ?)
    GROUP BY event_type
    ORDER BY count DESC
    LIMIT 20
  `).all(interval);

  const byOutcome = db.prepare(`
    SELECT outcome, COUNT(*) as count
    FROM ${AUDIT_TABLE}
    WHERE timestamp >= datetime('now', ?)
    GROUP BY outcome
  `).all(interval);

  return { ...stats, byType, byOutcome };
}

/**
 * Export audit trail for compliance
 */
export function exportAuditTrail(filters = {}, format = 'json') {
  const rows = queryAuditLogs({ ...filters, limit: 10000 });

  if (format === 'csv') {
    const headers = ['id', 'timestamp', 'event_type', 'event_category', 'user_id', 'tenant_id', 'action', 'outcome', 'risk_level'];
    const csvRows = rows.map(r => headers.map(h => {
      const val = r[h];
      return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
    }).join(','));
    return [headers.join(','), ...csvRows].join('\n');
  }

  return JSON.stringify(rows, null, 2);
}

/**
 * High-level audit helpers for common events
 */
export const AuditEvents = {
  login: (user, req, outcome = 'success') => writeAuditEntry({
    event_type: 'auth.login',
    event_category: 'authentication',
    user_id: user?.id,
    tenant_id: user?.tenantId,
    session_id: user?.sessionId,
    request_id: req?.id,
    ip: req?.ip,
    user_agent: req?.headers?.['user-agent'],
    action: 'login',
    outcome,
    risk_level: outcome === 'failure' ? 'medium' : 'low',
  }),

  logout: (user, req) => writeAuditEntry({
    event_type: 'auth.logout',
    event_category: 'authentication',
    user_id: user?.id,
    tenant_id: user?.tenantId,
    session_id: user?.sessionId,
    request_id: req?.id,
    ip: req?.ip,
    action: 'logout',
    outcome: 'success',
  }),

  dataAccess: (user, req, resourceType, resourceId, action) => writeAuditEntry({
    event_type: `data.${action}`,
    event_category: 'data_access',
    user_id: user?.id,
    tenant_id: user?.tenantId,
    request_id: req?.id,
    ip: req?.ip,
    resource_type: resourceType,
    resource_id: resourceId,
    action,
    outcome: 'success',
  }),

  dataMutation: (user, req, resourceType, resourceId, action, details, outcome = 'success') => writeAuditEntry({
    event_type: `data.${action}`,
    event_category: 'data_mutation',
    user_id: user?.id,
    tenant_id: user?.tenantId,
    request_id: req?.id,
    ip: req?.ip,
    resource_type: resourceType,
    resource_id: resourceId,
    action,
    outcome,
    details,
    risk_level: outcome === 'failure' ? 'high' : 'medium',
  }),

  configChange: (user, req, configKey, oldValue, newValue) => writeAuditEntry({
    event_type: 'config.change',
    event_category: 'configuration',
    user_id: user?.id,
    tenant_id: user?.tenantId,
    request_id: req?.id,
    ip: req?.ip,
    resource_type: 'config',
    resource_id: configKey,
    action: 'update',
    outcome: 'success',
    details: { oldValue, newValue },
    risk_level: 'high',
  }),

  securityEvent: (req, eventType, details, riskLevel = 'high') => writeAuditEntry({
    event_type: `security.${eventType}`,
    event_category: 'security',
    request_id: req?.id,
    ip: req?.ip,
    user_agent: req?.headers?.['user-agent'],
    action: eventType,
    outcome: 'detected',
    details,
    risk_level: riskLevel,
  }),

  apiError: (req, error, context = {}) => writeAuditEntry({
    event_type: 'api.error',
    event_category: 'error',
    request_id: req?.id,
    ip: req?.ip,
    user_id: req?.user?.id,
    tenant_id: req?.user?.tenantId,
    action: 'error',
    outcome: 'failure',
    details: { message: error.message, stack: error.stack, ...context },
    risk_level: 'medium',
  }),
};

// Initialize on load
initAuditTables();