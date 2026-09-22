/** DyPOS Integration Registry v1.31.0 — single entry point for external systems. */
import db from '../../db/schema.js';
import { BaseAdapter } from './base.js';
import { ErpnextAdapter } from './adapters/erpnext.js';
import { OdooAdapter } from './adapters/odoo.js';

const adapters = new Map([
  ['base', new BaseAdapter()],
  ['erpnext', new ErpnextAdapter()],
  ['odoo', new OdooAdapter()],
]);

export function initIntegrationTables() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS integration_configs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL DEFAULT 'STD',
        adapter TEXT NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        auth_type TEXT NOT NULL DEFAULT 'api_key',
        credentials TEXT NOT NULL DEFAULT '{}',
        options TEXT NOT NULL DEFAULT '{}',
        direction TEXT NOT NULL DEFAULT 'both',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, adapter, name)
      );
      CREATE TABLE IF NOT EXISTS integration_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT DEFAULT 'STD',
        adapter TEXT NOT NULL,
        config_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        entity_type TEXT NOT NULL DEFAULT '',
        entity_id TEXT NOT NULL DEFAULT '',
        dypos_id TEXT NOT NULL DEFAULT '',
        external_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT DEFAULT (datetime('now')),
        idempotency_key TEXT,
        request_json TEXT DEFAULT '{}',
        response_json TEXT DEFAULT '{}',
        last_error TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_intrun_idem ON integration_runs(idempotency_key)
        WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
      CREATE INDEX IF NOT EXISTS idx_intrun_status ON integration_runs(status, next_attempt_at, id);
      CREATE INDEX IF NOT EXISTS idx_intrun_tenant ON integration_runs(tenant_id, status, id);
      CREATE INDEX IF NOT EXISTS idx_intcfg_tenant ON integration_configs(tenant_id, is_active);
    `);
  } catch {
    // best effort; routes stay alive
  }
}

export function listAdapters() {
  return [...adapters.values()].map((a) => ({
    key: a.key,
    kind: a.kind,
    displayName: a.displayName,
    configSchema: a.configSchema(),
  }));
}

export function getAdapter(key) {
  return adapters.get(String(key || '').toLowerCase()) || null;
}

/** Redact secrets before returning configs to API callers. */
export function redactConfig(row) {
  if (!row) return row;
  const { credentials, ...rest } = row;
  let credKeys = [];
  try {
    credKeys = Object.keys(JSON.parse(credentials || '{}'));
  } catch {
    credKeys = [];
  }
  return { ...rest, credential_keys: credKeys, secret_preview: '***' };
}

export default { listAdapters, getAdapter, redactConfig, initIntegrationTables };
