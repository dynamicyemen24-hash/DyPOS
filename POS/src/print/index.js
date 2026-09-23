/**
 * DyPOS Print — public API.
 *
 * All printing in the app goes through this facade:
 *
 *   submitPrintJob(job)  — enqueue & schedule (never blocks, never prints directly)
 *   submitAndWait(job)   — enqueue, run, resolve with the terminal job
 *   reprintPrintJob(id)  — Clone with COPY watermark
 *   getPrintStatus(id)   — live job snapshot
 *   cancelPrintJob(id)   — cancel a queued job
 *   retryPrintJob(id)    — force an immediate retry
 *
 * The system degrades gracefully: without Pinia/IndexedDB/QZ the facade still
 * resolves, and the dispatcher's browser device path preserves the legacy
 * printview behaviour — nothing in the existing POS regresses.
 */

import { logger } from "@/utils/logger"
import { usePrintJobStore } from "@/print/spool/printJobStore"
import { createPrintDispatcher } from "@/print/spool/printDispatcher"
import {
	JOB_STATUSES,
	idempotencyKeyOf,
	isDuplicateWithinWindow,
	buildPrintJob,
} from "@/print/spool/printJobFactory"
import {
	resolveOutput,
	applyDeviceAvailability,
} from "@/print/rules/outputDetermination"
import { render, docTypeToDoctype } from "@/print/forms/formRenderer"
import { reprintPrintJob as reprintViaHistory } from "@/print/history/printHistory"

const log = logger.create("PrintAPI")

// ─── Singleton wiring ──────────────────────────────────────────────────────
let initialized = false
let dispatcher = null
let store = null
let initPromise = null

const pendingWaiters = new Map()
const SUBMIT_WINDOW_MS = 3000

/**
 * Default device executor. Routes to QZ Tray (silent) or the browser
 * (legacy /printview popup). Resolves with printedCopies; throws only when
 * both the primary device and its fallbacks fail.
 */
async function execute(job, plan, html) {
	const { getSavedPrinterName } = await import("@/utils/qzTray")

	if (plan.deviceId === "qz") {
		const { printHTML } = await import("@/utils/qzTray")
		try {
			if (!html) throw new Error("No HTML rendered for QZ print")
			const printer = job.qzPrinter || getSavedPrinterName()
			await printHTML(html, printer, {
				width: plan.width,
				orientation: plan.orientation,
			})
			// Executes one rendered copy per call (the dispatcher owns the
			// per-copy loop and its checkpoint).
			return { printedCopies: 1 }
		} catch (error) {
			log.warn("QZ print failed; checking browser fallback", error?.message)
			if (plan.fallback?.includes("browser")) {
				const { printInvoiceByName } = await import("@/utils/printInvoice")
				if (job.docType === "invoice") {
					await printInvoiceByName(job.docId, job.formId || null)
				} else {
					await printviewPopup(
						docTypeToDoctype(job.docType),
						job.docId,
						job.formId || null,
					)
				}
				return { printedCopies: 1 }
			}
			throw error
		}
	}

	// deviceId === "browser" — legacy popup / printview path.
	const { printInvoiceByName, printInvoiceCustom } = await import(
		"@/utils/printInvoice"
	)
	if (job.payload?.items?.length) {
		printInvoiceCustom(job.payload)
		return { printedCopies: 1 }
	}
	if (job.docType === "invoice") {
		await printInvoiceByName(job.docId, job.formId || null)
	} else {
		await printviewPopup(
			docTypeToDoctype(job.docType),
			job.docId,
			job.formId || null,
		)
	}
	return { printedCopies: 1 }
}

/** Open Frappe's /printview in a new window (trigger_print auto-starts). */
export async function printviewPopup(doctype, name, printFormat) {
	const params = new URLSearchParams({
		doctype,
		name,
		format: printFormat || "",
		no_letterhead: 1,
		_lang: "en",
		trigger_print: 1,
		_t: Date.now(),
	})
	const popup = window.open(
		`/printview?${params}`,
		"_blank",
		"width=800,height=600",
	)
	if (!popup) throw new Error("Popup blocked — check your browser settings.")
}

/** Post-success hook: flag offline queued invoices as printed (`was_printed`). */
async function runPostPrintFlag(job) {
	if (job.docType !== "invoice") return
	try {
		const { markOfflineInvoicePrinted } = await import(
			"@/utils/offline/workerClient"
		)
		const { isLocalOnlyInvoiceName } = await import("@/utils/printInvoice")
		if (isLocalOnlyInvoiceName(job.docId)) {
			await markOfflineInvoicePrinted(job.docId)
		}
	} catch (err) {
		log.debug?.("Offline printed flag skipped", err?.message)
	}
}

/** Live QZ state for output determination. */
let qzConnectedRef = null
async function ensureQzRef() {
	if (qzConnectedRef) return qzConnectedRef
	try {
		const { qzConnected } = await import("@/utils/qzTray")
		qzConnectedRef = qzConnected
	} catch {
		qzConnectedRef = null
	}
	return qzConnectedRef
}

/**
 * Boot the spool subsystem. Idempotent; safe to call from main.js after the
 * Pinia app is created. Never throws into app bootstrap.
 */
export async function initPrintSystem() {
	if (initialized || typeof window === "undefined") return false
	if (initPromise) return initPromise

	initPromise = (async () => {
		try {
			await ensureQzRef()
			store = usePrintJobStore()
			await store.init()

			dispatcher = createPrintDispatcher({
				store,
				render,
				execute,
				resolvePlan: async (job) => {
					let silentPrint = false
					try {
						const { usePOSSettingsStore } = await import("@/stores/posSettings")
						silentPrint = Boolean(usePOSSettingsStore().silentPrint)
					} catch {
						// store not ready — default to browser
					}
					const qzReady = qzConnectedRef?.value ?? false
					const plan = resolveOutput({
						docType: job.docType,
						posProfile: job.posProfile || null,
						silentPrint,
						qzReady,
					})
					return applyDeviceAvailability(plan, { qzReady })
				},
				onTerminal: (job) => resolvePending(job.id, job),
				onCompleted: (job) => {
					runPostPrintFlag(job)
				},
			})

			dispatcher.start()
			initialized = true
			log.info("Print system initialized", {
				database: Boolean(store.dbOnline),
			})
			return true
		} catch (error) {
			initialized = false
			initPromise = null
			log.warn("Print system init failed; direct-print fallback active", error)
			return false
		}
	})()

	return initPromise
}

async function ensureStore() {
	if (store) return
	store = usePrintJobStore()
	await store.init()
}

/**
 * Enqueue a print job. Idempotent: repeated taps on the same document within
 * 3s collapse into a single queue entry. Never waits for paper.
 */
export async function submitPrintJob(input) {
	await ensureStore()

	const now = Date.now()
	const candidate = buildPrintJob(input)

	const existing = store.jobs.find(
		(j) =>
			j.docId === candidate.docId &&
			j.docType === candidate.docType &&
			j.reprintOf === candidate.reprintOf,
	)
	if (
		isDuplicateWithinWindow(
			existing,
			idempotencyKeyOf(candidate),
			now,
			SUBMIT_WINDOW_MS,
		)
	) {
		log.debug("Print job deduplicated", { docId: candidate.docId })
		return existing
	}

	const spoolNo = `SPR-${String(await store.nextSpoolNo()).padStart(6, "0")}`
	const job = await store.enqueue(
		{
			...candidate,
			spoolNo,
			requestedBy: input.requestedBy || defaultRequester(),
			terminalId: input.terminalId || defaultTerminal(),
			printedCount: input.printedCount || 0,
		},
		spoolNo,
	)

	notifySpoolAssigned(job)
	if (dispatcher) dispatcher.schedule(50)
	return job
}

/**
 * Enqueue and block until the job reaches a terminal state.
 * @returns {Promise<PrintJob>} resolves with the terminal job.
 * @throws {Error} when the job fails permanently or the wait times out.
 */
export function submitAndWait(input, { timeoutMs = 30000 } = {}) {
	return (async () => {
		const job = await submitPrintJob(input)
		if (TERMINAL.includes(job.status)) return job
		return waitForTerminal(job.id, timeoutMs)
	})()
}

const TERMINAL = Object.freeze([
	JOB_STATUSES.COMPLETED,
	JOB_STATUSES.FAILED,
	JOB_STATUSES.PARTIAL,
	JOB_STATUSES.CANCELLED,
])

function waitForTerminal(jobId, timeoutMs) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			pendingWaiters.delete(jobId)
			reject(new Error("Print job timed out"))
		}, timeoutMs)

		const done = (finalJob) => {
			clearTimeout(timeout)
			pendingWaiters.delete(jobId)
			if (finalJob?.status === JOB_STATUSES.COMPLETED) {
				resolve(finalJob)
			} else {
				const err = new Error(
					finalJob?.lastError || `Print job ended ${finalJob?.status}`,
				)
				err.job = finalJob
				reject(err)
			}
		}

		// Register BEFORE checking so a completion that lands between the
		// check and registration can never strand the waiter until timeout.
		pendingWaiters.set(jobId, done)

		const current = store?.getById(jobId)
		if (current && TERMINAL.includes(current.status)) {
			done(current)
		}
	})
}

function resolvePending(jobId, job) {
	const waiter = pendingWaiters.get(jobId)
	if (waiter) waiter(job)
	pendingWaiters.delete(jobId)
}

/** Live snapshot of a job. */
export function getPrintStatus(jobId) {
	if (!store) return null
	return store.getById(jobId)
}

export function listPrintJobs() {
	if (!store) return []
	return store.jobs
}

export function listPrintHistory() {
	if (!store) return []
	return store.history
}

/** Clone a finished job, queue it with a COPY watermark. */
export async function reprintPrintJob(jobId, overrides = {}) {
	await ensureStore()
	const spoolNo = `SPR-${String(await store.nextSpoolNo()).padStart(6, "0")}`
	const job = await reprintViaHistory(store, jobId, { ...overrides, spoolNo })
	if (dispatcher) dispatcher.schedule(50)
	return job
}

export async function cancelPrintJob(jobId) {
	await ensureStore()
	if (!dispatcher) return null
	return dispatcher.cancel(jobId)
}

export async function retryPrintJob(jobId) {
	await ensureStore()
	if (!dispatcher) return null
	return dispatcher.retryNow(jobId)
}

// ─── Request context helpers ───────────────────────────────────────────────
function defaultRequester() {
	try {
		return (
			window?.frappe?.session?.user_fullname ||
			window?.frappe?.session?.user ||
			"Cashier"
		)
	} catch {
		return "Cashier"
	}
}

function defaultTerminal() {
	try {
		const posContext = requireContext()
		return posContext?.terminalId || null
	} catch {
		return null
	}
}

function requireContext() {
	// Lazy: avoids a hard import cycle between print/index and posContext.
	try {
		return globalThis?.__DYPOS_POS_CONTEXT__?.value || null
	} catch {
		return null
	}
}

function notifySpoolAssigned(job) {
	if (typeof window !== "undefined" && window.dispatchEvent) {
		try {
			window.dispatchEvent(
				new CustomEvent("dypos:print-job-queued", {
					detail: {
						jobId: job.id,
						spoolNo: job.spoolNo,
						docId: job.docId,
					},
				}),
			)
		} catch {
			// event dispatch is best-effort
		}
	}
}
