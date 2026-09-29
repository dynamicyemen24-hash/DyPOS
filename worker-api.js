/**
 * DyPOS API Edge Gateway
 *
 * The authoritative application/data layer lives behind BACKEND_URL.
 * This worker is deliberately a thin same-origin security/routing boundary:
 * it must never impersonate users, persist fake sales, or report successful
 * writes when the authoritative backend did not commit them.
 */

const API_VERSION = "1.40.0";
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
    const requestOrigin = request.headers.get("Origin");
    const corsHeaders = {
      "Access-Control-Allow-Origin": requestOrigin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : ALLOWED_ORIGIN,
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

    const backendBase = String(env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
    let backend;
    try {
      backend = new URL(backendBase);
    } catch {
      return json({ error: "API backend configuration is invalid" }, 500, corsHeaders);
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
