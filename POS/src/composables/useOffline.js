import {
	syncOfflineInvoices,
	cacheItemsFromServer,
	cacheCustomersFromServer,
} from "@/utils/offline"
import { offlineState } from "@/utils/offline/offlineState"
import { offlineWorker } from "@/utils/offline/workerClient"
import { logger } from "@/utils/logger"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"

const log = logger.create("Offline")

/**
 * @deprecated Legacy offline facade — zero live importers. Status reads moved
 *   to `useOfflineStatus`; sale writes move through `session.submitSale →
 *   services/sync-manager.pushLocalChange → syncQueue`. Kept frozen for
 *   reference; do not add callers.
 */
export function useOffline() {
	// Reactive state that syncs with centralized offlineState
	const isOffline = ref(offlineState.isOffline)
	const pendingInvoicesCount = ref(0)
	const isSyncing = ref(false)
	const connectionQuality = ref(offlineState.getConnectionQuality())

	// Track previous offline state for transition detection
	let wasOffline = offlineState.isOffline
	let unsubscribe = null

	// Update offline status from centralized state
	const updateOfflineStatus = () => {
		isOffline.value = offlineState.isOffline
		connectionQuality.value = offlineState.getConnectionQuality()
	}

	// Update pending invoices count using worker
	const updatePendingCount = async () => {
		try {
			pendingInvoicesCount.value = await offlineWorker.getOfflineInvoiceCount()
		} catch (error) {
			log.error("[useOffline] Error getting pending count:", error)
		}
	}

	// Save invoice offline using worker
	/** @deprecated Dead write path — see `useOffline` note above. */
	const saveInvoiceOffline = async (invoiceData) => {
		try {
			await offlineWorker.saveOfflineInvoice(invoiceData)
			await updatePendingCount()
			return true
		} catch (error) {
			log.error("[useOffline] Error saving invoice offline:", error)
			throw error
		}
	}

	// Sync pending invoices
	const syncPending = async () => {
		if (isOffline.value) {
			throw new Error("Cannot sync while offline")
		}

		isSyncing.value = true
		try {
			const result = await syncOfflineInvoices()
			await updatePendingCount()
			return result
		} catch (error) {
			log.error("[useOffline] Error syncing invoices:", error)
			throw error
		} finally {
			isSyncing.value = false
		}
	}

	// Get pending invoices using worker
	const getPending = async () => {
		return await offlineWorker.getOfflineInvoices()
	}

	// Delete pending invoice using worker
	const deletePending = async (id) => {
		await offlineWorker.deleteOfflineInvoice(id)
		await updatePendingCount()
	}

	// Cache data using worker
	const cacheData = async (items, customers) => {
		try {
			if (items && items.length > 0) {
				await offlineWorker.cacheItems(items)
			}
			if (customers && customers.length > 0) {
				await offlineWorker.cacheCustomers(customers)
			}
			return true
		} catch (error) {
			log.error("[useOffline] Error caching data:", error)
			return false
		}
	}

	// Search cached items using worker
	const searchItems = async (searchTerm, limit = 50) => {
		return await offlineWorker.searchCachedItems(searchTerm, limit)
	}

	// Search cached customers using worker
	const searchCustomers = async (searchTerm, limit = 20) => {
		return await offlineWorker.searchCachedCustomers(searchTerm, limit)
	}

	// Check if cache is ready using worker
	const checkCacheReady = async () => {
		return await offlineWorker.isCacheReady()
	}

	// Get cache stats using worker
	const getCacheStats = async () => {
		return await offlineWorker.getCacheStats()
	}

	// Handle state changes from centralized manager
	const handleStateChange = async (state) => {
		const nowOffline = state.isOffline

		// Update reactive refs
		isOffline.value = nowOffline
		connectionQuality.value =
			state.quality || offlineState.getConnectionQuality()

		// Detect transition from offline to online
		if (wasOffline && !nowOffline) {
			log.debug(
				"[useOffline] Transition to online detected, syncing and refreshing cache...",
			)
			try {
				await syncPending()
				// Auto-refresh cache when coming online
				if (!offlineState.manualOffline && offlineWorker.isCacheReady()) {
					log.debug("[useOffline] Auto-refreshing cache from server...")
					await cacheItemsFromServer(shiftStore.profileName)
					await cacheCustomersFromServer(shiftStore.profileName)
				}
			} catch (error) {
				log.error("[useOffline] Auto-sync failed:", error)
			}
		}

		wasOffline = nowOffline
	}

	// Force immediate connectivity check
	const checkConnectivity = async () => {
		const state = await offlineState.checkConnectivity()
		isOffline.value = state.isOffline
		connectionQuality.value = state.quality
		return state
	}

	// Handle invoice sync completion
	const handleInvoicesSynced = () => {
		log.debug("[useOffline] Invoices synced event received, updating count...")
		updatePendingCount()
	}

	onMounted(() => {
		// Initial state sync
		updateOfflineStatus()
		updatePendingCount()

		// Subscribe to centralized state changes
		unsubscribe = offlineState.subscribe(handleStateChange)

		// Listen for sync completion events
		window.addEventListener("offlineInvoicesSynced", handleInvoicesSynced, {
			passive: true,
		})
	})

	onUnmounted(() => {
		// Cleanup subscription
		if (unsubscribe) {
			unsubscribe()
			unsubscribe = null
		}

		window.removeEventListener("offlineInvoicesSynced", handleInvoicesSynced)
	})

	return {
		isOffline,
		pendingInvoicesCount,
		isSyncing,
		connectionQuality,
		saveInvoiceOffline,
		syncPending,
		getPending,
		deletePending,
		cacheData,
		searchItems,
		searchCustomers,
		checkCacheReady,
		getCacheStats,
		checkConnectivity,
		updateOfflineStatus,
		updatePendingCount,
	}
}
