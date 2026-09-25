/**
 * Application Lifecycle Manager
 * Startup ordering, health checks, graceful shutdown, readiness gates
 */

import { logger, childSafe } from "./logger.js"
import { createLogger } from "./structuredLog.js"
import { getCircuitStatuses, getBulkheadStatus } from "./resilience.js"

const log = childSafe({ component: "Lifecycle" })

/**
 * Register a service with the lifecycle manager
 * @param {Object} service
 */
export function registerService(service) {
	if (services.has(service.name)) {
		throw new Error(`Service ${service.name} already registered`)
	}
	services.set(service.name, service)
	log.debug(`Registered service: ${service.name}`)
}

/**
 * Register a health check
 * @param {string} name
 * @param {Function} check
 */
export function registerHealthCheck(name, check) {
	healthChecks.set(name, check)
	log.debug(`Registered health check: ${name}`)
}

/**
 * Initialize all services in dependency order
 */
export async function initialize() {
	log.info("Starting application initialization...")

	// Topological sort by dependencies
	const sorted = topologicalSort()

	for (const service of sorted) {
		const start = Date.now()
		try {
			log.info(`Initializing ${service.name}...`)
			await service.init()
			log.info(`Initialized ${service.name} in ${Date.now() - start}ms`)
		} catch (error) {
			log.error(`Failed to initialize ${service.name}`, { error: error.message, stack: error.stack })
			if (service.required !== false) {
				throw new Error(`Required service ${service.name} failed to initialize: ${error.message}`)
			}
			log.warn(`Optional service ${service.name} failed, continuing...`)
		}
	}

	startupComplete = true
	log.info(`Application initialization complete in ${Date.now() - startupStartTime}ms`)
}

/**
 * Topological sort of services by dependencies
 */
function topologicalSort() {
	const visited = new Set()
	const visiting = new Set()
	const result = []

	function visit(name) {
		if (visiting.has(name)) {
			throw new Error(`Circular dependency detected involving ${name}`)
		}
		if (visited.has(name)) return

		visiting.add(name)
		const service = services.get(name)
		if (service?.dependencies) {
			for (const dep of service.dependencies) {
				if (!services.has(dep)) {
					throw new Error(`Service ${name} depends on unknown service ${dep}`)
				}
				visit(dep)
			}
		}
		visiting.delete(name)
		visited.add(name)
		result.push(service)
	}

	for (const name of services.keys()) {
		visit(name)
	}

	return result
}

/**
 * Run all health checks
 * @returns {Promise<{healthy: boolean, checks: Object}>}
 */
export async function runHealthChecks() {
	const results = {}
	let allHealthy = true

	for (const [name, check] of healthChecks) {
		const start = Date.now()
		try {
			const result = await check()
			results[name] = { ...result, latency: Date.now() - start }
			if (!result.healthy) allHealthy = false
		} catch (error) {
			results[name] = {
				healthy: false,
				error: error?.message || String(error),
				latency: Date.now() - start,
			}
			allHealthy = false
		}
	}

	return { healthy: allHealthy, checks: results }
}

/**
 * Deep health check with dependency verification
 * @returns {Promise<Object>}
 */
export async function deepHealthCheck() {
	const { checks, healthy } = await runHealthChecks()

	// Circuit breaker status
	const circuits = getCircuitStatuses()
	const openCircuits = Object.entries(circuits).filter(([, c]) => c.state === "open")

	// Bulkhead status
	const bulkheads = {}
	for (const [name] of services) {
		const status = getBulkheadStatus(name)
		if (status) bulkheads[name] = status
	}

	return {
		healthy,
		startupComplete,
		uptime: Date.now() - startupStartTime,
		timestamp: new Date().toISOString(),
		checks,
		circuits: openCircuits.length > 0 ? circuits : undefined,
		bulkheads: Object.keys(bulkheads).length > 0 ? bulkheads : undefined,
	}
}

/**
 * Check if application is ready to serve traffic
 * @returns {boolean}
 */
export function isReady() {
	return startupComplete && !isShuttingDown
}

/**
 * Graceful shutdown
 * @param {string} signal
 */
export async function shutdown(signal = "SIGTERM") {
	if (isShuttingDown) {
		log.warn(`Shutdown already in progress, ignoring ${signal}`)
		return
	}

	isShuttingDown = true
	log.info(`Received ${signal}, starting graceful shutdown...`)

	const shutdownStart = Date.now()

	// Shutdown services in reverse order
	const sorted = topologicalSort().reverse()

	for (const service of sorted) {
		if (service.shutdown) {
			const start = Date.now()
			try {
				await Promise.race([
					service.shutdown(),
					new Promise((_, reject) => setTimeout(() => reject(new Error("Shutdown timeout")), 10000)),
				])
				log.info(`Shutdown ${service.name} in ${Date.now() - start}ms`)
			} catch (error) {
				log.error(`Error shutting down ${service.name}`, { error: error.message })
			}
		}
	}

	log.info(`Graceful shutdown complete in ${Date.now() - shutdownStart}ms`)
}

/**
 * Get service status
 * @param {string} name
 * @returns {Object|null}
 */
export function getServiceStatus(name) {
	const service = services.get(name)
	if (!service) return null
	return {
		name,
		dependencies: service.dependencies,
		required: service.required !== false,
	}
}

/**
 * Get all services status
 * @returns {Array}
 */
export function getAllServicesStatus() {
	return Array.from(services.values()).map((s) => ({
		name: s.name,
		dependencies: s.dependencies,
		required: s.required !== false,
	}))
}

// Internal state
const services = new Map()
const healthChecks = new Map()
let isShuttingDown = false
let startupComplete = false
const startupStartTime = Date.now()

export default {
	registerService,
	registerHealthCheck,
	initialize,
	runHealthChecks,
	deepHealthCheck,
	isReady,
	shutdown,
	getServiceStatus,
	getAllServicesStatus,
}