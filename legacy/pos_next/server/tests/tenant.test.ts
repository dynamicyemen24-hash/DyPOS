import { describe, it, expect } from "vitest";
import { requireTenantId, resolveTenantId } from "../_core/tenant";
import { TRPCError } from "@trpc/server";

describe("Tenant Isolation", () => {
  it("requireTenantId should throw when tenantId is null", () => {
    expect(() => requireTenantId({ tenantId: null })).toThrow(TRPCError);
  });

  it("requireTenantId should return tenantId when valid", () => {
    expect(requireTenantId({ tenantId: 1 })).toBe(1);
  });

  it("resolveTenantId should return user tenant for regular user", () => {
    const user = { openId: "user@smartports.com", tenantId: 5, role: "user" };
    const result = resolveTenantId(user, { headers: () => null } as any);
    expect(result.tenantId).toBe(5);
    expect(result.isSuperAdmin).toBe(false);
  });

  it("resolveTenantId should set isSuperAdmin for owner", () => {
    const user = { openId: "owner@smartports.com", tenantId: 1, role: "owner" };
    const result = resolveTenantId(user, { headers: () => null } as any);
    expect(result.isSuperAdmin).toBe(true);
  });
});
