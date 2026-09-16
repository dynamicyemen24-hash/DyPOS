/**
 * SaaS settings store.
 *
 * Manages multi-tenant branding, company info, and feature flags
 * for the SaaS deployment of DyPOS.
 */
import { defineStore } from "pinia"
import { ref, computed } from "vue"

export const useSaaSStore = defineStore("saas", () => {
	/** Company / tenant branding */
	const companyName = ref("")
	const companyLogo = ref("")
	const primaryColor = ref("#6366f1")
	const currency = ref("SAR")
	const locale = ref("ar")
	const timezone = ref("Asia/Riyadh")

	/** Feature flags */
	const features = ref({
		dashboards: true,
		executiveDashboard: true,
		salesDashboard: true,
		financeDashboard: true,
		inventoryDashboard: true,
		customerDashboard: true,
		operationsDashboard: true,
		exportCSV: true,
		exportExcel: true,
		exportPDF: false,
		realtimeUpdates: true,
		autoRefresh: true,
		printSupport: true,
		customBranding: true,
	})

	/** Loading state */
	const isLoaded = ref(false)

	const brandVars = computed(() => ({
		"--dy-brand-primary": primaryColor.value,
		"--dy-company-name": `"${companyName.value}"`,
	}))

	function setBranding(brand) {
		if (brand.companyName) companyName.value = brand.companyName
		if (brand.companyLogo) companyLogo.value = brand.companyLogo
		if (brand.primaryColor) primaryColor.value = brand.primaryColor
		if (brand.currency) currency.value = brand.currency
		if (brand.locale) locale.value = brand.locale
		if (brand.timezone) timezone.value = brand.timezone
	}

	function setFeatures(flags) {
		Object.assign(features.value, flags)
	}

	function isFeatureEnabled(feature) {
		return features.value[feature] === true
	}

	async function exportUserData() {
		try {
			const userData = {
				companyName: companyName.value,
				companyLogo: companyLogo.value,
				primaryColor: primaryColor.value,
				currency: currency.value,
				locale: locale.value,
				timezone: timezone.value,
				features: features.value,
				exportedAt: new Date().toISOString(),
			}
			if (typeof window !== "undefined" && window.frappe?.call) {
				const result = await window.frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "DyPOS User Data",
						filters: { user: frappe.session.user },
					},
				})
				userData.records = result?.message || []
			}
			const blob = new Blob([JSON.stringify(userData, null, 2)], { type: "application/json" })
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = `dypos-user-data-${frappe.session.user}-${new Date().toISOString().split("T")[0]}.json`
			a.click()
			URL.revokeObjectURL(url)
			return userData
		} catch {
			throw new Error("Failed to export user data")
		}
	}

	async function deleteUserData() {
		try {
			if (typeof window !== "undefined" && window.frappe?.call) {
				await window.frappe.call({
					method: "frappe.delete_doc",
					args: {
						doctype: "DyPOS User Data",
						name: frappe.session.user,
					},
				})
			}
			companyName.value = ""
			companyLogo.value = ""
			primaryColor.value = "#6366f1"
			currency.value = "SAR"
			locale.value = "ar"
			timezone.value = "Asia/Riyadh"
			features.value = {
				dashboards: true,
				executiveDashboard: true,
				salesDashboard: true,
				financeDashboard: true,
				inventoryDashboard: true,
				customerDashboard: true,
				operationsDashboard: true,
				exportCSV: true,
				exportExcel: true,
				exportPDF: false,
				realtimeUpdates: true,
				autoRefresh: true,
				printSupport: true,
				customBranding: true,
			}
			return { status: "deleted" }
		} catch {
			throw new Error("Failed to delete user data")
		}
	}

	async function loadSaaSConfig() {
		try {
			if (typeof window !== "undefined" && window.frappe?.call) {
				const result = await window.frappe.call({
					method: "frappe.client.get_value",
					args: {
						doctype: "DyPOS Settings",
						filters: {},
						fieldname: [
							"company_name",
							"company_logo",
							"primary_color",
							"currency",
						],
					},
				})
				const data = result?.message
				if (data) {
					setBranding({
						companyName: data.company_name,
						companyLogo: data.company_logo,
						primaryColor: data.primary_color,
						currency: data.currency,
					})
				}
			}
		} catch {
			// Non-critical: use defaults
		} finally {
			isLoaded.value = true
		}
	}

	return {
		companyName,
		companyLogo,
		primaryColor,
		currency,
		locale,
		timezone,
		features,
		isLoaded,
		brandVars,
		setBranding,
		setFeatures,
		isFeatureEnabled,
		exportUserData,
		deleteUserData,
		loadSaaSConfig,
	}
})
