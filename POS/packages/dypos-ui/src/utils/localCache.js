/**
 * DyPOS UI Kit — local cache for resources.
 *
 * The old implementation shelled out to a second IndexedDB wrapper library just
 * to stash resource snapshots. This module talks to IndexedDB directly through
 * a tiny promisified helper, which:
 *
 *  - removes a dependency from the offline-critical path,
 *  - degrades to a no-op when IndexedDB is unavailable (private mode, SSR,
 *    test runner) instead of throwing inside a fetch handler,
 *  - never blocks the UI: every call resolves asynchronously and failures are
 *    swallowed (a cache is an optimisation, never a correctness requirement).
 *
 * Stored values are JSON strings, matching the previous on-disk format so an
 * already-installed PWA can read its existing cache after the upgrade.
 */

const DB_NAME = "dypos-ui-cache"
const STORE = "resources"
const DB_VERSION = 1

/** @type {Promise<IDBDatabase|null>|null} */
let dbPromise = null

function openDb() {
	if (dbPromise) return dbPromise
	if (typeof indexedDB === "undefined") {
		dbPromise = Promise.resolve(null)
		return dbPromise
	}
	dbPromise = new Promise((resolve) => {
		let request
		try {
			request = indexedDB.open(DB_NAME, DB_VERSION)
		} catch {
			resolve(null)
			return
		}
		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE)
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => resolve(null)
		request.onblocked = () => resolve(null)
	})
	return dbPromise
}

async function withStore(mode, run) {
	const db = await openDb()
	if (!db) return undefined
	return new Promise((resolve) => {
		let tx
		try {
			tx = db.transaction(STORE, mode)
		} catch {
			resolve(undefined)
			return
		}
		const request = run(tx.objectStore(STORE))
		tx.onerror = () => resolve(undefined)
		tx.onabort = () => resolve(undefined)
		if (request) {
			request.onsuccess = () => resolve(request.result)
			request.onerror = () => resolve(undefined)
		} else {
			tx.oncomplete = () => resolve(undefined)
		}
	})
}

/**
 * Persist a snapshot.
 * @param {string} key
 * @param {unknown} data
 * @returns {Promise<void>}
 */
export async function saveLocal(key, data) {
	if (!key) return
	try {
		await withStore("readwrite", (store) =>
			store.put(JSON.stringify(data), key),
		)
	} catch {
		/* cache write is best-effort */
	}
}

/**
 * Read a snapshot.
 * @param {string} key
 * @returns {Promise<unknown|null>}
 */
export async function getLocal(key) {
	if (!key) return null
	const raw = await withStore("readonly", (store) => store.get(key))
	if (typeof raw !== "string") return raw ?? null
	try {
		return JSON.parse(raw)
	} catch {
		return null
	}
}

/**
 * Drop a snapshot.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function deleteLocal(key) {
	if (!key) return
	try {
		await withStore("readwrite", (store) => store.delete(key))
	} catch {
		/* cache delete is best-effort */
	}
}
