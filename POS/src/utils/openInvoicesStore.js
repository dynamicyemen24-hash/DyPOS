/**
 * openInvoicesStore — durable parking for open (multi) invoices.
 *
 * Same two-layer crash-proof shape as liveCartAutosave, keyed per invoice:
 *  1. IndexedDB (`DyPOS_open_invoices` / `invoices`, keyPath `id`) — primary.
 *  2. Synchronous localStorage mirror (`dypos.open_invoices.v1`) — power-loss
 *     proof for the `pagehide` flush.
 *
 * Writes are debounced (default 800ms) so parking a line at cashier speed
 * never blocks the sale thread; `flushOpenInvoices` forces a synchronous
 * mirror write + best-effort IndexedDB write for unload paths.
 *
 * Pure storage module — no store imports, safe to import anywhere. Every
 * function tolerates missing storage (private mode, SSR) by degrading to
 * memory, never by throwing into the sale flow.
 */
import { logger } from "@/utils/logger"

const log = logger.create("OpenInvoicesStore")

const DB_NAME = "DyPOS_open_invoices"
const DB_VERSION = 1
const STORE_NAME = "invoices"
const LS_KEY = "dypos.open_invoices.v1"

export const PERSIST_DEBOUNCE_MS = 800

let dbPromise = null
let debounceTimer = null
let pendingList = null
const memoryFallback = new Map()

function clone(data) {
	try {
		return JSON.parse(JSON.stringify(data ?? null))
	} catch (error) {
		log.warn("Open invoices snapshot is not serializable", error)
		return null
	}
}

function storageAvailable() {
	try {
		return typeof indexedDB !== "undefined"
	} catch {
		return false
	}
}

function openDb() {
	if (dbPromise) return dbPromise
	if (!storageAvailable()) {
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

/** Keep only JSON-safe parked invoices (drops reactive proxies cleanly). */
export function sanitizeInvoiceList(list) {
	const clean = clone(list)
	return Array.isArray(clean) ? clean.filter((inv) => inv?.id) : []
}

function writeMirror(list) {
	try {
		if (typeof localStorage === "undefined") return
		if (!list || list.length === 0) {
			localStorage.removeItem(LS_KEY)
			return
		}
		localStorage.setItem(LS_KEY, JSON.stringify(list))
	} catch (error) {
		log.debug("Open invoices mirror write failed", error?.message)
	}
}

function readMirror() {
	try {
		if (typeof localStorage === "undefined") return null
		const raw = localStorage.getItem(LS_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed.filter((inv) => inv?.id) : null
	} catch {
		return null
	}
}

async function writeAll(list) {
	const clean = sanitizeInvoiceList(list)
	writeMirror(clean)
	try {
		const database = await openDb()
		await new Promise((resolve, reject) => {
			const tx = database.transaction([STORE_NAME], "readwrite")
			const store = tx.objectStore(STORE_NAME)
			store.clear()
			for (const inv of clean) store.put(inv)
			tx.oncomplete = () => resolve()
			tx.onerror = () => reject(tx.error)
		})
	} catch (error) {
		log.debug("Open invoices IndexedDB write failed", error?.message)
		for (const inv of clean) memoryFallback.set(String(inv.id), inv)
	}
}

/**
 * Schedule a debounced persist (cashier-speed safe). Always resolves —
 * persistence must never break the sale flow.
 */
export function persistOpenInvoices(list) {
	pendingList = sanitizeInvoiceList(list)
	if (debounceTimer) clearTimeout(debounceTimer)
	debounceTimer = setTimeout(() => {
		debounceTimer = null
		const due = pendingList
		pendingList = null
		void writeAll(due)
	}, PERSIST_DEBOUNCE_MS)
	return true
}

/** Immediate persist for unload/submit paths (mirror is synchronous). */
export async function flushOpenInvoices(list) {
	if (debounceTimer) {
		clearTimeout(debounceTimer)
		debounceTimer = null
	}
	pendingList = null
	await writeAll(list)
}

/** Boot read: IndexedDB first, mirror fallback, memory last. */
export async function readOpenInvoices() {
	try {
		const database = await openDb()
		const rows = await new Promise((resolve, reject) => {
			const tx = database.transaction([STORE_NAME], "readonly")
			const request = tx.objectStore(STORE_NAME).getAll()
			request.onsuccess = () => resolve(request.result || [])
			request.onerror = () => reject(request.error)
		})
		const clean = (Array.isArray(rows) ? rows : []).filter((inv) => inv?.id)
		if (clean.length > 0) return clean
	} catch (error) {
		log.debug("Open invoices IndexedDB read failed", error?.message)
	}
	const mirror = readMirror()
	if (mirror && mirror.length > 0) return mirror
	if (memoryFallback.size > 0) return [...memoryFallback.values()]
	return []
}

/** Test/edge helper: drop timers + memory without touching storage. */
export function resetOpenInvoicesPersistence() {
	if (debounceTimer) {
		clearTimeout(debounceTimer)
		debounceTimer = null
	}
	pendingList = null
	memoryFallback.clear()
}

export default {
	PERSIST_DEBOUNCE_MS,
	sanitizeInvoiceList,
	persistOpenInvoices,
	flushOpenInvoices,
	readOpenInvoices,
	resetOpenInvoicesPersistence,
}
