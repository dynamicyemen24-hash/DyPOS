/**
 * DyPOS Tenant Context — multi-subscriber scoping (tenants → organizations → branches).
 *
 * Resolution order per request: explicit headers (X-Tenant-Id / X-Org-Id /
 * X-Branch-Id) → body fields → query params. Provided ids are validated for
 * existence, and hierarchy is enforced (org must belong to tenant, branch to org).
 *
 * Enforcement: DYPOS_REQUIRE_TENANT=1 rejects business writes without a tenant
 * (same opt-in pattern as DYPOS_REQUIRE_SHIFT). Default 0 = legacy permissive.
 */
import db from '../db/schema.js';

const REQUIRED = () => process.env.DYPOS_REQUIRE_TENANT === '1';

function str(v, max = 64) {
  return String(v ?? '').trim().slice(0, max) || null;
}

export function tenantContext(req) {
  const h = req.headers || {};
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const q = req.query || {};
  // A tenant-bound user is ALWAYS scoped to their own tenant, even when they
  // omit the headers: otherwise bound users could fall back to the global
  // passthrough and read/write other tenants' rows by id. Legacy users
  // (tenant_id NULL) keep the unchanged passthrough.
  return {
    tenantId: str(h['x-tenant-id'] || b.tenantId || q.tenant) || (req.user?.tenantId ? String(req.user.tenantId) : null),
    orgId: str(h['x-org-id'] || b.orgId || q.org),
    branchId: str(h['x-branch-id'] || b.branchId || q.branch),
  };
}

/**
 * Validate + enforce tenant scope. Returns { tenantId, orgId, branchId }.
 * Throws { statusCode } on unknown ids, hierarchy violations, or missing
 * tenant when enforcement is on. Never throws when nothing was provided
 * and enforcement is off (legacy single-tenant passthrough).
 */
export function assertTenantScope(req) {
  const ctx = tenantContext(req);
  if (ctx.tenantId) {
    const t = db.prepare('SELECT id FROM tenants WHERE id=? AND is_active=1').get(ctx.tenantId);
    if (!t) throw Object.assign(new Error('المستأجر غير موجود أو موقف'), { statusCode: 404 });
  }
  if (ctx.orgId) {
    const o = db.prepare('SELECT id, tenant_id FROM organizations WHERE id=? AND is_active=1').get(ctx.orgId);
    if (!o) throw Object.assign(new Error('المؤسسة غير موجودة أو موقفة'), { statusCode: 404 });
    if (ctx.tenantId && String(o.tenant_id) !== ctx.tenantId) {
      throw Object.assign(new Error('المؤسسة لا تتبع هذا المستأجر'), { statusCode: 400 });
    }
    if (!ctx.tenantId) ctx.tenantId = String(o.tenant_id) || null;
  }
  if (ctx.branchId) {
    const br = db.prepare('SELECT id, org_id, tenant_id FROM branches WHERE id=? AND is_active=1').get(ctx.branchId);
    if (!br) throw Object.assign(new Error('الفرع غير موجود أو موقف'), { statusCode: 404 });
    if (ctx.orgId && String(br.org_id) !== ctx.orgId) {
      throw Object.assign(new Error('الفرع لا يتبع هذه المؤسسة'), { statusCode: 400 });
    }
    if (!ctx.orgId) ctx.orgId = String(br.org_id) || null;
    if (ctx.tenantId && br.tenant_id && String(br.tenant_id) !== ctx.tenantId) {
      throw Object.assign(new Error('الفرع لا يتبع هذا المستأجر'), { statusCode: 400 });
    }
    if (!ctx.tenantId && br.tenant_id) ctx.tenantId = String(br.tenant_id);
  }
  // Cross-tenant spoof guard (security campaign): a user bound to a tenant
  // can never act as another tenant — neither via an explicit X-Tenant-Id nor
  // via ids derived from the org/branch hierarchy. Legacy users (tenant_id NULL)
  // keep the documented passthrough; enforcement is opt-in (REQUIRE_TENANT).
  if (ctx.tenantId && req.user?.tenantId && String(ctx.tenantId) !== String(req.user.tenantId)) {
    throw Object.assign(new Error('غير مصرح بالوصول لهذا المستأجر'), { statusCode: 403 });
  }
  if (REQUIRED() && !ctx.tenantId) {
    throw Object.assign(new Error('المستأجر مطلوب (DYPOS_REQUIRE_TENANT=1) — أرسل X-Tenant-Id'), { statusCode: 400 });
  }
  return ctx;
}

export function requireTenantEnabled() {
  return REQUIRED();
}

/**
 * Read-only scope for list endpoints: validates a PROVIDED tenant id (404 if
 * unknown) but never requires one — reads stay open, writes enforce.
 */
export function resolveTenantFilter(req) {
  const { tenantId } = tenantContext(req);
  if (!tenantId) return { tenantId: null };
  const t = db.prepare('SELECT id FROM tenants WHERE id=? AND is_active=1').get(tenantId);
  if (!t) throw Object.assign(new Error('المستأجر غير موجود أو موقف'), { statusCode: 404 });
  return { tenantId };
}

/**
 * Cross-tenant IDOR guard for by-id reads/writes (billions-scale security).
 * - Legacy rows without a tenant: visible to all (single-tenant compat).
 * - Requests without tenant context: passthrough (unless REQUIRE_TENANT).
 * - Otherwise a mismatch is 404 (not 403) to avoid leaking existence.
 */
export function assertRecordTenant(req, record, field = 'tenant_id') {
  if (!record) return;
  const recTenant = record[field] ? String(record[field]) : null;
  if (!recTenant) return;
  const { tenantId } = tenantContext(req);
  if (!tenantId) return;
  if (tenantId !== recTenant) throw Object.assign(new Error('غير موجود'), { statusCode: 404 });
}

export default { tenantContext, assertTenantScope, resolveTenantFilter, assertRecordTenant, requireTenantEnabled };
