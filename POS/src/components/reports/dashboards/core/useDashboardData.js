/**
 * Shared composable for dashboard data loading.
 *
 * Provides reactive loading/error state, automatic period comparison,
 * and a standard refresh flow for all dashboard components.
 */
import { ref, computed, watch, onMounted, onUnmounted } from "vue"

/**
 * @param {Function} fetchFn - async (filter) => facts
 * @param {Object} options
 * @param {number} [options.autoRefreshInterval] - ms between auto-refreshes (0 = disabled)
 */
export function useDashboardData(fetchFn, options = {}) {
	const { autoRefreshInterval = 0 } = options

	const facts = ref(null)
	const loading = ref(false)
	const error = ref(null)
	const lastLoaded = ref(null)
	const refreshCount = ref(0)

	let refreshTimer = null

	async function load(filter) {
		loading.value = true
		error.value = null
		try {
			facts.value = await fetchFn(filter)
			lastLoaded.value = new Date()
			refreshCount.value += 1
		} catch (err) {
			error.value = err?.message || String(err)
		} finally {
			loading.value = false
		}
	}

	const isLoaded = computed(() => facts.value !== null)
	const hasData = computed(() => {
		if (!facts.value) return false
		const f = facts.value
		return !!(f.invoices?.length || f.payments?.length || f.items?.length)
	})

	function startAutoRefresh(filter) {
		stopAutoRefresh()
		if (autoRefreshInterval > 0) {
			refreshTimer = setInterval(() => load(filter), autoRefreshInterval)
		}
	}

	function stopAutoRefresh() {
		if (refreshTimer) {
			clearInterval(refreshTimer)
			refreshTimer = null
		}
	}

	onMounted(() => {
		load()
	})

	onUnmounted(() => {
		stopAutoRefresh()
	})

	return {
		facts,
		loading,
		error,
		lastLoaded,
		refreshCount,
		isLoaded,
		hasData,
		load,
		startAutoRefresh,
		stopAutoRefresh,
	}
}
