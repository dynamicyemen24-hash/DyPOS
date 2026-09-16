import { defineStore } from "pinia"
import { ref, computed, watch } from "vue"

const FAVORITES_STORAGE_KEY = "dypos.favorites.v1"

const DEFAULT_LISTS = [
	{
		id: "favorites",
		name: "المفضلة",
		itemCodes: [],
		createdAt: Date.now(),
		updatedAt: Date.now(),
	},
]

function normalizeFavorites(raw) {
	if (!raw || typeof raw !== "object") return DEFAULT_LISTS
	if (!Array.isArray(raw.lists)) return DEFAULT_LISTS

	const lists = raw.lists.map((l) => {
		const base = {
			id:
				l.id || `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			name:
				typeof l.name === "string" && l.name.trim()
					? l.name.trim()
					: "قائمة غير مسماة",
			itemCodes: Array.isArray(l.itemCodes) ? [...l.itemCodes] : [],
			createdAt: Number(l.createdAt) || Date.now(),
			updatedAt: Number(l.updatedAt) || Date.now(),
			color:
				typeof l.color === "string" && /^#[0-9a-fA-F]{6}$/.test(l.color)
					? l.color
					: "#3b82f6",
			order:
				typeof l.order === "number" && Number.isFinite(l.order) ? l.order : 0,
			limit:
				Number.isFinite(l.limit) && l.limit > 0
					? l.limit
					: Number.POSITIVE_INFINITY,
		}
		return base
	})

	const seen = new Map()
	for (const list of lists) {
		if (!seen.has(list.id)) seen.set(list.id, list)
	}

	return {
		lists: Array.from(seen.values()).sort((a, b) => a.order - b.order),
		version: raw.version ?? 1,
	}
}

function persist(lists) {
	try {
		localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ lists }))
	} catch {
		// quota exceeded / private mode
	}
}

function loadStored() {
	try {
		const raw = localStorage.getItem(FAVORITES_STORAGE_KEY)
		if (!raw) return null
		return normalizeFavorites(JSON.parse(raw))
	} catch {
		return null
	}
}

function makeEmptyList(name, color, limit) {
	const id = `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
	return {
		id,
		name: name || "قائمة جديدة",
		itemCodes: [],
		createdAt: Date.now(),
		updatedAt: Date.now(),
		color: color || "#3b82f6",
		order: 0,
		limit:
			Number.isFinite(limit) && limit > 0 ? limit : Number.POSITIVE_INFINITY,
	}
}

function applyOrder(lists) {
	return lists.map((l, idx) => ({ ...l, order: idx }))
}

export const useFavoritesStore = defineStore("favorites", () => {
	const stored = loadStored()

	const lists = ref(
		stored
			? applyOrder(stored.lists)
			: applyOrder(DEFAULT_LISTS.map((l) => ({ ...l }))),
	)
	const version = ref(stored?.version ?? 1)

	const byId = computed(() => {
		const m = new Map()
		for (const l of lists.value) m.set(l.id, l)
		return m
	})

	const allCodes = computed(() => {
		const set = new Set()
		for (const l of lists.value) {
			for (const code of l.itemCodes) set.add(code)
		}
		return Array.from(set)
	})

	const isInAnyList = (code) => {
		if (!code) return false
		return lists.value.some((l) => l.itemCodes.includes(code))
	}

	const listIdsForCode = (code) => {
		if (!code) return []
		return lists.value
			.filter((l) => l.itemCodes.includes(code))
			.map((l) => l.id)
	}

	const createList = ({ name, color, limit } = {}) => {
		const list = makeEmptyList(name, color, limit)
		list.order = lists.value.length
		lists.value = [...lists.value, list]
		persist(lists.value)
		return list
	}

	const deleteList = (id) => {
		const before = lists.value.length
		const filtered = lists.value.filter((l) => l.id !== id)
		if (filtered.length === before) return false
		lists.value = applyOrder(filtered)
		persist(lists.value)
		return true
	}

	const renameList = (id, newName) => {
		const target = byId.value.get(id)
		if (!target) return false
		const trimmed = (newName || "").trim()
		if (!trimmed) return false
		target.name = trimmed
		target.updatedAt = Date.now()
		persist(lists.value)
		return true
	}

	const setListColor = (id, color) => {
		const target = byId.value.get(id)
		if (!target) return false
		if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color))
			return false
		target.color = color
		target.updatedAt = Date.now()
		persist(lists.value)
		return true
	}

	const addToListView = ({ code, listId, max } = {}) => {
		if (!code) return { ok: false, reason: "invalid-code" }
		const list = listId ? byId.value.get(listId) : lists.value[0]
		if (!list) return { ok: false, reason: "list-not-found" }
		if (list.itemCodes.includes(code))
			return { ok: false, reason: "already-favorited" }
		const limit = max ?? list.limit
		if (list.itemCodes.length >= limit)
			return { ok: false, reason: "list-full", listName: list.name }
		list.itemCodes = [...list.itemCodes, code]
		list.updatedAt = Date.now()
		persist(lists.value)
		return { ok: true }
	}

	const removeFromList = (code, listId) => {
		if (!code) return false
		const list = byId.value.get(listId)
		if (!list) return false
		const idx = list.itemCodes.indexOf(code)
		if (idx < 0) return false
		list.itemCodes.splice(idx, 1)
		list.updatedAt = Date.now()
		persist(lists.value)
		return true
	}

	const removeFromAll = (code) => {
		if (!code) return
		let changed = false
		for (const list of lists.value) {
			const idx = list.itemCodes.indexOf(code)
			if (idx >= 0) {
				list.itemCodes.splice(idx, 1)
				list.updatedAt = Date.now()
				changed = true
			}
		}
		if (changed) persist(lists.value)
	}

	const moveTo = (code, fromListId, toListId, max) => {
		if (!code) return { ok: false, reason: "invalid-code" }
		const from = byId.value.get(fromListId)
		const to = byId.value.get(toListId)
		if (!from || !to) return { ok: false, reason: "list-not-found" }
		const fIdx = from.itemCodes.indexOf(code)
		if (fIdx < 0) return { ok: false, reason: "not-in-source" }
		if (to.itemCodes.includes(code))
			return { ok: false, reason: "already-there" }
		const limit = max ?? to.limit
		if (to.itemCodes.length >= limit)
			return { ok: false, reason: "target-full", listName: to.name }
		from.itemCodes.splice(fIdx, 1)
		to.itemCodes = [...to.itemCodes, code]
		from.updatedAt = Date.now()
		to.updatedAt = Date.now()
		persist(lists.value)
		return { ok: true }
	}

	const reorderLists = (newOrder) => {
		const next = []
		for (const id of newOrder) {
			const found = byId.value.get(id)
			if (found) next.push(found)
		}
		for (const l of lists.value) {
			if (!next.find((n) => n.id === l.id)) next.push(l)
		}
		lists.value = applyOrder(next)
		persist(lists.value)
	}

	const clearAll = () => {
		lists.value = applyOrder(DEFAULT_LISTS.map((l) => ({ ...l })))
		version.value++
		persist(lists.value)
	}

	const exportData = () =>
		JSON.stringify({ lists: lists.value, version: version.value })

	const importData = (json) => {
		try {
			const parsed = JSON.parse(json)
			const normalized = normalizeFavorites(parsed)
			lists.value = applyOrder(normalized.lists)
			version.value = normalized.version
			persist(lists.value)
			return true
		} catch {
			return false
		}
	}

	watch(
		allCodes,
		() => {
			// UI subscribers can react
		},
		{ deep: true },
	)

	return {
		lists,
		version,
		byId,
		allCodes,
		isInAnyList,
		listIdsForCode,
		createList,
		deleteList,
		renameList,
		setListColor,
		addToListView,
		removeFromList,
		removeFromAll,
		moveTo,
		reorderLists,
		clearAll,
		exportData,
		importData,
		getListById: (id) => byId.value.get(id) || null,
		getFirstList: () => lists.value[0] || null,
	}
})
