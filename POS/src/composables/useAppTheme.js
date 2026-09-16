/**
 * Intelligent application theme manager — mode + accent + density.
 *
 * - Modes: "light" | "dark" | "system" (follows the terminal OS preference).
 * - Accents: "royal" | "indigo" | "violet" | "teal" | "emerald" | "rose".
 * - Densities: "comfortable" | "compact".
 *
 * Each dimension is persisted in localStorage independently, applied to the
 * document root as HTML attributes (`data-theme`, `data-accent`,
 * `data-density`), and synchronised across open tabs.
 *
 * Usage anywhere (safe both inside and outside setup):
 *   const { isDark, setMode, accent, setAccent, density, setDensity } = useAppTheme();
 */

import { computed, readonly, ref } from "vue"

const STORAGE_KEYS = {
	mode: "DyPOS_theme",
	accent: "DyPOS_accent",
	density: "DyPOS_density",
}

export const ACCENTS = ["royal", "indigo", "violet", "teal", "emerald", "rose"]
export const THEME_ACCENT_LABEL_KEYS = {
	royal: "Accent.RoyalBlue",
	indigo: "Accent.Indigo",
	violet: "Accent.Violet",
	teal: "Accent.Teal",
	emerald: "Accent.Emerald",
	rose: "Accent.Rose",
}

export const DENSITIES = ["comfortable", "compact"]
export const THEME_DENSITY_LABEL_KEYS = {
	comfortable: "Density.Comfortable",
	compact: "Density.Compact",
}

const mode = ref("system")
const accent = ref("royal")
const density = ref("comfortable")
const systemDark = ref(false)
let mediaQuery = null
let crossTabBound = false

function getSavedValue(key, allowedList, fallback) {
	if (typeof window === "undefined" || !window.localStorage) return fallback
	try {
		const v = window.localStorage.getItem(key)
		return allowedList.includes(v) ? v : fallback
	} catch {
		return fallback
	}
}

function resolveTheme(modeValue) {
	if (modeValue === "system") return systemDark.value ? "dark" : "light"
	return modeValue
}

function applyTheme() {
	const resolved = resolveTheme(mode.value)
	if (typeof document !== "undefined") {
		const root = document.documentElement
		root.setAttribute("data-theme", resolved)
		root.setAttribute("data-accent", accent.value)
		root.setAttribute("data-density", density.value)
		root.style.colorScheme = resolved
	}
	if (typeof window !== "undefined" && window.localStorage) {
		try {
			const ls = window.localStorage
			ls.setItem(STORAGE_KEYS.mode, mode.value)
			ls.setItem(STORAGE_KEYS.accent, accent.value)
			ls.setItem(STORAGE_KEYS.density, density.value)
		} catch {
			// Private mode / quota — ignore.
		}
	}
}

function initSystemListener() {
	if (mediaQuery || typeof window === "undefined" || !window.matchMedia) return
	mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
	systemDark.value = mediaQuery.matches

	const onChange = (event) => {
		systemDark.value = Boolean(event.matches)
		if (mode.value === "system") applyTheme()
	}
	try {
		mediaQuery.addEventListener("change", onChange)
	} catch {
		if (mediaQuery.addListener) mediaQuery.addListener(onChange)
	}
}

function initCrossTabSync() {
	if (crossTabBound || typeof window === "undefined") return
	crossTabBound = true
	window.addEventListener("storage", (event) => {
		if (event.newValue === null) return
		const val = event.newValue
		if (event.key === STORAGE_KEYS.mode) {
			if (["light", "dark", "system"].includes(val) && val !== mode.value) {
				mode.value = val
				applyTheme()
			}
		} else if (event.key === STORAGE_KEYS.accent) {
			if (ACCENTS.includes(val) && val !== accent.value) {
				accent.value = val
				applyTheme()
			}
		} else if (event.key === STORAGE_KEYS.density) {
			if (DENSITIES.includes(val) && val !== density.value) {
				density.value = val
				applyTheme()
			}
		}
	})
}

/**
 * Apply the persisted theme as early as possible (before Vue mounts) to
 * prevent a flash of the wrong colors on cold start.
 */
export function applyThemeEarly() {
	mode.value = getSavedValue(
		STORAGE_KEYS.mode,
		["light", "dark", "system"],
		"system",
	)
	accent.value = getSavedValue(STORAGE_KEYS.accent, ACCENTS, "royal")
	density.value = getSavedValue(STORAGE_KEYS.density, DENSITIES, "comfortable")
	initSystemListener()
	initCrossTabSync()
	applyTheme()
}

/**
 * Reactive theme composable. Safe to call anywhere (module singleton).
 * @returns {{
 *   mode: import('vue').Ref<string>,
 *   resolvedTheme: import('vue').Ref<string>,
 *   isDark: import('vue').Ref<boolean>,
 *   isSystem: import('vue').Ref<boolean>,
 *   accent: import('vue').Ref<string>,
 *   density: import('vue').Ref<string>,
 *   setMode(mode: string): void,
 *   setAccent(accent: string): void,
 *   setDensity(density: string): void,
 *   toggle(): void,
 *   cycle(): void,
 * }}
 */
export function useAppTheme() {
	initSystemListener()
	initCrossTabSync()

	const resolvedTheme = computed(() => resolveTheme(mode.value))
	const isDark = computed(() => resolvedTheme.value === "dark")
	const isSystem = computed(() => mode.value === "system")

	function setMode(next) {
		if (next !== "light" && next !== "dark" && next !== "system") return
		mode.value = next
		applyTheme()
	}

	function setAccent(next) {
		if (!ACCENTS.includes(next)) return
		accent.value = next
		applyTheme()
	}

	function setDensity(next) {
		if (!DENSITIES.includes(next)) return
		density.value = next
		applyTheme()
	}

	/** Toggle light <-> dark (converts "system" into an explicit choice). */
	function toggle() {
		setMode(resolvedTheme.value === "dark" ? "light" : "dark")
	}

	/** Cycle light -> dark -> system. */
	function cycle() {
		setMode(
			mode.value === "light"
				? "dark"
				: mode.value === "dark"
					? "system"
					: "light",
		)
	}

	return {
		mode: readonly(mode),
		resolvedTheme,
		isDark,
		isSystem,
		accent: readonly(accent),
		density: readonly(density),
		setMode,
		setAccent,
		setDensity,
		toggle,
		cycle,
	}
}

export const APP_THEMES = ["light", "dark", "system"]
export const THEME_LABEL_KEYS = {
	light: "Theme.Light",
	dark: "Theme.Dark",
	system: "Theme.System",
}
