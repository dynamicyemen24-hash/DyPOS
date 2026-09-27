/**
 * SaaS settings store.
 *
 * Manages multi-tenant branding, company info, and feature flags
 * for the SaaS deployment of DyPOS.
 */
import { defineStore } from "pinia"
import { ref, computed } from "vue"
import { DEFAULT_CURRENCY } from "@/utils/currency"
import { methodCall } from "@/utils/methodClient"
import { sessionUser } from "@/data/session"

export const useSaaSStore = defineStore("saas", () => {
	/** Company / tenant branding */
	const companyName = ref("")
	const companyLogo = ref("")
	const primaryColor = ref("#6366f1")
	// Seeded from the canonical currency module (itself configured from
	// posSettings) so a non-SAR tenant never starts out labelled SAR.
	const currency = ref(DEFAULT_CURRENCY)
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
			// Server-side records are a best-effort enrichment: the export file
			// must still be produced while offline, so a dead backend degrades
			// to "local data only" instead of failing the whole export.
			const user = sessionUser()
			const result = await methodCall("dypos.client.get_list", {
				doctype: "DyPOS User Data",
				filters: { user },
			}).catch(() => null)
			userData.records = result?.message || result || []
			const blob = new Blob([JSON.stringify(userData, null, 2)], {
				type: "application/json",
			})
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = `dypos-user-data-${user || "guest"}-${new Date().toISOString().split("T")[0]}.json`
			a.click()
			URL.revokeObjectURL(url)
			return userData
		} catch {
			throw new Error("Failed to export user data")
		}
	}

	async function deleteUserData() {
		try {
			// Best-effort remote delete: the local reset below always runs, so a
			// dead backend can never block the cashier from clearing the device.
			await methodCall("dypos.delete_doc", {
				doctype: "DyPOS User Data",
				name: sessionUser(),
			}).catch(() => null)
			companyName.value = ""
			companyLogo.value = ""
			primaryColor.value = "#6366f1"
			// Reset to the canonical default, not a hardcoded SAR.
			currency.value = DEFAULT_CURRENCY
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
			// Tenant branding is a nicety, not a boot requirement: offline the
			// defaults stay in place and the tenant gets them on reconnect.
			const data = await methodCall("dypos.client.get_value", {
				doctype: "DyPOS Settings",
				filters: {},
				fieldname: [
					"company_name",
					"company_logo",
					"primary_color",
					"currency",
				],
			}).catch(() => null)
			if (data) {
				setBranding({
					companyName: data.company_name,
					companyLogo: data.company_logo,
					primaryColor: data.primary_color,
					currency: data.currency,
				})
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
