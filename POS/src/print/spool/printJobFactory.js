/**
 * PrintJob Factory — SAP-style spool job construction.
 *
 * Builds normalized {@link PrintJob} objects, issues human spool numbers,
 * and derives idempotency keys so duplicate submissions collapse into a
 * single queue entry.
 */

export const JOB_STATUSES = Object.freeze({
	QUEUED: "QUEUED",
	PROCESSING: "PROCESSING",
	COMPLETED: "COMPLETED",
	FAILED: "FAILED",
	CANCELLED: "CANCELLED",
	PARTIAL: "PARTIAL",
})

export const TERMINAL_STATUSES = Object.freeze([
	JOB_STATUSES.COMPLETED,
	JOB_STATUSES.FAILED,
	JOB_STATUSES.CANCELLED,
	JOB_STATUSES.PARTIAL,
])

export const IN_PROGRESS_STATUSES = Object.freeze([
	JOB_STATUSES.QUEUED,
	JOB_STATUSES.PROCESSING,
])

export const DOC_TYPES = Object.freeze([
	"invoice",
	"eod",
	"draft",
	"quotation",
	"return_receipt",
	"report_daily",
	"custom",
])

const SPOOL_PREFIX = "SPR"

function createPrintJobId() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID()
	}
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0
		const v = c === "x" ? r : (r & 0x3) | 0x8
		return v.toString(16)
	})
}

/**
 * Format a sequential number into an SAP-style spool number (SPR-000123).
 * @param {number} seq
 * @returns {string}
 */
export function createSpoolNo(seq) {
	const n = Number(seq) || 0
	return `${SPOOL_PREFIX}-${String(n).padStart(6, "0")}`
}

/**
 * Normalize an incoming job request into a persisted {@link PrintJob}.
 * @param {Object} input
 * @param {number} [input.copies]
 * @param {Object} [input.payload]
 * @param {string} [input.spoolNo]
 * @returns {PrintJob}
 */
export function buildPrintJob(input) {
	const {
		docType = "invoice",
		docId = "",
		title = "",
		payload = null,
		formId = "",
		deviceId = "browser",
		copies = 1,
		priority = 0,
		maxAttempts = 3,
		qzPrinter = null,
		reprintOf = null,
		requestedBy = "",
		terminalId = "",
		spoolNo = "",
	} = input || {}

	const safeCopies = Math.max(1, Math.min(Number(copies) || 1, 20))

	return {
		id: createPrintJobId(),
		spoolNo,
		docType,
		docId,
		title,
		status: JOB_STATUSES.QUEUED,
		payload,
		formId,
		deviceId,
		copies: safeCopies,
		priority: priority === 1 ? 1 : 0,
		attempts: 0,
		maxAttempts: Number(maxAttempts) >= 1 ? Number(maxAttempts) : 3,
		lastError: null,
		qzPrinter,
		createdAt: Date.now(),
		startedAt: null,
		finishedAt: null,
		reprintOf,
		printedCount: 0,
		printedCopies: 0,
		requestedBy,
		terminalId,
		pendingRetryTime: null,
	}
}

/**
 * Canonical dedupe key for a job.
 * Reprints are deliberately kept distinct from the original document.
 * @param {Object} job
 * @returns {string}
 */
export function idempotencyKeyOf(job) {
	const docId = String(job?.docId ?? "")
	const reprintOf = String(job?.reprintOf ?? "")
	return `${job?.docType}:${docId}:${reprintOf}`
}

/**
 * True when an identical job already sits in the window.
 * Repeated clicks on Print within `windowMs` collapse into one job.
 * @param {PrintJob|null} existing
 * @param {string} key
 * @param {number} now
 * @param {number} [windowMs]
 * @returns {boolean}
 */
export function isDuplicateWithinWindow(existing, key, now, windowMs = 3000) {
	if (!existing) return false
	if (!IN_PROGRESS_STATUSES.includes(existing.status)) return false
	if (idempotencyKeyOf(existing) !== key) return false
	return now - existing.createdAt <= windowMs
}

const BASE_RETRY_MS = 1000
const MAX_RETRY_MS = 60000

/**
 * Exponential backoff for a failed attempt: 1s → 2s → 4s → … capped at 60s.
 * Returns 0 when the job has exhausted its attempt budget (dead-letter).
 * @param {PrintJob} job
 * @returns {number} delay in ms (0 = do not retry)
 */
export function nextRetryDelay(job) {
	const attempt = Number(job?.attempts) || 0
	if (attempt >= (job?.maxAttempts ?? 3)) return 0
	return Math.min(BASE_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS)
}
