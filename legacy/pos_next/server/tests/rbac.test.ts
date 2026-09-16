import { describe, it, expect } from "vitest";
import { checkPermission, permissionsForRole, ROLE_DEFINITIONS, PERMISSIONS } from "../_core/rbac";

describe("RBAC", () => {
  it("should have all permission keys defined", () => {
    expect(Object.keys(PERMISSIONS).length).toBeGreaterThan(0);
  });

  it("should define role permissions", () => {
    expect(Object.keys(ROLE_DEFINITIONS).length).toBeGreaterThan(0);
  });

  it("owner role should have all permissions", () => {
    expect(ROLE_DEFINITIONS.owner.length).toBe(Object.keys(PERMISSIONS).length);
  });

  it("should check permission for a role", () => {
    const ctx = { user: { role: "admin" }, tenantId: 1, isSuperAdmin: false } as any;
    expect(checkPermission(ctx, "POS_CREATE")).toBe(true);
  });

  it("viewer role should not have POS_CREATE", () => {
    const ctx = { user: { role: "viewer" }, tenantId: 1, isSuperAdmin: false } as any;
    expect(checkPermission(ctx, "POS_CREATE")).toBe(false);
  });
});
