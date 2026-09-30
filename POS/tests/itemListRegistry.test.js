import { describe, expect, it, vi } from "vitest"
import { ref } from "vue"
import {
	createItemListRegistry,
	registerItems,
	removeRegisteredItems,
} from "@/stores/itemListRegistry"

/**
 * The registry is the bookkeeping the item-search store delegates to. Its
 * whole point is that the per-code buckets cannot drift from the tracked
 * lists — a leak here is invisible until a long POS session has sold every
 * code in the catalog, so the invariant is asserted directly.
 */
function harness() {
	const allItems = ref([])
	const searchResults = ref([])
	const allItemsVersion = ref(0)
	const searchResultsVersion = ref(0)
	const registeredAllItems = new Set()
	const registeredSearchItems = new Set()
	const itemRegistry = new Map()
	const stockStore = { init: vi.fn() }
	const invalidate = vi.fn()

	const api = createItemListRegistry({
		allItems,
		searchResults,
		allItemsVersion,
		searchResultsVersion,
		registeredAllItems,
		registeredSearchItems,
		itemRegistry,
		stockStore,
		invalidate,
	})

	return {
		...api,
		allItems,
		searchResults,
		allItemsVersion,
		searchResultsVersion,
		registeredAllItems,
		registeredSearchItems,
		itemRegistry,
		stockStore,
		invalidate,
	}
}

const item = (code, extra = {}) => ({ item_code: code, ...extra })

describe("item list registry", () => {
	it("tracks items by code and initializes their stock", () => {
		const h = harness()
		h.replaceAllItems([item("A"), item("B")])

		expect(h.allItems.value).toHaveLength(2)
		expect(h.allItemsVersion.value).toBe(1)
		expect(h.itemRegistry.get("A").size).toBe(1)
		expect(h.registeredAllItems.size).toBe(2)
		expect(h.stockStore.init).toHaveBeenCalledTimes(1)
	})

	it("prunes the bucket when the last item for a code is replaced", () => {
		const h = harness()
		h.replaceAllItems([item("A")])
		expect(h.itemRegistry.has("A")).toBe(true)

		// A code that leaves the list must not leave an empty Set behind: a long
		// POS session would otherwise hold one per code it ever displayed.
		h.replaceAllItems([item("B")])
		expect(h.itemRegistry.has("A")).toBe(false)
		expect(h.itemRegistry.has("B")).toBe(true)
	})

	it("keeps a shared code alive while another list still tracks it", () => {
		const h = harness()
		h.replaceAllItems([item("A")])
		h.setSearchResults([item("A")])

		h.setSearchResults([])
		// The browse list still holds A, so the bucket must survive.
		expect(h.itemRegistry.has("A")).toBe(true)
	})

	it("ignores items without an item_code", () => {
		const h = harness()
		h.replaceAllItems([{ name: "no code" }, null, item("A")])

		expect(h.itemRegistry.size).toBe(1)
		expect(h.itemRegistry.has("A")).toBe(true)
	})

	it("appends without clearing the previously tracked codes", () => {
		const h = harness()
		h.replaceAllItems([item("A")])
		h.appendAllItems([item("B")])

		expect(h.allItems.value.map((i) => i.item_code)).toEqual(["A", "B"])
		expect(h.allItemsVersion.value).toBe(2)
		expect(h.itemRegistry.size).toBe(2)
	})

	it("treats a non-array payload as an empty list, not a crash", () => {
		const h = harness()
		h.replaceAllItems([item("A")])
		h.replaceAllItems(undefined)

		expect(h.allItems.value).toEqual([])
		expect(h.itemRegistry.size).toBe(0)
	})

	it("upserts in place: an existing code is merged, not duplicated", () => {
		const h = harness()
		h.replaceAllItems([item("A", { name: "old" })])

		const updated = h.upsertItemInList(
			h.allItems,
			h.allItemsVersion,
			h.registeredAllItems,
			item("A", { name: "new" }),
		)

		expect(updated).toBe(true)
		expect(h.allItems.value).toHaveLength(1)
		expect(h.allItems.value[0].name).toBe("new")
		expect(h.allItemsVersion.value).toBe(2)
	})

	it("upsert prepends a code the list has never seen", () => {
		const h = harness()
		h.replaceAllItems([item("A")])

		h.upsertItemInList(
			h.allItems,
			h.allItemsVersion,
			h.registeredAllItems,
			item("Z"),
		)

		expect(h.allItems.value[0].item_code).toBe("Z")
		expect(h.itemRegistry.has("Z")).toBe(true)
	})

	it("refuses an upsert with no code instead of tracking a ghost", () => {
		const h = harness()
		h.replaceAllItems([item("A")])
		const versionBefore = h.allItemsVersion.value

		const updated = h.upsertItemInList(
			h.allItems,
			h.allItemsVersion,
			h.registeredAllItems,
			{ name: "no code" },
		)

		expect(updated).toBe(false)
		expect(h.allItems.value).toHaveLength(1)
		expect(h.allItemsVersion.value).toBe(versionBefore)
	})

	it("invalidates the derived caches on every mutation", () => {
		const h = harness()
		h.replaceAllItems([item("A")])
		h.appendAllItems([item("B")])
		h.setSearchResults([item("C")])
		h.upsertItemInList(
			h.allItems,
			h.allItemsVersion,
			h.registeredAllItems,
			item("A"),
		)

		expect(h.invalidate).toHaveBeenCalledTimes(4)
	})

	it("removeRegisteredItems clears the set and prunes emptied buckets", () => {
		const registrySet = new Set()
		const itemRegistry = new Map()
		registerItems([item("A"), item("B")], registrySet, itemRegistry, {
			init: () => {},
		})

		removeRegisteredItems(registrySet, itemRegistry)

		expect(registrySet.size).toBe(0)
		expect(itemRegistry.size).toBe(0)
	})

	it("tolerates an empty or missing registry set", () => {
		const itemRegistry = new Map()
		expect(() => removeRegisteredItems(new Set(), itemRegistry)).not.toThrow()
		expect(() => removeRegisteredItems(null, itemRegistry)).not.toThrow()
		expect(() =>
			registerItems(null, new Set(), itemRegistry, { init: () => {} }),
		).not.toThrow()
	})
})
