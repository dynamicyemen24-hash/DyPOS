import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	__: vi.fn((msg) => {
		const messages = globalThis.window?.translatedMessages || {}
		return messages[msg] || msg
	}),
	call: vi.fn(() => Promise.resolve(null)),
	useBootstrapStore: vi.fn(() => ({ getPreloadedLocale: () => null })),
	translationVersion: { value: 0 },
}))

vi.mock("@/utils/logger", () => ({
	logger: {
		create: () =>
			new Proxy(
				{},
				{
					get: () => () => {},
				},
			),
	},
}))

vi.mock("@/utils/translation", () => ({
	__: mocks.__,
	translate: mocks.__,
	changeLanguage: vi.fn(() => Promise.resolve()),
	default: vi.fn(),
	translationVersion: mocks.translationVersion,
}))

vi.mock("@/utils/apiWrapper", () => ({
	call: mocks.call,
}))

vi.mock("@/utils/offline/offlineState", () => ({
	offlineState: { isOffline: true },
}))

vi.mock("@/stores/bootstrap", () => ({
	useBootstrapStore: mocks.useBootstrapStore,
}))

import {
	SCHEMA_VERSION,
	STORAGE_KEY,
	MAX_ITEMS,
	captureDraftState,
	cartFingerprint,
	restoreDraft,
	mergeDraftIntoCart,
	writeDraftNow,
	writeDraftThrottled,
	flushDraft,
	resetDraftThrottle,
	readDraftRaw,
	readValidDraft,
	hasDraft,
	clearDraft,
} from "@/utils/useCrashResume"

import { ref } from "vue"
import { createPinia, defineStore, setActivePinia } from "pinia"
import { installCrashResume } from "@/composables/useCrashResume"

function makeItems(count) {
	return Array.from({ length: count }, (_, index) => ({
		item_code: `ITEM-${index + 1}`,
		name: `Item ${index + 1}`,
		quantity: index + 1,
		rate: 10 + index,
	}))
}

const DAY_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
	localStorage.clear()
	resetDraftThrottle()
})

describe("captureDraftState", () => {
	it("captures a plain-serializable draft from live cart items", () => {
		const draft = captureDraftState(makeItems(2), {
			amountReceived: 120,
			paymentMethod: "cash",
		})
		expect(draft).not.toBeNull()
		expect(draft.schema).toBe(SCHEMA_VERSION)
		expect(draft.kind).toBe("checkout")
		expect(draft.cart.items).toHaveLength(2)
		expect(draft.cart.items[0].item_code).toBe("ITEM-1")
		expect(draft.panel.amountReceived).toBe(120)
		expect(draft.fingerprint).toMatch(/^[0-9a-f]{8}$/)
	})

	it("caps captured line items at MAX_ITEMS", () => {
		const draft = captureDraftState(makeItems(MAX_ITEMS + 50), null, null)
		expect(draft.cart.items.length).toBeLessThanOrEqual(MAX_ITEMS)
	})

	it("returns null when the cart is empty", () => {
		expect(captureDraftState([], null, null)).toBeNull()
		expect(captureDraftState(null, null, null)).toBeNull()
		expect(captureDraftState({ items: [] }, null, null)).toBeNull()
	})

	it("strips functions, refs, undefined and class instances", () => {
		const sneaky = {
			item_code: "X",
			cancelOrder: () => {},
			symbolValue: Symbol("x"),
			undefinedValue: undefined,
			refLike: { value: "nested" },
			when: new Date("2026-08-05T12:00:00.000Z"),
		}
		const draft = captureDraftState([sneaky], null, null)
		expect(draft.cart.items[0].cancelOrder).toBeUndefined()
		expect(draft.cart.items[0].symbolValue).toBeUndefined()
		expect(draft.cart.items[0].undefinedValue).toBeUndefined()
		expect(draft.cart.items[0].refLike).toEqual({ value: "nested" })
		expect(draft.cart.items[0].when).toBe("2026-08-05T12:00:00.000Z")
	})

	it("produces a stable fingerprint for identical carts", () => {
		const a = captureDraftState(makeItems(3), null, null)
		const b = captureDraftState(makeItems(3), null, null)
		const c = captureDraftState(makeItems(3).reverse(), null, null)
		expect(a.fingerprint).toBe(b.fingerprint)
		expect(a.fingerprint).not.toBe(c.fingerprint)
	})
})

describe("restoreDraft validation", () => {
	it("round-trips a captured draft", () => {
		const draft = captureDraftState(makeItems(2), { amountReceived: 99 })
		const result = restoreDraft(draft)
		expect(result.ok).toBe(true)
		expect(result.draft.cart.items).toHaveLength(2)
		expect(result.draft.panel.amountReceived).toBe(99)
	})

	it("rejects malformed JSON (not_json)", () => {
		expect(restoreDraft("{oops")).toEqual({ ok: false, reason: "not_json" })
	})

	it("rejects non-object drafts (invalid_draft)", () => {
		expect(restoreDraft([1, 2, 3])).toEqual({
			ok: false,
			reason: "invalid_draft",
		})
		expect(restoreDraft("42")).toEqual({ ok: false, reason: "invalid_draft" })
		expect(restoreDraft(null)).toEqual({ ok: false, reason: "invalid_draft" })
	})

	it("discards future schema versions (schema_invalid)", () => {
		const draft = captureDraftState(makeItems(1), null, null)
		draft.schema = SCHEMA_VERSION + 1
		expect(restoreDraft(draft)).toEqual({ ok: false, reason: "schema_invalid" })
	})

	it("rejects an empty item list (no_items)", () => {
		expect(
			restoreDraft({ schema: SCHEMA_VERSION, cart: { items: [] } }),
		).toEqual({ ok: false, reason: "no_items" })
		expect(
			restoreDraft({ schema: SCHEMA_VERSION, cart: { items: null } }),
		).toEqual({ ok: false, reason: "no_items" })
	})

	it("rejects more items than MAX_ITEMS (too_many_items)", () => {
		const raw = {
			schema: SCHEMA_VERSION,
			savedAt: new Date().toISOString(),
			cart: { items: makeItems(MAX_ITEMS + 1) },
		}
		expect(restoreDraft(raw)).toEqual({ ok: false, reason: "too_many_items" })
	})

	it("rejects drafts older than 24h (too_old)", () => {
		const old = captureDraftState(
			makeItems(1),
			null,
			null,
			Date.now() - DAY_MS - 1000,
		)
		expect(restoreDraft(old)).toEqual({ ok: false, reason: "too_old" })
	})

	it("honors an explicit maxAgeMs override", () => {
		const old = captureDraftState(
			makeItems(1),
			null,
			null,
			Date.now() - DAY_MS - 1000,
		)
		expect(restoreDraft(old, { maxAgeMs: 2 * DAY_MS }).ok).toBe(true)
	})

	it("rejects drafts over the byte budget (size_exceeded)", () => {
		const draft = captureDraftState([{ item_code: "X", name: "Item" }], null, {
			huge: "x".repeat(300 * 1024),
		})
		expect(restoreDraft(draft)).toEqual({ ok: false, reason: "size_exceeded" })
	})

	it("rejects drafts with no savedAt (invalid_timestamp)", () => {
		const draft = captureDraftState(makeItems(1), null, null)
		draft.savedAt = undefined
		const result = restoreDraft(draft)
		expect(result.ok).toBe(false)
		expect(result.reason).toBe("invalid_timestamp")
	})

	it("clamps restored quantities into 0..1_000_000", () => {
		const draft = captureDraftState(
			[
				{ item_code: "A", quantity: 5_000_000 },
				{ item_code: "B", quantity: -3 },
				{ item_code: "C", quantity: "not-a-number" },
			],
			null,
			null,
		)
		const { draft: restored } = restoreDraft(draft)
		expect(restored.cart.items[0].quantity).toBe(1_000_000)
		expect(restored.cart.items[1].quantity).toBe(0)
		expect(restored.cart.items[2].quantity).toBe(0)
	})

	it("clamps both quantity and qty fields independently", () => {
		const draft = captureDraftState(
			[{ item_code: "A", quantity: 2, qty: 2_000_000 }],
			null,
			null,
		)
		const { draft: restored } = restoreDraft(draft)
		expect(restored.cart.items[0].quantity).toBe(2)
		expect(restored.cart.items[0].qty).toBe(1_000_000)
	})
})

describe("mergeDraftIntoCart", () => {
	it("merges into an empty cart", () => {
		const draft = captureDraftState(makeItems(3), null, null)
		const result = mergeDraftIntoCart(draft, [])
		expect(result.ok).toBe(true)
		expect(result.items).toHaveLength(3)
		expect(result.items[0].item_code).toBe("ITEM-1")
	})

	it("never overwrites a non-empty cart (cart_not_empty)", () => {
		const draft = captureDraftState(makeItems(3), null, null)
		const result = mergeDraftIntoCart(draft, [{ item_code: "BUSY" }])
		expect(result.ok).toBe(false)
		expect(result.reason).toBe("cart_not_empty")
	})

	it("rejects invalid drafts and empty item lists", () => {
		expect(mergeDraftIntoCart(null, []).ok).toBe(false)
		expect(mergeDraftIntoCart({ cart: {} }, []).ok).toBe(false)
	})
})

describe("persistence (localStorage)", () => {
	it("writes and reads a draft via the physical writer", () => {
		const draft = captureDraftState(makeItems(2), { amountReceived: 42 })
		expect(writeDraftNow(draft)).toBe(true)
		expect(hasDraft()).toBe(true)
		const result = readValidDraft()
		expect(result.ok).toBe(true)
		expect(result.draft.cart.items).toHaveLength(2)
	})

	it("cleanly removes the draft (clearDraft)", () => {
		expect(writeDraftNow(captureDraftState(makeItems(1), null, null))).toBe(
			true,
		)
		expect(clearDraft()).toBe(true)
		expect(hasDraft()).toBe(false)
		expect(readDraftRaw()).toBeNull()
	})

	it("is never lying about absence", () => {
		expect(hasDraft()).toBe(false)
	})

	it("throttles writes to ~1/sec and flushes the pending draft", () => {
		resetDraftThrottle()
		const first = captureDraftState(makeItems(1), { step: 1 })
		const second = captureDraftState(makeItems(1), { step: 2 })

		expect(writeDraftThrottled(first)).toBe(true)
		expect(writeDraftThrottled(second)).toBe(false)
		// The throttled writer kept the OLDEST on disk so far…
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).panel.step).toBe(1)

		// …and flushDraft() (pagehide) closes the gap with the newest.
		expect(flushDraft()).toBe(true)
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).panel.step).toBe(2)

		// After flushing, nothing is pending.
		expect(flushDraft()).toBe(false)
	})

	it("shrinks oversized drafts to fit under the byte guard", () => {
		const hugeItems = Array.from({ length: 400 }, (_, index) => ({
			item_code: `BIG-${index}`,
			description: "y".repeat(1500),
			quantity: 1,
		}))
		const draft = captureDraftState(hugeItems, null, null)
		expect(writeDraftNow(draft)).toBe(true)

		const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY))
		expect(JSON.stringify(persisted).length).toBeLessThanOrEqual(256 * 1024)
		expect(persisted.cart.items.length).toBeLessThan(400)
		expect(readValidDraft().ok).toBe(true)
	})
})

describe("cartFingerprint", () => {
	it("is stable per content and sensitive to changes", () => {
		const a = makeItems(2)
		const b = makeItems(2)
		b[0].quantity = 99
		expect(cartFingerprint(a)).toBe(cartFingerprint(makeItems(2)))
		expect(cartFingerprint(a)).not.toBe(cartFingerprint(b))
	})
})

describe("installCrashResume wiring", () => {
	function writeDraft(items, panel) {
		expect(
			writeDraftNow(captureDraftState(items, panel, null, Date.now())),
		).toBe(true)
	}

	it("surfaces a pending draft at boot only when the live cart is empty", () => {
		writeDraft(makeItems(2), { paymentAmount: "120" })

		const cart = ref([])
		const controller = installCrashResume({
			invoiceItems: cart,
			getPanel: () => ({ paymentAmount: "120" }),
		})

		try {
			expect(controller.installed).toBe(true)
			expect(controller.pendingDraft.value).not.toBeNull()
			expect(controller.pendingDraft.value.itemsCount).toBe(2)
			expect(controller.messages.value.title).toBe("استئناف عملية البيع")
			expect(controller.messages.value.accept).toBe("استئناف البيع")
		} finally {
			controller.stop()
		}
	})

	it("restores the draft into an empty cart and clears the draft", () => {
		writeDraft(makeItems(3), { paymentAmount: "99" })

		const cart = ref([])
		const restoredPanel = ref(null)
		const controller = installCrashResume({
			invoiceItems: cart,
			getPanel: () => null,
			setPanel: (panel) => {
				restoredPanel.value = panel
			},
			isCartEmpty: () => cart.value.length === 0,
		})

		try {
			const result = controller.accept()
			expect(result.ok).toBe(true)
			expect(cart.value).toHaveLength(3)
			expect(cart.value[0].item_code).toBe("ITEM-1")
			expect(restoredPanel.value.paymentAmount).toBe("99")
			expect(hasDraft()).toBe(false)
			expect(controller.pendingDraft.value).toBeNull()
		} finally {
			controller.stop()
		}
	})

	it("stays hidden when the live cart already has items", () => {
		writeDraft(makeItems(2), null)

		const cart = ref([{ item_code: "BUSY", quantity: 1 }])
		const controller = installCrashResume({
			invoiceItems: cart,
		})

		try {
			expect(controller.pendingDraft.value).toBeNull()
			expect(controller.messages.value).toBeNull()
		} finally {
			controller.stop()
		}
	})

	it("accept() refuses to overwrite a non-empty live cart", () => {
		writeDraft(makeItems(2), null)

		const cart = ref([])
		const controller = installCrashResume({
			invoiceItems: cart,
			isCartEmpty: () => cart.value.length === 0,
		})
		controller.accept() // Restore first so the cart is now occupied.
		cart.value.push({ item_code: "NEW" })

		// A second restore attempt must be refused mid-session.
		expect(controller.accept()).toEqual({ ok: false, reason: "no_pending" })
		controller.stop()
	})

	it("dismiss() discards the draft permanently", () => {
		writeDraft(makeItems(1), null)

		const cart = ref([])
		const controller = installCrashResume({ invoiceItems: cart })

		try {
			expect(controller.dismiss().ok).toBe(true)
			expect(hasDraft()).toBe(false)
			expect(controller.pendingDraft.value).toBeNull()
		} finally {
			controller.stop()
		}
	})

	it("works against a live Pinia setup store exposing an unwrapped invoiceItems", () => {
		setActivePinia(createPinia())
		const useCart = defineStore("crashCart", () => {
			const invoiceItems = ref([])
			return { invoiceItems }
		})
		const store = useCart()

		writeDraft(makeItems(1), null)
		const controller = installCrashResume(store)

		try {
			expect(controller.installed).toBe(true)
			expect(controller.accept().ok).toBe(true)
			expect(store.$state.invoiceItems).toHaveLength(1)
			expect(store.invoiceItems[0].item_code).toBe("ITEM-1")
			expect(hasDraft()).toBe(false)
		} finally {
			controller.stop()
		}
	})

	it("never throws for unsupported stores and reports installed:false", () => {
		const controller = installCrashResume({ not: "a-store" })
		expect(controller.installed).toBe(false)
		expect(controller.accept()).toEqual({ ok: false, reason: "unsupported" })
		expect(controller.captureNow()).toBe(false)
	})
})
