import { randomBytes, scrypt, timingSafeEqual, createHmac, createHash } from "crypto";
import { promisify } from "util";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./env";
import type { TrpcContext } from "./context";

const scryptAsync = promisify(scrypt);
const scryptN = 16384;
const scryptR = 8;
const scryptP = 1;
const scryptKeyLen = 64;

export interface JwtPayload {
  sub: string;
  tenantId?: number;
  role?: string;
  sessionId?: string;
  jti?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: number;
  refreshTokenExpiry: number;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, scryptKeyLen, { N: scryptN, r: scryptR, p: scryptP })) as Buffer;
  return `scrypt$N=${scryptN}$$r=${scryptR}$$p=${scryptP}$$salt=${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  const saltPart = parts.find(p => p.startsWith("salt="));
  const hashPart = parts.find(p => p.startsWith("") && parts.indexOf(p) > 3);
  const salt = saltPart?.split("=")[1];
  const hash = parts[parts.length - 1];
  if (!salt || !hash) return false;
  const derived = (await scryptAsync(password, salt, scryptKeyLen, { N: scryptN, r: scryptR, p: scryptP })) as Buffer;
  const hashBuf = Buffer.from(hash, "hex");
  if (hashBuf.length !== derived.length) return false;
  return timingSafeEqual(hashBuf, derived);
}

export async function generateTokens(payload: JwtPayload): Promise<TokenPair> {
  const now = Math.floor(Date.now() / 1000);
  const accessExpiry = now + Math.floor(ENV.jwtExpiry / 1000 * 0.1);
  const refreshExpiry = now + ENV.jwtExpiry;

  const accessToken = await new SignJWT({ ...payload, jti: randomBytes(16).toString("hex") })
    .setProtectedHeader({ alg: ENV.jwtAlgorithm })
    .setIssuedAt()
    .setIssuer("smartports-pos")
    .setExpirationTime("15m")
    .setSubject(payload.sub)
    .sign(Buffer.from(ENV.jwtSecret));

  const refreshToken = await new SignJWT({ sub: payload.sub, tenantId: payload.tenantId, role: payload.role })
    .setProtectedHeader({ alg: ENV.jwtAlgorithm })
    .setIssuedAt()
    .setIssuer("smartports-pos")
    .setExpirationTime(ENV.jwtExpiry + "s")
    .setSubject(payload.sub)
    .sign(Buffer.from(ENV.jwtSecret));

  return { accessToken, refreshToken, accessTokenExpiry: accessExpiry, refreshTokenExpiry: refreshExpiry };
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  try {
    const { payload } = await jwtVerify(token, Buffer.from(ENV.jwtSecret), {
      issuer: "smartports-pos",
      algorithms: [ENV.jwtAlgorithm],
    });
    return payload as JwtPayload;
  } catch {
    throw new Error("INVALID_TOKEN");
  }
}

export async function verifyRefreshToken(token: string): Promise<JwtPayload> {
  try {
    const { payload } = await jwtVerify(token, Buffer.from(ENV.jwtSecret), {
      issuer: "smartports-pos",
      algorithms: [ENV.jwtAlgorithm],
    });
    return payload as JwtPayload;
  } catch {
    throw new Error("INVALID_REFRESH_TOKEN");
  }
}

export function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}

export function generateHMAC(data: string): string {
  return createHmac("sha256", ENV.jwtSecret).update(data).digest("hex");
}

export function generateDeviceFingerprint(userAgent: string, ip: string): string {
  const raw = `${userAgent}|${ip}`;
  return createHash("sha256").update(raw).digest("hex").substring(0, 32);
}

export async function authenticateRequest(req: Request): Promise<TrpcContext["user"] | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const payload = await verifyAccessToken(token);
    const db = await getDb();
    if (!db) return null;
    const { users } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const row = await db.select().from(users).where(eq(users.openId, payload.sub)).limit(1);
    return row.length > 0 ? row[0] : null;
  } catch {
    return null;
  }
}

import { getDb } from "./db";
import type { TrpcContext } from "./context";
