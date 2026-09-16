/**
 * Front-end performance utilities for POS terminals.
 *
 * Goal: keep the cashier interaction smooth on the modest hardware found at
 * the counter (cheap tablets, thin clients) and make the app behave politely
 * on expensive mobile connections.
 *
 * Provides:
 *   - scheduleIdleTask / cancelIdleTask  — defer non-urgent work to idle time
 *   - isLowEndDevice / isSaveDataMode    — capability-aware behavior gates
 *   - prefetchOnIdle                     — warm the SW/caches when idle only
 *   - startPerformanceMonitoring         — long-tasks + memory-pressure watch
 *   - measure / measureAsync             — micro-timing helpers
 */

// ---------------------------------------------------------------------------
// Idle scheduling
// ---------------------------------------------------------------------------

/**
 * Run a task when the browser is idle (requestIdleCallback semantics) with a
 * setTimeout fallback for browsers that do not support it.
 * @param {Function} fn - `(deadline) => void`
 * @param {Object} [opts]
 * @param {number} [opts.timeout=2000] - Hard deadline; run even if never idle.
 * @param {boolean} [opts.important=false] - Run asap (0ms) instead of delayed.
 * @returns {number} Handle for cancelIdleTask.
 */
export function scheduleIdleTask(
	fn,
	{ timeout = 2000, important = false } = {},
) {
	if (typeof requestIdleCallback === "function") {
		return requestIdleCallback(fn, { timeout })
	}
	return setTimeout(fn, important ? 0 : 300)
}

/** Cancel a task scheduled via scheduleIdleTask. */
export function cancelIdleTask(handle) {
	if (typeof cancelIdleCallback === "function") {
		cancelIdleCallback(handle)
	} else {
		clearTimeout(handle)
	}
}

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

/** True on 2G/3G or Data-Saver connections — skip heavy background work. */
export function isSaveDataMode() {
	if (typeof navigator === "undefined") return false
	const conn =
		navigator.connection ||
		navigator.mozConnection ||
		navigator.webkitConnection
	if (!conn) return false
	if (conn.saveData === true) return true
	const effective = (conn.effectiveType || "").toLowerCase()
	return effective === "slow-2g" || effective === "2g"
}

/** True on typical cheap POS hardware (few cores / little memory). */
export function isLowEndDevice() {
	if (typeof navigator === "undefined") return false
	const cores = navigator.hardwareConcurrency || 8
	const memory = navigator.deviceMemory || 8 // GB (Chromium only)
	return cores <= 4 && memory <= 4
}

/** Prefer light UX when the terminal or network is constrained. */
export function isCapabilityConstrained() {
	return isSaveDataMode() || isLowEndDevice()
}

// ---------------------------------------------------------------------------
// Idle prefetch
// ---------------------------------------------------------------------------

/**
 * Warm the HTTP/SW caches with GET requests, but only when:
 *   - the tab is visible,
 *   - the device/data budget allows it,
 *   - the thread is idle.
 * Failures are swallowed (best-effort warm-up only).
 * @param {string[]} urls - Absolute or same-origin GET endpoints to fetch.
 * @returns {Promise<void>}
 */
export async function prefetchOnIdle(urls, { idleTimeout = 2000 } = {}) {
	if (!Array.isArray(urls) || urls.length === 0) return
	if (typeof document !== "undefined" && document.visibilityState !== "visible")
		return
	if (isCapabilityConstrained()) return

	await new Promise((resolve) => {
		scheduleIdleTask(resolve, { timeout: idleTimeout })
	})

	if (typeof document !== "undefined" && document.visibilityState !== "visible")
		return

	await Promise.allSettled(
		urls.map((url) =>
			fetch(url, {
				method: "GET",
				credentials: "include",
				headers: { Accept: "application/json" },
			}).catch(() => null),
		),
	)
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

/**
 * Watch for long tasks and memory pressure. Emits callbacks (default to a
 * no-op) and returns a stop() handle. Non-invasive: nothing throws.
 * @param {Object} [hooks]
 * @param {Function} [hooks.onLongTask] - `(entry, {name, duration, startTime})`
 * @param {Function} [hooks.onMemoryPressure] - `({usedBytes, limitBytes, ratio})`
 * @param {number} [hooks.longTaskThreshold=250] - ms; below 250 devtools-only.
 * @param {number} [hooks.memoryPollMs=15000]
 * @param {number} [hooks.memoryWarnRatio=0.9]
 * @returns {{ stop: Function, stats: () => Object }}
 */
export function startPerformanceMonitoring({
	onLongTask = () => {},
	onMemoryPressure = () => {},
	longTaskThreshold = 250,
	memoryPollMs = 15000,
	memoryWarnRatio = 0.9,
} = {}) {
	const stats = { longTasks: 0, maxLongTaskMs: 0, memoryWarnings: 0 }
	const cleanup = []

	// --- Long task observer ---
	if (typeof PerformanceObserver !== "undefined") {
		try {
			const observer = new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					const duration = entry.duration || 0
					if (duration >= longTaskThreshold) {
						stats.longTasks += 1
						stats.maxLongTaskMs = Math.max(stats.maxLongTaskMs, duration)
						onLongTask(entry, {
							name: entry.name || "longtask",
							duration,
							startTime: entry.startTime,
						})
					}
				}
			})
			observer.observe({ type: "longtask", buffered: true })
			cleanup.push(() => observer.disconnect())
		} catch {
			// PerformanceObserver unavailable (some privacy modes)
		}
	}

	// --- Memory pressure poller (Chromium only) ---
	let memTimer = null
	const perfMem =
		typeof performance !== "undefined" ? performance.memory : undefined
	if (perfMem && typeof perfMem.usedJSHeapSize === "number") {
		memTimer = setInterval(
			() => {
				const used = perfMem.usedJSHeapSize
				const limit = perfMem.jsHeapSizeLimit || 1
				const ratio = limit ? used / limit : 0
				if (ratio >= memoryWarnRatio) {
					stats.memoryWarnings += 1
					onMemoryPressure({ usedBytes: used, limitBytes: limit, ratio })
				}
			},
			Math.max(1000, memoryPollMs),
		)
		cleanup.push(() => clearInterval(memTimer))
	}

	function stop() {
		while (cleanup.length) cleanup.pop()?.()
		stats._stopped = true
	}

	return {
		stop,
		stats: () => ({ ...stats }),
	}
}

// ---------------------------------------------------------------------------
// Micro-timing
// ---------------------------------------------------------------------------

/** Time a sync function, returning its result + elapsed ms. */
export function measure(fn, label) {
	const start = performance.now()
	const value = fn()
	return { value, ms: performance.now() - start, label }
}

/** Time an async function, returning its result + elapsed ms. */
export async function measureAsync(fn, label) {
	const start = performance.now()
	const value = await fn()
	return { value, ms: performance.now() - start, label }
}
