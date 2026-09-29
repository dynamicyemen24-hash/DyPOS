import test from "node:test"
import assert from "node:assert/strict"

import worker from "../../worker-api.js"

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
