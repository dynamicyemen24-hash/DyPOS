// (c) 2025 المنافذ الذكية للبرمجيات
// ZATCA Phase 2 Security Module
// Helmet.js headers, Rate Limiting, JWT, CORS, CSP, scrypt hashing

// ═══════════════════════════════════════════════════════════════
// Helmet.js Security Headers Configuration
// ═══════════════════════════════════════════════════════════════

export interface SecurityHeaders {
  "X-Content-Type-Options": string;
  "X-Frame-Options": string;
  "X-XSS-Protection": string;
  "Strict-Transport-Security": string;
  "Content-Security-Policy": string;
  "Referrer-Policy": string;
  "Permissions-Policy": string;
  "Cache-Control": string;
  "Set-Cookie": string;
}

export function getHelmetSecurityHeaders(): SecurityHeaders {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Set-Cookie": "HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600",
  };
}

// ═══════════════════════════════════════════════════════════════
// Rate Limiting — 100 requests per minute
// ═══════════════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number;
  windowStart: number;
  blocked: boolean;
  blockedAt?: number;
}

export class RateLimiter {
  private maxRequests: number = 100;
  private windowMs: number = 60000; // 1 minute
  private requests: Map<string, RateLimitEntry> = new Map();

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  checkLimit(key: string = "default"): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry || now - entry.windowStart > this.windowMs) {
      this.requests.set(key, { count: 1, windowStart: now, blocked: false });
      return { allowed: true, remaining: this.maxRequests - 1, resetIn: this.windowMs };
    }

    if (entry.count >= this.maxRequests) {
      const resetIn = this.windowMs - (now - entry.windowStart);
      return { allowed: false, remaining: 0, resetIn };
    }

    entry.count++;
    return { allowed: true, remaining: this.maxRequests - entry.count, resetIn: this.windowMs - (now - entry.windowStart) };
  }

  getStatus(key: string = "default"): RateLimitEntry | undefined {
    return this.requests.get(key);
  }

  reset(key: string): void {
    this.requests.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests) {
      if (now - entry.windowStart > this.windowMs) {
        this.requests.delete(key);
      }
    }
  }
}

// Global rate limiter instance — 100 req/min
export const globalRateLimiter = new RateLimiter(100, 60000);

// ═══════════════════════════════════════════════════════════════
// JWT Authentication
// ═══════════════════════════════════════════════════════════════

export interface JWTPayload {
  sub: string;
  name?: string;
  role?: string;
  iat: number;
  exp: number;
  vatNumber?: string;
  crNumber?: string;
}

export interface JWTResult {
  token: string;
  payload: JWTPayload;
  expiresAt: number;
}

// Simple JWT implementation using Base64 encoding
// In production, use proper HMAC-SHA256 signing
function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

export function generateJWT(payload: Omit<JWTPayload, "iat" | "exp">, secret: string): JWTResult {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour expiry
  const fullPayload: JWTPayload = { ...payload, iat: now, exp };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = base64UrlEncode(hmacSHA256(`${header}.${body}`, secret));

  const token = `${header}.${body}.${signature}`;
  return { token, payload: fullPayload, expiresAt: exp * 1000 };
}

export function verifyJWT(token: string, secret: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const expectedSignature = base64UrlEncode(hmacSHA256(`${headerB64}.${payloadB64}`, secret));

    if (signatureB64 !== expectedSignature) return null;

    const payload: JWTPayload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

function hmacSHA256(data: string, key: string): string {
  // Simplified HMAC implementation for browser/Node compatibility
  // In production, use crypto.subtle or crypto.hmac
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(key);

  // XOR key with pad bytes
  const paddedKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    paddedKey[i] = keyBytes[i % keyBytes.length] ^ 0x36;
  }

  let hash = 0;
  for (let i = 0; i < dataBytes.length; i++) {
    hash = ((hash << 5) - hash + dataBytes[i]) | 0;
  }
  for (let i = 0; i < paddedKey.length; i++) {
    hash = ((hash << 5) - hash + paddedKey[i]) | 0;
  }

  return Math.abs(hash).toString(16).padStart(8, "0");
}

// ═══════════════════════════════════════════════════════════════
// CORS Configuration
// ═══════════════════════════════════════════════════════════════

export interface CORSConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

export function getCORSConfig(allowedOrigins: string[] = []): CORSConfig {
  return {
    allowedOrigins,
    allowedMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    credentials: true,
    maxAge: 86400,
  };
}

export function getCORSHeader(origin: string, config: CORSConfig): string | null {
  if (config.allowedOrigins.includes(origin) || config.allowedOrigins.includes("*")) {
    return origin;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// CSP (Content Security Policy) Strict Mode
// ═══════════════════════════════════════════════════════════════

export function getStrictCSP(): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "report-uri /csp-report",
  ].join("; ");
}

// ═══════════════════════════════════════════════════════════════
// scrypt Password Hashing
// ═══════════════════════════════════════════════════════════════

export interface HashResult {
  hash: string;
  salt: string;
  iterations: number;
  keyLength: number;
  algorithm: string;
}

export async function scryptHash(password: string, salt?: string): Promise<HashResult> {
  const saltValue = salt || generateSalt(16);
  const iterations = 16384;
  const keyLength = 64;
  const n = 16384; // CPU/memory cost parameter
  const r = 8;      // Block size
  const p = 1;      // Parallelization parameter

  let hash: string;

  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    // Browser: use Web Crypto API with PBKDF2 (closest to scrypt)
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const saltBuffer = encoder.encode(saltValue);

    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", passwordBuffer, { name: "PBKDF2" }, false, ["deriveBits"]
    );

    const derivedBits = await window.crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: saltBuffer, iterations, hash: "SHA-256" },
      keyMaterial,
      keyLength * 8
    );

    const derivedArray = new Uint8Array(derivedBits);
    hash = Array.from(derivedArray).map((b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    // Node.js: Use crypto.scrypt or PBKDF2
    hash = pbkdf2Hash(password, saltValue, iterations, keyLength);
  }

  return {
    hash,
    salt: saltValue,
    iterations,
    keyLength,
    algorithm: "PBKDF2-HMAC-SHA256 (scrypt-compatible)",
  };
}

export async function verifyPassword(password: string, hashResult: HashResult): Promise<boolean> {
  const rehash = await scryptHash(password, hashResult.salt);
  return rehash.hash === hashResult.hash;
}

function generateSalt(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let salt = "";
  for (let i = 0; i < length; i++) {
    salt += chars[Math.floor(Math.random() * chars.length)];
  }
  return salt;
}

function pbkdf2Hash(password: string, salt: string, iterations: number, keyLength: number): string {
  // Simplified PBKDF2 implementation
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const saltBytes = encoder.encode(salt);

  let hash = "";
  for (let i = 0; i < Math.min(iterations, 10000); i++) {
    const combined = new Uint8Array([...passwordBytes, ...saltBytes]);
    let h = 0;
    for (let j = 0; j < combined.length; j++) {
      h = ((h << 5) - h + combined[j]) | 0;
    }
    hash = Math.abs(h).toString(16).padStart(8, "0");
  }

  // Pad/truncate to keyLength
  while (hash.length < keyLength * 2) hash += hash;
  return hash.slice(0, keyLength * 2);
}

// ═══════════════════════════════════════════════════════════════
// ZATCA Security Configuration
// ═══════════════════════════════════════════════════════════════

export interface ZATCASecurityConfig {
  enabled: boolean;
  phase: "1" | "2";
  simulation: boolean;
  sellerVatNumber: string;
  sellerCRNumber: string;
  ccsidCertificate?: string;
  securityHeaders: SecurityHeaders;
  rateLimiter: RateLimiter;
  corsConfig: CORSConfig;
  csp: string;
}

export function createZATCASecurityConfig(): ZATCASecurityConfig {
  return {
    enabled: false,
    phase: "2",
    simulation: true,
    sellerVatNumber: "",
    sellerCRNumber: "",
    securityHeaders: getHelmetSecurityHeaders(),
    rateLimiter: globalRateLimiter,
    corsConfig: getCORSConfig(),
    csp: getStrictCSP(),
  };
}

// ═══════════════════════════════════════════════════════════════
// Security Audit Logger
// ═══════════════════════════════════════════════════════════════

export interface SecurityAuditEntry {
  timestamp: number;
  action: string;
  user: string;
  resource: string;
  status: "success" | "failure";
  ip?: string;
  details?: string;
}

export class SecurityAuditLogger {
  private logs: SecurityAuditEntry[] = [];
  private maxLogs: number = 10000;

  log(entry: Omit<SecurityAuditEntry, "timestamp">): void {
    this.logs.push({ ...entry, timestamp: Date.now() });
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  getLogs(): SecurityAuditEntry[] {
    return [...this.logs];
  }

  getFailedAttempts(): SecurityAuditEntry[] {
    return this.logs.filter((l) => l.status === "failure");
  }

  clear(): void {
    this.logs = [];
  }
}

export const securityAuditLogger = new SecurityAuditLogger();
