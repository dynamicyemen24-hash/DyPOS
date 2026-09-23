/**
 * PrintJobStore — Pinia store over a Dexie-backed spool.
 *
 * The queue (dypos_print_jobs) and the permanent audit trail
 * (dypos_print_history) live in IndexedDB so the spool survives page
 * reloads and works fully offline. The store only persists state; the
 * PrintDispatcher owns scheduling and the state machine.
 */

import Dexie from "dexie"
import { defineStore } from "pinia"
import { computed, ref } from "vue"

import { logger } from "@/utils/logger"
import {
	buildPrintJob,
	JOB_STATUSES,
	TERMINAL_STATUSES,
} from "@/print/spool/printJobFactory"

const log = logger.create("PrintJobStore")

export const PRINT_DB_NAME = "DyPOS_print"

/** Spool counter persisted in the meta table so SPR numbers never repeat. */
const SPOOL_COUNTER_KEY = "spool_no_counter"

/** Keep only the most recent audit records per device (memory bounded). */
const HISTORY_LIMIT = 2000

/**
 * Keep terminal jobs (rows remain on disk for Reprint) but cap how many stay
 * in the reactive in-memory list so a long POS session never grows unbounded.
 */
const TERMINAL_MEMORY_WINDOW = 300

/**
 * Dedicated Dexie instance — deliberately separate from "DyPOS_offline"
 * so print state never interferes with invoice sync migrations.
 */
const dexie = new Dexie(PRINT_DB_NAME)

dexie.version(1).stores({
	dypos_print_jobs:
		"&id, status, docType, docId, createdAt, priority, deviceId",
	dypos_print_history:
		"&id, jobId, docType, docId, createdAt, finishedAt, status, terminalId",
	meta: "&key",
})

export const usePrintJobStore = defineStore("printJob", () => {
	/** Reactive view of active spool jobs (QUEUED/PROCESSING + recent failures). */
	const jobs = ref([])

	/** Persistent audit trail of terminal job outcomes. */
	const history = ref([])

	const initialized = ref(false)
	const dbOnline = ref(false)

	const queuedCount = computed(
		() => jobs.value.filter((j) => j.status === JOB_STATUSES.QUEUED).length,
	)
	const processingCount = computed(
		() => jobs.value.filter((j) => j.status === JOB_STATUSES.PROCESSING).length,
	)
	const failedCount = computed(
		() => jobs.value.filter((j) => j.status === JOB_STATUSES.FAILED).length,
	)

	async function open() {
		if (dbOnline.value) return true
		try {
			await dexie.open()
			dbOnline.value = true
			return true
		} catch (error) {
			log.error("Failed to open print database", error)
			return false
		}
	}

	/**
	 * Atomically issue the next spool number. Wrapped in a Dexie rw
	 * transaction so concurrent submissions (or two POS tabs) can never
	 * mint the same SPR number.
	 */
	async function nextSpoolNo() {
		await open()
		return dexie.transaction("rw", dexie.meta, async () => {
			const counter = Number(
				(await dexie.meta.get(SPOOL_COUNTER_KEY))?.value || 0,
			)
			const next = counter + 1
			await dexie.meta.put({ key: SPOOL_COUNTER_KEY, value: next })
			return next
		})
	}

	/**
	 * Load active jobs + recent history from disk. Requeues any job stranded
	 * in PROCESSING by a crashed session (crash recovery).
	 */
	async function init() {
		if (initialized.value) return
		if (!(await open())) return

		try {
			const [storedJobs, storedHistory] = await Promise.all([
				dexie.dypos_print_jobs.toArray(),
				dexie.dypos_print_history.toArray(),
			])
			// Crash recovery: PROCESSING jobs stranded by a killed session are
			// requeued so the dispatcher picks them up on the next tick.
			const recovered = storedJobs.map((job) => {
				if (job.status === JOB_STATUSES.PROCESSING) {
					return { ...job, status: JOB_STATUSES.QUEUED, startedAt: null }
				}
				return job
			})

			// Persist the corrected rows (crash-recovery delta) if any changed.
			if (recovered.some((j, i) => j.status !== storedJobs[i].status)) {
				await dexie.dypos_print_jobs.bulkPut(recovered)
			}

			recovered.sort((a, b) => b.createdAt - a.createdAt)

			// Only active jobs (QUEUED / scheduled retry) stay on the reactive
			// list; terminal outcomes live in the audit history but their rows
			// remain on disk so Reprint can clone the original payload.
			jobs.value = recovered.filter(
				(j) => !TERMINAL_STATUSES.includes(j.status),
			)

			storedHistory.sort((a, b) => b.createdAt - a.createdAt)
			history.value = storedHistory

			await trimHistory()
			initialized.value = true
		} catch (error) {
			log.error("Failed to initialize print spool", error)
		}
	}

	async function persist(job) {
		await open()
		await dexie.dypos_print_jobs.put(job)
		const idx = jobs.value.findIndex((j) => j.id === job.id)
		if (idx >= 0) {
			// Replace in place to preserve Vue reactivity.
			jobs.value.splice(idx, 1, job)
		} else {
			jobs.value.unshift(job)
		}
		// Bound the live list: terminal rows stay on disk (Reprint clones from
		// there), only a recent window is kept in memory for the Monitor.
		const active = jobs.value.filter(
			(j) => !TERMINAL_STATUSES.includes(j.status),
		)
		const terminalWindow = jobs.value
			.filter((j) => TERMINAL_STATUSES.includes(j.status))
			.slice(0, TERMINAL_MEMORY_WINDOW)
		jobs.value = [...active, ...terminalWindow]
	}

	async function upsert(job) {
		await persist(job)
		return job
	}

	async function enqueue(input, spoolNo) {
		const job = buildPrintJob({ ...input, spoolNo: spoolNo || "" })
		await persist(job)
		return job
	}

	function getById(id) {
		return jobs.value.find((j) => j.id === id) || null
	}

	/** Full job from disk (terminal rows remain there for Reprint clones). */
	async function getByIdFromDisk(id) {
		await open()
		return (await dexie.dypos_print_jobs.get(id)) || null
	}

	function getByDocType(docType) {
		return jobs.value.filter((j) => j.docType === docType)
	}

	async function remove(id) {
		await open()
		await dexie.dypos_print_jobs.delete(id)
		jobs.value = jobs.value.filter((j) => j.id !== id)
	}

	/** Record a terminal outcome in the audit trail. */
	async function recordHistory(job) {
		await open()
		const entry = {
			id: `${job.id}-${Date.now()}`,
			jobId: job.id,
			spoolNo: job.spoolNo,
			docType: job.docType,
			docId: job.docId,
			status: job.status,
			copies: job.copies,
			printer: job.qzPrinter || job.deviceId,
			requestedBy: job.requestedBy || "",
			terminalId: job.terminalId || "",
			reprintOf: job.reprintOf || null,
			createdAt: job.createdAt,
			finishedAt: job.finishedAt || Date.now(),
			lastError: job.lastError || null,
		}
		await dexie.dypos_print_history.put(entry)
		history.value = [entry, ...history.value]
		await trimHistory()
	}

	async function trimHistory() {
		if (history.value.length <= HISTORY_LIMIT) return
		const excess = history.value.slice(HISTORY_LIMIT)
		const excessIds = excess.map((e) => e.id)
		if (excessIds.length) {
			await dexie.dypos_print_history.bulkDelete(excessIds)
		}
		history.value = history.value.slice(0, HISTORY_LIMIT)
	}

	return {
		jobs,
		history,
		initialized,
		dbOnline,
		queuedCount,
		processingCount,
		failedCount,
		open,
		init,
		nextSpoolNo,
		enqueue,
		upsert,
		persist,
		remove,
		getById,
		getByIdFromDisk,
		getByDocType,
		recordHistory,
		trimHistory,
	}
})

export * from "@/print/spool/printJobFactory"
