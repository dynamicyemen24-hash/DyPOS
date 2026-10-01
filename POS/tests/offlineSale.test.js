/**
 * The promise the whole product rests on: a cashier can ring up and take money
 * on a dead network, and the sale is real the moment they press pay.
 *
 * Every other offline test proves one unit — boot gating, the queue table, the
 * numbering, the retry policy. None of them proves the JOIN: that the real
 * `saveOfflineInvoice` path completes a whole sale while every network surface
 * is booby-trapped, that stock comes off the shelf, and that the invoice comes
 * out numbered `POS-{branch}-{terminal}-{date}-{seq}`.
 *
 * This is the gate for invariant #8. A claim that "it works offline" is not a
 * measurement (invariant #11); a test that fails when someone reintroduces a
 * fetch into the sale path IS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The offline-numbering store is a Dexie settings table; mirror its surface
 * (get/put + the atomic transaction wrapper) so the REAL numbering code runs.
 */
function createSettingsStore() {
	const settings = new Map()
	return {
		settings: {
			async get(key) {
				return settings.get(key)
			},
			async put(row) {
				settings.set(row.key, { ...row })
				return row.key
			},
		},
		_map: settings,
		async transaction(_mode, _table, fn) {
			return fn()
		},
	}
}

const queueRows = []
let stockRows = []
let queueSeq = 1

vi.mock("dypos-ui", () => ({
	call: vi.fn(() => {
		throw new Error("network call during an offline sale")
	}),
	get: vi.fn(() => {
		throw new Error("network call during an offline sale")
	}),
}))

vi.mock("@/utils/offline/db", () => ({
	db: {
		invoice_queue: {
			add: async (row) => {
				const id = queueSeq++
				queueRows.push({ ...row, id })
				return id
			},
			filter: (fn) => {
				const matched = queueRows.filter(fn)
				return {
					toArray: async () => matched,
					delete: async () => {
						const kept = queueRows.filter((r) => !matched.includes(r))
						queueRows.length = 0
						queueRows.push(...kept)
						return matched.length
					},
				}
			},
		},
		stock: {
			get: async (key) =>
				stockRows.find(
					(r) => r.item_code === key.item_code && r.warehouse === key.warehouse,
				),
			put: async (row) => {
				stockRows = stockRows.filter(
					(r) =>
						!(r.item_code === row.item_code && r.warehouse === row.warehouse),
				)
				stockRows.push({ ...row })
				return row.item_code
			},
		},
	},
}))

import { getOfflineInvoices, saveOfflineInvoice } from "@/utils/offline/sync"
import {
	formatOfflineInvoiceNumber,
	nextOfflineInvoiceNumber,
} from "@/services/offline-numbering"

const BRANCH = "BR-01"
const TERMINAL = "T-02"

/** Trip every wire a browser could possibly pull, so "offline" is enforced. */
function boobyTrapNetwork() {
	const attempts = []
	const trap = (name) =>
		vi.fn(() => {
			attempts.push(name)
			throw new Error(`offline sale attempted network via ${name}`)
		})
	const spies = {
		fetch: trap("fetch"),
		XMLHttpRequest: trap("XMLHttpRequest"),
		WebSocket: trap("WebSocket"),
		EventSource: trap("EventSource"),
		sendBeacon: trap("sendBeacon"),
	}
	const original = {
		fetch: globalThis.fetch,
		XMLHttpRequest: globalThis.XMLHttpRequest,
		WebSocket: globalThis.WebSocket,
		EventSource: globalThis.EventSource,
	}
	globalThis.fetch = spies.fetch
	globalThis.XMLHttpRequest = spies.XMLHttpRequest
	globalThis.WebSocket = spies.WebSocket
	globalThis.EventSource = spies.EventSource
	if (typeof globalThis.navigator?.sendBeacon === "function") {
		vi.spyOn(globalThis.navigator, "sendBeacon").mockImplementation(() => {
			attempts.push("navigator.sendBeacon")
			return false
		})
	}
	return {
		attempts,
		restore() {
			globalThis.fetch = original.fetch
			globalThis.XMLHttpRequest = original.XMLHttpRequest
			globalThis.WebSocket = original.WebSocket
			globalThis.EventSource = original.EventSource
			vi.restoreAllMocks()
		},
	}
}

const ITEMS = [
	{
		item_code: "SKU-COF-001",
		warehouse: "W-01",
		quantity: 2,
		rate: 25,
		amount: 50,
	},
	{
		item_code: "SKU-TEA-002",
		warehouse: "W-01",
		quantity: 1,
		rate: 15,
		amount: 15,
	},
]

describe("offline sale — يعمل بلا إنترنت، بالكامل", () => {
	let net
	let store

	beforeEach(() => {
		queueRows.length = 0
		queueSeq = 1
		stockRows = [{ item_code: "SKU-COF-001", warehouse: "W-01", qty: 10 }]
		store = createSettingsStore()
		net = boobyTrapNetwork()
	})

	afterEach(() => net?.restore())

	it("rings up a whole sale and takes the money with every wire trapped", async () => {
		const subtotal = ITEMS.reduce((sum, i) => sum + i.amount, 0)
		const vat = Number((subtotal * 0.15).toFixed(2))
		const total = subtotal + vat

		const saved = await saveOfflineInvoice({
			pos_profile: "POS-riyadh",
			branch: BRANCH,
			terminal: TERMINAL,
			customer: null,
			items: ITEMS,
			payments: [{ mode: "cash", amount: total }],
			grand_total: total,
			net_total: subtotal,
			total_taxes: vat,
		})

		expect(saved.success).toBe(true)
		expect(saved.offline_id).toBeTruthy()
		// The whole point: not one call escaped.
		expect(net.attempts).toEqual([])
	})

	it("takes the stock off the shelf so a second terminal cannot oversell", async () => {
		await saveOfflineInvoice({
			branch: BRANCH,
			terminal: TERMINAL,
			items: ITEMS,
			grand_total: 65,
		})
		const coffee = stockRows.find((r) => r.item_code === "SKU-COF-001")
		expect(coffee.qty).toBe(8) // 10 - 2 sold
		expect(net.attempts).toEqual([])
	})

	it("numbers the invoice offline as POS-{branch}-{terminal}-{date}-{seq}", async () => {
		const first = await nextOfflineInvoiceNumber({
			branch: BRANCH,
			terminal: TERMINAL,
			store,
		})
		// cleanScopeToken strips punctuation, so "BR-01" reads as BR01 aloud.
		expect(first.invoiceNumber).toMatch(/^POS-BR01-T02-\d{8}-\d{5,}$/)
		const second = await nextOfflineInvoiceNumber({
			branch: BRANCH,
			terminal: TERMINAL,
			store,
		})
		expect(second.invoiceNumber).not.toBe(first.invoiceNumber)
		expect(second.seq).toBe(first.seq + 1)
		expect(net.attempts).toEqual([])
	})

	it("keeps the sale pending for sync instead of pushing it on its own", async () => {
		await saveOfflineInvoice({
			branch: BRANCH,
			terminal: TERMINAL,
			items: ITEMS,
		})
		const pending = await getOfflineInvoices()
		expect(pending).toHaveLength(1)
		expect(pending[0].synced).toBe(false)
		expect(pending[0].retry_count).toBe(0)
		// Still nothing on the wire: sync is the user's decision, never automatic.
		expect(net.attempts).toEqual([])
	})

	it("survives the network staying dead — a second sale is still a real sale", async () => {
		await saveOfflineInvoice({
			branch: BRANCH,
			terminal: TERMINAL,
			items: ITEMS,
		})
		await saveOfflineInvoice({
			branch: BRANCH,
			terminal: TERMINAL,
			items: ITEMS,
		})
		const pending = await getOfflineInvoices()
		expect(pending).toHaveLength(2)
		expect(new Set(pending.map((r) => r.offline_id)).size).toBe(2)
		expect(net.attempts).toEqual([])
	})

	it("refuses an empty invoice rather than queueing a phantom sale", async () => {
		await expect(
			saveOfflineInvoice({ branch: BRANCH, terminal: TERMINAL, items: [] }),
		).rejects.toThrow(/empty invoice/i)
		expect(queueRows).toHaveLength(0)
		expect(net.attempts).toEqual([])
	})

	it("formats a number with a zero-padded sequence the cashier can read aloud", () => {
		const formatted = formatOfflineInvoiceNumber({
			branch: BRANCH,
			terminal: TERMINAL,
			yyyymmdd: "20260101",
			seq: 7,
		})
		expect(formatted).toBe("POS-BR01-T02-20260101-00007")
	})

	/**
	 * A trap that never fires makes every assertion above vacuous — they would
	 * pass against a POS that phones home on every sale, which is precisely the
	 * regression this file exists to catch. So prove the cage is locked first.
	 */
	it("the offline cage is actually locked, not a vacuous assertion", () => {
		expect(() => globalThis.fetch("/api/method/login")).toThrow(/offline sale/)
		expect(() => new globalThis.XMLHttpRequest()).toThrow(/offline sale/)
		expect(() => new globalThis.WebSocket("wss://x")).toThrow(/offline sale/)
		expect(() => new globalThis.EventSource("/api/events")).toThrow(
			/offline sale/,
		)
		expect(net.attempts).toEqual([
			"fetch",
			"XMLHttpRequest",
			"WebSocket",
			"EventSource",
		])
	})

	it("the real POS network helper is trapped too", async () => {
		const { call } = await import("dypos-ui")
		await expect(async () => call("DyPOS.getList", {})).rejects.toThrow(
			/offline sale/,
		)
		expect(net.attempts).not.toContain("dypos-ui")
	})
})
