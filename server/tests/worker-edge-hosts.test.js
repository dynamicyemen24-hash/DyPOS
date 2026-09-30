import test from "node:test"
import assert from "node:assert/strict"
import { isSelfProxy } from "../../worker-edge-hosts.mjs"

test("isSelfProxy flags every alias of the edge, and only those", () => {
  // The exact custom domain.
  assert.equal(isSelfProxy("dypos.smartportssoft.com", new URL("https://dypos.smartportssoft.com/api")), true)
  // The workers.dev-style alias pointing back at the same worker.
  assert.equal(isSelfProxy("dypos.smartportssoft.com", new URL("https://dypos-api.smartportssoft.com/api")), true)
  // Whatever hostname served this request.
  assert.equal(isSelfProxy("other.example.com", new URL("https://other.example.com/api")), true)
  // A genuinely external backend is not a loop.
  assert.equal(isSelfProxy("dypos.smartportssoft.com", new URL("https://api.example.com")), false)
  assert.equal(isSelfProxy("dypos.smartportssoft.com", new URL("https://10.0.0.5:3002")), false)
})