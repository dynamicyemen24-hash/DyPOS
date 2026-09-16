/**
 * Dashboards barrel export.
 *
 * All dashboard components are registered here for lazy/direct
 * importing from the parent shell or router.
 */
export { default as SalesDashboard } from "./sales/SalesDashboard.vue"
export { default as FinanceDashboard } from "./finance/FinanceDashboard.vue"
export { default as InventoryDashboard } from "./inventory/InventoryDashboard.vue"
export { default as CustomersDashboard } from "./customers/CustomersDashboard.vue"
export { default as ExecutiveDashboard } from "./executive/ExecutiveDashboard.vue"
export { default as OperationsDashboard } from "./operations/OperationsDashboard.vue"

/**
 * Dashboard registry — used by the shell to dynamically mount
 * the correct dashboard based on route or catalog ID.
 */
export const DASHBOARD_REGISTRY = [
	{
		id: "executive-dashboard",
		name: "Executive Dashboard",
		component: () => import("./executive/ExecutiveDashboard.vue"),
		icon: "layout",
		category: "bi",
	},
	{
		id: "sales-summary",
		name: "Sales Dashboard",
		component: () => import("./sales/SalesDashboard.vue"),
		icon: "shopping-cart",
		category: "sales",
	},
	{
		id: "finance-overview",
		name: "Finance Dashboard",
		component: () => import("./finance/FinanceDashboard.vue"),
		icon: "dollar-sign",
		category: "finance",
	},
	{
		id: "inventory-intelligence",
		name: "Inventory Dashboard",
		component: () => import("./inventory/InventoryDashboard.vue"),
		icon: "package",
		category: "inventory",
	},
	{
		id: "customer-intelligence",
		name: "Customers Dashboard",
		component: () => import("./customers/CustomersDashboard.vue"),
		icon: "users",
		category: "customers",
	},
	{
		id: "operations-overview",
		name: "Operations Dashboard",
		component: () => import("./operations/OperationsDashboard.vue"),
		icon: "activity",
		category: "operations",
	},
]
