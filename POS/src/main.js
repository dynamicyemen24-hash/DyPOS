/**
 * DyPOS — Application Entry Point v1.33.0
 *
 * Production bootstrap architecture
 * ---------------------------------
 * 1. Install global error boundary
 * 2. Apply theme + Arabic/RTL before first paint
 * 3. Create Vue application + Pinia
 * 4. Configure global infrastructure
 * 5. Initialize CSRF + authenticated user concurrently
 * 6. Establish authenticated application state
 * 7. Mount Vue application
 * 8. Warm non-critical resources during idle time
 * 9. Initialize realtime/bootstrap enhancements
 * 10. Start background maintenance safely
 *
 * Design principles:
 * - Fail soft for non-critical infrastructure
 * - Never block POS rendering on optional enhancements
 * - Never initialize the same subsystem twice
 * - Keep authentication deterministic
 * - Keep background work cancellable where possible
 * - Preserve Arabic + RTL before first paint
 * - Be safe for tests / HMR / non-browser environments
 * - Version: 1.38.0 — single source: server/lib/version.js
 */

import { createPinia } from "pinia"
import { createApp } from "vue"

import App from "./App.vue"

import { session, sessionUser } from "./data/session"
import { userResource } from "./data/user"
import router from "./router"

import { useSaaSStore } from "@/stores/saasSettings"
import { initPrintStyles } from "@/components/reports/dashboards/core/printStyles.js"

import {
	createCSRFAwareRequest,
	ensureCSRFToken,
	getCSRFTokenFromCookie,
	onCSRFTokenRefresh,
} from "./utils/csrf"

import { logger } from "./utils/logger"
import { installGlobalErrorBoundary } from "./utils/errorBoundary"
import { offlineWorker } from "./utils/offline/workerClient"
import { retryAsync } from "./utils/network"

import {
	isCapabilityConstrained,
	startPerformanceMonitoring,
} from "./utils/performance"

import { isLinkEnabled, subscribeLinkConsent } from "./services/link-consent"
import {
	getServiceEndpoint,
	SERVICE_ENDPOINTS,
} from "./services/runtime-endpoints"

import { applyThemeEarly } from "./composables/useAppTheme"
import { enforceDefaultArabic } from "./composables/useLocale"
import { initDeviceAdaptation } from "./composables/useDevice"

import translationPlugin from "./utils/translation"
import { initSocket } from "./socket"

import {
	ActionButton,
	Alert,
	Badge,
	Button,
	Dialog,
	ErrorMessage,
	FormControl,
	Input,
	TextInput,
	request,
	pageMetaPlugin,
	resourcesPlugin,
	setConfig,
	setRuntimeApiBaseResolver,
} from "dypos-ui"

import "./index.css"
import "./styles/brand/variables.css"

/* =============================================================================
   Runtime guards
   ============================================================================= */

const isBrowser =
	typeof window !== "undefined" && typeof document !== "undefined"

const log = logger.create("Main")

// Local-only resolver injection. It does not probe or initialize any network.
setRuntimeApiBaseResolver(() => getServiceEndpoint(SERVICE_ENDPOINTS.API))

/**
 * Prevent accidental duplicate bootstrap execution.
 *
 * This matters for:
 * - HMR
 * - test environments
 * - accidental duplicate imports
 * - micro-frontend style embedding
 */
const BOOTSTRAP_KEY = "__DYPOS_BOOTSTRAP_STATE__"

function getBootstrapState() {
	if (!isBrowser) {
		return {
			started: false,
			mounted: false,
			cleanup: [],
			csrfUnsubscribe: null,
			performanceMonitor: null,
			csrfRefreshTimer: null,
			socketInitialized: false,
			serviceWorkerInitialized: false,
			platformSyncInitialized: false,
			featuresInitialized: false,
			realtimeSyncInitialized: false,
		}
	}

	if (!window[BOOTSTRAP_KEY]) {
		window[BOOTSTRAP_KEY] = {
			started: false,
			mounted: false,
			cleanup: [],
			csrfUnsubscribe: null,
			performanceMonitor: null,
			csrfRefreshTimer: null,
			socketInitialized: false,
			serviceWorkerInitialized: false,
			platformSyncInitialized: false,
			featuresInitialized: false,
			realtimeSyncInitialized: false,
		}
	}

	return window[BOOTSTRAP_KEY]
}

const bootstrapState = getBootstrapState()

/* =============================================================================
   Global error boundary
   ============================================================================= */

/**
 * Install as early as possible.
 *
 * The boundary itself must never prevent the application from starting.
 */
try {
	installGlobalErrorBoundary()
} catch (error) {
	// There is no safe application logger guarantee this early.
	log.error("[DyPOS] Failed to install global error boundary", error)
}

/* =============================================================================
   Early visual/runtime configuration
   ============================================================================= */

/**
 * These operations intentionally happen before createApp/mount.
 *
 * Goal:
 * - no light/dark flash
 * - no LTR flash
 * - Arabic is the default UI language
 */
function applyEarlyApplicationState() {
	try {
		applyThemeEarly()
	} catch (error) {
		log.warn("Early theme initialization failed", error)
	}

	try {
		enforceDefaultArabic()
	} catch (error) {
		log.warn("Early Arabic/RTL initialization failed", error)
	}
}

if (isBrowser) {
	applyEarlyApplicationState()

	// Apply design system CSS variables for theming
	try {
		const { applyCSSVariables } = await import("@/styles/design-tokens.js")
		applyCSSVariables("dy")
	} catch (error) {
		log.warn("Design token initialization deferred", error)
	}
}

/* =============================================================================
   PWA Service Worker
   ============================================================================= */

/**
 * PWA registration is deliberately non-blocking.
 *
 * A service-worker problem must never prevent POS from opening.
 */
function registerPWAServiceWorker() {
	if (!isBrowser || !("serviceWorker" in navigator)) {
		return
	}

	if (bootstrapState.serviceWorkerInitialized) {
		return
	}

	bootstrapState.serviceWorkerInitialized = true

	const register = async () => {
		try {
			const { registerSW } = await import("virtual:pwa-register")

			registerSW({
				immediate: true,

				onNeedRefresh() {
					log.info("New application content is available")

					try {
						window.dispatchEvent(new CustomEvent("sw-update-available"))
					} catch (error) {
						log.debug("Update banner event dispatch failed", error)
					}
				},

				onOfflineReady() {
					log.info("Application is ready for offline operation")
				},

				onRegistered(registration) {
					log.debug("Service Worker registered", {
						scope: registration?.scope,
					})
				},

				onRegisterError(error) {
					log.warn("Service Worker registration failed", error)
				},
			})
		} catch (error) {
			log.warn("PWA registration unavailable", error)
		}
	}

	/**
	 * Wait for the browser load event so initial POS rendering is never
	 * delayed by service-worker registration.
	 */
	if (document.readyState === "complete") {
		void register()
		return
	}

	const handleLoad = () => {
		void register()
	}

	window.addEventListener("load", handleLoad, {
		once: true,
		passive: true,
	})

	bootstrapState.cleanup.push(() => {
		window.removeEventListener("load", handleLoad)
	})
}

registerPWAServiceWorker()

/* =============================================================================
   Build version watchdog
   ============================================================================= */

/**
 * Safety net independent of the service worker:
 * polls version.json and prompts for reload when the server exposes a newer
 * build than the one currently running. This guarantees users can never be
 * stuck on a stale Login/Register screen after a deployment.
 */
function startBuildVersionWatchdog() {
	if (!isBrowser) {
		return
	}

	let currentVersion = null

	try {
		currentVersion =
			typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : null
	} catch {
		currentVersion = null
	}

	if (!currentVersion) {
		return
	}

	let notifiedVersion = null

	const check = async () => {
		// Standalone-first: the build stamp is compile-time truth. Polling it
		// over the network without the user's linkage consent is a connection
		// nobody demanded — linked devices still learn about deploys on time.
		if (!isLinkEnabled()) {
			return
		}
		try {
			const response = await fetch("/assets/DyPOS/pos/version.json", {
				method: "GET",
				cache: "no-store",
				credentials: "same-origin",
			})

			if (!response.ok) {
				return
			}

			const data = await response.json()
			const serverVersion = data?.version ? String(data.version) : null

			if (
				serverVersion &&
				serverVersion !== String(currentVersion) &&
				serverVersion !== notifiedVersion
			) {
				notifiedVersion = serverVersion

				log.info("Newer build detected on server", {
					current: String(currentVersion),
					server: serverVersion,
				})

				window.dispatchEvent(new CustomEvent("sw-update-available"))
			}
		} catch (error) {
			log.debug("Build version check failed", error?.message || error)
		}
	}

	// First check shortly after mount, then every 15 minutes.
	window.setTimeout(check, 30_000)
	window.setInterval(check, 15 * 60 * 1000)

	// Reconnect check: a terminal offline for hours must learn about a
	// deployment within seconds of coming back — not at the next 15-minute
	// tick. Fail-soft: check() never throws (all errors caught inside).
	window.addEventListener("online", () => {
		window.setTimeout(check, 5_000)
	})
}

startBuildVersionWatchdog()

/* =============================================================================
   Global DyPOS UI components
   ============================================================================= */

const globalComponents = Object.freeze({
	Button,
	ActionButton,
	TextInput,
	Input,
	FormControl,
	ErrorMessage,
	Dialog,
	Alert,
	Badge,
})

/**
 * Registers global components deterministically.
 */
function registerGlobalComponents(app) {
	for (const [name, component] of Object.entries(globalComponents)) {
		if (component) {
			app.component(name, component)
		}
	}
}

/* =============================================================================
   Global directives
   ============================================================================= */

/**
 * Touch behavior is intentionally opt-in.
 *
 * This avoids changing touch semantics for every element in the application.
 */
function registerGlobalDirectives(app) {
	app.directive("touch-action", {
		mounted(el, binding) {
			const value =
				typeof binding.value === "string" && binding.value.trim()
					? binding.value.trim()
					: "manipulation"

			el.style.touchAction = value
			el.style.webkitTapHighlightColor = "transparent"
		},

		updated(el, binding) {
			const value =
				typeof binding.value === "string" && binding.value.trim()
					? binding.value.trim()
					: "manipulation"

			el.style.touchAction = value
		},
	})
}

/* =============================================================================
   CSRF
   ============================================================================= */

/**
 * Synchronize the current CSRF token with the offline worker.
 *
 * Failure is intentionally non-fatal because the normal API layer remains
 * capable of obtaining/refreshing the token.
 */
async function syncCSRFTokenToWorker() {
	if (!isBrowser) {
		return false
	}

	const token = window.csrf_token

	if (typeof token !== "string" || !token.trim()) {
		return false
	}

	try {
		await offlineWorker.setCSRFToken(token)
		log.debug("CSRF token synchronized with offline worker")
		return true
	} catch (error) {
		log.warn("Unable to synchronize CSRF token with offline worker", error)
		return false
	}
}

/**
 * Register CSRF refresh propagation exactly once.
 */
function setupCSRFRefreshListener() {
	if (bootstrapState.csrfUnsubscribe) {
		return
	}

	try {
		const unsubscribe = onCSRFTokenRefresh((newToken) => {
			if (!newToken || typeof newToken !== "string") {
				return
			}

			void offlineWorker.setCSRFToken(newToken).catch((error) => {
				log.warn("Unable to synchronize refreshed CSRF token", error)
			})
		})

		if (typeof unsubscribe === "function") {
			bootstrapState.csrfUnsubscribe = unsubscribe
			bootstrapState.cleanup.push(unsubscribe)
		}
	} catch (error) {
		log.warn("CSRF refresh listener initialization failed", error)
	}
}

/**
 * Configure the request pipeline before authenticated resources are
 * fetched.
 */
function configureCSRFRequestPipeline() {
	try {
		const csrfAwareRequest = createCSRFAwareRequest(request)

		setConfig("resourceFetcher", csrfAwareRequest)

		log.debug("CSRF-aware resource fetcher configured")
	} catch (error) {
		/**
		 * This is more important than ordinary telemetry but should still be
		 * reported through the centralized logger.
		 */
		log.error("Failed to configure CSRF-aware request pipeline", error)

		throw error
	}
}

/**
 * Resolve the CSRF token without making authentication dependent on a network
 * request when a valid cookie token already exists.
 */
async function initializeCSRF() {
	if (!isBrowser) {
		return false
	}

	// Standalone-first: CSRF is only meaningful for server calls the user
	// demanded. No linkage consent → no handshake, local login needs none.
	// (The old navigator.onLine check stays below as a second guard.)
	if (!isLinkEnabled()) {
		log.debug("Standalone — skipping CSRF initialization")
		return false
	}
	try {
		if (typeof navigator !== "undefined" && navigator.onLine === false) {
			log.debug("Offline — skipping CSRF initialization")
			return false
		}
	} catch {
		/* assume online */
	}

	const existingToken = getCSRFTokenFromCookie()

	if (existingToken) {
		log.debug("CSRF token available from cookie")

		await syncCSRFTokenToWorker()

		return true
	}

	log.debug("No CSRF token found; requesting token")

	try {
		await ensureCSRFToken({
			silent: true,
		})

		await syncCSRFTokenToWorker()

		return true
	} catch (error) {
		/**
		 * Do not abort application startup.
		 *
		 * The request layer can attempt recovery when the first authenticated
		 * request occurs.
		 */
		log.debug("Initial CSRF request failed; deferred recovery enabled", error)

		return false
	}
}

/* =============================================================================
   Authentication
   ============================================================================= */

/**
 * Resolve the current authenticated user (offline-first).
 * Local session + cookies are authoritative. No network request is made
 * here: a user fetch must never gate POS startup.
 */
async function initializeUser() {
	try {
		const user = sessionUser()

		return user || null
	} catch (error) {
		log.debug(
			"User session unavailable",
			error?.message || "No authenticated session",
		)

		return null
	}
}

/* =============================================================================
   Bootstrap data
   ============================================================================= */

/**
 * Bootstrap data is intentionally non-blocking after authentication.
 *
 * The POS application must be able to render its shell even if bootstrap
 * enrichment fails.
 */
async function preloadBootstrapData(user) {
	if (!user) {
		return null
	}

	try {
		const { useBootstrapStore } = await import("./stores/bootstrap")

		const bootstrapStore = useBootstrapStore()

		await bootstrapStore.loadInitialData()

		/* ---------------------------------------------------------------------
		   Currency precision
		   ------------------------------------------------------------------ */

		try {
			const { initPrecision } = await import("./utils/currency")

			initPrecision(bootstrapStore.getPreloadedPrecision())

			log.debug("Currency precision initialized")
		} catch (error) {
			log.warn("Currency precision initialization failed", error)
		}

		/* ---------------------------------------------------------------------
		   Realtime
		   ------------------------------------------------------------------ */

		await initializeRealtime(bootstrapStore)

		return bootstrapStore
	} catch (error) {
		log.debug("Bootstrap preload failed; application continues normally", error)

		return null
	}
}

/* =============================================================================
   Feature flags
   ============================================================================= */

/**
 * Initialize the feature-flag store exactly once (Pinia must be installed).
 *
 * Offline-safe by design: the store boots with its documented defaults ON and
 * adopts server truth only when /api/features answers within the timeout.
 * `registerFeatureHooks()` refetches after reconnect so views reactively flip.
 * Fail-soft: a flag problem must never block the POS shell.
 */
async function initializeFeatures() {
	if (!isBrowser || bootstrapState.featuresInitialized) {
		return
	}

	bootstrapState.featuresInitialized = true

	try {
		const { useFeaturesStore } = await import("./stores/features")

		const featuresStore = useFeaturesStore()

		featuresStore.registerFeatureHooks()

		void featuresStore.init()
	} catch (error) {
		log.debug("Feature-flag bootstrap skipped; defaults remain ON", error)
	}
}

/* =============================================================================
   Realtime
   ============================================================================= */

async function initializeRealtime(bootstrapStore) {
	if (!isBrowser || bootstrapState.socketInitialized) {
		return
	}

	// Standalone-first: opening a socket is a connection. Only a linked
	// session (user-demanded server linkage) may hold one.
	if (!isLinkEnabled()) {
		log.debug("Standalone — realtime socket stays closed")
		return
	}

	try {
		if (!window.dypos) {
			window.dypos = {}
		}

		const siteName = bootstrapStore?.getSiteName?.()

		if (!siteName) {
			log.debug("Realtime initialization skipped: site name unavailable")

			return
		}

		const realtime = initSocket(siteName)

		window.dypos.realtime = realtime

		bootstrapState.socketInitialized = true

		if (realtime && typeof realtime.connect === "function") {
			realtime.connect()

			log.info("Realtime connection initialized", {
				siteName,
			})

			// سحب الموافقة يُسقط المقبس فورًا: لا نبض صامت بعده.
			const { disconnectSocket } = await import("./socket")
			subscribeLinkConsent((mode) => {
				if (mode !== "linked" && typeof disconnectSocket === "function") {
					try {
						disconnectSocket()
					} catch (error) {
						log.debug("Socket revoke-disconnect failed", error)
					}
				}
			})
		}
	} catch (error) {
		/**
		 * Socket.IO is an enhancement, not a prerequisite for selling.
		 */
		log.warn(
			"Realtime initialization failed; POS continues offline-capable",
			error,
		)
	}
}

/* =============================================================================
   Performance monitoring
   ============================================================================= */

function initializePerformanceMonitoring() {
	if (!isBrowser) {
		return
	}

	if (bootstrapState.performanceMonitor) {
		return
	}

	try {
		const monitor = startPerformanceMonitoring({
			onLongTask(entry, meta) {
				log.debug(
					`Long task: ${Math.round(meta.duration)}ms (${meta.name})`,
					meta,
				)
			},

			onMemoryPressure({ ratio }) {
				log.warn(`High memory pressure detected (${Math.round(ratio * 100)}%)`)
			},
		})

		bootstrapState.performanceMonitor = monitor

		const stopMonitoring = () => {
			try {
				monitor?.stop?.()
			} catch (error) {
				log.debug("Performance monitor cleanup failed", error)
			}

			bootstrapState.performanceMonitor = null
		}

		window.addEventListener("beforeunload", stopMonitoring, {
			once: true,
			passive: true,
		})

		bootstrapState.cleanup.push(() => {
			window.removeEventListener("beforeunload", stopMonitoring)

			stopMonitoring()
		})
	} catch (error) {
		log.debug("Performance monitoring unavailable", error)
	}
}

/* =============================================================================
   Device adaptation (phone / tablet / desktop + perf warnings)
   Fail-soft like performance monitoring: a throw here must never block boot.
   ============================================================================= */

function initializeDeviceAdaptation() {
	if (!isBrowser) {
		return
	}

	try {
		void initDeviceAdaptation({ notify: true })
	} catch (error) {
		log.debug("Device adaptation unavailable", error)
	}
}

/* =============================================================================
   Idle warm-up
   ============================================================================= */

function initializeIdleWarmup() {
	// Removed on purpose (standalone-first): the only warm-up target was an
	// `/api/ping` connectivity probe — a network connection no user demanded.
	// Linked sessions warm naturally on their first demanded call, and the
	// function is kept so every existing call site stays valid.
	if (!isBrowser || isCapabilityConstrained()) {
		return
	}

	log.debug("Idle warm-up: no prefetch targets (standalone-first)")
}

/* =============================================================================
   Scheduled maintenance
   ============================================================================= */

function initializeScheduledCSRFRefresh() {
	if (!isBrowser) {
		return
	}

	if (bootstrapState.csrfRefreshTimer) {
		return
	}

	const REFRESH_INTERVAL = 30 * 60 * 1000

	const refresh = async () => {
		log.debug("Scheduled CSRF token refresh")

		try {
			await retryAsync(
				() =>
					ensureCSRFToken({
						forceRefresh: true,
						silent: true,
					}),
				{
					retries: 2,
					baseDelay: 500,
					maxDelay: 4000,
				},
			)

			await syncCSRFTokenToWorker()
		} catch (error) {
			/**
			 * Token refresh failure should not interrupt a running POS session.
			 */
			log.debug("Scheduled CSRF refresh failed", error)
		}
	}

	bootstrapState.csrfRefreshTimer = window.setInterval(
		refresh,
		REFRESH_INTERVAL,
	)

	bootstrapState.cleanup.push(() => {
		if (bootstrapState.csrfRefreshTimer) {
			window.clearInterval(bootstrapState.csrfRefreshTimer)

			bootstrapState.csrfRefreshTimer = null
		}
	})
}

/* =============================================================================
   Platform sync runtime
   ============================================================================= */

/**
 * Print Spool — initialize the SAP-style print job queue after mount.
 * Fail-soft: a spool problem must never block the POS shell.
 */
function initializePrintSpool() {
	if (!isBrowser) {
		return
	}

	try {
		void import("./print/index").then(({ initPrintSystem }) =>
			initPrintSystem(),
		)
	} catch (error) {
		log.debug("Print spool initialization skipped", error)
	}
}

/**
 * Initialize the offline sync engine for a returning authenticated user
 * (valid session cookie → no Login screen → session store never bootstraps).
 *
 * Both initializers are idempotent, so the session store may also start them
 * later without double-initialization.
 */
function initializePlatformSync(user) {
	if (!isBrowser || !user) {
		return
	}

	// Standalone-first: the platform sync engine talks network. It starts
	// only for a linked session — local logins sell fully offline.
	if (!isLinkEnabled()) {
		log.debug("Standalone — platform sync stays parked")
		return
	}

	if (bootstrapState.platformSyncInitialized) {
		return
	}

	bootstrapState.platformSyncInitialized = true

	void Promise.all([
		import("./services/sync-auth").then(({ initAuth }) => initAuth()),
		import("./services/sync-manager").then(({ initSyncManager }) =>
			initSyncManager(),
		),
	]).catch((error) => {
		log.warn("Platform sync initialization failed; deferred to session", error)
	})
}

/**
 * Register the realtime (SSE) sync client exactly once for the active
 * tenant/session, after auth state is resolved.
 *
 * The tenant id is read from the resolved session (posContext) with the
 * platform auth state as fallback; it is reported on the client for
 * observability only — EventSource cannot set headers, so the server
 * re-resolves the tenant from the session JWT/cookie.
 *
 * Fail-soft: a realtime problem must never block the POS shell.
 */
async function initializeRealtimeSync() {
	if (!isBrowser || bootstrapState.realtimeSyncInitialized) {
		return
	}

	bootstrapState.realtimeSyncInitialized = true

	try {
		const { initAuth, authState } = await import("./services/sync-auth")

		await initAuth().catch(() => {})

		const { getSessionStore } = await import("./stores/session")

		const tenantId = getSessionStore()?.tenantId || authState?.tenantId || null

		const { registerRealtimeSync } = await import("./stores/realtime")
		const apiBase = getServiceEndpoint(SERVICE_ENDPOINTS.API).replace(
			/\/+$/,
			"",
		)
		const realtimeUrl = new URL(
			`${apiBase}/realtime/events`,
			window.location.origin,
		).toString()

		// Standalone-first: an EventSource is a connection. The store honours
		// `enabled: false` by staying pristine (no socket, no stream).
		const teardown = registerRealtimeSync({
			tenantId,
			url: realtimeUrl,
			enabled: isLinkEnabled(),
		})

		if (typeof teardown === "function") {
			bootstrapState.cleanup.push(teardown)
		}

		log.debug("Realtime sync registered", { tenantId })
	} catch (error) {
		log.warn(
			"Realtime sync registration failed; POS continues offline-capable",
			error,
		)
	}
}

/* =============================================================================
   Vue application creation
   ============================================================================= */

function createDyPOSApplication() {
	const app = createApp(App)
	const pinia = createPinia()

	/**
	 * Vue infrastructure
	 */
	app.use(pinia)
	app.use(resourcesPlugin)
	app.use(pageMetaPlugin)
	app.use(translationPlugin)

	const saasStore = useSaaSStore()
	if (isLinkEnabled()) {
		void saasStore.loadSaaSConfig()
	} else {
		const unsubscribe = subscribeLinkConsent((mode) => {
			if (mode !== "linked") return
			unsubscribe()
			void saasStore.loadSaaSConfig()
		})
		bootstrapState.cleanup.push(unsubscribe)
	}

	/**
	 * Global UI components
	 */
	registerGlobalComponents(app)

	/**
	 * Global directives
	 */
	registerGlobalDirectives(app)

	return {
		app,
		pinia,
	}
}

/* =============================================================================
   Standalone-first mode (pure local — the boot probe was removed: pinging
   the backend to decide the mode was itself an undemanded connection)
   ============================================================================= */

let isOfflineMode = false

async function detectOfflineMode() {
	if (!isBrowser) return false

	// Standalone-first (user-mandated): deciding the mode by PINGING the
	// backend was itself a network connection nobody demanded — on every
	// boot, on every device. The mode is now pure local state: standalone
	// until the user demands server linkage (server login, Sync Now, or the
	// linkage toggle), which grants consent via services/link-consent.
	// Server reachability is then learned from the demanded call itself —
	// failure means local mode, never a blocker.
	return !isLinkEnabled()
}

/**
 * Initialize offline-only systems (IndexedDB, local data, offline queue)
 * Called when backend is unavailable — NO network requests allowed.
 */
async function initializeOfflineSystems() {
	if (!isBrowser) return

	try {
		log.info("Initializing offline systems...")

		// Initialize offline DB (Dexie) - this happens automatically on import
		const db = await import("./services/db").then((m) => m.default)
		// Open the database connection
		await db.open().catch((error) => {
			log.warn("Offline DB open failed", error)
		})

		// Seed the local install account — BEFORE the router guard can ask
		// for a login, otherwise first run presents a form whose
		// credentials cannot exist yet. Local-only, one-shot, and it uses
		// the same PBKDF2 hash `userRepository` verifies.
		await import("./services/localUserSeed")
			.then((m) => m.ensureInstallUser())
			.then((result) => {
				// A first run MINTED a password for this shop. The owner has to
				// read it off one screen — an install that creates an account
				// nobody can log into is a wall with no door, which is the exact
				// problem this seed exists to solve.
				return import("./services/localUserSeed").then((m) => {
					if (result?.created) m.announceInstallCredentials(result)
				})
			})
			.catch((error) => {
				log.warn("Install user seed failed", error)
			})

		// Provision the first subscriber (Royal, Marib) — explicit opt-in only
		// (`dypos.first_subscriber=royal-marib` on this device). Company,
		// users and opening stock from the owner's own keys, one-shot.
		await import("./services/firstSubscriberSeed")
			.then((m) => m.ensureFirstSubscriber())
			.catch((error) => {
				log.warn("First subscriber seed skipped", error)
			})

		// Initialize offline numbering (for invoice numbers)
		await import("./services/offline-numbering").catch((error) => {
			log.warn("Offline numbering init failed", error)
		})

		// Initialize stock reservations (local only)
		await import("./services/stock-reservations").catch((error) => {
			log.warn("Local stock reservations init failed", error)
		})

		// Initialize offline store and sync queue
		await import("./services/offline-store").catch((error) => {
			log.warn("Offline store init failed", error)
		})

		log.info("Offline systems initialized")
	} catch (error) {
		log.error("Offline systems initialization failed", error)
	}
}

/* =============================================================================
   Application initialization
   ============================================================================= */

async function initializeApp() {
	if (bootstrapState.started) {
		log.debug("Application bootstrap already started")
		return
	}

	bootstrapState.started = true

	const startedAt =
		isBrowser && typeof performance !== "undefined"
			? performance.now()
			: Date.now()

	try {
		log.info("Starting DyPOS application")

		/* ---------------------------------------------------------------------
		   Offline-first: detect backend availability BEFORE any network calls
		   ------------------------------------------------------------------ */
		isOfflineMode = await detectOfflineMode()

		if (isOfflineMode) {
			log.info("OFFLINE MODE: Skipping all network initialization")
			// Make offline mode globally accessible
			window.__DYPOS_OFFLINE__ = true
		}

		/* ---------------------------------------------------------------------
		   Create application
		   ------------------------------------------------------------------ */

		const { app } = createDyPOSApplication()

		/* ---------------------------------------------------------------------
		   Feature flags (offline-safe: defaults stay ON on any failure)
		   ------------------------------------------------------------------ */

		void initializeFeatures()

		/* ---------------------------------------------------------------------
		   Configure request infrastructure
		   ------------------------------------------------------------------ */

		configureCSRFRequestPipeline()
		setupCSRFRefreshListener()

		/* ---------------------------------------------------------------------
		   Authentication — SKIP in offline mode
		   ------------------------------------------------------------------ */

		let user = null

		if (!isOfflineMode) {
			const csrfPromise = initializeCSRF()
			const userPromise = initializeUser()

			const [, resolvedUser] = await Promise.all([csrfPromise, userPromise])

			user = resolvedUser

			log.info(
				`User authentication resolved: ${user ? "authenticated" : "guest"}`,
			)
		} else {
			log.info("Offline mode: skipping authentication, continuing as guest")
			session.user = null
		}

		/* ---------------------------------------------------------------------
		   Router
		   ------------------------------------------------------------------ */

		app.use(router)

		/* ---------------------------------------------------------------------
		   Mount application
		   ------------------------------------------------------------------ */

		if (!isBrowser) {
			log.warn("Browser environment unavailable; application mount skipped")

			return
		}

		const root = document.querySelector("#app")

		if (!root) {
			throw new Error("DyPOS application root (#app) was not found")
		}

		app.mount(root)

		bootstrapState.mounted = true

		/* ---------------------------------------------------------------------
		   Non-critical post-mount initialization
		   ------------------------------------------------------------------ */

		/**
		 * Bootstrap data runs after the application is mounted.
		 *
		 * This guarantees the shell can render immediately.
		 * SKIP all network-dependent initialization in offline mode.
		 */
		if (user && !isOfflineMode) {
			void preloadBootstrapData(user)
			initializePlatformSync(user)
			void initializeRealtimeSync()
		} else if (isOfflineMode) {
			log.info(
				"Offline mode: skipping bootstrap data, platform sync, realtime sync",
			)
			// Initialize offline-only systems (IndexedDB, local data)
			void initializeOfflineSystems()
		}

		// Performance & device monitoring (safe in both modes)
		initializePerformanceMonitoring()
		initializeDeviceAdaptation()

		// SKIP network-dependent timers in offline mode
		if (!isOfflineMode) {
			initializeIdleWarmup()
			initializeScheduledCSRFRefresh()
		} else {
			log.info("Offline mode: skipping idle warmup and scheduled CSRF refresh")
		}

		initPrintStyles()
		initializePrintSpool()

		const finishedAt =
			typeof performance !== "undefined" ? performance.now() : Date.now()

		log.info(
			`DyPOS application mounted in ${Math.round(finishedAt - startedAt)}ms`,
		)
	} catch (error) {
		log.error("Fatal application initialization error", error)

		/**
		 * Re-throw so the global boundary / browser environment can surface
		 * the fatal startup state instead of silently leaving a blank screen.
		 */
		throw error
	}
}

/* =============================================================================
   Start
   ============================================================================= */

void initializeApp()
