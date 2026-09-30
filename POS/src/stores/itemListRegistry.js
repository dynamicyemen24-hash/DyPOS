/**
 * Item list registry — the bookkeeping behind the item-search store.
 *
 * Extracted from `stores/itemSearch.js` so the browse list, the search
 * results and the per-code registry can be reasoned about (and tested)
 * on their own. Every mutation here has one invariant: a code is present
 * in `itemRegistry` if and only if at least one tracked item still carries
 * it. When the last item for a code is removed the bucket is dropped —
 * otherwise a long POS session leaks one empty Set per code it ever sold.
 *
 * `clearBaseCache` is passed in rather than imported because the derived
 * result caches (`filteredItemsCache` / `lastFilterKey`) stay in the store
 * with the filters that own them.
 */

/**
 * Drop every tracked item in `registrySet`, pruning empty registry buckets.
 *
 * @param {Set<Object>} registrySet items to untrack
 * @param {Map<string, Set<Object>>} itemRegistry code → tracked items
 */
export function removeRegisteredItems(registrySet, itemRegistry) {
	if (!registrySet || registrySet.size === 0) return

	registrySet.forEach((item) => {
		const code = item?.item_code
		if (!code) return
		const bucket = itemRegistry.get(code)
		if (bucket) {
			bucket.delete(item)
			if (bucket.size === 0) {
				itemRegistry.delete(code)
			}
		}
	})

	registrySet.clear()
}

/**
 * Track `items` and hand them to the stock store for initialization.
 * Items without an `item_code` are ignored: they can never be refreshed
 * or matched, so tracking them would be untrackable state.
 *
 * @param {Object[]} items
 * @param {Set<Object>} registrySet membership set to add to
 * @param {Map<string, Set<Object>>} itemRegistry code → tracked items
 * @param {{ init: (items: Object[]) => void }} stockStore
 */
export function registerItems(items, registrySet, itemRegistry, stockStore) {
	if (!Array.isArray(items) || items.length === 0) return

	// Initialize stock (smart & simple!)
	stockStore.init(items)

	items.forEach((item) => {
		if (!item || !item.item_code) return
		let bucket = itemRegistry.get(item.item_code)
		if (!bucket) {
			bucket = new Set()
			itemRegistry.set(item.item_code, bucket)
		}
		bucket.add(item)
		registrySet.add(item)
	})
}

/**
 * Insert or update a single item inside one of the tracked lists.
 * Used after a product is edited so the POS reflects the change without
 * a full reload.
 *
 * @returns {boolean} true when the list was actually modified
 */
export function upsertItemInList(
	listRef,
	versionRef,
	registrySet,
	updatedItem,
	itemRegistry,
	stockStore,
	invalidate,
) {
	if (!updatedItem?.item_code) return false

	const index = listRef.value.findIndex(
		(item) => item.item_code === updatedItem.item_code,
	)

	if (index >= 0) {
		Object.assign(listRef.value[index], updatedItem)
		stockStore.init([listRef.value[index]])
	} else {
		listRef.value.unshift(updatedItem)
		registerItems([updatedItem], registrySet, itemRegistry, stockStore)
	}

	versionRef.value += 1
	invalidate()
	return true
}

/**
 * Build the list mutators bound to one store's refs and caches.
 *
 * @param {object} deps
 * @param {import('vue').Ref<Object[]>} deps.allItems
 * @param {import('vue').Ref<Object[]>} deps.searchResults
 * @param {import('vue').Ref<number>} deps.allItemsVersion
 * @param {import('vue').Ref<number>} deps.searchResultsVersion
 * @param {Set<Object>} deps.registeredAllItems
 * @param {Set<Object>} deps.registeredSearchItems
 * @param {Map<string, Set<Object>>} deps.itemRegistry
 * @param {{ init: (items: Object[]) => void }} deps.stockStore
 * @param {() => void} deps.invalidate clears the derived result caches
 */
export function createItemListRegistry(deps) {
	const {
		allItems,
		searchResults,
		allItemsVersion,
		searchResultsVersion,
		registeredAllItems,
		registeredSearchItems,
		itemRegistry,
		stockStore,
		invalidate,
	} = deps

	function replaceAllItems(items) {
		const next = Array.isArray(items) ? items : []
		removeRegisteredItems(registeredAllItems, itemRegistry)
		allItems.value = next
		allItemsVersion.value += 1
		registerItems(next, registeredAllItems, itemRegistry, stockStore)
		invalidate()
	}

	function appendAllItems(items) {
		if (!Array.isArray(items) || items.length === 0) return
		allItems.value.push(...items)
		allItemsVersion.value += 1
		registerItems(items, registeredAllItems, itemRegistry, stockStore)
		invalidate()
	}

	function setSearchResults(items) {
		const next = Array.isArray(items) ? items : []
		removeRegisteredItems(registeredSearchItems, itemRegistry)
		searchResults.value = next
		searchResultsVersion.value += 1
		registerItems(next, registeredSearchItems, itemRegistry, stockStore)
		invalidate()
	}

	return {
		replaceAllItems,
		appendAllItems,
		setSearchResults,
		upsertItemInList: (listRef, versionRef, registrySet, updatedItem) =>
			upsertItemInList(
				listRef,
				versionRef,
				registrySet,
				updatedItem,
				itemRegistry,
				stockStore,
				invalidate,
			),
	}
}

export default {
	removeRegisteredItems,
	registerItems,
	upsertItemInList,
	createItemListRegistry,
}
