import { createResource } from "dypos-ui"
import { computed, ref } from "vue"
import { logger } from "@/utils/logger"
import { db } from "@/utils/offline/db"
import { offlineState } from "@/utils/offline/offlineState"
import { resolveTerminalId } from "@/utils/posContext"

const log = logger.create("ShiftClosing")

// Cache key for POS profiles
const PROFILES_CACHE_KEY = "DyPOS_pos_profiles_cache"
const PROFILES_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

// Get cached POS profiles
async function getCachedPosProfiles() {
	try {
		const cached = localStorage.getItem(PROFILES_CACHE_KEY)
		if (!cached) return null
		const { data, timestamp } = JSON.parse(cached)
		if (Date.now() - timestamp > PROFILES_CACHE_TTL) return null
		return data
	} catch {
		return null
	}
}

// Cache POS profiles
async function cachePosProfiles(data) {
	try {
		localStorage.setItem(
			PROFILES_CACHE_KEY,
			JSON.stringify({
				data,
				timestamp: Date.now(),
			}),
		)
	} catch (e) {
		log.warn("Failed to cache POS profiles", e)
	}
}

// Cache key for POS profile dialog data (payment methods)
const DIALOG_DATA_CACHE_KEY = "DyPOS_shift_dialog_data_cache"
const DIALOG_DATA_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

// Get cached dialog data
async function getCachedDialogData(posProfile) {
	try {
		const cached = localStorage.getItem(DIALOG_DATA_CACHE_KEY)
		if (!cached) return null
		const { data, timestamp, profile } = JSON.parse(cached)
		if (profile !== posProfile) return null
		if (Date.now() - timestamp > DIALOG_DATA_CACHE_TTL) return null
		return data
	} catch {
		return null
	}
}

// Cache dialog data
async function cacheDialogData(posProfile, data) {
	try {
		localStorage.setItem(
			DIALOG_DATA_CACHE_KEY,
			JSON.stringify({
				data,
				timestamp: Date.now(),
				profile: posProfile,
			}),
		)
	} catch (e) {
		log.warn("Failed to cache dialog data", e)
	}
}

// Check if we're online (uses centralized offlineState)
function isOnline() {
	if (typeof window === "undefined") return false
	return !offlineState.isOffline
}

export const shiftState = ref({
	pos_opening_shift: null,
	pos_profile: null,
	company: null,
	isOpen: false,
	/** Initial elapsed ms at the moment shift data was received from server */
	_initialElapsedMs: 0,
	/** Local timestamp (Date.now()) when shift data was received */
	_receivedAt: 0,
})

export function useShift() {
	// Check for existing open shift
	const checkOpeningShift = createResource({
		url: "DyPOS.api.shifts.check_opening_shift",
		auto: false,
		makeParams() {
			return { terminal_id: resolveTerminalId() }
		},
		onSuccess(data) {
			if (data) {
				// Compute initial elapsed time using server timestamps
				// (avoids timezone mismatch between server and browser)
				let initialElapsedMs = 0
				if (data.server_now && data.pos_opening_shift?.period_start_date) {
					const serverNow = new Date(data.server_now).getTime()
					const shiftStart = new Date(
						data.pos_opening_shift.period_start_date,
					).getTime()
					initialElapsedMs = Math.max(0, serverNow - shiftStart)
				}
				shiftState.value = {
					pos_opening_shift: data.pos_opening_shift,
					pos_profile: data.pos_profile,
					company: data.company,
					isOpen: true,
					_initialElapsedMs: initialElapsedMs,
					_receivedAt: Date.now(),
				}
				// Store in localStorage for offline support
				localStorage.setItem(
					"pos_shift_data",
					JSON.stringify({
						...data,
						_initialElapsedMs: initialElapsedMs,
						_receivedAt: Date.now(),
					}),
				)
			} else {
				shiftState.value = {
					pos_opening_shift: null,
					pos_profile: null,
					company: null,
					isOpen: false,
					_initialElapsedMs: 0,
					_receivedAt: 0,
				}
				localStorage.removeItem("pos_shift_data")
			}
		},
		onError(error) {
			log.error("Error checking opening shift:", error)
			// Try to load from localStorage
			const cachedData = localStorage.getItem("pos_shift_data")
			if (cachedData) {
				try {
					const data = JSON.parse(cachedData)
					shiftState.value = {
						pos_opening_shift: data.pos_opening_shift,
						pos_profile: data.pos_profile,
						company: data.company,
						isOpen: true,
						_initialElapsedMs: data._initialElapsedMs || 0,
						_receivedAt: data._receivedAt || Date.now(),
					}
				} catch (e) {
					log.error("Error parsing cached shift data:", e)
				}
			}
		},
	})

	// Get POS Profiles - offline-first: try cache first, then server
	const getPosProfiles = createResource({
		url: "DyPOS.api.pos_profile.get_pos_profiles",
		auto: false,
		onSuccess(data) {
			if (data && Array.isArray(data)) {
				cachePosProfiles(data)
			}
		},
		onError(error) {
			log.error("Error fetching POS profiles:", error)
		},
	})

	// Get dialog data (payment methods) - offline-first
	const getOpeningDialogData = createResource({
		url: "DyPOS.api.shifts.get_opening_dialog_data",
		auto: false,
		onSuccess(data) {
			// Cache will be handled by the caller with the selected profile
		},
		onError(error) {
			log.error("Error fetching dialog data:", error)
		},
	})

	// Create new opening shift - queue for sync when offline
	const createOpeningShift = createResource({
		url: "DyPOS.api.shifts.create_opening_shift",
		makeParams({ pos_profile, company, balance_details }) {
			return {
				pos_profile,
				terminal_id: resolveTerminalId(),
				company,
				balance_details: JSON.stringify(balance_details),
				pos_profile,
			}
		},
		onSuccess(data) {
			shiftState.value = {
				pos_opening_shift: data.pos_opening_shift,
				pos_profile: data.pos_profile,
				company: data.company,
				isOpen: true,
				_initialElapsedMs: 0,
				_receivedAt: Date.now(),
			}
			// Store in localStorage
			localStorage.setItem(
				"pos_shift_data",
				JSON.stringify({
					...data,
					_initialElapsedMs: 0,
					_receivedAt: Date.now(),
				}),
			)
		},
		onError(error) {
			log.error("Error creating opening shift:", error)
		},
	})

	// Get closing shift data
	const getClosingShiftData = createResource({
		url: "DyPOS.api.shifts.get_closing_shift_data",
		makeParams({ opening_shift }) {
			return { opening_shift }
		},
		auto: false,
	})

	// Submit closing shift - queue for sync when offline
	const submitClosingShift = createResource({
		url: "DyPOS.api.shifts.submit_closing_shift",
		makeParams({ closing_shift }) {
			return { closing_shift: JSON.stringify(closing_shift) }
		},
		onSuccess() {
			shiftState.value = {
				pos_opening_shift: null,
				pos_profile: null,
				company: null,
				isOpen: false,
				_initialElapsedMs: 0,
				_receivedAt: 0,
			}
			localStorage.removeItem("pos_shift_data")
		},
		onError(error) {
			log.error("Error submitting closing shift:", error)
		},
	})

	// Computed properties
	const hasOpenShift = computed(() => shiftState.value.isOpen)
	const currentShift = computed(() => shiftState.value.pos_opening_shift)
	const currentProfile = computed(() => shiftState.value.pos_profile)
	const currentCompany = computed(() => shiftState.value.company)

	// Offline-first helper: load profiles from cache or server
	async function loadPosProfiles() {
		// Try cache first
		const cached = await getCachedPosProfiles()
		if (cached && cached.length > 0) {
			log.debug("Loaded POS profiles from cache")
			return cached
		}
		// Fallback to server if online
		if (isOnline()) {
			try {
				await getPosProfiles.fetch()
				return getPosProfiles.data || []
			} catch (error) {
				log.warn("Failed to fetch POS profiles from server", error)
				return []
			}
		}
		return []
	}

	// Offline-first helper: load dialog data from cache or server
	async function loadDialogData(posProfile) {
		// Try cache first
		const cached = await getCachedDialogData(posProfile)
		if (cached) {
			log.debug("Loaded dialog data from cache", { posProfile })
			return cached
		}
		// Fallback to server if online
		if (isOnline()) {
			try {
				await getOpeningDialogData.fetch({ pos_profile: posProfile })
				const data = getOpeningDialogData.data
				if (data) {
					await cacheDialogData(posProfile, data)
				}
				return data
			} catch (error) {
				log.warn("Failed to fetch dialog data from server", error)
				return null
			}
		}
		return null
	}

	// Offline-capable shift creation: queue for sync when offline
	async function createOpeningShiftOffline(params) {
		if (isOnline()) {
			// Online: try server first
			try {
				await createOpeningShift.submit(params)
				// Best effort: flush any older offline ops now that we are online.
				void drainShiftQueue().catch(() => {})
				return { ok: true, data: createOpeningShift.data }
			} catch (error) {
				log.warn("Server shift creation failed, queueing for sync", error)
				// Fall through to queue locally
			}
		}
		// Offline or server failed: queue locally for sync
		const offlineId = `pos_offline_shift_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
		const shiftData = {
			...params,
			offline_id: offlineId,
			created_at: new Date().toISOString(),
			synced: false,
		}
		try {
			// Queue in local DB for sync — auto-id + indexed keys so the
			// drain below can find rows by offline_id/entityId.
			await db.shift_queue.add({
				type: "create",
				entityId: offlineId,
				offline_id: offlineId,
				data: shiftData,
				created_at: Date.now(),
				synced: false,
			})
			// Update local state optimistically
			shiftState.value = {
				pos_opening_shift: {
					name: offlineId,
					period_start_date: new Date().toISOString(),
				},
				pos_profile: params.pos_profile,
				company: params.company,
				isOpen: true,
				_initialElapsedMs: 0,
				_receivedAt: Date.now(),
			}
			localStorage.setItem(
				"pos_shift_data",
				JSON.stringify({
					pos_opening_shift: {
						name: offlineId,
						period_start_date: new Date().toISOString(),
					},
					pos_profile: params.pos_profile,
					company: params.company,
					_initialElapsedMs: 0,
					_receivedAt: Date.now(),
				}),
			)
			return { ok: true, offline: true, offlineId }
		} catch (error) {
			log.error("Failed to queue shift creation offline", error)
			return { ok: false, error }
		}
	}

	// Offline-capable shift closing
	async function submitClosingShiftOffline(closingShift) {
		if (isOnline()) {
			try {
				await submitClosingShift.submit({
					closing_shift: JSON.stringify(closingShift),
				})
				void drainShiftQueue().catch(() => {})
				return { ok: true }
			} catch (error) {
				log.warn("Server shift closing failed, queueing for sync", error)
			}
		}
		// Offline or server failed: queue locally
		const offlineId = `pos_offline_shift_close_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
		try {
			await db.shift_queue.add({
				type: "close",
				entityId: offlineId,
				offline_id: offlineId,
				data: { closing_shift, offline_id: offlineId },
				created_at: Date.now(),
				synced: false,
			})
			// Update local state optimistically
			shiftState.value = {
				pos_opening_shift: null,
				pos_profile: null,
				company: null,
				isOpen: false,
				_initialElapsedMs: 0,
				_receivedAt: 0,
			}
			localStorage.removeItem("pos_shift_data")
			return { ok: true, offline: true, offlineId }
		} catch (error) {
			log.error("Failed to queue shift closing offline", error)
			return { ok: false, error }
		}
	}

	// Drain queued offline shift ops when back online.
	// Rows are found by the indexed `synced` flag (never by id), pushed
	// through the same server resources, then marked synced — so a queue
	// written offline cannot sit silently unsynced.
	async function drainShiftQueue() {
		if (!isOnline()) return { drained: 0 }
		let drained = 0
		let pending = []
		try {
			pending = await db.shift_queue.where("synced").equals(0).toArray()
		} catch {
			try {
				pending = (await db.shift_queue.toArray()).filter((row) => !row?.synced)
			} catch {
				return { drained: 0 }
			}
		}
		for (const row of pending) {
			try {
				if (row?.type === "create" && row?.data) {
					await createOpeningShift.submit({
						pos_profile: row.data.pos_profile,
						company: row.data.company,
						balance_details: row.data.balance_details || [],
					})
				} else if (row?.type === "close" && row?.data?.closing_shift) {
					await submitClosingShift.submit({
						closing_shift: JSON.stringify(row.data.closing_shift),
					})
				} else {
					continue
				}
				if (row?.id != null) {
					await db.shift_queue.update(row.id, { synced: true })
				} else if (row?.offline_id) {
					await db.shift_queue
						.where("offline_id")
						.equals(row.offline_id)
						.modify({ synced: true })
				}
				drained += 1
			} catch (error) {
				log.warn("Shift queue drain failed for row, will retry", error)
				break
			}
		}
		return { drained }
	}

	return {
		// State
		shiftState,
		hasOpenShift,
		currentShift,
		currentProfile,
		currentCompany,

		// Resources (server-bound, for online use)
		checkOpeningShift,
		getPosProfiles,
		getOpeningDialogData,
		createOpeningShift,
		getClosingShiftData,
		submitClosingShift,

		// Offline-first helpers
		loadPosProfiles,
		loadDialogData,
		createOpeningShiftOffline,
		submitClosingShiftOffline,
		drainShiftQueue,
	}
}
