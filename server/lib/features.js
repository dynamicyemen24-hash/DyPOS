/**
 * DyPOS Feature Flags — precedence: env DYPOS_FEATURE_<NAME>=1|0 > DB
 * (feature_flags table) > default. All reads are cached for 5s (tunable via
 * DYPOS_FEATURES_CACHE_TTL_MS); writes invalidate the cache immediately.
 *
 * Documented flag semantics:
 *  - exposed   : safe to ship to the public GET /api/features (no billing or
 *                pricing gated flags). Defaults are ON unless documented.
 *  - internal  : never exposed on GET /api/features (billing/pricing gating).
 *
 * Resolve is synchronous (node:sqlite) so routes and guards can call it
 * without async plumbing; DB faults degrade to env>default, never throw.
 */
import {
	allFeatures as storeAll,
	upsertFeature as storeUpsert,
} from "./featuresStore.js"

const NAME_RE = /^[A-Z][A-Z0-9_]*$/

export const DEFAULT_FEATURES = {
	OFFLINE_MODE: { default: true, exposed: true, note: "وضع عدم الاتصال" },
	PRINT_SPOOL: { default: true, exposed: true, note: "طابور الطباعة SAP" },
	REALTIME_STOCK: {
		default: true,
		exposed: true,
		note: "تحديث المخزون اللحظي",
	},
	CUSTOMER_CRM: { default: true, exposed: true, note: "ملفات العملاء" },
	SMART_SEARCH: { default: true, exposed: true, note: "البحث الذكي" },
	DISPATCHER_FANOUT: {
		default: true,
		exposed: false,
		note: "داخلي: توزيع webhook المتوازي",
	},
	TIER2_POSTGRES: {
		default: false,
		exposed: false,
		note: "داخلي: طبقة النشر Postgres",
	},
}

/** Public-safe allowlist for GET /api/features — billing/pricing flags excluded. */
export const EXPOSED_FEATURE_NAMES = Object.keys(DEFAULT_FEATURES).filter(
	(n) => DEFAULT_FEATURES[n].exposed,
)

export function normalizeName(name) {
	return String(name ?? "")
		.toUpperCase()
		.replace(/[^A-Z0-9_]/g, "")
}

/**
 * TTL for the read cache in ms, read at call time so tests can shrink it and
 * deploys can tune it without a restart. Floor of 10ms prevents zero/neg TTL.
 */
export function cacheTtlMs() {
	const raw = Number(process.env.DYPOS_FEATURES_CACHE_TTL_MS)
	if (Number.isFinite(raw) && raw > 0) return Math.max(10, raw)
	return 5000
}

// module-level caches (per-instance process; multi-process deployments each
// hold an identical TTL cache — writes invalidate locally only, matches the
// webhook dispatcher's single-writer lease model)
let rowsCache = null
let rowsCacheAt = 0
let listCacheValue = null
let listCacheAt = 0

function now() {
	return Date.now()
}

function dbRows() {
	const ttl = cacheTtlMs()
	if (rowsCache && now() - rowsCacheAt < ttl) return rowsCache
	let rows = {}
	try {
		for (const row of storeAll()) rows[row.flag] = row
	} catch {
		rows = {}
	}
	rowsCache = rows
	rowsCacheAt = now()
	return rows
}

function envValue(name) {
	const raw = process.env[`DYPOS_FEATURE_${name}`]
	if (raw === undefined || raw === "") return undefined
	if (/^(1|true|yes|on)$/i.test(raw)) return true
	if (/^(0|false|no|off)$/i.test(raw)) return false
	return undefined
}

/**
 * @param {string} name normalised flag name
 * @param {boolean} fallback
 * @returns {{ enabled: boolean, source: 'env'|'db'|'default', note?: string }}
 */
export function resolveFeature(name, fallback) {
	const fromEnv = envValue(name)
	if (fromEnv !== undefined) return { enabled: fromEnv, source: "env" }
	const row = dbRows()[name]
	if (row)
		return { enabled: Number(row.enabled) === 1, source: "db", note: row.note }
	return { enabled: fallback, source: "default" }
}

/**
 * @param {string} name flag name (case/format-insensitive; normalised)
 * @returns {boolean} effective value; unknown/unset flags are ON for all
 *                    exposed allowlist entries, OFF for undocumented ones.
 */
export function isFeatureEnabled(name) {
	const norm = normalizeName(name)
	if (!NAME_RE.test(norm)) return false
	const meta = DEFAULT_FEATURES[norm]
	return resolveFeature(norm, meta ? meta.default : false).enabled
}

/**
 * @param {string} name flag name (normalised)
 * @param {boolean|0|1} enabled
 * @param {string} [note]
 * @returns {{ flag: string, enabled: boolean, source: string, note: string, default: boolean, overridden_by_env: boolean }}
 */
export function setFeatureFlag(name, enabled, note) {
	const norm = normalizeName(name)
	if (!NAME_RE.test(norm))
		throw new TypeError(
			`invalid feature flag name: ${String(name).slice(0, 64)}`,
		)
	const value =
		enabled === true || enabled === 1 || enabled === "1"
			? true
			: enabled === false || enabled === 0 || enabled === "0"
				? false
				: undefined
	if (value === undefined)
		throw new TypeError("enabled must be a boolean (or 0/1)")
	storeUpsert(norm, value, String(note ?? "").slice(0, 300))
	clearFeatureCaches()
	const meta = DEFAULT_FEATURES[norm]
	const effective = resolveFeature(norm, meta ? meta.default : false)
	return {
		flag: norm,
		enabled: effective.enabled,
		source: effective.source,
		note: effective.note ?? String(note ?? "").slice(0, 300),
		default: meta ? meta.default : false,
		overridden_by_env: effective.source === "env",
	}
}

/** All known flags (defaults + DB extras), resolved, bounded by definitions. */
export function listFeatures() {
	const ttl = cacheTtlMs()
	if (listCacheValue && now() - listCacheAt < ttl) return listCacheValue
	const rows = dbRows()
	const seen = new Set()
	const out = []
	for (const name of Object.keys(DEFAULT_FEATURES)) {
		const meta = DEFAULT_FEATURES[name]
		const r = resolveFeature(name, meta.default)
		out.push({
			name,
			default: meta.default,
			enabled: r.enabled,
			source: r.source,
			exposed: meta.exposed,
			note: r.note ?? meta.note ?? "",
		})
		seen.add(name)
	}
	for (const name of Object.keys(rows)) {
		if (seen.has(name) || !NAME_RE.test(name)) continue
		const r = resolveFeature(name, false)
		out.push({
			name,
			default: false,
			enabled: r.enabled,
			source: r.source,
			exposed: false,
			note: r.note ?? "",
		})
	}
	listCacheValue = out
	listCacheAt = now()
	return out
}

/** Drop read caches (called by setFeatureFlag; exported for tests/janitors). */
export function clearFeatureCaches() {
	rowsCache = null
	rowsCacheAt = 0
	listCacheValue = null
	listCacheAt = 0
}

export default {
	DEFAULT_FEATURES,
	EXPOSED_FEATURE_NAMES,
	normalizeName,
	cacheTtlMs,
	isFeatureEnabled,
	setFeatureFlag,
	listFeatures,
	resolveFeature,
	clearFeatureCaches,
}
