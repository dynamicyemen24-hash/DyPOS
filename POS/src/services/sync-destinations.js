/**
 * Sync destinations — runtime-selectable sync targets (world-class POSsync).
 *
 * A cashier device works fully offline against its local store. When it must
 * push sales elsewhere — another branch, the cloud — the operator picks the
 * DESTINATION at runtime from the Sync screen instead of a build-time URL.
 *
 * Model (localStorage, framework-free, unit-tested):
 *   destination = { id, name, kind: 'local'|'branch'|'cloud',
 *                   baseUrl, username, updatedAt }
 *   - `local` is built-in and immutable: same-origin backend (current path).
 *   - `branch`/`cloud` carry an absolute http(s) baseUrl (LAN branches are
 *     plain http — allowed deliberately) + per-destination token storage.
 *   - Exactly one destination is `active` (the sync-now default).
 *   - Per-destination ops state: lastSyncAt / lastError / lastSyncedCount.
 *
 * Security posture: tokens live in localStorage next to the existing
 * DyPOS_access_token (same threat model as the platform layer); baseUrls
 * are validated http(s) only (no javascript:, no credentials in URL).
 */

const DESTS_KEY = "DyPOS_sync_destinations"
const ACTIVE_KEY = "DyPOS_sync_active_destination"
const TOKEN_PREFIX = "DyPOS_sync_token_"
const STATE_PREFIX = "DyPOS_sync_state_"

export const DEST_KINDS = Object.freeze({
	LOCAL: "local",
	BRANCH: "branch",
	CLOUD: "cloud",
})

export const LOCAL_DESTINATION_ID = "local"

function nowIso() {
	return new Date().toISOString()
}

function readJson(key, fallback) {
	try {
		const raw =
			typeof localStorage !== "undefined" ? localStorage.getItem(key) : null
		if (!raw) return fallback
		return JSON.parse(raw)
	} catch {
		return fallback
	}
}

function writeJson(key, value) {
	if (typeof localStorage === "undefined") return false
	try {
		localStorage.setItem(key, JSON.stringify(value))
		return true
	} catch {
		return false
	}
}

/** Normalize a destination base URL. Returns "" for the local destination. */
export function normalizeBaseUrl(baseUrl, kind) {
	if (kind === DEST_KINDS.LOCAL) return ""
	const raw = String(baseUrl || "").trim()
	if (!raw) return ""
	// Reject non-http(s) schemes and embedded credentials outright.
	if (/^(javascript|data|file|ftp):/i.test(raw)) return ""
	const withScheme =
		/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)
			? ""
			: raw
	if (!withScheme) return ""
	let url
	try {
		url = new URL(
			/^https?:\/\//i.test(withScheme) ? withScheme : `http://${withScheme}`,
		)
	} catch {
		return ""
	}
	if (url.username || url.password) return ""
	if (url.protocol !== "http:" && url.protocol !== "https:") return ""
	return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`
}

/** Validate a destination draft. Returns { ok, errors } (Arabic messages). */
export function validateDestination(draft) {
	const errors = []
	const name = String(draft?.name || "").trim()
	if (!name) errors.push("اسم الوجهة مطلوب")
	else if (name.length > 60) errors.push("اسم الوجهة أطول من 60 حرفًا")
	const kind = draft?.kind
	if (!Object.values(DEST_KINDS).includes(kind)) {
		errors.push("نوع الوجهة غير صالح")
	} else if (kind !== DEST_KINDS.LOCAL) {
		const base = normalizeBaseUrl(draft?.baseUrl, kind)
		if (!base) errors.push("رابط الوجهة غير صالح (http(s)://host[:port])")
	}
	return { ok: errors.length === 0, errors }
}

function builtinLocal() {
	return {
		id: LOCAL_DESTINATION_ID,
		name: "الخادم الحالي",
		kind: DEST_KINDS.LOCAL,
		baseUrl: "",
		username: "",
		updatedAt: nowIso(),
		builtin: true,
	}
}

function storedDestinations() {
	const list = readJson(DESTS_KEY, [])
	return Array.isArray(list) ? list : []
}

function persistDestinations(list) {
	writeJson(DESTS_KEY, list)
}

/** List all destinations (built-in local first). */
export function listDestinations() {
	const customs = storedDestinations().filter(
		(d) => d && d.id !== LOCAL_DESTINATION_ID,
	)
	return [builtinLocal(), ...customs]
}

export function getDestination(id) {
	if (!id || id === LOCAL_DESTINATION_ID) return builtinLocal()
	return storedDestinations().find((d) => d && d.id === id) || null
}

/** Create or update a destination. Returns { ok, destination?, errors? }. */
export function saveDestination(draft) {
	if (draft?.id === LOCAL_DESTINATION_ID || draft?.builtin) {
		return { ok: false, errors: ["الوجهة المدمجة لا تُعدَّل"] }
	}
	const { ok, errors } = validateDestination(draft)
	if (!ok) return { ok: false, errors }
	const list = storedDestinations()
	const id =
		String(draft.id || "")
			.trim()
			.slice(0, 64) ||
		`dest_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
	const clean = {
		id,
		name: String(draft.name).trim().slice(0, 60),
		kind: draft.kind,
		baseUrl: normalizeBaseUrl(draft.baseUrl, draft.kind),
		username: String(draft.username || "")
			.trim()
			.slice(0, 128),
		updatedAt: nowIso(),
	}
	const idx = list.findIndex((d) => d && d.id === id)
	if (idx >= 0) {
		// Base URL change invalidates the stored token (different origin).
		if (list[idx].baseUrl !== clean.baseUrl) clearDestinationToken(id)
		list[idx] = { ...list[idx], ...clean }
	} else {
		list.push(clean)
	}
	persistDestinations(list)
	return { ok: true, destination: clean }
}

export function deleteDestination(id) {
	if (!id || id === LOCAL_DESTINATION_ID) return false
	const next = storedDestinations().filter((d) => !d || d.id !== id)
	persistDestinations(next)
	clearDestinationToken(id)
	try {
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(STATE_PREFIX + id)
			if (getActiveDestinationId() === id) {
				setActiveDestinationId(LOCAL_DESTINATION_ID)
			}
		}
	} catch {
		/* ignore */
	}
	return true
}

export function getActiveDestinationId() {
	try {
		const id =
			typeof localStorage !== "undefined"
				? localStorage.getItem(ACTIVE_KEY)
				: null
		if (id && getDestination(id)) return id
	} catch {
		/* ignore */
	}
	return LOCAL_DESTINATION_ID
}

export function setActiveDestinationId(id) {
	const dest = getDestination(id)
	const finalId = dest ? dest.id : LOCAL_DESTINATION_ID
	try {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(ACTIVE_KEY, finalId)
		}
	} catch {
		/* ignore */
	}
	return finalId
}

export function getDestinationToken(id) {
	if (!id || id === LOCAL_DESTINATION_ID) return null
	try {
		return (
			(typeof localStorage !== "undefined"
				? localStorage.getItem(TOKEN_PREFIX + id)
				: null) || null
		)
	} catch {
		return null
	}
}

export function setDestinationToken(id, token) {
	if (!id || id === LOCAL_DESTINATION_ID) return false
	try {
		if (typeof localStorage === "undefined") return false
		if (token) localStorage.setItem(TOKEN_PREFIX + id, String(token))
		else localStorage.removeItem(TOKEN_PREFIX + id)
		return true
	} catch {
		return false
	}
}

export function clearDestinationToken(id) {
	return setDestinationToken(id, null)
}

/** Per-destination ops state: last sync result for the Sync screen. */
export function getDestinationState(id) {
	return readJson(STATE_PREFIX + (id || LOCAL_DESTINATION_ID), {
		lastSyncAt: null,
		lastError: null,
		lastSyncedCount: 0,
	})
}

export function touchDestination(id, patch = {}) {
	const key = STATE_PREFIX + (id || LOCAL_DESTINATION_ID)
	const prev = getDestinationState(id)
	const next = {
		lastSyncAt: patch.lastSyncAt ?? prev.lastSyncAt ?? null,
		lastError: patch.lastError ?? null,
		lastSyncedCount:
			typeof patch.lastSyncedCount === "number"
				? patch.lastSyncedCount
				: (prev.lastSyncedCount ?? 0),
	}
	writeJson(key, next)
	return next
}
