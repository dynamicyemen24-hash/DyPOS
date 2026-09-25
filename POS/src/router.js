import { shiftState } from "@/composables/useShift"
import { userResource } from "@/data/user"
import { logger } from "@/utils/logger"
import { createRouter, createWebHistory } from "vue-router"
import { session } from "./data/session"

const log = logger.create("Router")

/**
 * Dual-mode router base (offline-first on any device, anywhere served).
 *
 * - Standalone deployments (Cloudflare Worker / PWA at domain root) → "/".
 * - Frappe-embedded desk page (served under /pos) → "/pos".
 * - VITE_ROUTER_BASE overrides both (exotic embeds).
 *
 * A hardcoded "/pos" base while served at "/" breaks EVERY route (blank
 * screen with zero errors in the route tree) — this auto-detection keeps
 * both serving modes working from a single build.
 */
function resolveRouterBase() {
	const configured =
		typeof import.meta !== "undefined"
			? import.meta.env?.VITE_ROUTER_BASE
			: null
	if (configured) return configured
	try {
		if (typeof window !== "undefined") {
			const p = window.location.pathname || "/"
			if (p === "/pos" || p.startsWith("/pos/")) return "/pos"
		}
	} catch {
		/* non-browser bundling (tests import with jsdom — fine) */
	}
	return "/"
}

const ROUTE_NAMES = Object.freeze({
	POS: "POSSale",
	LOGIN: "Login",
	REGISTER: "Register",
	FORGOT_PASSWORD: "ForgotPassword",
	RESET_PASSWORD: "ResetPassword",
	NOT_FOUND: "NotFound",
	STOCK_MANAGEMENT: "StockManagement",
	WORK_DATAGRID_DEMO: "WorkDataGridDemo",
})

const ROUTE_TITLES = Object.freeze({
	[ROUTE_NAMES.POS]: "نقطة البيع",
	[ROUTE_NAMES.LOGIN]: "تسجيل الدخول",
	[ROUTE_NAMES.REGISTER]: "حساب جديد",
	[ROUTE_NAMES.FORGOT_PASSWORD]: "استعادة كلمة المرور",
	[ROUTE_NAMES.RESET_PASSWORD]: "تعيين كلمة مرور جديدة",
	Reports: "التقارير",
	[ROUTE_NAMES.STOCK_MANAGEMENT]: "إدارة المخزون",
	[ROUTE_NAMES.WORK_DATAGRID_DEMO]: "شبكة البيانات المتقدمة",
	landing: "DyPOS",
	[ROUTE_NAMES.NOT_FOUND]: "صفحة غير موجودة",
})

const APP_TITLE_SUFFIX = "DyPOS"

function applyDocumentTitle(route) {
	if (!isBrowser) return
	try {
		const title = ROUTE_TITLES[route?.name] || ROUTE_TITLES.landing
		document.title = `${title} | ${APP_TITLE_SUFFIX}`
	} catch {
		/* title never breaks navigation */
	}
}

const ROUTE_META = Object.freeze({
	requiresAuth: "requiresAuth",
	guestOnly: "guestOnly",
	requiresOpenShift: "requiresOpenShift",
})

const SESSION_KEYS = Object.freeze({
	CHUNK_RECOVERY: "__DYPOS_ROUTER_CHUNK_RECOVERY__",
})

const CHUNK_RECOVERY_MAX_AGE = 15_000

/**
 * --------------------------------------------------------------------------
 * Routes
 * --------------------------------------------------------------------------
 *
 * Route metadata is intentionally declarative.
 *
 * Future POS routes can use:
 *
 * meta: {
 *   requiresAuth: true,
 *   requiresOpenShift: true,
 * }
 *
 * without modifying the central authentication contract.
 */
/**
 * Landing Routes
 *
 * عند فتح التطبيق لأول مرة (رابط أو سطح مكتب):
 *   يجب أن تظهر شاشة الدخول فورًا.
 *
 * المسار الافتراضي يُعيد توجيه المستخدم غير المصادق عليه إلى login.
 */
const routes = [
	/**
	 * المسار الافتراضي — يُعيد التوجيه إلى login إذا لم تكن مصدّقًا.
	 */
	{
		path: "/",
		name: "landing",
		redirect: (to) => {
			if (isAuthenticated()) {
				return { name: ROUTE_NAMES.POS }
			}
			return { name: ROUTE_NAMES.LOGIN, query: { redirect: to.fullPath } }
		},
	},

	/**
	 * POS Sales Workspace (requires authentication).
	 */
	{
		path: "/pos",
		name: ROUTE_NAMES.POS,
		component: () => import("@/pages/POSSale.vue"),
		meta: {
			[ROUTE_META.requiresAuth]: true,
			[ROUTE_META.requiresOpenShift]: true,
		},
	},

	/**
	 * تسجيل الدخول — الصفحة الأولى التي يراها المستخدم.
	 */
	{
		path: "/account/login",
		name: ROUTE_NAMES.LOGIN,
		component: () => import("@/pages/Login.vue"),
		meta: {
			[ROUTE_META.guestOnly]: true,
		},
	},

	{
		path: "/account/register",
		name: ROUTE_NAMES.REGISTER,
		component: () => import("@/pages/Register.vue"),
		meta: {
			[ROUTE_META.guestOnly]: true,
		},
	},

	/**
	 * Password recovery flow:
	 *   /forgot-password  → request reset link (email)
	 *   /reset-password   → set new password (single-use token from URL)
	 */
	{
		path: "/forgot-password",
		name: ROUTE_NAMES.FORGOT_PASSWORD,
		component: () => import("@/pages/ForgotPassword.vue"),
		meta: {
			[ROUTE_META.guestOnly]: true,
		},
	},

	{
		path: "/reset-password",
		name: ROUTE_NAMES.RESET_PASSWORD,
		component: () => import("@/pages/ResetPassword.vue"),
		meta: {
			[ROUTE_META.guestOnly]: true,
		},
	},

	{
		path: "/reports",
		name: "Reports",
		component: () => import("@/components/reports/DashboardPage.vue"),
		meta: {
			[ROUTE_META.requiresAuth]: true,
		},
	},

	{
		path: "/stock",
		name: ROUTE_NAMES.STOCK_MANAGEMENT,
		component: () => import("@/components/reports/StockManagement.vue"),
		meta: {
			[ROUTE_META.requiresAuth]: true,
		},
	},

	{
		path: "/work-datagrid",
		name: ROUTE_NAMES.WORK_DATAGRID_DEMO,
		component: () => import("@/components/work/WorkDataGridDemo.vue"),
		meta: {
			[ROUTE_META.requiresAuth]: true,
		},
	},

	/**
	 * Keep the fallback last.
	 */
	{
		path: "/:pathMatch(.*)*",
		name: ROUTE_NAMES.NOT_FOUND,
		redirect: {
			name: ROUTE_NAMES.POS,
		},
	},
]

/**
 * --------------------------------------------------------------------------
 * Browser / environment helpers
 * --------------------------------------------------------------------------
 */

const isBrowser =
	typeof window !== "undefined" && typeof document !== "undefined"

function isDev() {
	return import.meta.env.DEV === true
}

/**
 * --------------------------------------------------------------------------
 * Session state
 * --------------------------------------------------------------------------
 */

function isAuthenticated() {
	try {
		return Boolean(session?.isLoggedIn)
	} catch (error) {
		log.warn?.("Failed to read authentication state", error)
		return false
	}
}

function hasUserResource() {
	try {
		return Boolean(userResource?.data?.value)
	} catch {
		return false
	}
}

/**
 * Prevent multiple simultaneous user bootstrap requests.
 *
 * This matters when several navigations happen before the initial
 * authentication request finishes.
 */
let userBootstrapPromise = null

async function ensureUserSession() {
	if (isAuthenticated()) {
		return true
	}

	if (hasUserResource() && isAuthenticated()) {
		return true
	}

	if (!userBootstrapPromise) {
		userBootstrapPromise = (async () => {
			try {
				if (typeof userResource?.fetch === "function") {
					await userResource.fetch()
				}

				if (userResource?.promise) {
					await userResource.promise
				}

				return isAuthenticated()
			} catch (error) {
				log.warn?.("User session restoration failed", error)
				return false
			} finally {
				userBootstrapPromise = null
			}
		})()
	}

	return userBootstrapPromise
}

/**
 * Session guard with a hard ceiling (offline-first).
 *
 * ensureUserSession() awaits a network resource that may NEVER settle when
 * the backend is gone (hanging fetch, captive portal, killed socket). A
 * guard that never settles = a RouterView that never renders = blank screen
 * on exactly the devices that need offline POS most (phones/tablets on
 * flaky store wifi). After the ceiling we continue as guest: Login renders
 * from cache and queued sales keep working.
 */
const GUARD_SESSION_TIMEOUT_MS = 8000

async function settleSession(timeoutMs = GUARD_SESSION_TIMEOUT_MS) {
	try {
		const result = await Promise.race([
			ensureUserSession(),
			new Promise((resolve) => setTimeout(() => resolve("timeout"), timeoutMs)),
		])
		if (result === "timeout") {
			log.warn?.("Session guard timed out; continuing as guest (offline-first)")
			return false
		}
		return result === true
	} catch {
		return false
	}
}

/**
 * --------------------------------------------------------------------------
 * Shift state
 * --------------------------------------------------------------------------
 */

function isShiftOpen() {
	try {
		return shiftState?.isOpen === true
	} catch (error) {
		log.warn?.("Failed to read shift state", error)
		return false
	}
}

/**
 * --------------------------------------------------------------------------
 * Redirect helpers
 * --------------------------------------------------------------------------
 */

function redirectToLogin(to) {
	return {
		name: ROUTE_NAMES.LOGIN,
		query: {
			redirect: to.fullPath,
		},
		replace: true,
	}
}

function redirectToPOS() {
	return {
		name: ROUTE_NAMES.POS,
		replace: true,
	}
}

/**
 * --------------------------------------------------------------------------
 * Chunk-load recovery
 * --------------------------------------------------------------------------
 *
 * A deployed SPA can occasionally retain an old JS chunk reference while
 * the server already exposes a new build. Recover once instead of leaving
 * the POS broken.
 *
 * The timestamp prevents an infinite reload loop.
 */
function readChunkRecoveryTimestamp() {
	if (!isBrowser) {
		return null
	}

	try {
		const value = sessionStorage.getItem(SESSION_KEYS.CHUNK_RECOVERY)

		if (!value) {
			return null
		}

		const timestamp = Number(value)

		if (!Number.isFinite(timestamp)) {
			sessionStorage.removeItem(SESSION_KEYS.CHUNK_RECOVERY)
			return null
		}

		return timestamp
	} catch {
		return null
	}
}

function canRecoverFromChunkError() {
	const timestamp = readChunkRecoveryTimestamp()

	if (!timestamp) {
		return true
	}

	return Date.now() - timestamp > CHUNK_RECOVERY_MAX_AGE
}

function markChunkRecovery() {
	if (!isBrowser) {
		return
	}

	try {
		sessionStorage.setItem(SESSION_KEYS.CHUNK_RECOVERY, String(Date.now()))
	} catch {
		// Storage may be unavailable.
	}
}

function clearChunkRecovery() {
	if (!isBrowser) {
		return
	}

	try {
		sessionStorage.removeItem(SESSION_KEYS.CHUNK_RECOVERY)
	} catch {
		// Ignore storage restrictions.
	}
}

function isChunkLoadError(error) {
	const message = String(
		error?.message || error?.name || error || "",
	).toLowerCase()

	return (
		message.includes("failed to fetch dynamically imported module") ||
		message.includes("importing a module script failed") ||
		message.includes("chunkloaderror") ||
		message.includes("loading chunk") ||
		message.includes("networkerror when attempting to fetch resource")
	)
}

/**
 * --------------------------------------------------------------------------
 * Router
 * --------------------------------------------------------------------------
 */

const router = createRouter({
	history: createWebHistory(resolveRouterBase()),

	routes,

	scrollBehavior(to, from, savedPosition) {
		if (savedPosition) {
			return savedPosition
		}

		/**
		 * Hash navigation.
		 *
		 * Do not force smooth scrolling on every POS transition.
		 */
		if (to.hash) {
			return {
				el: to.hash,
				behavior: "auto",
			}
		}

		return {
			left: 0,
			top: 0,
			behavior: "auto",
		}
	},
})

/**
 * --------------------------------------------------------------------------
 * Authentication / authorization guard
 * --------------------------------------------------------------------------
 *
 * Uses Vue Router's return-based guard model instead of next().
 */
router.beforeEach(async (to, from) => {
	const wasAuthenticated = isAuthenticated()

	if (isDev()) {
		log.debug(
			`Navigation: ${String(from.name || "initial")} → ${String(
				to.name || to.path,
			)} | auth=${wasAuthenticated}`,
		)
	}

	/**
	 * Do not unnecessarily perform user bootstrap for a known guest
	 * route when the session is already definitively logged out.
	 *
	 * Login itself must always remain reachable.
	 */
	const requiresAuth = to.meta?.[ROUTE_META.requiresAuth] === true

	const guestOnly = to.meta?.[ROUTE_META.guestOnly] === true

	let authenticated = wasAuthenticated

	if (requiresAuth || guestOnly) {
		authenticated = await settleSession()
	}

	/**
	 * Authenticated user attempting to access Login.
	 */
	if (guestOnly && authenticated) {
		return redirectToPOS()
	}

	/**
	 * Anonymous user attempting to access protected POS content.
	 */
	if (requiresAuth && !authenticated) {
		return redirectToLogin(to)
	}

	/**
	 * Optional shift protection.
	 *
	 * The main POS route intentionally does not require an open shift.
	 * The screen can expose the "فتح الوردية" workflow.
	 */
	if (to.meta?.[ROUTE_META.requiresOpenShift] === true && !isShiftOpen()) {
		if (isDev()) {
			log.debug(`Navigation blocked: ${String(to.name)} requires an open shift`)
		}

		return redirectToPOS()
	}

	return true
})

/**
 * --------------------------------------------------------------------------
 * Pre-resolution guard
 * --------------------------------------------------------------------------
 *
 * Kept intentionally lightweight.
 *
 * This is the correct place for future route-level preconditions that
 * should execute only after authentication/authorization has succeeded
 * and async route components have been resolved.
 */
router.beforeResolve(async (to) => {
	/**
	 * Reserved for future POS route preconditions.
	 *
	 * Examples:
	 * - terminal initialization
	 * - branch/session validation
	 * - permission hydration
	 * - critical route data
	 *
	 * Do not put ordinary UI work here.
	 */
	if (to.meta?.[ROUTE_META.requiresOpenShift] === true) {
		/**
		 * Re-check because shift state can change while an async
		 * route component is being resolved.
		 */
		if (!isShiftOpen()) {
			return redirectToPOS()
		}
	}

	return true
})

/**
 * --------------------------------------------------------------------------
 * Successful navigation
 * --------------------------------------------------------------------------
 */

router.afterEach((to, from, failure) => {
	// Arabic document title on every navigation (professional polish).
	applyDocumentTitle(to)
	/**
	 * A successfully completed navigation proves that the current
	 * deployment's route chunks are valid.
	 */
	if (!failure) {
		clearChunkRecovery()
		/**
		 * SPA focus reset (a11y standard): move focus to the main landmark
		 * so screen-reader users land on the new page, not the old position.
		 * Guarded for SSR/tests where document is unavailable.
		 */
		try {
			const main =
				typeof document !== "undefined"
					? document.getElementById("dypos-main")
					: null
			if (main && typeof main.focus === "function")
				main.focus({ preventScroll: true })
		} catch {
			/* focus never breaks navigation */
		}
	}

	if (isDev()) {
		log.debug(
			`Navigation complete: ${String(
				from.name || "initial",
			)} → ${String(to.name || to.path)}`,
		)
	}
})

/**
 * --------------------------------------------------------------------------
 * Navigation errors
 * --------------------------------------------------------------------------
 */

router.onError((error, to) => {
	if (isChunkLoadError(error)) {
		log.warn?.("Route chunk failed to load", {
			message: error?.message,
			target: to?.fullPath,
		})

		/**
		 * One controlled recovery attempt.
		 */
		if (canRecoverFromChunkError() && isBrowser) {
			markChunkRecovery()

			/**
			 * Give the browser a task boundary before reload.
			 * This avoids competing with the rejected dynamic import.
			 */
			window.setTimeout(() => {
				window.location.reload()
			}, 0)

			return
		}
	}

	log.error?.("Unhandled router error", error)
})

/**
 * --------------------------------------------------------------------------
 * Public router helpers
 * --------------------------------------------------------------------------
 *
 * Kept intentionally small. These make future application-level code
 * independent from internal route names.
 */
export function goToPOS() {
	return router.replace({
		name: ROUTE_NAMES.POS,
	})
}

export function goToLogin(redirect = null) {
	const query =
		typeof redirect === "string" && redirect.length > 0
			? { redirect }
			: undefined

	return router.replace({
		name: ROUTE_NAMES.LOGIN,
		query,
	})
}

/**
 * Navigate to the forgot-password page (request reset link).
 * @returns {Promise}
 */
export function goToForgotPassword() {
	return router.push({
		name: ROUTE_NAMES.FORGOT_PASSWORD,
	})
}

export {
	ROUTE_NAMES,
	resolveRouterBase,
	settleSession,
	GUARD_SESSION_TIMEOUT_MS,
}

export default router
