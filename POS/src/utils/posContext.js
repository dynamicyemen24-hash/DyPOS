/**
 * POS context provider — tenant / branch / terminal / POS profile.
 *
 * Single reactive source consumed by the session store and the login surface.
 * Terminal identity is bound to the device and persisted locally so a
 * re-login on the same terminal keeps its identity and its sync queue.
 */

import { reactive } from "vue"

import { logger } from "@/utils/logger"

const log = logger.create("PosContext")

export const TERMINAL_STORAGE_KEY = "dypos.terminal.id"

export const posContext = reactive({
	tenantId: null,
	tenantName: null,
	branchCode: null,
	branchName: null,
	terminalId: null,
	posProfile: null,
	company: null,
	source: "unknown",
})

function safeStorage() {
	try {
		return typeof globalThis !== "undefined" && globalThis.localStorage
			? globalThis.localStorage
			: null
	} catch (error) {
		return null
	}
}

/**
 * Read the first present value from a list of candidate keys.
 * @param {Object|null} source
 * @param {string[]} keys
 * @returns {any}
 */
function pick(source, keys) {
	if (!source) return undefined
	for (const key of keys) {
		const value = source[key]
		if (value !== undefined && value !== null && value !== "") {
			return value
		}
	}
	return undefined
}

/**
 * pick() that also unwraps object values to a named property
 * (e.g. `{ name }`, `{ code }`) when present.
 */
function pickNamed(source, keys, prop) {
	const value = pick(source, keys)
	if (value && typeof value === "object") {
		return value[prop] ?? value
	}
	return value
}

/**
 * Generate a device terminal identity (UUID-based, TERM- prefixed).
 * @returns {string}
 */
export function generateTerminalId() {
	const cryptoObj = globalThis.crypto
	if (typeof cryptoObj?.randomUUID === "function") {
		try {
			return `TERM-${cryptoObj.randomUUID()}`
		} catch (error) {
			/* fall through to the random fallback */
		}
	}
	const segment = () =>
		Math.floor(Math.random() * 0xffff)
			.toString(16)
			.padStart(4, "0")
	return `TERM-${segment()}${segment()}-${segment()}-${segment()}`
}

/**
 * Resolve the terminal identity for this device: reuse an existing one or
 * generate + persist a fresh id. Never regenerates an existing id.
 * @param {Object} [storage] - Injectable storage (testability).
 * @returns {string}
 */
export function resolveTerminalId(storage = safeStorage()) {
	if (storage) {
		try {
			const existing = storage.getItem(TERMINAL_STORAGE_KEY)
			if (existing) {
				posContext.terminalId = existing
				return existing
			}
		} catch (error) {
			log.warn("Could not read persisted terminal id", error)
		}
	}

	const id = generateTerminalId()
	posContext.terminalId = id

	if (storage) {
		try {
			storage.setItem(TERMINAL_STORAGE_KEY, id)
		} catch (error) {
			log.warn("Could not persist terminal id", error)
		}
	}

	return id
}

/**
 * Import a provisioned terminal code (e.g. printed on the device).
 * @param {string} code
 * @param {Object} [storage]
 * @returns {string}
 */
export function importTerminalCode(code, storage = safeStorage()) {
	const normalized = String(code || "").trim()
	if (!normalized) {
		throw new TypeError("Terminal code is required")
	}
	posContext.terminalId = normalized
	if (storage) {
		try {
			storage.setItem(TERMINAL_STORAGE_KEY, normalized)
		} catch (error) {
			log.warn("Could not persist imported terminal id", error)
		}
	}
	return normalized
}

/**
 * Merge discovered tenant/branch/terminal/profile context into posContext.
 * Later (server) sources win over earlier ones; never nulls existing values.
 *
 * Expected sources:
 *  - bootstrapData: DyPOS.api.bootstrap.get_initial_data payload
 *  - settings:      preloaded POS settings doc
 *  - auth:          platform sync auth state (tenantId/employeeId)
 * @param {Object} [sources]
 * @param {Object} [sources.bootstrapData]
 * @param {Object} [sources.settings]
 * @param {Object} [sources.auth]
 * @returns {Object} A snapshot of the context after the merge.
 */
export function refreshPosContext({
	bootstrapData = null,
	settings = null,
	auth = null,
} = {}) {
	const tenantId =
		auth?.tenantId ||
		pick(bootstrapData, ["tenant_id", "tenantId", "tenant_code"]) ||
		posContext.tenantId

	const tenantName =
		pickNamed(bootstrapData, ["tenant_name", "tenantName", "tenant"], "name") ||
		pick(settings, ["tenant_name", "company_name"]) ||
		pick(bootstrapData, ["company", "site_name"]) ||
		posContext.tenantName

	const branchName =
		pickNamed(bootstrapData, ["branch_name", "branch"], "name") ||
		pick(settings, ["branch_name", "warehouse"]) ||
		posContext.branchName

	const branchCode =
		pickNamed(bootstrapData, ["branch_code", "branch"], "code") ||
		pick(settings, ["branch_code"]) ||
		posContext.branchCode

	const company =
		pick(bootstrapData, ["company", "company_name"]) ||
		pick(settings, ["company_name", "default_company"]) ||
		posContext.company

	const profileValue = pick(bootstrapData, ["pos_profile"])
	const posProfile =
		(typeof profileValue === "object" && profileValue !== null
			? profileValue.name || profileValue.pos_profile
			: profileValue) ||
		pick(settings, ["pos_profile"])?.name ||
		posContext.posProfile

	posContext.tenantId = tenantId || null
	posContext.tenantName = tenantName || null
	posContext.branchCode = branchCode || null
	posContext.branchName = branchName || null
	posContext.company = company || null
	posContext.posProfile = posProfile || null
	posContext.source = "bootstrap"

	return { ...posContext }
}

/**
 * Explicitly overwrite a slice of the device context (e.g. after branch switch).
 * @param {Object} patch
 * @returns {Object}
 */
export function applyPosContext(patch = {}) {
	for (const key of [
		"tenantId",
		"tenantName",
		"branchCode",
		"branchName",
		"terminalId",
		"posProfile",
		"company",
	]) {
		if (patch[key] !== undefined && patch[key] !== null) {
			posContext[key] = patch[key]
		}
	}
	if (patch.branch) {
		posContext.branchCode = patch.branch.code || posContext.branchCode
		posContext.branchName = patch.branch.name || posContext.branchName
	}
	return { ...posContext }
}

export default {
	posContext,
	TERMINAL_STORAGE_KEY,
	generateTerminalId,
	resolveTerminalId,
	importTerminalCode,
	refreshPosContext,
	applyPosContext,
}
