import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hashPassword, verifyPassword } from "../_core/auth";
import { generateTokens, verifyAccessToken } from "../_core/auth";
import { ENV } from "../_core/env";

describe("Auth Service", () => {
  it("should hash and verify password", async () => {
    const password = "testPassword123";
    const hash = await hashPassword(password);
    expect(hash.startsWith("scrypt$")).toBe(true);
    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);
  });

  it("should reject wrong password", async () => {
    const hash = await hashPassword("correctPassword");
    const valid = await verifyPassword("wrongPassword", hash);
    expect(valid).toBe(false);
  });

  it("should generate and verify JWT tokens", async () => {
    const tokens = await generateTokens({
      sub: "test-user",
      tenantId: 1,
      role: "admin",
    });
    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    const payload = await verifyAccessToken(tokens.accessToken);
    expect(payload.sub).toBe("test-user");
  });

  it("should require JWT_SECRET of minimum 32 chars", () => {
    expect(ENV.jwtSecret.length).toBeGreaterThanOrEqual(32);
  });
});
