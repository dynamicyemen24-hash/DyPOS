/**
 * Structured Logging with Correlation IDs
 * JSON output, context propagation, performance optimized
 */

import { v4 as uuidv4 } from "uuid"

// ============================================================================
// CORRELATION CONTEXT
// ============================================================================

const correlationContext = new Map()

/** @typedef {{
 *   traceId: string,
 *   spanId: string,
 *   parentSpanId?: string,
 *   userId?: string,
 *   tenantId?: string,
 *   sessionId?: string,
 *   requestId?: string,
 *   startTime: number,
 *   metadata: Record<string, unknown>,
 * }} CorrelationContext */

const ASYNC_CONTEXT_KEY = Symbol("dypos-correlation")

/**
 * Run function with correlation context
 * @template T
 * @param {CorrelationContext | (() => CorrelationContext)} context
 * @param {() => T | Promise<T>} fn
 * @returns {T | Promise<T>}
 */
export function withCorrelation(context, fn) {
	const ctx = typeof context === "function" ? context() : context
	const prev = correlationContext.get(ASYNC_CONTEXT_KEY)
	correlationContext.set(ASYNC_CONTEXT_KEY, ctx)
	try {
		const result = fn()
		if (result instanceof Promise) {
			return result.finally(() => {
				if (prev) correlationContext.set(ASYNC_CONTEXT_KEY, prev)
				else correlationContext.delete(ASYNC_CONTEXT_KEY)
			})
		}
		if (prev) correlationContext.set(ASYNC_CONTEXT_KEY, prev)
		else correlationContext.delete(ASYNC_CONTEXT_KEY)
		return result
	} catch (e) {
		if (prev) correlationContext.set(ASYNC_CONTEXT_KEY, prev)
		else correlationContext.delete(ASYNC_CONTEXT_KEY)
		throw e
	}
}

/** Get current correlation context */
export function getCorrelation() {
	return correlationContext.get(ASYNC_CONTEXT_KEY) || {
		traceId: "none",
		spanId: "none",
		startTime: Date.now(),
		metadata: {},
	}
}

/** Create new child span */
export function createSpan(name, attributes = {}) {
	const parent = getCorrelation()
	return {
		traceId: parent.traceId,
		spanId: uuidv4().slice(0, 16),
		parentSpanId: parent.spanId,
		userId: parent.userId,
		tenantId: parent.tenantId,
		sessionId: parent.sessionId,
		requestId: parent.requestId,
		name,
		startTime: Date.now(),
		attributes,
	}
}

// ============================================================================
// STRUCTURED LOGGER
// ============================================================================

/** @typedef {'debug' | 'info' | 'warn' | 'error' | 'fatal'} LogLevel */

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
	fatal: 50,
}

const DEFAULT_LEVEL: LogLevel = "info"

/** @typedef {{
 *   level: LogLevel,
 *   timestamp: string,
 *   message: string,
 *   logger: string,
 *   correlation: CorrelationContext,
 *   data?: Record<string, unknown>,
 *   error?: { name: string; message: string; stack?: string; code?: string },
 * }} LogEntry */

let currentLevel: LogLevel = DEFAULT_LEVEL
const sinks = new Set<(entry: LogEntry) => void>()

/** Add log sink (e.g., file, remote, console) */
export function addSink(sink) {
	sinks.add(sink)
	return () => sinks.delete(sink)
}

/** Remove log sink */
export function removeSink(sink) {
	sinks.delete(sink)
}

/** Set minimum log level */
export function setLogLevel(level: LogLevel) {
	currentLevel = level
}

/** Check if level is enabled */
export function isLevelEnabled(level: LogLevel) {
	return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

/** Format error for logging */
function formatError(error) {
	if (!error) return undefined
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
			code: error.code,
			...Object.fromEntries(
				Object.entries(error).filter(
					([k]) => !["name", "message", "stack", "code"].includes(k),
				),
			),
		}
	}
	return { message: String(error) }
}

/** Core log function */
function log(level: LogLevel, loggerName: string, message: string, data?: Record<string, unknown>, error?: Error) {
	if (!isLevelEnabled(level)) return

	const correlation = getCorrelation()
	const entry: LogEntry = {
		level,
		timestamp: new Date().toISOString(),
		message,
		logger: loggerName,
		correlation: {
			traceId: correlation.traceId,
			spanId: correlation.spanId,
			parentSpanId: correlation.parentSpanId,
			userId: correlation.userId,
			tenantId: correlation.tenantId,
			sessionId: correlation.sessionId,
			requestId: correlation.requestId,
		},
		data,
		error: formatError(error),
	}

	// Console output (pretty in dev, JSON in prod)
	if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
		const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${loggerName}]`
		const corr = `trace=${correlation.traceId} span=${correlation.spanId}`
		console[level === "debug" ? "debug" : level === "info" ? "log" : level === "warn" ? "warn" : "error"](
			`${prefix} ${corr} ${message}`,
			data ? JSON.stringify(data) : "",
			error ? error.stack : "",
		)
	} else {
		// JSON output for production
		console.log(JSON.stringify(entry))
	}

	// Send to sinks
	for (const sink of sinks) {
		try {
			sink(entry)
		} catch {
			// Sink errors must not break logging
		}
	}
}

/** Create logger instance */
export function createLogger(name: string) {
	return {
		debug: (msg: string, data?: Record<string, unknown>) => log("debug", name, msg, data),
		info: (msg: string, data?: Record<string, unknown>) => log("info", name, msg, data),
		warn: (msg: string, data?: Record<string, unknown>) => log("warn", name, msg, data),
		error: (msg: string, data?: Record<string, unknown>, err?: Error) => log("error", name, msg, data, err),
		fatal: (msg: string, data?: Record<string, unknown>, err?: Error) => log("fatal", name, msg, data, err),
		child: (childData: Record<string, unknown>) => createChildLogger(name, childData),
	}
}

function createChildLogger(parentName: string, childData: Record<string, unknown>) {
	const base = createLogger(parentName)
	const original = { ...base }
	for (const level of ["debug", "info", "warn", "error", "fatal"] as LogLevel[]) {
		base[level] = (msg, data, err) => original[level](msg, { ...childData, ...data }, err)
	}
	return base
}

/** Create logger with correlation context bound */
export function createBoundLogger(name: string, correlation: CorrelationContext) {
	return withCorrelation(correlation, () => createLogger(name))
}

// ============================================================================
// PERFORMANCE LOGGING
// ============================================================================

/** @typedef {{
 *   name: string,
 *   duration: number,
 *   success: boolean,
 *   metadata?: Record<string, unknown>,
 * }} PerfEntry */

/** Log performance timing */
export function logPerformance(name: string, duration: number, success: boolean, metadata?: Record<string, unknown>) {
	const logger = createLogger("performance")
	if (success) {
		logger.info(`${name} completed`, { duration, ...metadata })
	} else {
		logger.warn(`${name} failed`, { duration, ...metadata })
	}
}

/** Time a function execution */
export function timeFunction(fn, name, metadata) {
	const start = performance.now()
	try {
		const result = fn()
		if (result instanceof Promise) {
			return result
				.then((value) => {
					logPerformance(name, performance.now() - start, true, metadata)
					return value
				})
				.catch((err) => {
					logPerformance(name, performance.now() - start, false, { ...metadata, error: err?.message })
					throw err
				})
		}
		logPerformance(name, performance.now() - start, true, metadata)
		return result
	} catch (err) {
		logPerformance(name, performance.now() - start, false, { ...metadata, error: err?.message })
		throw err
	}
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/** @typedef {{
 *   action: string,
 *   entityType: string,
 *   entityId: string,
 *   userId?: string,
 *   tenantId?: string,
 *   before?: Record<string, unknown>,
 *   after?: Record<string, unknown>,
 *   metadata?: Record<string, unknown>,
 * }} AuditEntry */

const auditSink = new Set<(entry: AuditEntry) => void>()

/** Add audit sink */
export function addAuditSink(sink) {
	auditSink.add(sink)
	return () => auditSink.delete(sink)
}

/** Log audit entry */
export function audit(entry: AuditEntry) {
	const fullEntry = {
		...entry,
		timestamp: new Date().toISOString(),
		correlation: getCorrelation(),
	}

	for (const sink of auditSink) {
		try {
			sink(fullEntry)
		} catch {
			// Silent fail
		}
	}

	// Also log as structured log
	const logger = createLogger("audit")
	logger.info(`AUDIT: ${entry.action} ${entry.entityType}`, fullEntry)
}

export default {
	createLogger,
	setLogLevel,
	isLevelEnabled,
	addSink,
	removeSink,
	withCorrelation,
	getCorrelation,
	createSpan,
	logPerformance,
	timeFunction,
	audit,
	addAuditSink,
}