/** DyPOS Live Cart Autosave v1.32.0
 *
 * Persists the OPEN working invoice (unsent cart) so it survives
 * restarts, power loss, logout, or any unexpected exit.
 *
 * Two-layer crash-proof design:
 *  1. IndexedDB (`DyPOS_live` / `live_cart`) — primary, holds full lines.
 *  2. Synchronous localStorage mirror (`dypos.live_cart.v1`) — power-loss
 *     proof: localStorage writes are synchronous, so even a `pagehide`
 *     flush during a power cut lands safely.
 *
 * Empty carts clear the snapshot (nothing to recover after a submit).
 * Pure storage module — no store imports, safe to import anywhere.
 */
import { logger } from "@/utils/logger"

const log = logger.create("LiveCartAutosave")

const DB_NAME = "DyPOS_live"
const DB_VERSION = 1
const STORE_NAME = "live_cart"
const RECORD_ID = "open-invoice"
const LS_KEY = "dypos.live_cart.v1"

let dbPromise = null

function clone(data) {
	try {
		return JSON.parse(JSON.stringify(data ?? null))
	} catch (error) {
		log.warn("Live cart snapshot is not serializable", error)
		return null
	}
}

function openDb() {
	if (dbPromise) return dbPromise
	if (typeof indexedDB === "undefined") {
		dbPromise = Promise.reject(new Error("IndexedDB unavailable"))
		return dbPromise
	}
	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)
		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result)
		request.onupgradeneeded = (event) => {
			const database = event.target.result
			if (!database.objectStoreNames.contains(STORE_NAME)) {
				database.createObjectStore(STORE_NAME, { keyPath: "id" })
			}
		}
	})
	return dbPromise
}

/** Normalize a cart snapshot; returns null when there is nothing to keep. */
export function buildLiveSnapshot({ items, customer, additionalDiscount }) {
	const cleanItems = clone(items) || []
	if (!Array.isArray(cleanItems) || cleanItems.length === 0) return null
	return {
		id: RECORD_ID,
		v: 1,
		savedAt: new Date().toISOString(),
		items: cleanItems,
		customer: clone(customer),
		additionalDiscount: Number(additionalDiscount) || 0,
	}
}

function writeLocalStorageMirror(snapshot) {
	try {
		if (typeof localStorage === "undefined") return
		if (!snapshot) {
			localStorage.removeItem(LS_KEY)
			return
		}
		localStorage.setItem(LS_KEY, JSON.stringify(snapshot))
	} catch (error) {
		log.debug("localStorage mirror write failed", error?.message)
	}
}

function readLocalStorageMirror() {
	try {
		if (typeof localStorage === "undefined") return null
		const raw = localStorage.getItem(LS_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw)
		return parsed?.id === RECORD_ID &&
			Array.isArray(parsed?.items) &&
			parsed.items.length > 0
			? parsed
			: null
	} catch {
		return null
	}
}

/**
 * Persist the open invoice. Passing an empty cart clears the snapshot.
 * Always resolves — autosave must never break the sale flow.
 */
export async function saveLiveSnapshot(snapshot) {
	// Synchronous mirror first: survives even a mid-write power cut.
	writeLocalStorageMirror(snapshot)
	try {
		const database = await openDb()
		await new Promise((resolve, reject) => {
			const tx = database.transaction([STORE_NAME], "readwrite")
			const store = tx.objectStore(STORE_NAME)
			let request
			if (!snapshot) {
				request = store.delete(RECORD_ID)
			} else {
				request = store.put(snapshot)
			}
			request.onsuccess = () => resolve()
			request.onerror = () => reject(request.error)
		})
	} catch (error) {
		log.debug("IndexedDB live snapshot write failed", error?.message)
	}
}

/** Read the surviving open invoice, if any. IndexedDB first, mirror fallback. */
export async function readLiveSnapshot() {
	try {
		const database = await openDb()
		const record = await new Promise((resolve, reject) => {
			const tx = database.transaction([STORE_NAME], "readonly")
			const request = tx.objectStore(STORE_NAME).get(RECORD_ID)
			request.onsuccess = () => resolve(request.result || null)
			request.onerror = () => reject(request.error)
		})
		if (record && Array.isArray(record.items) && record.items.length > 0) {
			return record
		}
	} catch (error) {
		log.debug("IndexedDB live snapshot read failed", error?.message)
	}
	return readLocalStorageMirror()
}

/** Discard the surviving snapshot (after submit, explicit clear, or discard). */
export async function clearLiveSnapshot() {
	writeLocalStorageMirror(null)
	try {
		const database = await openDb()
		await new Promise((resolve) => {
			const tx = database.transaction([STORE_NAME], "readwrite")
			const request = tx.objectStore(STORE_NAME).delete(RECORD_ID)
			request.onsuccess = () => resolve()
			request.onerror = () => resolve()
		})
	} catch {
		// Mirror already cleared; nothing more to do.
	}
}

export default {
	buildLiveSnapshot,
	saveLiveSnapshot,
	readLiveSnapshot,
	clearLiveSnapshot,
}
