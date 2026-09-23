/**
 * PrintHistory — audit trail + Reprint (COPY) workflow.
 *
 * - Records terminal outcomes into the store's history.
 * - Reprint clones the original frozen payload + form/device into a brand-new
 *   job flagged `reprintOf` so the renderer draws the COPY watermark and the
 *   audit shows how many times a document was physically printed.
 * - Optional server mirror (POST /api/print/jobs) when online.
 */

import { logger } from "@/utils/logger"
import { JOB_STATUSES } from "@/print/spool/printJobFactory"

const log = logger.create("PrintHistory")

const SERVER_MIRROR_FLAG = window?._DYPOS_PRINT_SERVER_MIRROR !== false

/**
 * Find every printed instance of a document (original + reprints) to report
 * `printedCount`.
 */
export function countPrints(history, docId, docType) {
	if (!Array.isArray(history)) return 0
	return history.filter(
		(e) =>
			e.docId === docId &&
			(!docType || e.docType === docType) &&
			e.status === JOB_STATUSES.COMPLETED,
	).length
}

/**
 * Build a NEW print job that reprints an original one.
 * @param {PrintJob} original
 * @param {Object} [overrides] — { copies, deviceId, formId, requestedBy, terminalId, spoolNo }
 * @returns {PrintJob}
 */
export function buildReprintJob(original, overrides = {}) {
	if (!original) throw new Error("Reprint requires an original job")
	return {
		...original,
		id:
			typeof crypto !== "undefined" && crypto.randomUUID
				? crypto.randomUUID()
				: `RE-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		reprintOf: overrides.reprintOf || original.id,
		status: JOB_STATUSES.QUEUED,
		attempts: 0,
		lastError: null,
		startedAt: null,
		finishedAt: null,
		pendingRetryTime: null,
		printedCopies: 0,
		createdAt: Date.now(),
		spoolNo: overrides.spoolNo || original.spoolNo,
		copies: overrides.copies || original.copies || 1,
		deviceId: overrides.deviceId || original.deviceId || "browser",
		formId: overrides.formId || original.formId || "",
		requestedBy: overrides.requestedBy || original.requestedBy || "",
		terminalId: overrides.terminalId || original.terminalId || "",
		qzPrinter: overrides.qzPrinter || original.qzPrinter || null,
		// Payload snapshot is cloned so the reprint is identical to the original.
		payload: original.payload || null,
		// printedCount drives the "printed N times" audit.
		printedCount: (original.printedCount || 0) + 1,
	}
}

/**
 * Queue a reprint of a previously completed/failed job.
 * @param {Object} store — print job store
 * @param {string} jobId — original or reprint job id
 * @param {Object} [overrides]
 * @returns {Promise<PrintJob>}
 */
export async function reprintPrintJob(store, jobId, overrides = {}) {
	const source = await findJobForReprint(store, jobId)
	const job = buildReprintJob(source, overrides)
	await store.upsert(job)
	return job
}

/**
 * Locate an original job: live list first, then the full row on disk (rows
 * persist after the memory window so Reprint always has the original payload),
 * then the audit history.
 */
export async function findJobForReprint(store, jobId) {
	const live = store.getById(jobId)
	if (live) return live

	if (typeof store.getByIdFromDisk === "function") {
		const onDisk = await store.getByIdFromDisk(jobId)
		if (onDisk) return onDisk
	}

	// Search the audit history by jobId OR by an earlier reprint's docId chain.
	const parent = store.history.find((e) => e.jobId === jobId)
	if (parent) {
		// History entries only carry a summary — restore the payload from the
		// full row persisted on disk so Reprint stays byte-identical.
		const onDisk =
			typeof store.getByIdFromDisk === "function" &&
			(await store.getByIdFromDisk(parent.jobId))
		if (onDisk) return onDisk
		throw new Error("Original print payload is no longer available for reprint")
	}

	throw new Error("Print job not found")
}

/**
 * Best-effort mirror of a terminal audit row to the optional Node server.
 * Never throws: printing must not depend on the network.
 */
export async function syncPrintHistoryToServer(entry) {
	if (!SERVER_MIRROR_FLAG || typeof fetch === "undefined") return
	try {
		await fetch("/api/print/jobs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				id: `job:${entry.jobId}:${Date.now()}`,
				...entry,
			}),
		}).catch(() => {
			// Network unavailable or route not deployed — perfectly fine.
		})
	} catch (error) {
		log.debug?.("Print history mirror skipped", error?.message)
	}
}
