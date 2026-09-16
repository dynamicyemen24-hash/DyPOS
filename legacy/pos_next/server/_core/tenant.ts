import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import type { TrpcContext } from "./context";

export function requireTenantId(ctx: { tenantId: number | null }): number {
  if (ctx.tenantId == null) {
    throw new TRPCError({ code: "FORBIDDEN", message: "TENANT_REQUIRED: هذا الإجراء يتطلب ارتباط المستخدم بمؤسسة نشطة" });
  }
  return ctx.tenantId;
}

export function isOwner(ctx: TrpcContext): boolean {
  return !!ctx.user && ctx.user.openId === ENV.ownerOpenId;
}

export function requireOwner(ctx: TrpcContext): void {
  if (!isOwner(ctx)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "SUPER_ADMIN_REQUIRED: الإجراء متاح لمالك المنصة فقط" });
  }
}

export function resolveTenantId(user: TrpcContext["user"], req: Request): { tenantId: number | null; isSuperAdmin: boolean } {
  if (!user) return { tenantId: null, isSuperAdmin: false };
  if (user.openId !== ENV.ownerOpenId) return { tenantId: user.tenantId ?? null, isSuperAdmin: false };
  const headerVal = req.headers.get("x-tenant-id");
  if (typeof headerVal === "string") {
    const parsed = Number.parseInt(headerVal, 10);
    if (Number.isInteger(parsed) && parsed > 0) return { tenantId: parsed, isSuperAdmin: true };
  }
  return { tenantId: user.tenantId ?? null, isSuperAdmin: true };
}

export async function enforceSuperAdminTenantExists(ctx: { tenantId: number | null; isSuperAdmin: boolean }, db: any): Promise<void> {
  if (!ctx.isSuperAdmin || !ctx.tenantId) return;
  const { tenants } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
  if (rows.length === 0) throw new Error(`المستأجر #${ctx.tenantId} غير موجود`);
}
