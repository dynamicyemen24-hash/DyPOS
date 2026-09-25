/**
 * @fileoverview Translation system for DyPOS with offline support.
 *
 * This module provides:
 * - Vue plugin for global `__()` translation function
 * - IndexedDB-backed caching via translationCache
 * - Stale-while-revalidate loading strategy
 * - Reactive version counter for component re-renders
 *
 * Usage:
 * ```ts
 * // In templates (via Vue plugin)
 * {{ __('Hello') }}
 *
 * // In scripts
 * import { __ } from '@/utils/translation'
 * const msg = __('Hello')
 *
 * // With placeholders
 * __('Hello {0}', { 0: 'World' })
 * ```
 *
 * @module translation
 */
import { type App, ref } from "vue"
import { translationCache } from "./offline/translationCache"
import { logger } from "./logger"

const log = logger.create("Translation")

/** Translation dictionary type: source string → translated string */
type Messages = Record<string, string>

// Extend Window interface with translation globals
declare global {
	interface Window {
		/** Global translation function */
		__: typeof translate
		/** Current translation dictionary */
		translatedMessages?: Messages
		/** Language switcher function */
		$changeLanguage?: typeof changeLanguage
	}
}

/**
 * Reactive counter that increments when translations change.
 * Watch this to trigger re-renders when language changes.
 * Debounced to avoid multiple remounts during stale-while-revalidate
 * (cache hit + network refresh can fire applyMessages 2-3 times rapidly).
 */
export const translationVersion = ref(0)
let _versionDebounce: ReturnType<typeof setTimeout> | null = null

/** Default locale when none is configured */
const FALLBACK_LOCALE = "ar"

/** Options for locale loading behavior */
type LoadOptions = {
	/** Try cached translations first before network */
	preferCache?: boolean
	/** Force network fetch even if cache is fresh */
	forceNetwork?: boolean
}

/**
 * Vue plugin that installs translation helpers globally.
 * Adds `__` to component instances and window object.
 *
 * @param app - Vue application instance
 * @example
 * // In main.ts
 * import translationPlugin from '@/utils/translation'
 * app.use(translationPlugin)
 */
export default function translationPlugin(app: App) {
	app.config.globalProperties.__ = translate
	window.__ = translate
	window.$changeLanguage = changeLanguage
	init()
}

/**
 * Resolves a translation for the provided key.
 * Supports indexed placeholders and contextual translations.
 *
 * @param msg - Source string to translate
 * @param replace - Indexed placeholder values (e.g., {0}, {1})
 * @param ctx - Optional context for disambiguation
 * @returns Translated string, or original if no translation found
 *
 * @example
 * // Simple translation
 * __('Save')  // → "حفظ" (in Arabic)
 *
 * // With placeholders
 * __('Hello {0}', { 0: 'Ahmed' })  // → "مرحبا Ahmed"
 *
 * // With context (for same source with different meanings)
 * __('Save', null, 'button')  // Uses key "Save:button"
 */
export function translate(
	msg: string,
	replace?: Record<string, string>,
	ctx?: string | null,
): string {
	const messages = window.translatedMessages || {}
	const key = ctx ? `${msg}:${ctx}` : msg
	let translated = messages[key] || messages[msg] || msg

	if (replace) {
		translated = translated.replace(/{(\d+)}/g, (_, n) => replace[n] ?? _)
	}

	return translated
}

/** Alias for translate function */
export const __ = translate
export const t = __

/**
 * Determines the preferred locale for the current session.
 * Arabic is the enforced default; only an explicit in-app switch
 * (persisted to localStorage) can select another language. The
 * browser/Frappe boot language is intentionally ignored so every
 * startup — including the login screen — renders in Arabic.
 * @returns Lowercase locale code
 */
const getLocale = (): string => {
	if (typeof window === "undefined") return FALLBACK_LOCALE

	const explicit = window.localStorage?.getItem("DyPOS_language")?.toLowerCase()
	if (explicit && ["ar", "en", "id", "pt-br"].includes(explicit)) {
		return explicit
	}

	return FALLBACK_LOCALE
}

/**
 * Initializes translations on app startup.
 * Uses stale-while-revalidate: shows cached immediately, refreshes in background.
 * Never throws: offline boot must render from Arabic fallbacks, not crash.
 */
async function init() {
	try {
		const locale = getLocale()
		const loaded = await loadLocale(locale, { preferCache: true })
		if (!loaded) fallbackFetch(locale)
	} catch {
		try {
			fallbackFetch(getLocale())
		} catch {
			// Fully offline: translate() falls back to source strings (Arabic).
		}
	}
}

/**
 * Applies new translations and triggers reactivity update.
 * @param messages - New translation dictionary
 */
function applyMessages(messages: Messages) {
	window.translatedMessages = messages
	// Debounce: coalesce rapid calls (cache hit + network refresh)
	// into a single version bump to avoid multiple component remounts
	if (_versionDebounce) clearTimeout(_versionDebounce)
	_versionDebounce = setTimeout(() => {
		translationVersion.value++
		_versionDebounce = null
	}, 100)
}

/**
 * Loads the bundled local translation dictionary (offline-first).
 * Source: POS/public/locales/{locale}.json (precached by the PWA).
 * The server is never required for the UI language.
 * @returns Translation dictionary or null when no bundle exists
 */
async function requestTranslations(locale?: string) {
	try {
		const target = (locale || getLocale()).toLowerCase()
		const base =
			(typeof import.meta !== "undefined" &&
				(import.meta as unknown as { env?: { BASE_URL?: string } }).env
					?.BASE_URL) ||
			"/"
		const res = await fetch(`${base}locales/${target}.json`, {
			cache: "force-cache",
			credentials: "same-origin",
			headers: { Accept: "application/json" },
		})
		if (!res.ok) return null
		const data = (await res.json()) as unknown
		if (data && typeof data === "object") return data as Messages
		return null
	} catch {
		return null
	}
}

/**
 * Loads translations for a locale using cache-first strategy.
 *
 * Flow:
 * 1. If preferCache: apply cached translations immediately (fast initial render)
 * 2. If cache is stale or forceNetwork: fetch fresh from API
 * 3. Update cache and re-apply if new translations received
 *
 * @param locale - Target locale code
 * @param options - Loading behavior options
 * @returns True if translations were successfully applied
 */
async function loadLocale(locale: string, options: LoadOptions = {}) {
	const { preferCache = false, forceNetwork = false } = options
	const target = locale || FALLBACK_LOCALE
	let appliedFromCache = false

	if (preferCache) {
		const cached = await translationCache.get(target)
		if (cached?.messages) {
			applyMessages(cached.messages)
			appliedFromCache = true

			if (!translationCache.isStale(cached.timestamp) && !forceNetwork) {
				return true
			}
		}
	}

	const entry = await translationCache.getFresh(
		target,
		() => requestTranslations(target),
		{
			force: forceNetwork,
		},
	)

	if (entry?.messages) {
		applyMessages(entry.messages)
		return true
	}

	return appliedFromCache
}

/**
 * Local fallback loader (offline-first).
 * There is no server fallback: the bundled locale + IndexedDB cache +
 * Arabic source strings are the complete language system.
 * @param locale - Locale code for logging
 */
function fallbackFetch(locale?: string) {
	log.debug(
		`Local translations only for ${locale || FALLBACK_LOCALE}; no server fallback`,
	)
}

/**
 * Public API to switch the application language.
 * Persists to cache and triggers UI re-render.
 *
 * @param locale - Target locale code (e.g., "ar", "en")
 * @returns Promise that resolves when translations are loaded
 *
 * @example
 * await changeLanguage('ar')
 */
export async function changeLanguage(locale: string): Promise<void> {
	const success = await loadLocale(locale, {
		preferCache: true,
		forceNetwork: true,
	})
	if (!success) fallbackFetch(locale)
}
