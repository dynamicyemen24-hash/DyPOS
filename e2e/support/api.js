/**
 * Shared e2e helpers — seeding + API claims against the same origin a
 * cashier uses (http://localhost:8080, proxied to the Node backend :8000).
 */

const { request } = require("playwright/test")

/**
 * Seed a throwaway ADMIN (first user → bootstrap ADMIN) and a product.
 * Returns a lightweight client for further API calls.
 */
async function seedApi(baseURL) {
	const ctx = await request.newContext({ baseURL })
	const username = `e2e_${Date.now()}`
	const password = "E2ePass1234"

	const reg = await ctx.post("/api/auth/register", {
		data: { username, password, fullName: "E2E Admin", role: "ADMIN" },
	})
	const statusReg = reg.status()
	const registerBody = await reg.json().catch(() => ({}))
	if (statusReg !== 201)
		throw new Error(
			`seed register failed ${statusReg}: ${JSON.stringify(registerBody)}`,
		)

	const login = await ctx.post("/api/auth/login", {
		data: { username, password },
	})
	const statusLogin = login.status()
	const loginBody = await login.json().catch(() => ({}))
	if (statusLogin !== 200 || !loginBody.token) {
		throw new Error(
			`seed login failed ${statusLogin}: ${JSON.stringify(loginBody)}`,
		)
	}

	const authed = await request.newContext({
		baseURL,
		extraHTTPHeaders: { Authorization: `Bearer ${loginBody.token}` },
	})

	const code = `E2E-PROD-${Date.now()}`
	const prod = await authed.post("/api/products", {
		data: { name: "E2E Basmati Rice", code, unitPrice: 40 },
	})
	const statusProd = prod.status()
	const prodBody = await prod.json().catch(() => ({}))
	if (statusProd !== 201 || !prodBody.id)
		throw new Error(
			`seed product failed ${statusProd}: ${JSON.stringify(prodBody)}`,
		)

	return {
		client: authed,
		registerClient: ctx,
		username,
		password,
		token: loginBody.token,
		productId: prodBody.id,
	}
}

module.exports = { seedApi }
