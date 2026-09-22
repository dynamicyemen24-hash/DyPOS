/**
 * DyPOS API Smoke — runs TODAY (no browser binary required).
 *
 * This is the wiring-proof for the whole dev stack: every request goes to
 * http://localhost:8080 (the vite origin) and through the proxy to the Node
 * backend on :8000 — the exact path a real cashier's browser takes. CI keeps
 * this file as the gatekeeper; the richer UI specs in auth/sale/offline/print
 * are deferred until the Frappe-compat layer lands (see QA_ENGINEERING.md).
 *
 * Contract verified here:
 *   register (bootstrap ADMIN) → wrong-password 401 → login 200 →
 *   /auth/me 200 → product 201 → invoice 201 (taxed) → idempotent replay
 *   (deduped, same id) → /reports/summary reflects the order → logout →
 *   token dead (401).
 */
const { test, expect } = require("playwright/test")

const USERNAME = `smoke_${Date.now()}`
const PASSWORD = "Smoke1234"
let productId
let invoiceId

test.describe
	.serial("DyPOS REST API (through the :8080→:8000 stack)", () => {
		test("bootstrap register promotes the first user to ADMIN", async ({
			request,
		}) => {
			const res = await request.post("/api/auth/register", {
				data: {
					username: USERNAME,
					password: PASSWORD,
					fullName: "Smoke Admin",
					role: "ADMIN",
				},
			})
			expect(res.status()).toBe(201)
			const body = await res.json()
			expect(body.role).toBe("ADMIN")
		})

		test("wrong password is rejected 401", async ({ request }) => {
			const res = await request.post("/api/auth/login", {
				data: { username: USERNAME, password: "wrong-pass-1" },
			})
			expect(res.status()).toBe(401)
		})

		test("login succeeds and returns a JWT", async ({ request }) => {
			const res = await request.post("/api/auth/login", {
				data: { username: USERNAME, password: PASSWORD },
			})
			expect(res.status()).toBe(200)
			const body = await res.json()
			expect(body.token).toBeTruthy()
		})

		test("seeded product is created", async ({ request }) => {
			const login = await request.post("/api/auth/login", {
				data: { username: USERNAME, password: PASSWORD },
			})
			const token = (await login.json()).token
			const res = await request.post("/api/products", {
				headers: { Authorization: `Bearer ${token}` },
				data: {
					name: "Smoke Rice",
					code: `SMOKE-${Date.now()}`,
					unitPrice: 50,
				},
			})
			expect(res.status()).toBe(201)
			productId = (await res.json()).id
			expect(productId).toBeTruthy()
		})

		test("taxed invoice is created (PAID)", async ({ request }) => {
			const login = await request.post("/api/auth/login", {
				data: { username: USERNAME, password: PASSWORD },
			})
			const token = (await login.json()).token
			const res = await request.post("/api/invoices", {
				headers: { Authorization: `Bearer ${token}` },
				data: { items: [{ productId, qty: 2 }] },
			})
			expect(res.status()).toBe(201)
			const body = await res.json()
			expect(body.subtotal).toBe(100)
			expect(body.taxAmount).toBe(15)
			expect(body.total).toBe(115)
			expect(body.status).toBe("PAID")
			invoiceId = body.invoiceId
			expect(invoiceId).toBeTruthy()
		})

		test("idempotent replay of the same key never duplicates", async ({
			request,
		}) => {
			const login = await request.post("/api/auth/login", {
				data: { username: USERNAME, password: PASSWORD },
			})
			const token = (await login.json()).token
			const key = `smoke-idem-${Date.now()}`
			const payload = { items: [{ productId, qty: 1 }], idempotencyKey: key }
			const headers = { Authorization: `Bearer ${token}` }

			const first = await request.post("/api/invoices", {
				headers,
				data: payload,
			})
			expect([200, 201]).toContain(first.status())
			const firstId = (await first.json()).invoiceId

			const second = await request.post("/api/invoices", {
				headers,
				data: payload,
			})
			expect(second.status()).toBe(200)
			const dup = await second.json()
			expect(dup.deduped).toBe(true)
			expect(dup.invoiceId).toBe(firstId)
		})

		test("daily report reflects the sold orders", async ({ request }) => {
			const login = await request.post("/api/auth/login", {
				data: { username: USERNAME, password: PASSWORD },
			})
			const token = (await login.json()).token
			const today = new Date().toISOString().slice(0, 10)
			const res = await request.get(
				`/api/reports/summary?from=${today}&to=${today}`,
				{
					headers: { Authorization: `Bearer ${token}` },
				},
			)
			expect(res.status()).toBe(200)
			const body = await res.json()
			expect(body.orders).toBeGreaterThan(0)
			expect(body.byStatus).toHaveProperty("PAID")
		})

		test("logout revokes the token (401 afterwards)", async ({ request }) => {
			const login = await request.post("/api/auth/login", {
				data: { username: USERNAME, password: PASSWORD },
			})
			const token = (await login.json()).token
			const headers = { Authorization: `Bearer ${token}` }

			const me = await request.get("/api/auth/me", { headers })
			expect(me.status()).toBe(200)

			const out = await request.post("/api/auth/logout", { headers })
			expect(out.status()).toBe(200)

			const dead = await request.get("/api/auth/me", { headers })
			expect(dead.status()).toBe(401)
		})
	})
