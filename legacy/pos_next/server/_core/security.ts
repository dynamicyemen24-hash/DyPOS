import helmet from "helmet";
import type { Request, Response, NextFunction } from "express";
import { ENV } from "./env";

export function securityHeaders() {
  return [
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'", ENV.appUrl],
          mediaSrc: ["'self'"],
          objectSrc: ["'none'"],
          childSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
      xssFilter: true,
      noSniff: true,
      frameguard: { action: "deny" },
      hidePoweredBy: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      contentTypeOptions: true,
    }),
  ];
}

export function corsMiddleware(origin: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Tenant-Id,Idempotency-Key");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-csrf-token"] as string;
  if (!token || token.length < 32) return res.status(403).json({ error: "CSRF token missing" });
  next();
}

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const idempotencyKey = req.headers["idempotency-key"] as string;
  if (!idempotencyKey) return next();
  (req as any).idempotencyKey = idempotencyKey;
  next();
}

export function requestSizeLimiter(maxSizeBytes = 10 * 1024 * 1024) {
  return (req: Request, res: Response, next: NextFunction) => {
    const len = parseInt(req.headers["content-length"] || "0", 10);
    if (len > maxSizeBytes) return res.status(413).json({ error: "Request entity too large" });
    next();
  };
}

export function sanitizeInput(input: string): string {
  return input.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "").replace(/on\w+=/gi, "").trim();
}

export function auditLogAction(req: Request, action: string, details: string) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
  console.log(`[AUDIT] ${new Date().toISOString()} | ${action} | IP: ${ip} | ${details}`);
}
