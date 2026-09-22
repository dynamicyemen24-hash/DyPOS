/** DyPOS Hardware & Print Robustness & Audit Layer v1.31.0 */
import db from '../db/schema.js'
import { v4 as uuid } from 'uuid'

/**
 * Initialize audit trail and offline print queue tables for robustness.
 */
export function initHardwareAuditTables() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS hardware_audit_logs (
        id TEXT PRIMARY KEY,
        device_id TEXT,
        action TEXT, -- 'PRINT_JOB', 'DRAWER_KICK', 'DEVICE_SYNC'
        status TEXT, -- 'SUCCESS', 'FAILED', 'QUEUED_OFFLINE'
        payload_summary TEXT,
        username TEXT,
        created_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_hw_audit_time ON hardware_audit_logs(created_at DESC);
    `)
  } catch (e) {
    // Non-blocking best effort
  }
}

/**
 * Record a hardware action or print job in the audit trail.
 * @param {Object} options - Audit options
 * @returns {Object} Created audit record
 */
export function recordHardwareAudit({ deviceId, action, status, payloadSummary, username }) {
  const auditId = uuid()
  const timestamp = new Date().toISOString()
  try {
    db.prepare(`
      INSERT INTO hardware_audit_logs (id, device_id, action, status, payload_summary, username, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      deviceId || 'default',
      action || 'PRINT_JOB',
      status || 'SUCCESS',
      String(payloadSummary || '').slice(0, 500),
      username || 'system',
      timestamp
    )
  } catch (e) {
    // Non-blocking best effort
  }
  return { auditId, timestamp, status }
}

export default {
  initHardwareAuditTables,
  recordHardwareAudit,
}