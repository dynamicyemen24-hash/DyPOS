/**
 * Dashboard filters injection token.
 *
 * Allows child dashboard components to access the parent-provided
 * filter state (date range, refresh trigger) without prop drilling.
 */
import { inject, provide } from "vue"

const FILTERS_KEY = "dypos-dashboard-filters"

/**
 * Provide dashboard filters to child components.
 * Called by the parent DashboardPage or DashboardShell.
 */
export function provideDashboardFilters(filters) {
	provide(FILTERS_KEY, filters)
}

/**
 * Inject dashboard filters in child components.
 * Returns reactive filter state and refresh trigger.
 */
export function useDashboardFilters() {
	const filters = inject(FILTERS_KEY, {
		filterFrom: { value: "" },
		filterTo: { value: "" },
		refreshKey: { value: 0 },
	})
	return filters
}
