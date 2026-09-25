/**
 * Remote sync transport — push local sales to a runtime-chosen destination.
 *
 * The device works fully offline against IndexedDB. When the operator picks
 * a destination (another branch, the cloud) from the Sync screen, invoices
 * flow through HERE over plain REST (frappe-ui is same-origin-hardcoded and
 * cannot address runtime URLs):
 *
 *   POST {baseUrl}/api/invoices  { items, payments, customerName,
 *                                  idempotencyKey: offline_id }
 *
 * Correctness pillars:
 * - Idempotency FIRST: offline_id is the idempotency key, so retries and
 *   double-taps can never double-post (server answers { deduped: true }).
 * - Catalog alignment: products are resolved code → REMOTE id via a cached
 *   catalog map. Unmapped SKUs fail LOUDLY with the exact codes (Arabic),
 *   never silently dropped or mismatched.
 * - Foreign ledgers stay clean: customerId is NOT forwarded (IDs differ per
 *   database) — only the display name travels.
 * - Offline fast-fail: no 15s-timeout storms when radios report offline.
 */

import SyncProtocol, { kindForStatus } from "./sync-protocol.js"
import { SyncError, SyncErrorKind } from "./sync-error.js"
import {
	getDestinationToken,
	setDestinationToken,
} from "./sync-destinations.js"

const REQUEST_TIMEOUT_MS = 15000
const CATALOG_TTL_MS = 10 * 60 * 1000
const CATALOG_PAGE = 500

function isDefinitelyOffline() {
	try {
		if (typeof navigator !== "undefined" && navigator.onLine === false) {
			return true
		}
	} catch {
		/* non-browser — assume online */
	}
	return false
}

function offlineError() {
	const err = new Error(
		"لا يوجد اتصال بالإنترنت — سيُحفظ العمل محليًا ويُزامَن لاحقًا",
	)
	err.code = "OFFLINE"
	err.status = 0
	err.offline = true
	return err
}

/** Normalize any transport failure into { ok:false, code, message, ... }. */
export function mapRemoteError(error, destName) {
	const where = destName ? ` (${destName})` : ""
	if (!error) {
		return { ok: false, code: "UNKNOWN", message: `خطأ غير معروف${where}` }
	}
	if (error?.offline === true || error?.code === "OFFLINE") {
		return { ok: false, code: "OFFLINE", message: error.message, offline: true }
	}
	const kind = error?.kind || error?.name
	const status = Number(
		error?.statusCode ?? error?.status ?? error?.response?.status,
	)
	if (kind === SyncErrorKind.AUTH_REVOKED || status === 401) {
		return {
			ok: false,
			code: "AUTH",
			needsLogin: true,
			message: `انتهت جلسة الوجهة${where} — سجّل الدخول مجددًا من شاشة المزامنة`,
		}
	}
	if (kind === SyncErrorKind.REMOTE_FORBIDDEN || status === 403) {
		return {
			ok: false,
			code: "FORBIDDEN",
			message: `صلاحية غير كافية على الوجهة${where}`,
		}
	}
	if (kind === SyncErrorKind.TIMEOUT || error?.name === "AbortError") {
		return {
			ok: false,
			code: "TIMEOUT",
			retryable: true,
			message: `انتهت مهلة الوجهة${where} — تحقق من الشبكة وحاول مجددًا`,
		}
	}
	if (kind === SyncErrorKind.REMOTE_CONFLICT || status === 409) {
		return {
			ok: false,
			code: "CONFLICT",
			retryable: true,
			message: `تعارض مؤقت على الوجهة${where} — سيُعاد تلقائيًا`,
		}
	}
	if (
		kind === SyncErrorKind.REMOTE_SERVER_ERROR ||
		(status >= 500 && status <= 599)
	) {
		return {
			ok: false,
			code: "SERVER",
			retryable: true,
			message: `خطأ من الوجهة${where} (${status || "؟"}) — سيُعاد تلقائيًا`,
		}
	}
	const detail = String(
		error?.message || error?.details?.error || error || "",
	).slice(0, 200)
	return {
		ok: false,
		code: error?.code || `HTTP_${status || "?"}`,
		message: detail ? `${detail}${where}` : `فشلت المزامنة${where}`,
	}
}

function protocolFor(dest, token) {
	return new SyncProtocol({
		baseUrl: dest.baseUrl,
		timeout: REQUEST_TIMEOUT_MS,
		retryCount: 0, // the queue layer owns retry policy, not the socket
		tokenProvider: token ? async () => token : null,
	})
}

/** Liveness probe: is this origin a DyPOS backend? */
export async function pingDestination(dest) {
	if (!dest?.baseUrl)
		return { ok: false, code: "NO_URL", message: "لا رابط للوجهة" }
	if (isDefinitelyOffline()) return mapRemoteError(offlineError(), dest.name)
	try {
		const protocol = protocolFor(dest, getDestinationToken(dest.id))
		const res = await protocol.healthCheck()
		// REST /api/health answers { status:'ok', ... } (SyncProtocol's own
		// "healthy" wrapper is overwritten by the spread — accept both).
		if (res && (res.status === "healthy" || res.status === "ok")) {
			return { ok: true }
		}
		return {
			ok: false,
			code: "NOT_DYPOS",
			message: `الوجهة ${dest.name} لا ترد كبوابة DyPOS — تحقق من الرابط`,
		}
	} catch (error) {
		return mapRemoteError(error, dest.name)
	}
}

/** Authenticate against the destination; persists the token on success. */
export async function loginDestination(dest, username, password) {
	if (!dest?.baseUrl)
		return { ok: false, code: "NO_URL", message: "لا رابط للوجهة" }
	if (isDefinitelyOffline()) return mapRemoteError(offlineError(), dest.name)
	const user = String(username || "").trim()
	if (!user || !password) {
		return {
			ok: false,
			code: "CREDENTIALS",
			message: "اسم المستخدم وكلمة المرور مطلوبان",
		}
	}
	try {
		const protocol = protocolFor(dest, null)
		const res = await protocol.post("/api/auth/login", {
			username: user,
			password: String(password),
		})
		const token = res?.token
		if (!token) {
			return { ok: false, code: "AUTH", message: "رد غير متوقع من الوجهة" }
		}
		setDestinationToken(dest.id, token)
		return { ok: true, token, user: res?.user || null }
	} catch (error) {
		return mapRemoteError(error, dest.name)
	}
}

const catalogCache = new Map() // destId -> { at, map: Map(code -> id) }

/**
 * Destination catalog alignment: local item_code → REMOTE product id.
 * Cached 10 minutes per destination; paginated to any catalog size.
 */
export async function fetchCatalogMap(dest, { token, force = false } = {}) {
	if (!dest?.baseUrl) {
		return { ok: false, code: "NO_URL", message: "لا رابط للوجهة" }
	}
	const hit = catalogCache.get(dest.id)
	if (hit && !force && Date.now() - hit.at < CATALOG_TTL_MS) {
		return { ok: true, map: hit.map }
	}
	if (isDefinitelyOffline()) return mapRemoteError(offlineError(), dest.name)
	try {
		const protocol = protocolFor(dest, token ?? getDestinationToken(dest.id))
		const map = new Map()
		let offset = 0
		for (;;) {
			const res = await protocol.get("/api/products", {
				limit: CATALOG_PAGE,
				offset,
				count: false,
			})
			const rows = Array.isArray(res?.products) ? res.products : []
			for (const p of rows) {
				if (p?.code && p?.id && !map.has(p.code)) map.set(p.code, p.id)
			}
			if (!res?.hasMore || rows.length < CATALOG_PAGE) break
			offset += rows.length
			if (offset > 200000) break // sanity ceiling
		}
		catalogCache.set(dest.id, { at: Date.now(), map })
		return { ok: true, map }
	} catch (error) {
		return mapRemoteError(error, dest.name)
	}
}

export function clearCatalogCache(destId) {
	if (destId) catalogCache.delete(destId)
	else catalogCache.clear()
}

/**
 * Map a queued (Frappe-shaped) invoice to the destination REST contract.
 * Returns { ok, payload } or { ok:false, missing:[codes] } when SKUs are
 * unknown on the destination — LOUD, never silent.
 */
export function mapInvoiceForRemote(queueInvoice, catalogMap) {
	const data = queueInvoice?.data || {}
	const offlineId = queueInvoice?.offline_id || data?.offline_id || null
	const rawItems = Array.isArray(data.items) ? data.items : []
	const items = []
	const missing = []
	for (const it of rawItems) {
		const code = String(it.item_code || it.product_id || "").trim()
		if (!code) continue
		const remoteId = catalogMap?.get(code)
		if (!remoteId) {
			if (!missing.includes(code)) missing.push(code)
			continue
		}
		const qty = Number(it.qty ?? it.quantity ?? 1)
		items.push({
			productId: remoteId,
			qty,
			unitPrice: Number(it.rate ?? it.unitPrice ?? 0),
			uom: String(it.uom || "Unit").slice(0, 20),
			warehouseId: String(it.warehouse || it.warehouse_id || "W-01").slice(
				0,
				32,
			),
			...(it.discount != null ? { discount: Number(it.discount) || 0 } : {}),
			...(it.tax_rate != null ? { taxRate: Number(it.tax_rate) || 0 } : {}),
			...(it.is_free_item ? { isFreeItem: true } : {}),
		})
	}
	if (missing.length) return { ok: false, missing }
	if (!items.length) {
		return { ok: false, missing: [], error: "الفاتورة بلا بنود صالحة" }
	}
	const rawPayments = Array.isArray(data.payments) ? data.payments : []
	const payments = rawPayments
		.filter((p) => p && !p.is_customer_credit)
		.map((p) => ({
			method: String(p.mode_of_payment || p.method || "CASH")
				.toUpperCase()
				.slice(0, 20),
			amount: Number(p.amount) || 0,
			...(p.reference ? { reference: String(p.reference).slice(0, 128) } : {}),
		}))
		.filter((p) => p.amount >= 0)
		.slice(0, 10)
	return {
		ok: true,
		payload: {
			items,
			payments,
			// Foreign ledger: never fabricate cross-database customer links.
			customerId: null,
			customerName: String(
				data.customer_name || data.customer || "Walk-in Customer",
			).slice(0, 200),
			idempotencyKey: offlineId || "",
			notes: String(data.remarks || "").slice(0, 1000),
		},
	}
}

/**
 * Push ONE queued invoice to a remote destination.
 * Idempotent via offline_id: safe to retry, resume, and double-tap.
 */
export async function pushInvoiceToDestination(queueInvoice, dest, opts = {}) {
	if (!dest?.baseUrl) {
		return { ok: false, code: "NO_URL", message: "لا رابط للوجهة" }
	}
	if (isDefinitelyOffline()) return mapRemoteError(offlineError(), dest.name)
	const offlineId =
		queueInvoice?.offline_id || queueInvoice?.data?.offline_id || null
	try {
		const token = opts.token ?? getDestinationToken(dest.id)
		const catalog = await fetchCatalogMap(dest, { token })
		if (!catalog.ok) return catalog
		const mapped = mapInvoiceForRemote(queueInvoice, catalog.map)
		if (!mapped.ok) {
			if (mapped.missing?.length) {
				return {
					ok: false,
					code: "UNKNOWN_SKU",
					missing: mapped.missing,
					message: `أصناف غير معرّفة على ${dest.name}: ${mapped.missing.join("، ")} — عرّفها هناك أولًا`,
				}
			}
			return {
				ok: false,
				code: "EMPTY",
				message: mapped.error || "الفاتورة بلا بنود صالحة",
			}
		}
		const protocol = protocolFor(dest, token)
		const res = await protocol.post("/api/invoices", mapped.payload)
		const invoiceId = res?.invoiceId
		if (!invoiceId) {
			return {
				ok: false,
				code: "BAD_RESPONSE",
				message: `رد غير متوقع من ${dest.name}`,
			}
		}
		return {
			ok: true,
			deduped: res?.deduped === true,
			invoiceId,
			serverName: res?.number || invoiceId,
		}
	} catch (error) {
		const mappedErr = mapRemoteError(error, dest.name)
		// Stale token? Drop it so the next attempt re-authenticates loudly
		// instead of burning the bad token forever.
		if (mappedErr.needsLogin) setDestinationToken(dest.id, null)
		return mappedErr
	}
}

// Re-exported for tests: SyncError vocabulary used by the queue layer.
export { SyncError, SyncErrorKind, kindForStatus }
