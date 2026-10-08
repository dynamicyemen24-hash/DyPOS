/**
 * Session store — the authoritative user session + POS bootstrap layer.
 *
 * Chains: tenant → auth → session → permissions → branch → terminal →
 *         shift → offline sync → POS
 *
 * Wraps the low-level dypossession (data/session.js) and orchestrates the
 * rest of the runtime: bootstrap data, POS context, permission preload, shift
 * resolution and the platform sync manager lifecycle.
 *
 * Consumers use the exported `session` instance (Login.vue, POSSale.vue) or
 * `useSessionStore()` where they need a full Pinia store.
 */

import { computed, ref } from "vue"
import { defineStore } from "pinia"

import { session as localSession } from "@/data/session"
import { userResource, userData } from "@/data/user"
import { shiftState, useShift } from "@/composables/useShift"
import { usePermissions } from "@/composables/usePermissions"
import { useBootstrapStore } from "@/stores/bootstrap"

import {
	posContext,
	refreshPosContext,
	resolveTerminalId,
} from "@/utils/posContext"
import {
	DEFAULT_POS_PERMISSIONS,
	POS_PERMISSION_KEYS,
	preloadPOSPermissions,
} from "@/utils/permissions"
import { requiresReauthentication } from "@/utils/authErrors"
import { logger } from "@/utils/logger"

import {
	initAuth as initPlatformAuth,
	revokeAuth,
	authState,
} from "@/services/sync-auth"
import {
	initSyncManager,
	stopSyncManager,
	maybeImmediatePush,
	syncState,
} from "@/services/sync-manager"
import OfflineStore from "@/services/offline-store"
import {
	reserveStock,
	releaseReservation,
	getPhysicalStockMap,
} from "@/services/stock-reservations"
import { nextOfflineInvoiceNumber } from "@/services/offline-numbering"
import {
	LINK_REASONS,
	isLinkEnabled,
	setLinkMode,
} from "@/services/link-consent"

const log = logger.create("SessionStore")

/**
 * Normalize the POSSale checkout payload into the sync invoice schema so the
 * offline validator and the platform push handler see a consistent shape.
 * @param {Object} payload
 * @returns {Object}
 */
export function normalizeInvoiceForSync(payload) {
	if (!payload) return payload
	return {
		...payload,
		customerId:
			payload.customerId ??
			payload.customer?.id ??
			payload.customer?.name ??
			null,
		total: payload.total ?? payload.pricing?.total ?? null,
		items: payload.items || [],
	}
}

export const useSessionStore = defineStore("session", () => {
	// Low-level dypossession layer (source of truth for user identity).
	const lowSession = localSession

	// Runtime lifecycle
	const isReady = ref(false)
	const isBootstrapping = ref(false)
	const bootstrappedAt = ref(null)
	const lastError = ref(null)
	const requiresReauth = ref(false)

	// Permissions (op → boolean); seeded optimistically.
	const permissions = ref({ ...DEFAULT_POS_PERMISSIONS })
	const permissionsLoaded = ref(false)

	// Composables
	const shiftComposable = useShift()
	const bootstrapStore = useBootstrapStore()

	let syncInited = false
	let bootstrapPromise = null

	// --------------------------------------------------------------------
	// Computed — identity / context
	// --------------------------------------------------------------------

	const user = computed(() => lowSession.user)
	const isLoggedIn = computed(() => lowSession.isLoggedIn)
	const tenantId = computed(() => posContext.tenantId)
	const tenantName = computed(() => posContext.tenantName)
	const branchName = computed(() => posContext.branchName)
	const terminalId = computed(() => posContext.terminalId)
	const posProfile = computed(() => posContext.posProfile)

	const workspaceReadiness = computed(() => {
		const readiness = {
			identity: Boolean(user.value && lowSession.isLoggedIn),
			tenant: Boolean(posContext.tenantId),
			branch: Boolean(posContext.branchCode && posContext.branchName),
			terminal: Boolean(posContext.terminalId),
			profile: Boolean(posContext.posProfile),
			permissions: permissionsLoaded.value,
			settings: Boolean(bootstrapStore.getPreloadedPOSSettings()),
			shift: Boolean(shiftState.value.isOpen),
		}
		return {
			...readiness,
			saleReady: Object.entries(readiness)
				.filter(([key]) => key !== "shift")
				.every(([, value]) => value),
		}
	})

	const workspaceReady = computed(() => workspaceReadiness.value.saleReady)

	const currentShift = computed(() => shiftState.value.pos_opening_shift)
	const activeShift = currentShift
	const shiftIsOpen = computed(() => shiftState.value.isOpen)
	const shift = computed(() => ({
		isOpen: shiftState.value.isOpen,
		status: shiftState.value.pos_opening_shift ? "open" : "none",
		requiresOpening: !shiftState.value.isOpen,
		pos_opening_shift: shiftState.value.pos_opening_shift,
		pos_profile: shiftState.value.pos_profile,
		company: shiftState.value.company,
	}))
	const requiresOpeningShift = computed(() => !shiftState.value.isOpen)
	const syncLive = computed(() => syncState.isOnline)

	// --------------------------------------------------------------------
	// Auth
	// --------------------------------------------------------------------

	/**
	 * Log in with the current dypossession contract ({ usr, pwd }).
	 * @param {{ usr: string, pwd: string }} credentials
	 * @returns {Promise<string|null>} The logged-in user id.
	 */
	async function login(credentials = {}) {
		const { usr, pwd, subscriberCode } = credentials || {}
		if (!usr || !pwd) {
			const error = new Error("بيانات الدخول ناقصة")
			throw error
		}

		await lowSession.login.submit({ email: usr, password: pwd, subscriberCode })

		// The user explicitly demanded the server (typed credentials +
		// pressed login): grant linkage consent. Local/PIN logins never
		// pass through here, so they stay fully standalone.
		setLinkMode("linked", LINK_REASONS.SERVER_LOGIN)

		// Load persisted platform sync auth so the offline engine has tokens.
		await initPlatformAuth().catch(() => {})

		return lowSession.user
	}

	/**
	 * Centralized logout: stops the sync loop, revokes platform tokens,
	 * tears down dypossession + local user data, resets store state.
	 * @returns {Promise<boolean>}
	 */
	async function logout() {
		stopSyncManagerSafe()

		try {
			await revokeAuth()
		} catch (error) {
			log.warn("Platform auth revocation failed", error)
		}

		try {
			await lowSession.logout.submit()
		} catch (error) {
			// data/session logout.onError already cleans up local state.
		}

		resetStoreState()
		bootstrapStore.reset()
		return true
	}

	function resetStoreState() {
		isReady.value = false
		isBootstrapping.value = false
		bootstrappedAt.value = null
		lastError.value = null
		requiresReauth.value = false
		permissions.value = { ...DEFAULT_POS_PERMISSIONS }
		permissionsLoaded.value = false
		bootstrapPromise = null
	}

	// --------------------------------------------------------------------
	// Bootstrap
	// --------------------------------------------------------------------

	/**
	 * Full POS session bootstrap:
	 *  1. platform sync auth  2. initial data  3. POS context
	 *  4. permissions (async) 5. shift state   6. sync manager
	 * Coalesced: concurrent callers share one run.
	 * @returns {Promise<boolean>} True when ready (even if degraded).
	 */
	async function bootstrap() {
		if (isReady.value && bootstrappedAt.value) return true
		if (bootstrapPromise) return bootstrapPromise

		bootstrapPromise = doBootstrap().finally(() => {
			bootstrapPromise = null
		})
		return bootstrapPromise
	}

	async function doBootstrap() {
		if (isBootstrapping.value) return false
		isBootstrapping.value = true
		lastError.value = null

		try {
			// 1. Platform sync auth (local read; no network by itself)
			await initPlatformAuth().catch(() => {})

			// 2. Initial data (idempotent — reuses the bootstrap store cache).
			// Standalone-first: one server call the user never demanded is
			// still one too many — local logins bootstrap from device state.
			const data = isLinkEnabled()
				? await bootstrapStore.loadInitialData()
				: null

			// 3. POS context (tenant / branch / terminal / profile)
			// Terminal identity must come from provisioned workspace data or a
			// previously persisted provisioned terminal; never manufacture one.
			resolveTerminalId()
			refreshPosContext({
				bootstrapData: data,
				settings: bootstrapStore.getPreloadedPOSSettings(),
				auth: authState,
			})

			// 4. Permission preload (non-blocking, optimistic defaults served meanwhile)
			void loadPermissions()

			// 5. Shift state (offline-safe — cached copy used on failure).
			// Standalone-first: the check is a server call; local logins
			// read the device shift copy instead of demanding the network.
			if (isLinkEnabled()) {
				try {
					await shiftComposable.checkOpeningShift.submit()
				} catch (error) {
					log.warn("Shift check degraded (offline fallback used)", error)
				}
			}

			// 6. Sync manager (poll + connectivity listeners)
			startSyncManager()

			isReady.value = true
			bootstrappedAt.value = Date.now()
			return true
		} catch (error) {
			lastError.value = error
			requiresReauth.value = requiresReauthentication(error)
			log.error("Session bootstrap failed", error)
			// Degraded-ready: never trap the cashier on the login screen
			// because a background initializer failed.
			isReady.value = true
			return false
		} finally {
			isBootstrapping.value = false
		}
	}

	/**
	 * Re-fetch the current user profile (identity, image).
	 * @returns {Promise<string|null>}
	 */
	async function refresh() {
		if (lowSession.isLoggedIn) {
			try {
				await userResource.reload()
			} catch (error) {
				log.warn("User profile refresh failed", error)
			}
			userData.refresh()
		}
		return lowSession.user
	}

	// --------------------------------------------------------------------
	// Permissions
	// --------------------------------------------------------------------

	async function loadPermissions() {
		try {
			const { checkPermission } = usePermissions()
			const map = await preloadPOSPermissions({
				hasPermission: checkPermission,
			})
			permissions.value = { ...permissions.value, ...map }
		} catch (error) {
			log.warn("Permission preload failed, optimistic defaults kept", error)
		} finally {
			permissionsLoaded.value = true
		}
	}

	/**
	 * @param {string} op - A POS_PERMISSION_KEYS operation.
	 * @returns {boolean} Optimistic true until the server payload arrives.
	 */
	function hasPermission(op) {
		const value = permissions.value[op]
		if (permissionsLoaded.value || value !== undefined) {
			return value
		}
		return DEFAULT_POS_PERMISSIONS[op] ?? true
	}

	// --------------------------------------------------------------------
	// Shift
	// --------------------------------------------------------------------

	/**
	 * Open a new shift through the centralized store.
	 * @param {{ pos_profile?: string, company?: string, balance_details?: Array }} payload
	 * @returns {Promise<Object>}
	 */
	async function openShift(payload = {}) {
		const data = await shiftComposable.createOpeningShift.submit({
			pos_profile: payload.pos_profile,
			company: payload.company,
			balance_details: payload.balance_details || payload.balance || [],
		})
		return data
	}

	// --------------------------------------------------------------------
	// Sale
	// --------------------------------------------------------------------

	/**
	 * Centralized sale submission (offline-first, durable):
	 *  - generates a structured offline invoice number when needed
	 *    (POS-{branch}-{terminal}-{date}-{seq}),
	 *  - reserves stock locally to prevent overselling across terminals,
	 *  - writes invoice + payments + sync-queue row + reservation commits +
	 *    stock decrements in ONE Dexie transaction (power-cut safe: the sale
	 *    lands whole or not at all — never a queue row without an invoice),
	 *  - triggers an immediate push when online + authenticated,
	 *  - never blocks the cashier on the network.
	 * @param {Object} payload
	 * @returns {Promise<Object>} Enriched payload incl. `invoice_id`.
	 */
	async function submitSale(payload = {}) {
		let invoiceId =
			payload.invoice_id || payload.offline_id || payload.clientSequence || null

		// ترقيم أوفلاين منظم: فرع/طرفية/تاريخ/تسلسل يومي ذري
		if (!invoiceId) {
			try {
				const numbering = await nextOfflineInvoiceNumber({
					branch: posContext.branchName || "BR",
					terminal: posContext.terminalId || "T1",
				})
				invoiceId = numbering.invoiceNumber
			} catch (error) {
				log.warn("Offline numbering failed, falling back", error)
				invoiceId = `INV-${Date.now()}`
			}
		}

		const normalized = normalizeInvoiceForSync({
			...payload,
			invoice_id: invoiceId,
		})

		// حجز المخزون محليًا (يمنع البيع الزائد بين الطرفيات).
		// لا نوقف البيع عند فشل الحجز — نسجّل ونكمل (سياسة لا تحجب الكاشير).
		// يبقى الحجز خارج المعاملة الذرية أدناه عمدًا: فشل الحجز هنا لا
		// يُبطل البيع، وانقطاع الكهرباء قبله يترك حجزًا ACTIVE تنتهي
		// صلاحيته تلقائيًا — لا فاتورة ولا طابور، أي لا شيء يُفقَد.
		let physicalStock = {}
		let reservedItems = []
		try {
			const items = (normalized.items || [])
				.map((item) => ({
					itemId: item.itemId ?? item.item ?? item.id,
					qty: Number(item.qty ?? item.quantity ?? 0),
				}))
				.filter((item) => item.itemId != null && item.qty > 0)

			if (items.length > 0) {
				physicalStock = await getPhysicalStockMap(
					undefined,
					items.map((item) => item.itemId),
				)
				await reserveStock({
					invoiceId,
					items,
					physicalStock,
				})
				reservedItems = items
			}
		} catch (error) {
			log.warn("Stock reservation skipped/failed", error)
		}

		// الدفعة: كتلة واحدة {method, received, change} أو مصفوفة دفعات.
		const paymentRows = []
		if (Array.isArray(normalized.payments)) {
			for (const payment of normalized.payments) {
				const amount = Number(payment?.amount)
				if (Number.isFinite(amount) && amount > 0) {
					paymentRows.push({
						method: payment.method || "cash",
						amount,
						reference: payment.reference || null,
						date: payment.date || null,
					})
				}
			}
		} else if (normalized.payment) {
			const received = Number(normalized.payment.received ?? 0)
			const change = Number(normalized.payment.change ?? 0)
			const amount = received - change
			if (Number.isFinite(amount) && amount > 0) {
				paymentRows.push({
					method: normalized.payment.method || "cash",
					amount,
					reference: null,
					date: null,
				})
			}
		}
		const paid = paymentRows.reduce((sum, row) => sum + row.amount, 0)
		const total = Number(normalized.total ?? 0)

		// التثبيت والخصم للأصناف معلومة المخزون فقط؛ مجهولة المخزون
		// (غير محدودة) تبقى حجوزاتها ACTIVE كحارس حتى انتهاء الصلاحية.
		const commitItems = reservedItems.filter((item) =>
			Number.isFinite(Number(physicalStock[String(item.itemId)])),
		)

		try {
			await OfflineStore.enqueueInvoiceSale({
				entityType: "invoice",
				entityId: String(invoiceId),
				operation: "create",
				queuePayload: normalized,
				invoice: {
					invoiceNo: String(invoiceId),
					customerId: normalized.customerId ?? null,
					items: normalized.items || [],
					total,
					paid,
					balance: Math.max(0, total - paid),
					date: normalized.createdAt || new Date().toISOString(),
					terminalId: posContext.terminalId || null,
					shiftId: currentShift.value?.id ?? currentShift.value?.name ?? null,
				},
				payments: paymentRows,
				commitItems,
			})
			// دفع فوري فقط بوضع auto مع الربط — وإلا يبقى في الطابور
			// حتى «مزامنة الآن» (لا شبكة بلا طلب).
			maybeImmediatePush()
		} catch (error) {
			log.error("Sale enqueue failed", error)
			syncState.error = error.message || String(error)
			syncState.errorKind = error.kind || null
			// حرّر الحجز إذا فشل الحفظ الذري (الفاتورة والطابور معًا
			// تراجعا، فلا شيء يُبقي الحجز محجوزًا)
			releaseReservation(invoiceId).catch(() => {})
			// لا تعلن نجاح البيع إذا فشل حفظه محلياً في قائمة المزامنة
			throw new Error(
				`فشل حفظ الفاتورة محلياً: ${error.message || String(error)}`,
			)
		}

		return { ...payload, invoice_id: invoiceId, synced: false }
	}

	// --------------------------------------------------------------------
	// Sync manager lifecycle
	// --------------------------------------------------------------------

	function startSyncManager() {
		if (syncInited) return
		syncInited = true
		initSyncManager()
	}

	function stopSyncManagerSafe() {
		if (!syncInited) return
		stopSyncManager()
		syncInited = false
	}

	return {
		// Identity / context
		user,
		isLoggedIn,
		tenantId,
		tenantName,
		branchName,
		terminalId,
		posProfile,
		workspaceReady,
		workspaceReadiness,

		// Runtime lifecycle
		isReady,
		isBootstrapping,
		bootstrappedAt,
		lastError,
		requiresReauth,

		// Permissions
		permissions,
		permissionsLoaded,
		hasPermission,

		// Shift
		shift,
		shiftIsOpen,
		currentShift,
		activeShift,
		requiresOpeningShift,

		// Sync visibility
		syncLive,
		syncState,

		// Actions
		login,
		logout,
		bootstrap,
		refresh,
		openShift,
		submitSale,
	}
})

let _store = null

/**
 * Get the shared store instance (lazy — created once Pinia is active).
 * @returns {ReturnType<typeof useSessionStore>}
 */
export function getSessionStore() {
	if (!_store) _store = useSessionStore()
	return _store
}

/**
 * Stable instance surface used by Login.vue / POSSale.vue.
 * Proxies reads onto the active Pinia store.
 */
export const session = new Proxy(
	{},
	{
		get(_target, prop) {
			if (prop === "_store") return getSessionStore()
			return getSessionStore()[prop]
		},
		set(_target, prop, value) {
			getSessionStore()[prop] = value
			return true
		},
		has(_target, prop) {
			return prop in getSessionStore()
		},
	},
)

export default session
