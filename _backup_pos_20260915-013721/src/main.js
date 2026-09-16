/**
 * DyPOS — Application Entry Point
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
	prefetchOnIdle,
	startPerformanceMonitoring,
} from "./utils/performance"

import { applyThemeEarly } from "./composables/useAppTheme"
import { enforceDefaultArabic } from "./composables/useLocale"

import translationPlugin from "./utils/translation"
import { initSocket } from "./socket"

import {
	Alert,
	Badge,
	Button,
	Dialog,
	ErrorMessage,
	FormControl,
	Input,
	TextInput,
	frappeRequest,
	pageMetaPlugin,
	resourcesPlugin,
	setConfig,
} from "frappe-ui"

import "./index.css"

/* =============================================================================
   Runtime guards
   ============================================================================= */

const isBrowser =
	typeof window !== "undefined" && typeof document !== "undefined"

const log = logger.create("Main")

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
	console.error("[DyPOS] Failed to install global error boundary", error)
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
						window.dispatchEvent(
							new CustomEvent("sw-update-available"),
						)
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
}

startBuildVersionWatchdog()

/* =============================================================================
   Global Frappe UI components
   ============================================================================= */

const globalComponents = Object.freeze({
	Button,
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
 * Configure the Frappe request pipeline before authenticated resources are
 * fetched.
 */
function configureCSRFRequestPipeline() {
	try {
		const csrfAwareRequest = createCSRFAwareRequest(frappeRequest)

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
 * Resolve the current authenticated user.
 */
async function initializeUser() {
	try {
		if (!userResource.loading) {
			await userResource.fetch()
		}

		/**
		 * Some resource implementations expose promise, others resolve directly.
		 * Awaiting undefined is safe.
		 */
		if (userResource.promise) {
			await userResource.promise
		}

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
   Realtime
   ============================================================================= */

async function initializeRealtime(bootstrapStore) {
	if (!isBrowser || bootstrapState.socketInitialized) {
		return
	}

	try {
		if (!window.frappe) {
			window.frappe = {}
		}

		const siteName = bootstrapStore?.getSiteName?.()

		if (!siteName) {
			log.debug("Realtime initialization skipped: site name unavailable")

			return
		}

		const realtime = initSocket(siteName)

		window.frappe.realtime = realtime

		bootstrapState.socketInitialized = true

		if (realtime && typeof realtime.connect === "function") {
			realtime.connect()

			log.info("Realtime connection initialized", {
				siteName,
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
   Idle warm-up
   ============================================================================= */

function initializeIdleWarmup() {
	if (!isBrowser || isCapabilityConstrained()) {
		return
	}

	try {
		void prefetchOnIdle(["/api/method/DyPOS.api.ping"]).catch((error) => {
			log.debug("Idle connectivity warm-up failed", error)
		})
	} catch (error) {
		log.debug("Idle warm-up unavailable", error)
	}
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
	saasStore.loadSaaSConfig()

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
		   Create application
		   ------------------------------------------------------------------ */

		const { app } = createDyPOSApplication()

		/* ---------------------------------------------------------------------
		   Configure request infrastructure
		   ------------------------------------------------------------------ */

		configureCSRFRequestPipeline()
		setupCSRFRefreshListener()

		/* ---------------------------------------------------------------------
		   Authentication
		   ------------------------------------------------------------------ */

		const csrfPromise = initializeCSRF()
		const userPromise = initializeUser()

		const [, user] = await Promise.all([csrfPromise, userPromise])

		session.user = user

		log.info(
			`User authentication resolved: ${
				session.user ? "authenticated" : "guest"
			}`,
		)

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
		 */
		if (user) {
			void preloadBootstrapData(user)
			initializePlatformSync(user)
		}

		initializeIdleWarmup()
		initializePerformanceMonitoring()
		initializeScheduledCSRFRefresh()
		initPrintStyles()

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
