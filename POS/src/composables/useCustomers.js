import { ref, computed } from "vue"
import { isOffline, searchCachedCustomers, isCacheReady } from "@/utils/offline"
import { logger } from "@/utils/logger"

const log = logger.create("Customers")
export function useCustomers(posProfile) {
	const allCustomers = ref([])
	const searchTerm = ref("")
	const loading = ref(false)
	const selectedIndex = ref(-1)

	async function loadCustomers() {
		loading.value = true
		try {
			if (isOffline() || isCacheReady()) {
				allCustomers.value = await searchCachedCustomers("")
			} else {
				// Online and cache not ready - fetch from server
				// This will be handled by the store's loadAllCustomers
				allCustomers.value = []
			}
		} catch (error) {
			log.error("Error loading customers:", error)
			allCustomers.value = []
		} finally {
			loading.value = false
		}
	}

	async function searchCustomers(searchValue) {
		try {
			const results = await searchCachedCustomers(searchValue, 20)
			return results || []
		} catch (error) {
			log.error("Error searching customers:", error)
			return []
		}
	}

	function setSelectedIndex(index) {
		selectedIndex.value = index
	}

	function resetSelectedIndex() {
		selectedIndex.value = -1
	}

	function getSelectedCustomer() {
		return allCustomers.value[selectedIndex.value] || null
	}

	return {
		// State
		allCustomers,
		searchTerm,
		loading,
		selectedIndex,

		// Methods
		loadCustomers,
		searchCustomers,
		setSelectedIndex,
		resetSelectedIndex,
		getSelectedCustomer,

		// Computed
		cacheReady: isCacheReady,
	}
}
