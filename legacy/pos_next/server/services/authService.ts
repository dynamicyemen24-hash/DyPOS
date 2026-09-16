import { TRPCError } from "@trpc/server";
import { hashPassword, verifyPassword, generateTokens, verifyAccessToken } from "../_core/auth";
import { getDb } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { ENV } from "../_core/env";

interface RegisterInput {
  name: string;
  username: string;
  password: string;
  email?: string;
  tenantId?: number;
  role?: string;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: any;
}

export async function registerUser(input: RegisterInput) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const existing = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
  if (existing.length > 0) {
    throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
  }

  const passwordHash = await hashPassword(input.password);
  const tenantId = input.tenantId ?? 1;
  const role = input.role ?? "user";

  const [user] = await db.insert(users).values({
    openId: `local:${input.username}`,
    tenantId,
    username: input.username,
    name: input.name,
    email: input.email ?? null,
    passwordHash,
    role,
    lastSignedIn: new Date(),
  }).returning();

  return user;
}

export async function loginUser(username: string, password: string): Promise<LoginResult> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });

  const tokens = await generateTokens({
    sub: user.openId,
    tenantId: user.tenantId,
    role: user.role,
    sessionId: randomBytes(32).toString("hex"),
    jti: randomBytes(16).toString("hex"),
  });

  const safeUser = { ...user, passwordHash: undefined };
  return { ...tokens, user: safeUser };
}

export async function logoutUser(sessionId: string) {
  return { success: true };
}

export async function refreshTokens(refreshToken: string) {
  const payload = await verifyAccessToken(refreshToken);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const [user] = await db.select().from(users).where(eq(users.openId, payload.sub)).limit(1);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });

  const tokens = await generateTokens({
    sub: user.openId,
    tenantId: user.tenantId,
    role: user.role,
    sessionId: randomBytes(32).toString("hex"),
    jti: randomBytes(16).toString("hex"),
  });

  return tokens;
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });

  const newHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));

  return { success: true };
}
