const buckets = new Map<string, number[]>();
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, hits] of Array.from(buckets.entries())) {
    const newest = hits[hits.length - 1] ?? 0;
    if (now - newest > 60 * 60 * 1000) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: boolean; retryAfterSec: number; remaining: number };

export function checkRateLimit(key: string, max: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  sweep(now);
  const hits = buckets.get(key) ?? [];
  const windowStart = now - windowMs;
  const recent = hits.filter(t => t > windowStart);
  if (recent.length >= max) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, recent);
    return { ok: false, retryAfterSec, remaining: 0 };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { ok: true, retryAfterSec: 0, remaining: max - recent.length };
}

export function resetRateLimits() { buckets.clear(); }

export function rateLimitMiddleware(max = 100, windowMs = 60000) {
  return (req: Request, res: Response, next: Function) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || req.ip || "unknown";
    const tenantId = (req as any).tenantId;
    const key = `rl:${ip}:${tenantId ?? "global"}`;
    const result = checkRateLimit(key, max, windowMs);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));
    res.setHeader("X-RateLimit-Reset", String(Date.now() + windowMs));
    if (!result.ok) {
      res.setHeader("Retry-After", String(result.retryAfterSec));
      return next({ status: 429, body: JSON.stringify({ error: "Too Many Requests", retryAfter: result.retryAfterSec }) });
    }
    next();
  };
}
