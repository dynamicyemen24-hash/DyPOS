/**
 * DyPOS Theme Manager
 * Runtime contract for mode, accent, density and accessibility contrast.
 *
 * Invariants:
 * - Components never mutate theme data attributes directly.
 * - "system" resolves to the OS color scheme while retaining the user's
 *   selected preference.
 * - Cross-tab changes converge without a persistence/event feedback loop.
 * - SSR/tests remain safe when window, document, matchMedia or localStorage
 *   are unavailable.
 */
export const THEME_MODES = Object.freeze(["light", "dark", "system"])
export const THEME_ACCENTS = Object.freeze(["royal", "indigo", "teal", "emerald", "violet", "rose"])
export const THEME_DENSITIES = Object.freeze(["compact", "comfortable", "spacious"])
export const THEME_CONTRASTS = Object.freeze(["normal", "high"])

const STORAGE_KEY = "dypos.design.preferences"
const EVENT_NAME = "dypos-theme-change"
const DEFAULTS = Object.freeze({
	mode: "light",
	accent: "royal",
	density: "comfortable",
	contrast: "normal",
})

const normalize = (value, allowed, fallback) =>
	allowed.includes(value) ? value : fallback

export function normalizePreferences(value = {}) {
	return {
		mode: normalize(value.mode, THEME_MODES, DEFAULTS.mode),
		accent: normalize(value.accent, THEME_ACCENTS, DEFAULTS.accent),
		density: normalize(value.density, THEME_DENSITIES, DEFAULTS.density),
		contrast: normalize(value.contrast, THEME_CONTRASTS, DEFAULTS.contrast),
	}
}

function readPreferences() {
	if (typeof localStorage === "undefined") return { ...DEFAULTS }
	try {
		return normalizePreferences(
			JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
		)
	} catch {
		return { ...DEFAULTS }
	}
}

let preferences = readPreferences()
let systemMediaQuery = null
let systemMediaListenerAttached = false

function resolveMode(mode) {
	if (mode !== "system") return mode
	try {
		return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
			? "dark"
			: "light"
	} catch {
		return "light"
	}
}

function applyToDocument(next) {
	if (typeof document === "undefined") return

	const root = document.documentElement
	const resolvedMode = resolveMode(next.mode)

	// data-theme is the resolved CSS state. data-theme-mode preserves the
	// user's actual preference so "system" is never confused with "light".
	root.dataset.theme = resolvedMode
	root.dataset.themeMode = next.mode
	root.dataset.accent = next.accent
	root.dataset.density = next.density
	root.dataset.contrast = next.contrast
	root.style.colorScheme = resolvedMode
}

function publish(next) {
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent(EVENT_NAME, {
				detail: Object.freeze({ ...next }),
			}),
		)
	}
}

function persist(next) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
	} catch {
		/* private browsing / blocked storage — runtime state remains valid */
	}
}

function detachSystemListener() {
	if (!systemMediaQuery || !systemMediaListenerAttached) return

	try {
		if (typeof systemMediaQuery.removeEventListener === "function") {
			systemMediaQuery.removeEventListener("change", handleSystemChange)
		} else {
			systemMediaQuery.removeListener?.(handleSystemChange)
		}
	} catch {
		/* best effort */
	}

	systemMediaListenerAttached = false
	systemMediaQuery = null
}

function handleSystemChange() {
	if (preferences.mode !== "system") return
	applyToDocument(preferences)
	publish(preferences)
}

function syncSystemListener(mode) {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		detachSystemListener()
		return
	}

	if (mode !== "system") {
		detachSystemListener()
		return
	}

	const nextQuery = window.matchMedia("(prefers-color-scheme: dark)")
	if (systemMediaQuery === nextQuery && systemMediaListenerAttached) return

	detachSystemListener()
	systemMediaQuery = nextQuery

	try {
		if (typeof systemMediaQuery.addEventListener === "function") {
			systemMediaQuery.addEventListener("change", handleSystemChange)
		} else {
			systemMediaQuery.addListener?.(handleSystemChange)
		}
		systemMediaListenerAttached = true
	} catch {
		systemMediaListenerAttached = false
	}
}

function applyRuntime(next, { persistValue = true, emit = true } = {}) {
	preferences = normalizePreferences(next)
	applyToDocument(preferences)
	syncSystemListener(preferences.mode)

	if (persistValue) persist(preferences)
	if (emit) publish(preferences)

	return getThemePreferences()
}

export function getThemePreferences() {
	return Object.freeze({ ...preferences })
}

export function getResolvedThemeMode() {
	return resolveMode(preferences.mode)
}

export function applyThemePreferences(value = preferences) {
	return applyRuntime(value)
}

export const setThemeMode = (mode) => applyRuntime({ ...preferences, mode })
export const setThemeAccent = (accent) => applyRuntime({ ...preferences, accent })
export const setThemeDensity = (density) => applyRuntime({ ...preferences, density })
export const setThemeContrast = (contrast) => applyRuntime({ ...preferences, contrast })
export const resetThemePreferences = () => applyRuntime(DEFAULTS)

export function subscribeTheme(callback) {
	if (typeof window === "undefined") return () => {}

	const handler = (event) =>
		callback(event.detail || getThemePreferences())
	window.addEventListener(EVENT_NAME, handler)
	return () => window.removeEventListener(EVENT_NAME, handler)
}

// Cross-tab convergence. External state is applied without writing it back.
function handleStorageChange(event) {
	if (event.key !== STORAGE_KEY || !event.newValue) return

	try {
		const external = normalizePreferences(JSON.parse(event.newValue))
		applyRuntime(external, { persistValue: false, emit: true })
	} catch {
		/* malformed external state is ignored */
	}
}

if (typeof window !== "undefined") {
	window.addEventListener("storage", handleStorageChange)
}

applyRuntime(preferences, { persistValue: false, emit: false })

export const themeManager = Object.freeze({
	get: getThemePreferences,
	getResolvedMode: getResolvedThemeMode,
	apply: applyThemePreferences,
	setMode: setThemeMode,
	setAccent: setThemeAccent,
	setDensity: setThemeDensity,
	setContrast: setThemeContrast,
	reset: resetThemePreferences,
	subscribe: subscribeTheme,
})
export default themeManager
