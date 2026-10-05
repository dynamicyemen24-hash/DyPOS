import { ref } from "vue"
import { __ } from "@/utils/translation"

/**
 * Technical Mode — Odoo-like debug/developer mode for the login screen.
 *
 * In Odoo, technical features are hidden behind a "Debug Mode" that can be
 * activated via URL parameter or keyboard shortcut. This provides the same
 * pattern: a persistent localStorage flag that survives reloads, with a
 * visible toggle in the login brand bar.
 *
 * When enabled, it reveals:
 * - Hardware diagnostics (printer, cash drawer, scanner tests)
 * - Network diagnostics (connectivity, latency, endpoint health)
 * - Version/build information
 * - Raw runtime state for debugging
 */
const TECHNICAL_MODE_KEY = "dypos:technicalMode"

const technicalModeEnabled = ref(false)

/** Initialize from localStorage on first import. */
function initTechnicalMode() {
	try {
		const stored = localStorage.getItem(TECHNICAL_MODE_KEY)
		if (stored !== null) {
			technicalModeEnabled.value = stored === "true"
		}
	} catch (e) {
		// localStorage unavailable (private browsing, etc.) — default to off
	}
}

/** Toggle technical mode and persist. */
function toggleTechnicalMode() {
	technicalModeEnabled.value = !technicalModeEnabled.value
	try {
		localStorage.setItem(TECHNICAL_MODE_KEY, String(technicalModeEnabled.value))
	} catch (e) {
		// ignore persistence failures
	}
}

/** Explicitly enable technical mode. */
function enableTechnicalMode() {
	if (!technicalModeEnabled.value) {
		technicalModeEnabled.value = true
		try {
			localStorage.setItem(TECHNICAL_MODE_KEY, "true")
		} catch (e) {
			// ignore
		}
	}
}

/** Explicitly disable technical mode. */
function disableTechnicalMode() {
	if (technicalModeEnabled.value) {
		technicalModeEnabled.value = false
		try {
			localStorage.setItem(TECHNICAL_MODE_KEY, "false")
		} catch (e) {
			// ignore
		}
	}
}

// Initialize immediately on module load
initTechnicalMode()

/** Keyboard shortcut: Ctrl+Shift+D (or Cmd+Shift+D on Mac) toggles technical mode. */
function setupKeyboardShortcut() {
	if (typeof window === "undefined") return

	const handler = (event) => {
		if (
			(event.ctrlKey || event.metaKey) &&
			event.shiftKey &&
			event.key === "D"
		) {
			event.preventDefault()
			toggleTechnicalMode()
		}
	}

	window.addEventListener("keydown", handler)
	return () => window.removeEventListener("keydown", handler)
}

export function useTechnicalMode() {
	return {
		technicalModeEnabled,
		toggleTechnicalMode,
		enableTechnicalMode,
		disableTechnicalMode,
		setupKeyboardShortcut,
	}
}
