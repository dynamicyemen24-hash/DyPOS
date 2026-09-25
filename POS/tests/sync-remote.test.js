/**
 * Remote sync transport regression: runtime destinations over REST.
 * fetch is stubbed per test — no network, no Dexie.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	clearCatalogCache,
	fetchCatalogMap,
	loginDestination,
	mapInvoiceForRemote,
	mapRemoteError,
	pingDestination,
	pushInvoiceToDestination,
} from "@/services/sync-remote"
import { setDestinationToken } from "@/services/sync-destinations"

const DEST = {
	id: "d1",
	name: "فرع العليا",
	kind: "branch",
	baseUrl: "http://10.0.0.5:3001",
	username: "cashier",
}

function jsonResponse(body, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? "OK" : "ERR",
		json: async () => body,
	}
}

function setOnline(value) {
	Object.defineProperty(window.navigator, "onLine", {
		value,
		configurable: true,
	})
}

beforeEach(() => {
	localStorage.clear()
	clearCatalogCache()
	setOnline(true)
	vi.stubGlobal("fetch", vi.fn())
})

function mockFetch(handler) {
	vi.mocked(fetch).mockImplementation(handler)
}

describe("mapRemoteError", () => {
	it("classifies offline / auth / server faults in Arabic", () => {
		expect(mapRemoteError({ offline: true, message: "x" }, "d").code).toBe(
			"OFFLINE",
		)
		const auth = mapRemoteError({ kind: "AUTH_REVOKED" }, "d")
		expect(auth.needsLogin).toBe(true)
		expect(mapRemoteError({ status: 503 }, "d").retryable).toBe(true)
		expect(mapRemoteError({ status: 400, message: "bad" }, "d").ok).toBe(false)
	})
})

describe("pingDestination / loginDestination", () => {
	it("healthy backend → ok", async () => {
		mockFetch(async () => jsonResponse({ status: "ok" }))
		await expect(pingDestination(DEST)).resolves.toMatchObject({ ok: true })
	})

	it("offline radio → fast offline verdict, no fetch", async () => {
		setOnline(false)
		const r = await pingDestination(DEST)
		expect(r.code).toBe("OFFLINE")
		expect(fetch).not.toHaveBeenCalled()
	})

	it("login persists the token", async () => {
		mockFetch(async (url, opts) => {
			expect(String(url)).toContain("/api/auth/login")
			expect(JSON.parse(opts.body)).toMatchObject({ username: "cashier" })
			return jsonResponse({ token: "tok", user: { username: "cashier" } })
		})
		const r = await loginDestination(DEST, "cashier", "pw")
		expect(r).toMatchObject({ ok: true, token: "tok" })
	})

	it("login rejects empty credentials without network", async () => {
		const r = await loginDestination(DEST, "", "")
		expect(r.code).toBe("CREDENTIALS")
		expect(fetch).not.toHaveBeenCalled()
	})
})

describe("mapInvoiceForRemote", () => {
	const map = new Map([["A1", "uuid-a1"]])

	it("maps Frappe lines to REST lines, drops nothing silently", () => {
		const r = mapInvoiceForRemote(
			{
				offline_id: "pos_offline_1",
				data: {
					customer_name: "عميل",
					items: [
						{
							item_code: "A1",
							qty: 2,
							rate: 10,
							uom: "Nos",
							warehouse: "W-01",
						},
					],
					payments: [{ mode_of_payment: "Cash", amount: 23 }],
					remarks: "hi",
				},
			},
			map,
		)
		expect(r.ok).toBe(true)
		expect(r.payload).toMatchObject({
			idempotencyKey: "pos_offline_1",
			customerId: null,
			customerName: "عميل",
		})
		expect(r.payload.items[0]).toMatchObject({
			productId: "uuid-a1",
			qty: 2,
			unitPrice: 10,
		})
		expect(r.payload.payments[0].method).toBe("CASH")
	})

	it("unknown SKUs fail loudly with the exact codes", () => {
		const r = mapInvoiceForRemote(
			{
				data: { items: [{ item_code: "GHOST", qty: 1, rate: 5 }] },
			},
			map,
		)
		expect(r.ok).toBe(false)
		expect(r.missing).toEqual(["GHOST"])
	})
})

describe("pushInvoiceToDestination", () => {
	const invoice = {
		id: 7,
		offline_id: "pos_offline_7",
		data: {
			customer_name: "عميل",
			items: [{ item_code: "A1", qty: 1, rate: 10 }],
			payments: [{ mode_of_payment: "CASH", amount: 11.5 }],
		},
	}

	function catalogThenPost(postBody) {
		mockFetch(async (url, opts) => {
			const u = String(url)
			if (u.includes("/api/products")) {
				return jsonResponse({
					products: [{ id: "uuid-a1", code: "A1" }],
					hasMore: false,
				})
			}
			if (u.includes("/api/invoices")) {
				expect(JSON.parse(opts.body).idempotencyKey).toBe("pos_offline_7")
				return jsonResponse(postBody)
			}
			throw new Error(`unexpected ${u}`)
		})
	}

	it("posts idempotently and returns the server name", async () => {
		setDestinationToken("d1", "tok")
		catalogThenPost({ invoiceId: "srv-1", number: "INV-1" })
		const r = await pushInvoiceToDestination(invoice, DEST)
		expect(r).toMatchObject({
			ok: true,
			deduped: false,
			invoiceId: "srv-1",
			serverName: "INV-1",
		})
	})

	it("dedupe responses count as synced", async () => {
		catalogThenPost({ deduped: true, invoiceId: "srv-1" })
		const r = await pushInvoiceToDestination(invoice, DEST)
		expect(r).toMatchObject({ ok: true, deduped: true })
	})

	it("401 drops the stale token and asks for login", async () => {
		setDestinationToken("d1", "stale")
		mockFetch(async (url) => {
			if (String(url).includes("/api/products")) {
				return jsonResponse({ products: [{ id: "u", code: "A1" }] })
			}
			return jsonResponse({ error: "gone" }, 401)
		})
		const r = await pushInvoiceToDestination(invoice, DEST)
		expect(r.needsLogin).toBe(true)
	})

	it("unknown SKU surfaces codes, never posts", async () => {
		mockFetch(async () => jsonResponse({ products: [], hasMore: false }))
		const r = await pushInvoiceToDestination(
			{
				offline_id: "x",
				data: { items: [{ item_code: "NOPE", qty: 1, rate: 1 }] },
			},
			DEST,
		)
		expect(r.code).toBe("UNKNOWN_SKU")
		expect(r.missing).toEqual(["NOPE"])
	})
})

describe("fetchCatalogMap", () => {
	it("pages and caches per destination", async () => {
		let calls = 0
		mockFetch(async () => {
			calls++
			return jsonResponse({
				products: [{ id: "u1", code: "A1" }],
				hasMore: false,
			})
		})
		const first = await fetchCatalogMap(DEST)
		expect(first.map.get("A1")).toBe("u1")
		const second = await fetchCatalogMap(DEST)
		expect(second.map.get("A1")).toBe("u1")
		expect(calls).toBe(1)
	})
})
