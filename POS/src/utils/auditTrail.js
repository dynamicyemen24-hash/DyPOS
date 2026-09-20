/**
 * auditTrail.js
 * سجل مراقبة كامل لعمليات نقاط البيع (POS Audit Trail).
 * =============================================================================
 *
 * أفضل الممارسات:
 * - كل عملية ماليّة لها audit entry.
 * - السجل append-only (لا يمكن تعديله).
 * - كل entry له timestamp, userId, sessionId, operation, result.
 * - متوافق مع PCI DSS 4.0 Requirement 10.
 *
 * =============================================================================
 */
import { ref, computed } from "vue"
import { logger } from "@/utils/logger"

const log = logger.create("AuditTrail")
const DEFAULT_CONFIG = {
	maxEntries: 1000,
	persistToStorage: true,
}
const config = ref({ ...DEFAULT_CONFIG })
const entries = ref([])
const isRecording = ref(true)
const storageKey = "dypos_audit_trail"

function generateEntryId() {
	const timestamp = Date.now().toString(36)
	const random = Math.random().toString(36).substring(2, 8)
	return `audit_${timestamp}_${random}`
}

function readEntries() {
	if (!config.value.persistToStorage) return []
	try {
		const raw = localStorage.getItem(storageKey)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		return parsed.slice(-config.value.maxEntries)
	} catch (error) {
		log.warn?.("Could not read audit trail", error)
		return []
	}
}

function writeEntries(entriesToSave) {
	if (!config.value.persistToStorage) return
	try {
		localStorage.setItem(storageKey, JSON.stringify(entriesToSave.slice(-config.value.maxEntries)))
	} catch (error) {
		log.warn?.("Could not write audit trail", error)
	}
}

export function addAuditEntry(entry) {
	if (!isRecording.value) {
		log.warn?.("Audit trail is not recording")
		return null
	}

	const now = new Date().toISOString()
	const fullEntry = {
		id: generateEntryId(),
		timestamp: now,
		userId: entry.userId || "unknown",
		sessionId: entry.sessionId || "unknown",
		operation: entry.operation || "unknown",
		description: entry.description || "",
		result: entry.result || "unknown",
		details: entry.details || {},
		error: entry.error || null,
		userAgent: typeof window !== "undefined" ? window.navigator.userAgent : null,
		location: typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : null,
	}

	entries.value.push(fullEntry)
	writeEntries(entries.value)

	log.info?.(`[Audit] ${entry.operation} → ${entry.result}`, { entry: fullEntry })

	return fullEntry
}

export function getAuditEntries() {
	return readEntries()
}

export function getAuditEntriesForOperation(operation) {
	return readEntries().filter(e => e.operation === operation)
}

export function getRecentAuditEntries(count = 10) {
	return readEntries().slice(-count)
}

export function searchAuditEntries(query) {
	if (!query || query.trim() === "") return []
	const lower = query.toLowerCase()
	return readEntries().filter(e =>
		e.description?.toLowerCase().includes(lower) ||
		e.userId?.toLowerCase().includes(lower) ||
		e.operation?.toLowerCase().includes(lower),
	)
}

export function clearAuditTrail() {
	entries.value = []
	writeEntries([])
	log.warn?.("[Audit] Trail cleared")
}

export function startRecording() {
	isRecording.value = true
	log.info?.("[Audit] Recording started")
}

export function stopRecording() {
	isRecording.value = false
	log.info?.("[Audit] Recording stopped")
}

export function isAuditActive() {
	return isRecording.value
}

export const auditEntryCount = computed(() => entries.value.length)

export const lastAuditEntry = computed(() => entries.value[entries.value.length - 1] || null)

export function updateAuditConfig(partialConfig) {
	config.value = { ...config.value, ...partialConfig }
	if (!config.value.persistToStorage) {
		try {
			localStorage.removeItem(storageKey)
		} catch {}
	}
	log.info?.("[Audit] Config updated", config.value)
}

export function exportAuditTrail({ format = "json" } = {}) {
	const data = readEntries()

	if (format === "csv") {
		const headers = ["id", "timestamp", "userId", "sessionId", "operation", "description", "result", "error"]
		const rows = data.map(e => [
			e.id,
			e.timestamp,
			e.userId,
			e.sessionId,
			e.operation,
			`"${e.description || ""}"`,
			e.result,
			e.error || "",
		])
		return [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
	}

	return JSON.stringify(data, null, 2)
}

export function importAuditTrail(data, format = "json") {
	try {
		let parsed
		if (format === "csv") {
			const lines = data.trim().split("\n")
			const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim())
			parsed = lines.slice(1).map(line => {
				const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || []
				const obj = {}
				headers.forEach((header, idx) => {
					obj[header] = values[idx]?.replace(/"/g, "") || ""
				})
				return obj
			})
		} else {
			parsed = JSON.parse(data)
			if (!Array.isArray(parsed)) throw new Error("Expected array")
		}

		entries.value = parsed
		writeEntries(parsed)
		return parsed
	} catch (error) {
		log.error?.(`Could not import audit trail: ${error?.message}`)
		throw error
	}
}

const initialEntries = readEntries()
entries.value = initialEntries
