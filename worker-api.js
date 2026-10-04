/**
 * DyPOS API Edge Gateway
 *
 * The worker is a same-origin security/routing boundary. It must never
 * impersonate users, persist fake sales, or report successful writes that the
 * authoritative backend did not commit.
 *
 * Two properties are load-bearing and both are covered by tests:
 *
 *  1. NO SELF-PROXY. `BACKEND_URL` historically pointed at this worker's own
 *     host, so every /api/* request was proxied to itself. The result was a
 *     request loop that surfaced as a flat 503 for the whole API. The upstream
 *     is now resolved and rejected up front when it is the edge itself.
 *
 *  2. D1 STAYS BOUND. The schema migrations (v23 → v28) run through the
 *     `dypos_db` binding; dropping it (as an earlier revision did) silently
 *     disables every pending migration, so invoices would be written against an
 *     un-upgraded schema. `/api/ready` reports the bound version so a deploy
 *     that lost the binding cannot look healthy.
 */

// `.mjs` is mandatory here: the repo root declares `"type": "commonjs"`, so a
// sibling `.js` ES module would be loaded as CommonJS by Node (the security
// test suite) while Wrangler still treats it as ESM.
import { isSelfProxy } from "./worker-edge-hosts.mjs";

// Kept in lockstep with server/lib/version.js by POS/tests/versionDrift.test.js
// — a literal here is a FIFTH place the version lives, and it went stale
// (1.44.2 while the release was 1.44.3) precisely because nothing checked it.
// The edge reports this value on /api/edge-health; customers see it.
const API_VERSION = "1.45.1";
const DEFAULT_BACKEND_URL = "https://dypos-api.smartportssoft.com";
const ALLOWED_ORIGIN = "https://dypos.smartportssoft.com";
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // A single fixed origin: the PWA is served from the same origin, so echoing
    // an arbitrary `Origin` back would only widen the attack surface. The
    // previous revision wrote a ternary whose two branches were identical,
    // which read like an allowlist check but was not one.
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Content-Type, Authorization, X-DyPOS-CSRF-Token, X-Request-Id",
      "Access-Control-Expose-Headers": "X-Request-Id, Retry-After",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Keep a deterministic edge health endpoint for routing diagnostics.
    // The authoritative /api/health is proxied below and is the release gate.
    if (url.pathname === "/api/edge-health") {
      return json(
        {
          status: "ok",
          service: "dypos-api-edge",
          version: API_VERSION,
        },
        200,
        corsHeaders,
      );
    }

    // Readiness is answered by the EDGE itself, never proxied: it must describe
    // this deployment, and a proxied answer could not report on our own bindings.
    // The D1 check is deliberate — losing the binding disables every pending
    // migration (v23 → v28), which is a broken release, not a healthy one.
    if (url.pathname === "/api/ready" || url.pathname === "/ready") {
      if (!env.dypos_db) {
        return json(
          {
            error: "D1 binding is missing; pending schema migrations cannot run",
            code: "DATABASE_UNBOUND",
            version: API_VERSION,
          },
          503,
          corsHeaders,
        );
      }
      return json(
        {
          status: "ready",
          version: API_VERSION,
          service: "dypos-api-edge",
          database_bound: true,
          timestamp: new Date().toISOString(),
        },
        200,
        corsHeaders,
      );
    }

    const backendBase = String(env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
    let backend;
    try {
      backend = new URL(backendBase);
    } catch {
      return json({ error: "API backend configuration is invalid" }, 500, corsHeaders);
    }

    // Fail loudly and immediately instead of proxying the edge to itself. A
    // request loop is worse than an outage to diagnose: every endpoint returns
    // the same 503 and the log shows no upstream host at all.
    if (isSelfProxy(url.host, backend)) {
      return json(
        {
          error: "API upstream is not configured",
          code: "UPSTREAM_MISCONFIGURED",
          detail: `BACKEND_URL (${backend.origin}) resolves to this worker (${url.host}). Point it at the authoritative backend.`,
          version: API_VERSION,
        },
        503,
        corsHeaders,
      );
    }

    const target = new URL(url.pathname + url.search, backend);
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.set("X-DyPOS-Edge", "cloudflare-worker");

    for (const name of HOP_BY_HOP) headers.delete(name);

    const requestId = request.headers.get("X-Request-Id") || crypto.randomUUID();
    headers.set("X-Request-Id", requestId);

    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
      });

      const responseHeaders = new Headers(upstream.headers);
      for (const name of HOP_BY_HOP) responseHeaders.delete(name);
      for (const [key, value] of Object.entries(corsHeaders)) responseHeaders.set(key, value);
      responseHeaders.set("X-Request-Id", requestId);

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error("Authoritative backend unavailable", {
        requestId,
        path: url.pathname,
        error: String(error?.message || error),
      });

      return json(
        {
          error: "الخدمة الخلفية غير متاحة حاليًا",
          code: "UPSTREAM_UNAVAILABLE",
          request_id: requestId,
        },
        503,
        corsHeaders,
      );
    }
  },
};

function json(data, status, headers) {
  const out = new Headers(headers);
  out.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: out });
}
