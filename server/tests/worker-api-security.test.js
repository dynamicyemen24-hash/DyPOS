import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

// The repo root declares `"type": "commonjs"`, so a plain `import` of
// worker-api.js would be loaded as CommonJS and die on its first `import`
// token — the security suite simply could not run. The worker itself is an ES
// module (Wrangler treats it as one), so it is loaded here the same way
// Wrangler does: read the source and evaluate it as an ES module. The
// relative "./worker-edge-hosts.mjs" import inside it is rewritten to an
// absolute file:// URL so the data-URL module can resolve it.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const workerPath = resolve(ROOT, "worker-api.js")
const hostsUrl = new URL(`file:///${resolve(ROOT, "worker-edge-hosts.mjs").replace(/\\/g, "/")}`).href
const source = readFileSync(workerPath, "utf8").replace(
  /from\s+"\.\/worker-edge-hosts\.mjs"/,
  `from "${hostsUrl}"`,
)
const { default: worker } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
)

const originalFetch = globalThis.fetch

async function request(path, init = {}, env = { BACKEND_URL: "https://backend.example.test" }) {
  return worker.fetch(new Request(`https://dypos.smartportssoft.com${path}`, init), env)
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test("edge health exposes the gateway release version and stays deterministic", async () => {
  const response = await request("/api/edge-health")
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.status, "ok")
  assert.equal(body.version, "1.40.0")
})

test("edge forwards authentication to the authoritative backend", async () => {
  let seen
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), init }
    return new Response(JSON.stringify({ user: { role: "CASHIER" }, authenticated: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  const response = await request("/api/auth/user", {
    headers: { Authorization: "Bearer real-backend-token" },
  })

  assert.equal(response.status, 200)
  assert.equal(seen.url, "https://backend.example.test/api/auth/user")
  assert.equal(seen.init.headers.get("Authorization"), "Bearer real-backend-token")
  assert.equal(seen.init.headers.get("X-DyPOS-Edge"), "cloudflare-worker")
})

test("edge refuses to proxy to itself instead of looping", async () => {
  // BACKEND_URL pointing at this worker's own host is a request loop: every
  // /api/* call would be forwarded back to the edge. It must fail fast and say
  // so, rather than surfacing as an unexplained 503 for the whole API.
  const response = await request(
    "/api/auth/user",
    { headers: { Authorization: "Bearer real-backend-token" } },
    { BACKEND_URL: "https://dypos-api.smartportssoft.com" },
  )

  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.code, "UPSTREAM_MISCONFIGURED")
  assert.match(body.detail, /resolves to this worker/)
})

test("edge reports readiness and refuses to look healthy without the D1 binding", async () => {
  // The schema migrations (v23 → v28) run through `dypos_db`. An earlier
  // revision removed the binding and turned the worker into a pure proxy, which
  // silently disabled every pending migration at deploy time.
  const withBinding = await request("/api/ready", {}, { BACKEND_URL: "https://backend.example.test", dypos_db: {} })
  assert.equal(withBinding.status, 200)
  const bound = await withBinding.json()
  assert.equal(bound.status, "ready")
  assert.equal(bound.database_bound, true)
  assert.match(bound.version, /^\d+\.\d+\.\d+$/)

  const withoutBinding = await request("/api/ready", {}, { BACKEND_URL: "https://backend.example.test" })
  assert.equal(withoutBinding.status, 503)
  const unbound = await withoutBinding.json()
  assert.equal(unbound.code, "DATABASE_UNBOUND")
})

test("edge never fabricates registration success when the backend is unavailable", async () => {
  globalThis.fetch = async () => {
    throw new Error("upstream down")
  }

  const response = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "attacker", password: "not-a-real-user" }),
  })

  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.code, "UPSTREAM_UNAVAILABLE")
})

test("edge proxies sync writes instead of claiming local persistence", async () => {
  let seenBody = ""
  globalThis.fetch = async (_url, init) => {
    seenBody = await new Response(init.body).text()
    return new Response(JSON.stringify({ message: { accepted: true, operation_id: "op-1" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  const response = await request("/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: [{ type: "sale", id: "op-1" }] }),
  })

  assert.equal(response.status, 200)
  assert.match(seenBody, /op-1/)
})
