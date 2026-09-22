import { ref, computed, onMounted } from "vue"
import { translationVersion, __ as serverTranslate } from "../utils/translation"
import { call } from "../utils/apiWrapper"
import { offlineState } from "../utils/offline/offlineState"
import { logger } from "../utils/logger"
import { useBootstrapStore } from "../stores/bootstrap"

const log = logger.create("Locale")

// Reactive locale state (shared across all components)
const currentLocale = ref("ar")
const currentDir = ref("rtl")
const allowedLocales = ref(null) // null = not fetched yet, array = fetched from server
const PREFARED_LANGUAGE_KEY = "DyPOS_language"
const ALLOWED_LOCALES_KEY = "DyPOS_allowed_locales"
const DEFAULT_LOCALE = "ar" // Arabic is the default language

/**
 * Synchronously enforce Arabic + RTL on the document before the app mounts.
 * Called from main.js so that even the first paint — including the login
 * screen — is right-to-left and Arabic. Does NOT overwrite an explicit
 * in-app language switch; initLocale() applies that persistently.
 */
export function enforceDefaultArabic() {
	currentLocale.value = DEFAULT_LOCALE
	currentDir.value = "rtl"

	if (typeof document !== "undefined") {
		document.documentElement.setAttribute("dir", "rtl")
		document.documentElement.setAttribute("lang", "ar")
		document.documentElement.classList.add("rtl")
	}
}

/** Track if initial language fetch from server has been attempted */
let serverLanguageFetched = false

// Get flag URL from flagcdn.com
function getFlagUrl(countryCode) {
	if (!countryCode) return null
	return `https://flagcdn.com/h24/${countryCode.toLowerCase()}.png`
}

// Get flag SVG URL from flagcdn.com
function getFlagUrlSvg(countryCode) {
	if (!countryCode) return null
	return `https://flagcdn.com/${countryCode.toLowerCase()}.svg`
}

// Supported languages configuration
export const SUPPORTED_LOCALES = {
	en: {
		name: "English",
		nativeName: "English",
		countryCode: "us",
		dir: "ltr",
	},
	ar: {
		name: "Arabic",
		nativeName: "العربية",
		countryCode: "sa",
		dir: "rtl",
	},
	id: {
		name: "Indonesian",
		nativeName: "Bahasa",
		countryCode: "id",
		dir: "ltr",
	},
	"pt-br": {
		name: "Portuguese (Brazil)",
		nativeName: "Portugues (Brasil)",
		countryCode: "br",
		dir: "ltr",
	},
}

/**
 * Fetch allowed locales from POS Settings
 * Caches result in localStorage for offline use
 * @returns {Promise<string[]|null>} Array of allowed locale codes or null if fetch fails
 */
async function fetchAllowedLocalesFromServer() {
	try {
		const response = await call(
			"DyPOS.api.localization.get_allowed_locales",
			{},
		)
		if (response?.locales && Array.isArray(response.locales)) {
			// Cache for offline use
			localStorage.setItem(
				ALLOWED_LOCALES_KEY,
				JSON.stringify(response.locales),
			)
			return response.locales
		}
	} catch (error) {
		log.warn("Failed to fetch allowed locales from server", error)
	}
	return null
}

/**
 * Get cached allowed locales from localStorage
 * @returns {string[]|null} Array of allowed locale codes or null
 */
function getCachedAllowedLocales() {
	try {
		const cached = localStorage.getItem(ALLOWED_LOCALES_KEY)
		if (cached) {
			return JSON.parse(cached)
		}
	} catch (error) {
		log.warn("Failed to parse cached allowed locales", error)
	}
	return null
}

/**
 * Fetch user's language preference from the server
 * Checks bootstrap store first for preloaded data to avoid redundant API call
 * @returns {Promise<string|null>} Language code or null if fetch fails
 */
async function fetchLanguageFromServer() {
	// OPTIMIZATION: Check if bootstrap has preloaded the locale
	try {
		const bootstrapStore = useBootstrapStore()
		const preloadedLocale = bootstrapStore.getPreloadedLocale()
		if (preloadedLocale && SUPPORTED_LOCALES[preloadedLocale]) {
			log.info(`Using preloaded language from bootstrap: ${preloadedLocale}`)
			return preloadedLocale
		}
	} catch (error) {
		// Bootstrap store may not be available yet, fall through to API call
		log.debug("Bootstrap store not available, fetching language from API")
	}

	// Fallback to direct API call
	try {
		const response = await call("DyPOS.api.localization.get_user_language", {})
		if (response?.locale && SUPPORTED_LOCALES[response.locale]) {
			log.info(`Fetched language from server: ${response.locale}`)
			return response.locale
		}
	} catch (error) {
		log.warn("Failed to fetch language from server", error)
	}
	return null
}

/**
 * Detect current language from cache sources (when offline)
 * Priority: explicit in-app switch (localStorage) → POS Settings locale → Arabic default.
 * The browser and Frappe boot languages are intentionally NOT considered so that
 * Arabic is the enforced default from the login screen to the last screen.
 * @returns {string} Language code
 */
function detectCachedLanguage() {
	// 1. Explicit in-app switch (persisted when the user used the language switcher)
	const stored = localStorage.getItem(PREFARED_LANGUAGE_KEY)
	if (stored && SUPPORTED_LOCALES[stored]) {
		return stored
	}

	// 2. POS Settings default locale (cached) - organization-level preference
	const settingsLocale = getPOSDefaultLocale()
	if (settingsLocale && SUPPORTED_LOCALES[settingsLocale]) {
		return settingsLocale
	}

	// 3. Enforced Arabic default
	return DEFAULT_LOCALE
}

/**
 * Read the default locale configured in POS Settings (cached if available)
 * @returns {string} Default locale code or "" if not configured
 */
function getPOSDefaultLocale() {
	const key = "DyPOS_default_locale"
	try {
		const cached = localStorage.getItem(key)
		if (cached && SUPPORTED_LOCALES[cached]) {
			return cached
		}
		// Fall back to the application default (Arabic)
		return DEFAULT_LOCALE
	} catch (error) {
		log.warn("Failed to read default locale from cache", error)
		return DEFAULT_LOCALE
	}
}

/**
 * Additive helpers (backward-compatible) for the regional/crash-resume layers:
 *  - `hasTranslation(key)` — true when a safe key exists (Arabic fallback map
 *    or the server/GUI translation dictionary).
 *  - `translate(key, fallbackAr)` — layered lookup: server translation →
 *    Arabic default map → caller fallback → the raw key.
 *  - `t` — shorthand alias of `translate`.
 *
 * Arabic-first: when the server has no translation for a regional string, the
 * Arabic default is used, so every surface stays Arabic by DyPOS convention.
 */

// Arabic defaults for keys the server dictionary may not know yet.
const FALLBACK_MESSAGES = {
	cashier_resume_title: "استئناف عملية البيع",
	cashier_resume_body:
		"عُثر على عملية بيع مُعلّقة ({0} صنف). هل تريد استئنافها من حيث توقفت؟",
	cashier_resume_accept: "استئناف البيع",
	cashier_resume_dismiss: "تجاهل",
	cashier_resume_subtitle: "آخر حفظ: {0}",
	tax_inclusive_15: "الضريبة شاملة في السعر (15%)",
	tax_exclusive_15: "الضريبة تُضاف إلى السعر (15%)",
	tax_inclusive_0: "بدون ضريبة",
}

export function hasTranslation(key) {
	if (typeof key !== "string" || key.length === 0) return false
	if (FALLBACK_MESSAGES[key] !== undefined) return true
	try {
		const messages =
			typeof window !== "undefined" ? window.translatedMessages : null
		return messages
			? Object.prototype.hasOwnProperty.call(messages, key)
			: false
	} catch {
		return false
	}
}

/**
 * Layered lookup, Arabic-first.
 * @param {string} key - string key to resolve
 * @param {string} [fallbackAr] - Arabic fallback for unknown keys
 * @returns {string}
 */
export function translate(key, fallbackAr) {
	if (typeof key !== "string" || key.length === 0) {
		return fallbackAr ?? key ?? ""
	}
	try {
		const serverValue = serverTranslate(key)
		if (serverValue && serverValue !== key) return serverValue
	} catch {
		// Dictionary lookup is best-effort — fall through to Arabic defaults.
	}
	const arabicDefault = FALLBACK_MESSAGES[key]
	if (arabicDefault !== undefined) return arabicDefault
	// An empty-string fallback is treated as "no fallback" so the raw key wins
	// (Arabic surface strings are themselves the final Arabic fallback).
	return fallbackAr || key
}

/** Shorthand alias for translate(). */
export const t = translate

/**
 * Composable for locale management
 * Provides reactive locale state and methods to change language
 */
export function useLocale() {
	// Computed properties
	const locale = computed(() => currentLocale.value)
	const dir = computed(() => currentDir.value)
	const isRTL = computed(() => currentDir.value === "rtl")
	const localeConfig = computed(() => {
		const config = SUPPORTED_LOCALES[locale.value] || SUPPORTED_LOCALES.en
		return {
			...config,
			flagUrl: getFlagUrl(config.countryCode),
			flagUrlSvg: getFlagUrlSvg(config.countryCode),
		}
	})

	/**
	 * Change application language
	 * Updates document direction, saves preference, and uses translation system
	 * @param {string} newLocale - Language code (e.g., 'ar', 'en', 'fr')
	 */
	async function changeLocale(newLocale) {
		if (!SUPPORTED_LOCALES[newLocale]) {
			log.warn(`Locale ${newLocale} not supported`)
			return
		}

		const config = SUPPORTED_LOCALES[newLocale]

		// Update reactive refs
		currentLocale.value = newLocale
		currentDir.value = config.dir

		// Update document attributes
		document.documentElement.setAttribute("dir", config.dir)
		document.documentElement.setAttribute("lang", newLocale)

		// Toggle RTL class for CSS
		if (config.dir === "rtl") {
			document.documentElement.classList.add("rtl")
		} else {
			document.documentElement.classList.remove("rtl")
		}

		// Store preference in localStorage
		localStorage.setItem(PREFARED_LANGUAGE_KEY, newLocale)

		// Update Frappe user settings first (this changes the user's language in Frappe)
		try {
			await call("DyPOS.api.localization.change_user_language", {
				locale: newLocale,
			})
		} catch (error) {
			log.error("Failed to save language preference to Frappe:", error)
		}

		// Fetch new translations dynamically (no page reload needed)
		// The API returns translations based on the user's current Frappe language setting
		if (typeof window !== "undefined" && window.$changeLanguage) {
			try {
				await window.$changeLanguage(newLocale)
			} catch (error) {
				log.error("Failed to load translations:", error)
			}
		}
	}

	/**
	 * Apply locale to document and reactive state
	 * @param {string} locale - Language code to apply
	 */
	function applyLocale(locale) {
		const config = SUPPORTED_LOCALES[locale]
		if (!config) return

		currentLocale.value = locale
		currentDir.value = config.dir

		// Set document attributes
		if (typeof document !== "undefined") {
			document.documentElement.setAttribute("dir", config.dir)
			document.documentElement.setAttribute("lang", locale)

			if (config.dir === "rtl") {
				document.documentElement.classList.add("rtl")
			} else {
				document.documentElement.classList.remove("rtl")
			}
		}
	}

	/**
	 * Initialize locale on component mount
	 * When online, fetches language from server; when offline, uses cache
	 */
	async function initLocale() {
		// First, apply cached language immediately (prevents flicker)
		const cachedLocale = detectCachedLanguage()
		applyLocale(cachedLocale)

		// Load cached allowed locales first for immediate display
		const cachedAllowed = getCachedAllowedLocales()
		if (cachedAllowed) {
			allowedLocales.value = cachedAllowed
		}

		// If online and haven't fetched from server yet, refresh allowed locales
		if (!offlineState.isOffline && !serverLanguageFetched) {
			serverLanguageFetched = true

			// Fetch allowed locales from server (language switcher options)
			const serverAllowed = await fetchAllowedLocalesFromServer()
			if (serverAllowed) {
				allowedLocales.value = serverAllowed
			}

			// NOTE: The server/boot language is deliberately NOT applied here.
			// Arabic is the enforced default; only an explicit in-app switch
			// (localStorage) changes the language on subsequent startups.
			const serverLocale = await fetchLanguageFromServer()
			if (serverLocale && serverLocale !== cachedLocale) {
				log.debug(
					`Server language is ${serverLocale}, keeping {${cachedLocale}} as enforced default`,
				)
			}

			// Cache the effective locale as the POS default for offline startup
			try {
				localStorage.setItem("DyPOS_default_locale", locale.value)
			} catch (error) {
				log.warn("Failed to cache default locale", error)
			}
		}
	}

	// Auto-initialize on first mount
	onMounted(() => {
		initLocale()
	})

	// Build supported locales with flag URLs, filtered by allowed locales from POS Settings
	const supportedLocales = computed(() => {
		const result = {}
		const allowed = allowedLocales.value

		for (const [code, config] of Object.entries(SUPPORTED_LOCALES)) {
			// If allowed locales are set, filter by them; otherwise show all
			if (allowed === null || allowed.length === 0 || allowed.includes(code)) {
				result[code] = {
					...config,
					flagUrl: getFlagUrl(config.countryCode),
					flagUrlSvg: getFlagUrlSvg(config.countryCode),
				}
			}
		}
		return result
	})

	return {
		locale,
		dir,
		isRTL,
		localeConfig,
		supportedLocales,
		changeLocale,
		initLocale,
		translationVersion, // Used to trigger re-renders when translations change
	}
}
