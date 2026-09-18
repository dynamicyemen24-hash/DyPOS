/**
 * DyPOS Trail — durable before/after audit trail (تتبع الأثر).
 *
 * Complements the stdout ring (GET /api/admin/audit, 500 entries, ephemeral)
 * with a queryable DB table (GET /api/admin/trail, retained with backups).
 * Best-effort by design: trail writes never break business transactions —
 * call INSIDE the caller's transaction so the link is atomic when possible.
 */
import db from '../db/schema.js';
import { tenantContext } from './tenant.js';

function safeJson(v) {
  try {
    const s = JSON.stringify(v ?? {});
    return s.length > 4000 ? s.slice(0, 4000) : s;
  } catch {
    return '{}';
  }
}

export function recordTrail(req, { entity, entityId, action, before = null, after = null } = {}) {
  try {
    let tenantId = '';
    try { tenantId = tenantContext(req).tenantId || ''; } catch { /* no context */ }
    db.prepare(`INSERT INTO audit_trail (tenant_id,entity_type,entity_id,action,before_json,after_json,user_id,username,ip) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(
        tenantId,
        String(entity || '').slice(0, 32),
        String(entityId || '').slice(0, 64),
        String(action || '').slice(0, 20),
        safeJson(before),
        safeJson(after),
        req?.user?.id || null,
        req?.user?.username || null,
        req?.ip || null,
      );
  } catch { /* trail never breaks requests */ }
}

export default { recordTrail };
