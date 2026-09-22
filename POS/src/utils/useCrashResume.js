/**
 * DyPOS Crash-Resume (pure logic + persistence).
 *
 * A cashier is mid-checkout (payment panel open, line items in the cart,
 * maybe a partially entered amount) when the app crashes, reloads, or the
 * tab dies. This module snapshots that exact working state to localStorage
 * (`DyPOS_crashDraft`) so the NEXT boot can offer to RESUME the checkout
 * instead of silently losing the sale.
 *
 * Deliberate scope:
 *  - localStorage ONLY. It never touches IndexedDB or the offline sync
 *    queue (double-write guard) — the live-cart autosave layer owns those.
 *  - Pure + testable: no Vue, no logger, no stores. Errors are contained.
 *
 * Financial truth note: the draft is a copy of the cashier's WORKING state
 * (items, quantities, payment panel fields). It is not an authoritative
 * total — server pricing remains the source of truth on submit.
 */
const SCHEMA_VERSION = 1

const STORAGE_KEY = "DyPOS_crashDraft"

/** Max cart lines captured (safety cap, not a business limit). */
const MAX_ITEMS = 500

/** Drafts older than 24h are discarded with a reason code. */
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Max persisted payload (~256KB) to keep localStorage healthy. */
const MAX_DRAFT_BYTES = 256 * 1024

/** At most one non-flush write per second. */
const WRITE_THROTTLE_MS = 1000

/** Clamp restored quantities into a sane range. */
const MAX_QUANTITY = 1_000_000
const MIN_QUANTITY = 0

const PLAIN_TYPES = new Set(["string", "number", "boolean"])

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

/**
 * Deep-copy a value into a plain, serializable shape: strips functions,
 * symbols, refs, class instances and undefined; Dates become ISO strings.
 * Arrays are capped at MAX_ITEMS; recursion is depth-limited so hostile
 * input cannot blow the stack.
 */
function sanitizeValue(value, depth = 0) {
	if (value === null || value === undefined) return null
	if (depth > 12) return null

	const kind = typeof value
	if (PLAIN_TYPES.has(kind)) return value
	if (kind === "bigint") return Number(value).toString()
	if (kind === "function" || kind === "symbol") return null

	if (Array.isArray(value)) {
		const out = []
		const limit = Math.min(value.length, MAX_ITEMS)
		for (let i = 0; i < limit; i++) {
			const child = sanitizeValue(value[i], depth + 1)
			if (child !== null) out.push(child)
		}
		return out
	}

	if (value instanceof Date) {
		const time = Number(value)
		return Number.isNaN(time) ? null : value.toISOString()
	}

	if (typeof value.toISOString === "function") {
		// Date-like (e.g., moment/dayjs instances).
		const time = Number(value)
		return Number.isNaN(time) ? null : value.toISOString()
	}

	const out = {}
	for (const key of Object.keys(value)) {
		const child = sanitizeValue(value[key], depth + 1)
		if (child !== null) out[key] = child
	}
	return out
}

/**
 * Cheap, deterministic "sha256-ish" cart fingerprint — FNV-1a 32-bit over the
 * canonical JSON. NOT cryptographic; it only detects cart drift for dirtying
 * the throttled writer and for human debugging in the runbook.
 */
function cartFingerprint(items) {
	const canonical = JSON.stringify(sanitizeValue(items))
	let hash = 0x811c9dc5
	for (let i = 0; i < canonical.length; i++) {
		hash ^= canonical.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(16).padStart(8, "0")
}

function clampQuantity(value) {
	const n = Number(value)
	if (!Number.isFinite(n)) return MIN_QUANTITY
	return Math.max(MIN_QUANTITY, Math.min(MAX_QUANTITY, n))
}

function toTimestamp(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value
	if (typeof value === "string" && value.length > 0) {
		const time = Date.parse(value)
		return Number.isNaN(time) ? null : time
	}
	return null
}

function toISO(value) {
	if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
		return value
	}
	const time = toTimestamp(value) ?? Date.now()
	return new Date(time).toISOString()
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * Build a sanitized crash draft from the current checkout state.
 * Returns null when there is nothing to resume (empty cart).
 *
 * @param {(Array|{items:Array})} cart - live cart items
 * @param {Object|null} panel - payment panel state (amountReceived, method, …)
 * @param {Object|null} meta - customer / discount context
 * @param {number|string} [ts] - capture timestamp
 * @returns {Object|null}
 */
function captureDraftState(cart, panel, meta, ts) {
	const source = Array.isArray(cart) ? cart : cart?.items
	const items = sanitizeValue(source)
	if (!Array.isArray(items) || items.length === 0) return null

	return {
		schema: SCHEMA_VERSION,
		kind: "checkout",
		savedAt: toISO(ts),
		fingerprint: cartFingerprint(items),
		cart: { items },
		panel: sanitizeValue(panel && typeof panel === "object" ? panel : null),
		meta: sanitizeValue(meta && typeof meta === "object" ? meta : null),
	}
}

// ---------------------------------------------------------------------------
// Restore / validation
// ---------------------------------------------------------------------------

function normalizeDraftItems(rawItems) {
	const out = []
	for (const item of rawItems) {
		if (!item || typeof item !== "object") continue
		const copy = sanitizeValue(item) ?? {}
		if (copy.quantity !== undefined)
			copy.quantity = clampQuantity(copy.quantity)
		if (copy.qty !== undefined) copy.qty = clampQuantity(copy.qty)
		out.push(copy)
	}
	return out
}

/**
 * Validate + normalize a raw draft (parsed JSON or object). Returns
 * { ok: true, draft } or { ok: false, reason }.
 *
 * Reasons: not_json | invalid_draft | schema_invalid | no_items |
 *          too_many_items | invalid_timestamp | too_old | size_exceeded
 */
function restoreDraft(raw, opts = {}) {
	const maxAgeMs = Number.isFinite(opts?.maxAgeMs)
		? opts.maxAgeMs
		: DRAFT_MAX_AGE_MS

	let parsed = raw
	if (typeof raw === "string") {
		try {
			parsed = JSON.parse(raw)
		} catch {
			return { ok: false, reason: "not_json" }
		}
	}

	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { ok: false, reason: "invalid_draft" }
	}

	if (parsed.schema !== SCHEMA_VERSION) {
		return { ok: false, reason: "schema_invalid" }
	}

	const rawItems = parsed.cart?.items
	if (!Array.isArray(rawItems) || rawItems.length === 0) {
		return { ok: false, reason: "no_items" }
	}
	if (rawItems.length > MAX_ITEMS) {
		return { ok: false, reason: "too_many_items" }
	}

	const savedAt = toTimestamp(parsed.savedAt)
	if (!savedAt) return { ok: false, reason: "invalid_timestamp" }
	if (Date.now() - savedAt > maxAgeMs) {
		return { ok: false, reason: "too_old" }
	}

	if (JSON.stringify(parsed).length > MAX_DRAFT_BYTES) {
		return { ok: false, reason: "size_exceeded" }
	}

	const draft = {
		schema: parsed.schema,
		kind: parsed.kind,
		savedAt: parsed.savedAt,
		fingerprint: parsed.fingerprint,
		cart: { items: normalizeDraftItems(rawItems) },
		panel: sanitizeValue(parsed.panel),
		meta: sanitizeValue(parsed.meta),
	}
	return { ok: true, draft }
}

/**
 * Merge rule: the crash draft may ONLY land in an EMPTY live cart — never
 * overwrite an in-progress sale. Pure: returns items, does not mutate.
 */
function mergeDraftIntoCart(draft, currentItems) {
	if (!draft || typeof draft !== "object") {
		return { ok: false, reason: "invalid_draft" }
	}
	const rawItems = draft.cart?.items
	if (!Array.isArray(rawItems) || rawItems.length === 0) {
		return { ok: false, reason: "no_items" }
	}
	if (Array.isArray(currentItems) && currentItems.length > 0) {
		return { ok: false, reason: "cart_not_empty" }
	}
	return { ok: true, items: normalizeDraftItems(rawItems) }
}

// ---------------------------------------------------------------------------
// Persistence (localStorage only)
// ---------------------------------------------------------------------------

function storageAvailable() {
	return typeof localStorage !== "undefined"
}

/** Shrink a draft under the JSON size guard (panel/meta first, then items). */
function trimDraftToFit(draft) {
	if (!draft || typeof draft !== "object") return null
	if (JSON.stringify(draft).length <= MAX_DRAFT_BYTES) return draft

	const base = { ...draft }
	base.panel = null
	base.meta = null
	if (JSON.stringify(base).length <= MAX_DRAFT_BYTES) return base

	const items = Array.isArray(base.cart?.items) ? [...base.cart.items] : []
	while (items.length > 0) {
		items.pop()
		base.cart = { items: [...items] }
		if (JSON.stringify(base).length <= MAX_DRAFT_BYTES) {
			base.fingerprint = cartFingerprint(items)
			return base
		}
	}
	return null
}

/** Single physical writer. Never throws; reports success. */
function writeDraftNow(draft) {
	if (!storageAvailable() || !draft) return false
	const trimmed = trimDraftToFit(draft)
	if (!trimmed) return false
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
		return true
	} catch {
		return false
	}
}

// Throttle state (module-scoped; max 1 physical write / second).
let lastWriteAt = 0
let pendingDraft = null

/**
 * Throttled capture write. Immediate write when the throttle window is open,
 * otherwise the LATEST draft is kept and flushed by flushDraft() (pagehide /
 * interval) or the next boot. Returns whether a physical write happened.
 */
function writeDraftThrottled(draft) {
	if (!storageAvailable() || !draft) return false
	const now = Date.now()
	if (now - lastWriteAt >= WRITE_THROTTLE_MS) {
		lastWriteAt = now
		return writeDraftNow(draft)
	}
	pendingDraft = draft
	return false
}

/** Flush any pending throttle-held draft synchronously (pagehide-safe). */
function flushDraft() {
	if (pendingDraft === null) return false
	const draft = pendingDraft
	pendingDraft = null
	lastWriteAt = Date.now()
	return writeDraftNow(draft)
}

/** Test / controller helpers: reset throttle bookkeeping. */
function resetDraftThrottle() {
	lastWriteAt = 0
	pendingDraft = null
}

function readDraftRaw() {
	if (!storageAvailable()) return null
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return null
		return JSON.parse(raw)
	} catch {
		return null
	}
}

/** Read + validate; mirrors restoreDraft() over persisted state. */
function readValidDraft(opts = {}) {
	return restoreDraft(readDraftRaw(), opts)
}

function hasDraft(opts = {}) {
	return readValidDraft(opts).ok === true
}

/** Discard the crash draft. */
function clearDraft() {
	if (!storageAvailable()) return false
	try {
		localStorage.removeItem(STORAGE_KEY)
		return true
	} catch {
		return false
	}
}

export {
	SCHEMA_VERSION,
	STORAGE_KEY,
	MAX_ITEMS,
	DRAFT_MAX_AGE_MS,
	MAX_DRAFT_BYTES,
	WRITE_THROTTLE_MS,
	MAX_QUANTITY,
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
}

export default {
	SCHEMA_VERSION,
	STORAGE_KEY,
	MAX_ITEMS,
	DRAFT_MAX_AGE_MS,
	MAX_DRAFT_BYTES,
	WRITE_THROTTLE_MS,
	MAX_QUANTITY,
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
}
