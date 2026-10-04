import {
	LINK_MODES,
	LINK_REASONS,
	setAutomationMaster,
	setLinkMode,
} from "@/services/link-consent"

export const RUNTIME_ENDPOINTS_KEY = "DyPOS_runtime_endpoints_v1"

export const SERVICE_ENDPOINTS = Object.freeze({
	API: "api",
	PLATFORM: "platform",
	SOCKET: "socket",
})

const SERVICE_KEYS = new Set(Object.values(SERVICE_ENDPOINTS))
const PLATFORM_CREDENTIAL_KEYS = [
	"DyPOS_access_token",
	"DyPOS_refresh_token",
	"DyPOS_token_expiry",
	"DyPOS_tenant_id",
	"DyPOS_employee_id",
]

let memoryOverrides = {}
const listeners = new Set()

function buildFallback(service) {
	switch (service) {
		case SERVICE_ENDPOINTS.API:
			return import.meta.env?.VITE_DYPOS_API || "/api"
		case SERVICE_ENDPOINTS.PLATFORM:
			return import.meta.env?.VITE_PLATFORM_URL || ""
		case SERVICE_ENDPOINTS.SOCKET:
			return import.meta.env?.VITE_SOCKETIO_URL || ""
		default:
			return ""
	}
}

function readOverrides() {
	try {
		const raw = localStorage.getItem(RUNTIME_ENDPOINTS_KEY)
		if (!raw) return {}
		const saved = JSON.parse(raw)
		if (
			saved?.version !== 1 ||
			!saved.endpoints ||
			typeof saved.endpoints !== "object"
		) {
			return {}
		}
		return Object.fromEntries(
			Object.entries(saved.endpoints).filter(
				([service, value]) =>
					SERVICE_KEYS.has(service) && typeof value === "string",
			),
		)
	} catch {
		return { ...memoryOverrides }
	}
}

function writeOverrides(endpoints) {
	memoryOverrides = { ...endpoints }
	try {
		localStorage.setItem(
			RUNTIME_ENDPOINTS_KEY,
			JSON.stringify({ version: 1, endpoints: memoryOverrides }),
		)
		return true
	} catch {
		return false
	}
}

function isLocalNetworkHost(hostname) {
	const host = String(hostname || "")
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
	if (
		host === "localhost" ||
		host.endsWith(".localhost") ||
		host.endsWith(".local") ||
		host === "::1" ||
		/^(fc|fd|fe80):/.test(host)
	) {
		return true
	}
	const octets = host.split(".").map(Number)
	if (
		octets.length !== 4 ||
		octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
	) {
		return false
	}
	return (
		octets[0] === 10 ||
		(octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
		(octets[0] === 192 && octets[1] === 168) ||
		octets[0] === 127 ||
		(octets[0] === 169 && octets[1] === 254)
	)
}

function normalizeEndpoint(service, value) {
	if (!SERVICE_KEYS.has(service))
		return { ok: false, error: "نوع الخدمة غير معروف" }
	const raw = String(value ?? "").trim()
	if (!raw) return { ok: true, value: "" }
	if (raw.startsWith("//") || /[?#]/.test(raw)) {
		return { ok: false, error: "أدخل عنوانًا دون query أو fragment" }
	}

	if (raw.startsWith("/")) {
		if (service === SERVICE_ENDPOINTS.SOCKET || raw.includes("\\")) {
			return { ok: false, error: "هذه الخدمة تتطلب عنوان HTTP(S) كاملًا" }
		}
		return { ok: true, value: raw.replace(/\/+$/, "") || "/" }
	}

	let parsed
	try {
		parsed = new URL(raw)
	} catch {
		return { ok: false, error: "أدخل عنوانًا يبدأ بـ http:// أو https://" }
	}
	if (
		!/^https?:$/.test(parsed.protocol) ||
		parsed.username ||
		parsed.password
	) {
		return { ok: false, error: "يُسمح بعناوين HTTP(S) دون بيانات اعتماد مضمّنة" }
	}
	if (parsed.protocol === "http:" && !isLocalNetworkHost(parsed.hostname)) {
		return {
			ok: false,
			error:
				"الاتصال الخارجي يتطلب HTTPS؛ HTTP مسموح لعناوين الشبكة المحلية فقط",
		}
	}
	return {
		ok: true,
		value: `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`,
	}
}

export function validateServiceEndpoint(service, value) {
	return normalizeEndpoint(service, value)
}

export function getServiceEndpoint(service) {
	if (!SERVICE_KEYS.has(service)) return ""
	return readOverrides()[service] || buildFallback(service)
}

export function getServiceEndpointOverride(service) {
	if (!SERVICE_KEYS.has(service)) return ""
	return readOverrides()[service] || ""
}

export function listRuntimeEndpoints() {
	return Object.fromEntries(
		[...SERVICE_KEYS].map((service) => [
			service,
			{
				override: getServiceEndpointOverride(service),
				effective: getServiceEndpoint(service),
			},
		]),
	)
}

function clearServiceCredential(service) {
	try {
		if (service === SERVICE_ENDPOINTS.API)
			localStorage.removeItem("dypos_token")
		if (service === SERVICE_ENDPOINTS.PLATFORM) {
			for (const key of PLATFORM_CREDENTIAL_KEYS) localStorage.removeItem(key)
		}
	} catch {
		/* Credentials are cleared best-effort when browser storage is unavailable. */
	}
}

function notify(change) {
	for (const listener of [...listeners]) {
		try {
			listener(change)
		} catch {
			/* One consumer must not prevent the other service clients from stopping. */
		}
	}
	if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
		window.dispatchEvent(
			new CustomEvent("dypos:service-endpoint-changed", { detail: change }),
		)
	}
}

function parseStoredEndpoints(raw) {
	if (!raw) return {}
	try {
		const parsed = JSON.parse(raw)
		return parsed?.version === 1 &&
			parsed.endpoints &&
			typeof parsed.endpoints === "object"
			? parsed.endpoints
			: {}
	} catch {
		return {}
	}
}

/**
 * Save a local-only service endpoint. A changed trust target revokes linkage,
 * disables all automation, and clears that service's persisted credentials.
 * Saving never probes or contacts the configured service.
 */
export function setServiceEndpoint(service, value) {
	const normalized = normalizeEndpoint(service, value)
	if (!normalized.ok) return normalized

	const endpoints = readOverrides()
	const previous = endpoints[service] || ""
	if (previous === normalized.value) {
		return { ok: true, changed: false, persisted: true, value: previous }
	}
	if (normalized.value) endpoints[service] = normalized.value
	else delete endpoints[service]

	const persisted = writeOverrides(endpoints)
	setLinkMode(LINK_MODES.STANDALONE, LINK_REASONS.REVOKED)
	setAutomationMaster(false)
	clearServiceCredential(service)
	notify({ service, previous, value: normalized.value, persisted })
	return { ok: true, changed: true, persisted, value: normalized.value }
}

export function subscribeRuntimeEndpoints(listener) {
	if (typeof listener !== "function") return () => {}
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/** Keep other open tabs' sockets and service clients from using a stale target. */
if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key !== RUNTIME_ENDPOINTS_KEY) return
		const previous = parseStoredEndpoints(event.oldValue)
		const next = parseStoredEndpoints(event.newValue)
		for (const service of Object.values(SERVICE_ENDPOINTS)) {
			if ((previous[service] || "") !== (next[service] || "")) {
				clearServiceCredential(service)
				notify({
					service,
					previous: previous[service] || "",
					value: next[service] || "",
					externalChange: true,
				})
			}
		}
	})
}
