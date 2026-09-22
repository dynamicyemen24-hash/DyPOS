/**
 * Output Determination — SAP-style routing rules.
 *
 * Resolves a print context (docType + profile + silent mode + QZ state) into
 * a concrete execution plan: device, template, copies, paper, priority and
 * browser-fallback chain. This layer is data-only: it never touches a
 * printer. Priority: productCard → profile match → docType match → default.
 *
 * Rule sources (highest wins):
 *   1. Server `document_print_configs` (fetched, cached)
 *   2. localStorage override (branch testing / direct QZ wiring)
 *   3. Built-in default rules below
 */

import { logger } from "@/utils/logger"

const log = logger.create("OutputDetermination")

export const LOCAL_RULES_KEY = "dypos.print.rules.v1"

export const DEVICE_BROWSER = "browser"

/** Widths (mm) mapped from paper-size tokens accepted by qzTray. */
export const PAPER_WIDTH_MM = Object.freeze({
	"58mm": 58,
	"80mm": 80,
	A4: 210,
	a4: 210,
	A5: 148,
	a5: 148,
	"label-4x6": 101,
	default: 80,
})

export const DEFAULT_RULES = Object.freeze([
	{
		docType: "invoice",
		match: { silentPrint: true, profile: "*" },
		deviceId: "qz",
		formId: "cfg-invoice",
		copies: 1,
		paper: "80mm",
		priority: 0,
		fallback: [DEVICE_BROWSER],
	},
	{
		docType: "invoice",
		match: { silentPrint: false, profile: "*" },
		deviceId: DEVICE_BROWSER,
		formId: "cfg-invoice",
		copies: 1,
		paper: "80mm",
		priority: 0,
		fallback: [],
	},
	{
		docType: "eod",
		match: { silentPrint: true, profile: "*" },
		deviceId: "qz",
		formId: "cfg-eod",
		copies: 1,
		paper: "A4",
		priority: 1,
		fallback: [DEVICE_BROWSER],
	},
	{
		docType: "eod",
		match: { silentPrint: false, profile: "*" },
		deviceId: DEVICE_BROWSER,
		formId: "cfg-eod",
		copies: 1,
		paper: "A4",
		priority: 1,
		fallback: [],
	},
	{
		docType: "draft",
		match: { profile: "*" },
		deviceId: DEVICE_BROWSER,
		formId: "cfg-draft",
		copies: 1,
		paper: "80mm",
		priority: 0,
		fallback: [],
	},
	{
		docType: "quotation",
		match: { profile: "*" },
		deviceId: DEVICE_BROWSER,
		formId: "cfg-quotation",
		copies: 1,
		paper: "80mm",
		priority: 0,
		fallback: [],
	},
	{
		docType: "return_receipt",
		match: { profile: "*" },
		deviceId: "qz",
		formId: "cfg-return",
		copies: 1,
		paper: "80mm",
		priority: 0,
		fallback: [DEVICE_BROWSER],
	},
	{
		docType: "report_daily",
		match: { profile: "*" },
		deviceId: DEVICE_BROWSER,
		formId: "cfg-report-daily",
		copies: 1,
		paper: "A4",
		priority: 0,
		fallback: [],
	},
	{
		docType: "custom",
		match: { profile: "*" },
		deviceId: DEVICE_BROWSER,
		formId: "cfg-custom",
		copies: 1,
		paper: "80mm",
		priority: 0,
		fallback: [],
	},
])

/**
 * Thin localStorage layer with graceful degradation.
 */
function safeStorage() {
	try {
		return typeof globalThis !== "undefined" && globalThis.localStorage
			? globalThis.localStorage
			: null
	} catch {
		return null
	}
}

export function loadLocalRules() {
	const storage = safeStorage()
	if (!storage) return null
	try {
		const raw = storage.getItem(LOCAL_RULES_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw)
		return Array.isArray(parsed) ? parsed : null
	} catch (error) {
		log.warn("Invalid local print rules; using defaults", error)
		return null
	}
}

export function saveLocalRules(rules) {
	const storage = safeStorage()
	if (!storage || !Array.isArray(rules)) return false
	try {
		storage.setItem(LOCAL_RULES_KEY, JSON.stringify(rules))
		return true
	} catch (error) {
		log.warn("Unable to persist local print rules", error)
		return false
	}
}

export function clearLocalRules() {
	const storage = safeStorage()
	if (!storage) return
	try {
		storage.removeItem(LOCAL_RULES_KEY)
	} catch {
		// ignore quota/priv errors
	}
}

function ruleMatches(rule, ctx) {
	const match = rule?.match || {}
	// profile filter: "*" matches everything, "" matches true by default,
	// otherwise exact match.
	const profile = match.profile
	if (profile && profile !== "*" && profile !== ctx.posProfile) return false

	if (match.silentPrint !== undefined && match.silentPrint !== ctx.silentPrint)
		return false

	if (match.deviceId && match.deviceId !== ctx.deviceId) return false

	return true
}

function mergeRule(rule, ctx) {
	const copies = Number(rule.copies)
	return {
		deviceId: rule.deviceId || DEVICE_BROWSER,
		formId: rule.formId || "cfg-custom",
		copies: Number.isFinite(copies) && copies >= 1 ? copies : 1,
		paper: rule.paper || "80mm",
		priority: rule.priority === 1 ? 1 : 0,
		fallback: Array.isArray(rule.fallback)
			? rule.fallback.filter((d) => typeof d === "string")
			: [],
		width: PAPER_WIDTH_MM[rule.paper] ?? PAPER_WIDTH_MM.default,
		orientation: rule.orientation || "portrait",
		source: ctx?.posProfile ? "server" : "default",
		profile: ctx.posProfile || null,
	}
}

/**
 * Resolve the execution plan for a print request.
 *
 * Priority order: productCard (a profile-specific rule) → profile match →
 * docType match → default. Falls back to {@link DEFAULT_RULES} when no
 * custom rules are configured.
 *
 * @param {Object} ctx — { docType, posProfile, silentPrint, qzReady, customRules? }
 * @returns {{deviceId:string, formId:string, copies:number, paper:string,
 *   priority:number, fallback:string[], width:number, orientation:string,
 *   source:string, profile:string|null}}
 */
export function resolveOutput(ctx) {
	const {
		docType = "invoice",
		posProfile = null,
		silentPrint = false,
		qzReady = false,
		customRules = null,
	} = ctx || {}

	const rules = Array.isArray(customRules) ? customRules : null

	const scoped = { docType, posProfile, silentPrint, qzReady }

	// productCard / profile-specific: a rule whose match lists this profile.
	const profileRule = (rules || []).find(
		(r) =>
			r?.docType === docType &&
			r?.match?.profile &&
			r.match.profile !== "*" &&
			r.match.profile === posProfile,
	)
	if (profileRule) return mergeRule(profileRule, scoped)

	// profile wildcard match.
	const wildRule = (rules || []).find(
		(r) =>
			r?.docType === docType &&
			r?.match?.profile === "*" &&
			ruleMatches(r, scoped),
	)
	if (wildRule) return mergeRule(wildRule, scoped)

	// blanket docType match (no profile filter).
	const docRule = (rules || []).find(
		(r) => r?.docType === docType && !r?.match?.profile && ruleMatches(r, scoped),
	)
	if (docRule) return mergeRule(docRule, scoped)

	// built-in default for this docType honouring the context (silent mode, …).
	const fallbackRule =
		DEFAULT_RULES.find(
			(r) => r.docType === docType && ruleMatches(r, scoped),
		) || DEFAULT_RULES.find((r) => ruleMatches(r, scoped))
	if (fallbackRule) return mergeRule(fallbackRule, scoped)

	// last resort: a neutral browser plan for unknown docTypes.
	return {
		deviceId: DEVICE_BROWSER,
		formId: "cfg-custom",
		copies: 1,
		paper: "80mm",
		priority: 0,
		fallback: [],
		width: PAPER_WIDTH_MM.default,
		orientation: "portrait",
		source: "default",
		profile: posProfile,
	}
}

/**
 * Decide whether the resolved device is actually reachable and, when not,
 * synthesize a browser fallback plan (the current fire-and-forget path).
 */
export function applyDeviceAvailability(plan, ctx) {
	if (!plan) return plan
	const { qzReady = false } = ctx || {}
	if (plan.deviceId === "qz" && !qzReady) {
		if (plan.fallback.includes(DEVICE_BROWSER)) {
			return { ...plan, deviceId: DEVICE_BROWSER, fellBack: true }
		}
	}
	return { ...plan, fellBack: false }
}