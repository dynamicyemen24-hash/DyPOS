import test from "node:test"
import assert from "node:assert/strict"

import worker from "../../worker-api.js"

async function request(path, init = {}) {
  return worker.fetch(new Request(`https://dypos.smartportssoft.com${path}`, init), {})
}

test("edge health exposes the release version and stays deterministic", async () => {
  const response = await request("/api/health")
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.status, "ok")
  assert.equal(body.version, "1.40.0")
})

test("edge auth never upgrades an arbitrary token to ADMIN", async () => {
  const response = await request("/api/auth/user", {
    headers: { Authorization: "Bearer attacker-controlled-value" },
  })
  assert.equal(response.status, 501)
  const body = await response.json()
  assert.match(body.error, /authoritative backend/i)
})

test("edge registration does not accept demo registrations", async () => {
  const response = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "attacker", password: "not-a-real-user" }),
  })
  assert.equal(response.status, 501)
})

test("edge sync never reports fake successful persistence", async () => {
  const response = await request("/api/sync/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operations: [{ type: "sale", id: "fake" }] }),
  })
  assert.equal(response.status, 501)
})
