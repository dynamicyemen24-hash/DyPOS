/**
 * Enterprise Resilience Patterns
 * Circuit Breaker, Retry with Backoff, Bulkhead, Timeout
 */

import { logger, childSafe } from "./logger.js"

const log = childSafe({ component: "Resilience" })

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

const circuits = new Map()

/**
 * Get or create a circuit breaker
 * @param {string} name - Unique name for the circuit
 * @param {Object} options
 * @returns {Object}
 */
export function getCircuitBreaker(name, options = {}) {
	if (!circuits.has(name)) {
		circuits.set(name, {
			name,
			failureThreshold: options.failureThreshold ?? 5,
			successThreshold: options.successThreshold ?? 2,
			timeout: options.timeout ?? 30000, // 30s before half-open
			state: "closed",
			failures: 0,
			successes: 0,
			lastFailure: 0,
			nextAttempt: 0,
		})
	}
	return circuits.get(name)
}

/**
 * Execute operation with circuit breaker protection
 * @param {string} circuitName
 * @param {Function} operation
 * @param {Object} options
 * @returns {Promise}
 */
export async function withCircuitBreaker(circuitName, operation, options = {}) {
	const circuit = getCircuitBreaker(circuitName)
	const now = Date.now()

	// Check if circuit is open
	if (circuit.state === "open") {
		if (now < circuit.nextAttempt) {
			const err = new Error(`Circuit ${circuitName} is OPEN`)
			err.code = "CIRCUIT_OPEN"
			err.circuit = circuitName
			throw err
		}
		// Transition to half-open
		circuit.state = "half-open"
		circuit.successes = 0
		log.warn(`Circuit ${circuitName} entering HALF-OPEN`)
	}

	try {
		const result = await operation()
		onSuccess(circuit)
		return result
	} catch (error) {
		onFailure(circuit, error)
		if (options.fallback) {
			log.debug(`Circuit ${circuitName} fallback triggered`)
			return options.fallback()
		}
		throw error
	}
}

function onSuccess(circuit) {
	circuit.failures = 0
	if (circuit.state === "half-open") {
		circuit.successes++
		if (circuit.successes >= circuit.successThreshold) {
			circuit.state = "closed"
			log.info(`Circuit ${circuit.name} CLOSED`)
		}
	}
}

function onFailure(circuit, error) {
	circuit.failures++
	circuit.lastFailure = Date.now()
	circuit.successes = 0

	if (circuit.state === "half-open") {
		circuit.state = "open"
		circuit.nextAttempt = Date.now() + circuit.timeout
		log.warn(`Circuit ${circuit.name} OPEN after half-open failure`)
	} else if (circuit.failures >= circuit.failureThreshold) {
		circuit.state = "open"
		circuit.nextAttempt = Date.now() + circuit.timeout
		log.warn(`Circuit ${circuit.name} OPEN after ${circuit.failures} failures`)
	}
}

/** Get all circuit statuses */
export function getCircuitStatuses() {
	const statuses = {}
	for (const [name, circuit] of circuits) {
		statuses[name] = {
			state: circuit.state,
			failures: circuit.failures,
			nextAttempt: circuit.nextAttempt,
		}
	}
	return statuses
}

/** Manually reset a circuit */
export function resetCircuit(name) {
	const circuit = circuits.get(name)
	if (circuit) {
		circuit.state = "closed"
		circuit.failures = 0
		circuit.successes = 0
		log.info(`Circuit ${name} manually reset`)
	}
}

// ============================================================================
// RETRY WITH EXPONENTIAL BACKOFF + JITTER
// ============================================================================

const DEFAULT_RETRY_OPTIONS = {
	maxAttempts: 3,
	baseDelay: 1000,
	maxDelay: 30000,
	jitter: 0.3,
	retryable: (error) => {
		const code = error?.code
		const status = error?.status || error?.response?.status
		return (
			code === "ECONNREFUSED" ||
			code === "ETIMEDOUT" ||
			code === "ENOTFOUND" ||
			code === "ECONNRESET" ||
			code === "CIRCUIT_OPEN" ||
			(status >= 500 && status < 600) ||
			status === 429 ||
			error?.name === "TimeoutError" ||
			error?.name === "AbortError"
		)
	},
	onRetry: (attempt, error) => {
		log.debug(`Retry attempt ${attempt}`, { error: error?.message })
	},
}

/**
 * Execute with retry logic
 * @param {Function} operation
 * @param {Object} options
 * @returns {Promise}
 */
export async function withRetry(operation, options = {}) {
	const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
	let lastError

	for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
		try {
			return await operation()
		} catch (error) {
			lastError = error

			if (attempt === opts.maxAttempts || !opts.retryable(error)) {
				throw error
			}

			opts.onRetry(attempt, error)

			const delay = Math.min(
				opts.baseDelay * 2 ** (attempt - 1) * (1 + (Math.random() - 0.5) * 2 * opts.jitter),
				opts.maxDelay,
			)

			await sleep(delay)
		}
	}

	throw lastError
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// TIMEOUT WRAPPER
// ============================================================================

/**
 * Wrap promise with timeout
 * @param {Promise} promise
 * @param {number} ms
 * @param {string} operationName
 * @returns {Promise}
 */
export function withTimeout(promise, ms, operationName = "operation") {
	return Promise.race([
		promise,
		new Promise((_, reject) => {
			const id = setTimeout(() => {
				const err = new Error(`${operationName} timeout after ${ms}ms`)
				err.code = "TIMEOUT"
				err.timeout = ms
				reject(err)
			}, ms)
			promise.finally(() => clearTimeout(id))
		}),
	])
}

// ============================================================================
// BULKHEAD (CONCURRENCY LIMIT)
// ============================================================================

const bulkheads = new Map()

/**
 * Get or create bulkhead
 * @param {string} name
 * @param {Object} options
 */
export function getBulkhead(name, options = {}) {
	if (!bulkheads.has(name)) {
		bulkheads.set(name, {
			maxConcurrent: options.maxConcurrent ?? 10,
			queueLimit: options.queueLimit ?? 100,
			running: 0,
			queued: 0,
			queue: [],
		})
	}
	return bulkheads.get(name)
}

/**
 * Execute with concurrency limit
 * @param {string} bulkheadName
 * @param {Function} operation
 * @returns {Promise}
 */
export function withBulkhead(bulkheadName, operation) {
	const bh = getBulkhead(bulkheadName)

	return new Promise((resolve, reject) => {
		const execute = () => {
			bh.running++
			bh.queued--

			Promise.resolve()
				.then(operation)
				.then(resolve)
				.catch(reject)
				.finally(() => {
					bh.running--
					processQueue()
				})
		}

		const processQueue = () => {
			if (bh.queue.length > 0 && bh.running < bh.maxConcurrent) {
				const next = bh.queue.shift()
				if (next) next()
			}
		}

		if (bh.running < bh.maxConcurrent) {
			execute()
		} else if (bh.queued < bh.queueLimit) {
			bh.queued++
			bh.queue.push(execute)
		} else {
			const err = new Error(`Bulkhead ${bulkheadName} queue full`)
			err.code = "BULKHEAD_FULL"
			reject(err)
		}
	})
}

/** Get bulkhead status */
export function getBulkheadStatus(name) {
	const bh = bulkheads.get(name)
	if (!bh) return null
	return {
		running: bh.running,
		queued: bh.queued,
		maxConcurrent: bh.maxConcurrent,
		queueLimit: bh.queueLimit,
	}
}

// ============================================================================
// COMPOSITE: CIRCUIT BREAKER + RETRY + TIMEOUT + BULKHEAD
// ============================================================================

/**
 * Execute with full resilience stack
 * @param {Function} operation
 * @param {Object} options
 * @returns {Promise}
 */
export async function resilient(operation, options = {}) {
	const {
		circuit = "default",
		retry = {},
		timeout = 30000,
		bulkhead = "default",
	} = options

	let fn = operation

	// Wrap with timeout
	if (timeout !== false) {
		const t = timeout
		const original = fn
		fn = () => withTimeout(original(), t, circuit)
	}

	// Wrap with retry
	if (retry !== false) {
		const r = retry
		const original = fn
		fn = () => withRetry(original, r)
	}

	// Wrap with circuit breaker
	if (circuit !== false) {
		const c = circuit
		const original = fn
		fn = () => withCircuitBreaker(c, original)
	}

	// Wrap with bulkhead
	if (bulkhead !== false) {
		const b = bulkhead
		const original = fn
		fn = () => withBulkhead(b, original)
	}

	return fn()
}

export default {
	getCircuitBreaker,
	withCircuitBreaker,
	getCircuitStatuses,
	resetCircuit,
	withRetry,
	withTimeout,
	getBulkhead,
	withBulkhead,
	getBulkheadStatus,
	resilient,
}