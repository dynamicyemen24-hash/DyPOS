/**
 * Work Screens Kit — Main Export
 *
 * Arabic-first, WCAG 2.2 AA, RTL-aware, Design Token driven.
 * Import from: '@/components/work'
 */

// Layout & Shell
export { default as WorkShell } from "./WorkShell.vue"
export { default as WorkToolbar } from "./WorkToolbar.vue"
export { default as WorkMenuStrip } from "./WorkMenuStrip.vue"
export { default as WorkStatusStrip } from "./WorkStatusStrip.vue"
export { default as WorkPanel } from "./WorkPanel.vue"

// Navigation
export { default as WorkTabs } from "./WorkTabs.vue"

// Data Display
export { default as WorkTable } from "./WorkTable.vue"
export { default as WorkDataGrid } from "./WorkDataGrid.vue"
export { default as WorkPagination } from "./WorkPagination.vue"
export { default as WorkChart } from "./WorkChart.vue"
export { default as WorkFilters } from "./WorkFilters.vue"
export { default as WorkFilterField } from "./WorkFilterField.vue"
export { default as WorkSearch } from "./WorkSearch.vue"
export { default as StatusBadge } from "./StatusBadge.vue"

// Feedback & States
export { default as WorkLoadingSkeleton } from "./WorkLoadingSkeleton.vue"
export { default as WorkErrorState } from "./WorkErrorState.vue"
export { default as WorkPermissionState } from "./WorkPermissionState.vue"
export { default as WorkEmptyState } from "./WorkEmptyState.vue"
// التنبيهات عبر `useToast` + `common/Toast.vue` وحدهما (S3): متجر
// `workNotifications` احتُذِي بلا مُصيِّر ولا نادٍ فحُذِف بدل أن يبقى
// واجهة عامة لا يراها أحد.

// Actions
export { default as WorkActions } from "./WorkActions.vue"

// Permissions
export {
	PermissionState,
	providePermissions,
	usePermissions,
	vPermission,
	PermissionGate,
} from "./permissions.js"

// Navigation Config
export { WORK_NAV_SECTIONS, flatWorkNav, isNavActive } from "./workNav.js"

// Design Tokens
export {
	tokens,
	generateCSSVariables,
	applyCSSVariables,
	getToken,
} from "@/styles/design-tokens.js"
