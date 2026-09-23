/**
 * PrintDispatcher — spool scheduler and state machine.
 *
 * Pulls ready jobs from the store, renders them, and executes them on the
 * resolved device with retries and browser fallback. The state machine and
 * ordering rules are pure and exported for testing; the scheduler only
 * wires them to the store and an injected device executor.
 *
 * State machine:
 *   QUEUED → PROCESSING → COMPLETED
 *                         PARTIAL  (some copies printed, resume on retry)
 *                         FAILED   (dead-letter at maxAttempts)
 *   PROCESSING → QUEUED (scheduled retry with backoff)
 *   QUEUED → CANCELLED
 */

import { logger } from "@/utils/logger"
import { JOB_STATUSES, nextRetryDelay } from "@/print/spool/printJobFactory"

const log = logger.create("PrintDispatcher")

/** Per-device execution lanes: only one job runs per device at a time. */
const activeLanes = new Set()

// ─── Pure state machine ────────────────────────────────────────────────────

/**
 * Decide the next state of a job after one dispatch attempt.
 *
 * @param {PrintJob} job
 * @param {{printedCopies:number, error:Error|null}} result
 * @param {number} now
 * @returns {PrintJob} the next job state
 */
export function applyAttemptResult(
	job,
	{ printedCopies = 0, error = null },
	now,
) {
	const total = job?.copies || 1
	const attempts = (job?.attempts || 0) + 1
	const maxAttempts = job?.maxAttempts || 3
	const printed = Math.max(0, Math.min(printedCopies, total))
	const base = {
		...job,
		printedCopies: printed,
		attempts,
		lastError: error ? error?.message || String(error) : null,
	}

	// All copies printed → success.
	if (printed >= total) {
		return {
			...base,
			status: JOB_STATUSES.COMPLETED,
			finishedAt: now,
			pendingRetryTime: null,
			lastError: null,
		}
	}

	// Attempt budget exhausted → terminal.
	if (attempts >= maxAttempts) {
		return {
			...base,
			status: printed > 0 ? JOB_STATUSES.PARTIAL : JOB_STATUSES.FAILED,
			finishedAt: now,
			pendingRetryTime: null,
		}
	}

	// Schedule a backoff retry; resume from the printedCopies checkpoint.
	const delay = nextRetryDelay(base)
	return {
		...base,
		status: JOB_STATUSES.QUEUED,
		startedAt: null,
		finishedAt: null,
		pendingRetryTime: now + delay,
	}
}

/** A job is ready to run when it is QUEUED and any retry delay has elapsed. */
export function isReady(job, now) {
	if (job?.status !== JOB_STATUSES.QUEUED) return false
	if (job?.pendingRetryTime && job.pendingRetryTime > now) return false
	return true
}

/** Priority desc, then oldest-first (FIFO within the same priority). */
export function sortReadyJobs(jobs) {
	return [...jobs].sort((a, b) => {
		if ((b.priority || 0) !== (a.priority || 0)) {
			return (b.priority || 0) - (a.priority || 0)
		}
		return (a.createdAt || 0) - (b.createdAt || 0)
	})
}

/** Ready jobs in dispatch order. */
export function readyJobs(jobs, now) {
	return sortReadyJobs(jobs.filter((j) => isReady(j, now)))
}

/** Cancel a non-terminal job. Terminal jobs are untouched. */
export function cancelJob(job, now) {
	if (!job) return null
	if (
		[
			JOB_STATUSES.COMPLETED,
			JOB_STATUSES.FAILED,
			JOB_STATUSES.CANCELLED,
			JOB_STATUSES.PARTIAL,
		].includes(job.status)
	) {
		return job
	}
	return { ...job, status: JOB_STATUSES.CANCELLED, finishedAt: now }
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DispatcherDeps
 * @property {Object} store — print job store (usePrintJobStore instance)
 * @property {(job:PrintJob)=>Promise<{html:string,paper:string,orientation:string,printer:string|null}>} render
 * @property {(job:PrintJob, plan:Object, html:string)=>Promise<{printedCopies:number}>} execute
 * @property {(job:PrintJob)=>Object} resolvePlan — output determination
 * @property {(job:PrintJob)=>void} [onCompleted] — post-success hook (flag offline printed)
 * @property {(job:PrintJob)=>void} [onTerminal] — notify waiters of ANY terminal outcome
 */

/**
 * Create a dispatcher bound to a store and device executor.
 * @param {DispatcherDeps} deps
 */
export function createPrintDispatcher(deps) {
	const { store, render, execute, resolvePlan, onCompleted, onTerminal } = deps

	let running = false
	let heartbeatTimer = null
	let wakeTimer = null

	function mark(job) {
		return store.upsert(job)
	}

	async function dispatchOne(job) {
		const laneKey = job.deviceId || "default"
		if (activeLanes.has(laneKey)) return false
		activeLanes.add(laneKey)

		let state = {
			...job,
			status: JOB_STATUSES.PROCESSING,
			startedAt: Date.now(),
		}
		await mark(state)

		// Declared OUTSIDE try so a mid-loop failure still preserves the
		// already-printed checkpoint instead of resetting it to the stale value.
		let printedCopies = state.printedCopies || 0
		try {
			const plan = (await resolvePlan(state)) || {}
			const copies = Math.max(1, plan.copies || state.copies || 1)

			// SAP per-copy loop: print every remaining copy with its own
			// copy_no watermark; breaking mid-way yields PARTIAL (resumed later).
			for (let c = printedCopies; c < copies; c++) {
				const copyState = { ...state, copies, copyNo: c + 1 }
				const rendered = await render(copyState, plan)
				if (!rendered?.html) {
					throw new Error("Rendering returned no output")
				}
				await execute(copyState, plan, rendered.html)
				printedCopies = c + 1
			}

			state = applyAttemptResult(
				state,
				{ printedCopies, error: null },
				Date.now(),
			)
		} catch (error) {
			log.warn("Print job failed", {
				spoolNo: state.spoolNo,
				error: error?.message,
			})
			state = applyAttemptResult(state, { printedCopies, error }, Date.now())
		} finally {
			activeLanes.delete(laneKey)
		}

		await mark(state)

		// Terminal outcomes move to the audit trail.
		if (
			[
				JOB_STATUSES.COMPLETED,
				JOB_STATUSES.FAILED,
				JOB_STATUSES.PARTIAL,
				JOB_STATUSES.CANCELLED,
			].includes(state.status)
		) {
			await store.recordHistory(state)
			// ANY terminal outcome must settle pending submitAndWait waiters.
			if (onTerminal) {
				try {
					onTerminal(state)
				} catch (err) {
					log.warn("Terminal notify hook failed", err?.message)
				}
			}
			if (state.status === JOB_STATUSES.COMPLETED && onCompleted) {
				try {
					onCompleted(state)
				} catch (err) {
					log.warn("Post-print hook failed", err?.message)
				}
			}
		}

		return true
	}

	/**
	 * Drain every ready job in order. Safe to call repeatedly; re-entrancy is
	 * guarded so submissions and timers cannot double-dispatch.
	 */
	async function drain() {
		if (running) return
		running = true
		try {
			let guard = 0
			while (guard < 100) {
				const now = Date.now()
				const candidates = readyJobs(store.jobs, now)
				if (!candidates.length) break
				let progressed = false
				for (const job of candidates) {
					const did = await dispatchOne(job)
					if (did) progressed = true
				}
				if (!progressed) break
				guard++
			}
		} finally {
			running = false
		}
	}

	function schedule(delay = 250) {
		if (wakeTimer) return
		wakeTimer = setTimeout(() => {
			wakeTimer = null
			void drain()
		}, delay)
	}

	function start() {
		// Kick once now, then on a light heartbeat to catch retry deadlines.
		void drain()
		if (heartbeatTimer) return
		heartbeatTimer = setInterval(() => {
			void drain()
		}, 2000)
	}

	function stop() {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer)
			heartbeatTimer = null
		}
		if (wakeTimer) {
			clearTimeout(wakeTimer)
			wakeTimer = null
		}
	}

	/** Force an immediate retry (Monitor Retry button / manual reprint). */
	async function retryNow(jobId) {
		const job = store.getById(jobId)
		if (!job) return null
		const retried = {
			...job,
			status: JOB_STATUSES.QUEUED,
			attempts: 0,
			lastError: null,
			pendingRetryTime: null,
			finishedAt: null,
		}
		await mark(retried)
		await drain()
		return retried
	}

	async function cancel(jobId) {
		const job = store.getById(jobId)
		if (!job) return null
		const cancelled = cancelJob(job, Date.now())
		await mark(cancelled)
		if (cancelled.status === JOB_STATUSES.CANCELLED) {
			await store.recordHistory(cancelled)
		}
		return cancelled
	}

	return { drain, start, stop, schedule, retryNow, cancel, dispatchOne }
}
