/**
 * DyPOS API Endpoints Configuration
 * Centralized API endpoint definitions for offline-first PWA
 * All endpoints point to the Cloudflare Worker API
 */

export const API_BASE = "/api"

export const endpoints = {
	// Health & connectivity
	ping: `${API_BASE}/ping`,
	health: `${API_BASE}/health`,
	ready: `${API_BASE}/ready`,

	// Authentication
	auth: {
		user: `${API_BASE}/auth/user`,
		login: `${API_BASE}/auth/login`,
		register: `${API_BASE}/auth/register`,
		logout: `${API_BASE}/auth/logout`,
		csrf: `${API_BASE}/csrf_token`,
	},

	// Localization
	localization: {
		translations: `${API_BASE}/localization/translations`,
		locales: `${API_BASE}/localization/locales`,
		userLanguage: `${API_BASE}/localization/user-language`,
	},

	// Features
	features: `${API_BASE}/features`,

	// Device
	device: {
		register: `${API_BASE}/device/register`,
		heartbeat: `${API_BASE}/device/heartbeat`,
		list: `${API_BASE}/devices`,
		revoke: (id) => `${API_BASE}/devices/${id}/revoke`,
		revive: (id) => `${API_BASE}/devices/${id}/revive`,
	},

	// Sync
	sync: {
		push: `${API_BASE}/sync/push`,
		pull: `${API_BASE}/sync/pull`,
	},

	// Products
	products: {
		list: `${API_BASE}/products`,
		get: (id) => `${API_BASE}/products/${id}`,
		create: `${API_BASE}/products`,
		update: (id) => `${API_BASE}/products/${id}`,
		delete: (id) => `${API_BASE}/products/${id}`,
		import: `${API_BASE}/products/import`,
		export: `${API_BASE}/products/export`,
	},

	// Customers
	customers: {
		list: `${API_BASE}/customers`,
		get: (id) => `${API_BASE}/customers/${id}`,
		create: `${API_BASE}/customers`,
		update: (id) => `${API_BASE}/customers/${id}`,
		delete: (id) => `${API_BASE}/customers/${id}`,
		wallet: (id) => `${API_BASE}/customers/${id}/wallet`,
	},

	// Sales / Invoices
	sales: {
		list: `${API_BASE}/invoices`,
		get: (id) => `${API_BASE}/invoices/${id}`,
		create: `${API_BASE}/invoices`,
		payment: (id) => `${API_BASE}/invoices/${id}/payment`,
		return: (id) => `${API_BASE}/invoices/${id}/return`,
		billings: (customerId) => `${API_BASE}/billings/${customerId}`,
		report: `${API_BASE}/reports/sales`,
	},

	// Stock / Inventory
	stock: {
		list: `${API_BASE}/stock`,
		movements: `${API_BASE}/stock/movements`,
		count: `${API_BASE}/stock/count`,
		reservations: `${API_BASE}/stock/reservations`,
	},

	// Shifts
	shifts: {
		list: `${API_BASE}/shifts`,
		open: `${API_BASE}/shifts/open`,
		close: `${API_BASE}/shifts/close`,
		current: `${API_BASE}/shifts/current`,
	},

	// Subscriptions (Saas)
	subscriptions: {
		plans: `${API_BASE}/subscriptions/plans`,
		subscribe: `${API_BASE}/subscriptions/subscribe`,
		billings: (customerId) =>
			`${API_BASE}/subscriptions/billings/${customerId}`,
		runBilling: `${API_BASE}/subscriptions/run-billing`,
		report: `${API_BASE}/subscriptions/report`,
	},

	// Tenants
	tenants: {
		list: `${API_BASE}/tenants`,
		create: `${API_BASE}/tenants`,
	},

	// Webhooks
	webhooks: {
		list: `${API_BASE}/webhooks`,
		create: `${API_BASE}/webhooks`,
		delete: (id) => `${API_BASE}/webhooks/${id}`,
	},

	// Exports/Imports
	export: {
		products: `${API_BASE}/export/products`,
		invoices: `${API_BASE}/export/invoices`,
		customers: `${API_BASE}/export/customers`,
	},
	import: {
		products: `${API_BASE}/import/products`,
		stock: `${API_BASE}/import/stock`,
		customers: `${API_BASE}/import/customers`,
	},

	// Backups
	backups: {
		list: `${API_BASE}/backups`,
		restore: `${API_BASE}/restore`,
	},
}

// Helper to build URL with query params
export function buildUrl(endpoint, params = {}) {
	const url = new URL(endpoint, window.location.origin)
	Object.entries(params).forEach(([key, value]) => {
		if (value !== undefined && value !== null) {
			url.searchParams.append(key, String(value))
		}
	})
	return url.toString()
}

export default endpoints
