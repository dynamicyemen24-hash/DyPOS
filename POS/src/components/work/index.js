/**
 * Work Screens Kit — Main Export
 *
 * Arabic-first, WCAG 2.2 AA, RTL-aware, Design Token driven.
 * Import from: '@/components/work'
 */

// Layout & Shell
export { default as WorkShell } from "./WorkShell.vue"
export { default as WorkPageHeader } from "./WorkPageHeader.vue"
export { default as WorkToolbar } from "./WorkToolbar.vue"
export { default as WorkBreadcrumb } from "./WorkBreadcrumb.vue"

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
export { default as WorkPivotTable } from "./WorkPivotTable.vue"

// Forms
export { default as WorkForm } from "./WorkForm.vue"
export { default as WorkFormField } from "./WorkFormField.vue"
export { default as WorkFormFieldArray } from "./WorkFormFieldArray.vue"
export { default as WorkWizard } from "./WorkWizard.vue"

// Feedback & States
export { default as WorkLoadingSkeleton } from "./WorkLoadingSkeleton.vue"
export { default as WorkErrorState } from "./WorkErrorState.vue"
export { default as WorkPermissionState } from "./WorkPermissionState.vue"
export { default as WorkEmptyState } from "./WorkEmptyState.vue"
export {
	default as WorkNotification,
	notify,
	notifySuccess,
	notifyError,
	notifyWarning,
	notifyInfo,
	dismissAll,
} from "./WorkNotification.vue"

// Overlays
export { default as WorkDialog } from "./WorkDialog.vue"
export { default as WorkDrawer } from "./WorkDrawer.vue"

// Actions
export { default as WorkActions } from "./WorkActions.vue"
export { default as WorkBatchActions } from "./WorkBatchActions.vue"

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
