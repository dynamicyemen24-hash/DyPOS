/**
 * DyPOS Theme Manager
 * Runtime contract for mode, accent, density and accessibility contrast.
 * Import this module from any screen/component; never manipulate data-theme
 * or data-accent directly.
 */
export const THEME_MODES = Object.freeze(["light", "dark", "system"])
export const THEME_ACCENTS = Object.freeze(["royal", "indigo", "teal", "emerald", "violet", "rose"])
export const THEME_DENSITIES = Object.freeze(["compact", "comfortable", "spacious"])
export const THEME_CONTRASTS = Object.freeze(["normal", "high"])

const STORAGE_KEY = "dypos.design.preferences"
const EVENT_NAME = "dypos-theme-change"
const DEFAULTS = Object.freeze({ mode: "light", accent: "royal", density: "comfortable", contrast: "normal" })

const normalize = (value, allowed, fallback) => allowed.includes(value) ? value : fallback
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
	try { return normalizePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")) }
	catch { return { ...DEFAULTS } }
}

let preferences = readPreferences()

function applyToDocument(next) {
	if (typeof document === "undefined") return
	const root = document.documentElement
	root.dataset.theme = next.mode
	root.dataset.accent = next.accent
	root.dataset.density = next.density
	root.dataset.contrast = next.contrast
	root.style.colorScheme = next.mode === "system" ? "" : next.mode
}

function publish(next) {
	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: Object.freeze({ ...next }) }))
	}
}

function persist(next) {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
}

export function getThemePreferences() { return Object.freeze({ ...preferences }) }

export function applyThemePreferences(value = preferences) {
	preferences = normalizePreferences(value)
	applyToDocument(preferences)
	persist(preferences)
	publish(preferences)
	return getThemePreferences()
}

export const setThemeMode = (mode) => applyThemePreferences({ ...preferences, mode })
export const setThemeAccent = (accent) => applyThemePreferences({ ...preferences, accent })
export const setThemeDensity = (density) => applyThemePreferences({ ...preferences, density })
export const setThemeContrast = (contrast) => applyThemePreferences({ ...preferences, contrast })
export const resetThemePreferences = () => applyThemePreferences(DEFAULTS)

export function subscribeTheme(callback) {
	if (typeof window === "undefined") return () => {}
	const handler = (event) => callback(event.detail || getThemePreferences())
	window.addEventListener(EVENT_NAME, handler)
	return () => window.removeEventListener(EVENT_NAME, handler)
}

applyToDocument(preferences)

export const themeManager = Object.freeze({
	get: getThemePreferences,
	apply: applyThemePreferences,
	setMode: setThemeMode,
	setAccent: setThemeAccent,
	setDensity: setThemeDensity,
	setContrast: setThemeContrast,
	reset: resetThemePreferences,
	subscribe: subscribeTheme,
})
export default themeManager
