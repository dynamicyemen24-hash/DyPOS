/** DyPOS settings store v1.33.0 — single source: server/lib/version.js */
import { createResource } from "frappe-ui"
import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { useBootstrapStore } from "./bootstrap"
import { configureCurrency } from "@/utils/currency"

// =============================================================================
// OPERATIONAL MODULE REGISTRY
// Settings are distributed across operational modules so the Settings UI can
// render per-module tabs and the data model stays country-agnostic. Every key
// listed here must exist in the settings state (and in resetSettings()).
// Best practice: feature modules own their fields; integration modules
// (localization, compliance) are generic frameworks, not per-country islands.
// =============================================================================

const CHECKBOX = (labelKey) => ({ type: "checkbox", labelKey })
const NUMBER = (labelKey, opts = {}) => ({ type: "number", labelKey, ...opts })
const SELECT = (labelKey, options, source) => ({
	type: "select",
	labelKey,
	options,
	source,
})
const TEXT = (labelKey, { area = false } = {}) => ({
	type: area ? "textarea" : "text",
	labelKey,
})
const EMAIL = (labelKey) => ({ type: "email", labelKey })

// Field metadata (type, options, i18n key) used to render the settings UI.
export const SETTINGS_FIELDS = {
	// Core
	pos_profile: TEXT("posProfile"),
	enabled: CHECKBOX("enabled"),

	// Billing & Payments
	allow_credit_sale: CHECKBOX("allowCreditSale"),
	allow_customer_credit_payment: CHECKBOX("allowCustomerCreditPayment"),
	allow_write_off_change: CHECKBOX("allowWriteOffChange"),
	allow_partial_payment: CHECKBOX("allowPartialPayment"),
	use_exact_amount: CHECKBOX("useExactAmount"),
	disable_rounded_total: CHECKBOX("disableRoundedTotal"),
	default_payment_method: TEXT("defaultPaymentMethod"),

	// Operations & Returns
	allow_sales_order: CHECKBOX("allowSalesOrder"),
	allow_select_sales_order: CHECKBOX("allowSelectSalesOrder"),
	create_only_sales_order: CHECKBOX("createOnlySalesOrder"),
	allow_return: CHECKBOX("allowReturn"),
	allow_return_without_invoice: CHECKBOX("allowReturnWithoutInvoice"),
	allow_free_batch_return: CHECKBOX("allowFreeBatchReturn"),
	allow_change_posting_date: CHECKBOX("allowChangePostingDate"),
	allow_submissions_in_background_job: CHECKBOX(
		"allowSubmissionsInBackgroundJob",
	),

	// Inventory & Stock
	allow_negative_stock: CHECKBOX("allowNegativeStock"),
	allow_user_to_edit_rate: CHECKBOX("allowUserToEditRate"),
	input_qty: CHECKBOX("inputQty"),
	show_variants_as_items: CHECKBOX("showVariantsAsItems"),
	cart_lifo: CHECKBOX("cartLifo"),

	// Catalog & Display
	default_card_view: CHECKBOX("defaultCardView"),
	display_item_code: CHECKBOX("displayItemCode"),
	display_discount_percentage: CHECKBOX("displayDiscountPercentage"),
	display_discount_amount: CHECKBOX("displayDiscountAmount"),
	show_customer_balance: CHECKBOX("showCustomerBalance"),
	hide_expected_amount: CHECKBOX("hideExpectedAmount"),

	// Discounts & Promotions
	max_discount_allowed: NUMBER("maxDiscountAllowed", {
		min: 0,
		max: 100,
		step: 0.01,
	}),
	use_percentage_discount: CHECKBOX("usePercentageDiscount"),
	allow_user_to_edit_additional_discount: CHECKBOX(
		"allowUserToEditAdditionalDiscount",
	),
	allow_user_to_edit_item_discount: CHECKBOX("allowUserToEditItemDiscount"),
	minimum_discount: NUMBER("minimumDiscount", { min: 0, max: 100, step: 0.01 }),
	maximum_discount: NUMBER("maximumDiscount", { min: 0, max: 100, step: 0.01 }),
	fetch_coupon: CHECKBOX("fetchCoupon"),

	// Taxation
	tax_regime: SELECT("taxRegime", [
		"standard",
		"vat",
		"gst",
		"sales_tax",
		"none",
	]),
	tax_inclusive: CHECKBOX("taxInclusive"),
	decimal_precision: SELECT("decimalPrecision", [
		"0",
		"1",
		"2",
		"3",
		"4",
		"5",
		"6",
	]),
	tax_rounding_method: SELECT("taxRoundingMethod", [
		"standard",
		"round_half_up",
		"round_half_down",
	]),
	tax_registration_no: TEXT("taxRegistrationNo"),

	// Customers
	allow_customer_purchase_order: CHECKBOX("allowCustomerPurchaseOrder"),
	allow_duplicate_customer_names: CHECKBOX("allowDuplicateCustomerNames"),
	require_customer_on_sale: CHECKBOX("requireCustomerOnSale"),

	// Loyalty & Wallet
	enable_loyalty_program: CHECKBOX("enableLoyaltyProgram"),
	default_loyalty_program: TEXT("defaultLoyaltyProgram"),
	wallet_account: TEXT("walletAccount"),
	auto_create_wallet: CHECKBOX("autoCreateWallet"),
	loyalty_to_wallet: CHECKBOX("loyaltyToWallet"),

	// Invoicing & E-Documents
	invoice_format: SELECT("invoiceFormat", [
		"standard",
		"simplified",
		"tax",
		"electronic",
	]),

	// Printing & Peripherals
	allow_print_last_invoice: CHECKBOX("allowPrintLastInvoice"),
	allow_print_draft_invoices: CHECKBOX("allowPrintDraftInvoices"),
	silent_print: CHECKBOX("silentPrint"),
	auto_kick_drawer_on_cash: CHECKBOX("autoKickDrawerOnCash"),

	// Desktop, Recovery & Recent Invoices
	auto_save_open_invoice: CHECKBOX("autoSaveOpenInvoice"),
	autosave_interval_seconds: NUMBER("autosaveIntervalSeconds", {
		min: 1,
		max: 60,
		step: 1,
	}),
	desktop_recent_invoices_count: NUMBER("desktopRecentInvoicesCount", {
		min: 0,
		max: 50,
		step: 1,
	}),

	// Localization (country-agnostic; empty = auto-detect)
	locale: SELECT("locale", ["", "ar", "en", "id", "pt-br"]),
	timezone: SELECT("timezone", [], "timezones"),
	currency: SELECT("currency", [], "currencies"),
	date_format: TEXT("dateFormat"),
	number_format: TEXT("numberFormat"),
	rtl_support: CHECKBOX("rtlSupport"),
	currency_symbol_position: SELECT("currencySymbolPosition", ["left", "right"]),

	// Offline & Sync
	allow_delete_offline_invoice: CHECKBOX("allowDeleteOfflineInvoice"),
	offline_sync_interval: NUMBER("offlineSyncInterval", { min: 5, step: 5 }),
	offline_cache_expiry_days: NUMBER("offlineCacheExpiryDays", {
		min: 1,
		step: 1,
	}),

	// Search & Performance
	use_limit_search: CHECKBOX("useLimitSearch"),
	search_limit: NUMBER("searchLimit", { min: 10, step: 10 }),

	// Security & Audit
	enable_session_lock: CHECKBOX("enableSessionLock"),
	session_lock_timeout: NUMBER("sessionLockTimeout", { min: 1, step: 1 }),
	audit_trail_enabled: CHECKBOX("auditTrailEnabled"),

	// Sales Team
	enable_sales_persons: SELECT("enableSalesPersons", [
		"Disabled",
		"Single",
		"Multiple",
	]),

	// Delivery & Fulfillment
	use_delivery_charges: CHECKBOX("useDeliveryCharges"),
	auto_set_delivery_charges: CHECKBOX("autoSetDeliveryCharges"),

	// Company & Branches (report header source)
	company_name: TEXT("companyName"),
	company_logo: TEXT("companyLogo"),
	company_address: TEXT("companyAddress", { area: true }),
	company_phone: TEXT("companyPhone"),
	company_email: EMAIL("companyEmail"),
	company_tax_id: TEXT("companyTaxId"),
	branch_name: TEXT("branchName"),
	branch_code: TEXT("branchCode"),
	branch_address: TEXT("branchAddress", { area: true }),

	// Compliance & E-Invoicing (one generic framework; ZATCA is one of many)
	einvoice_enabled: CHECKBOX("einvoiceEnabled"),
	einvoice_framework: SELECT("einvoiceFramework", [
		"none",
		"zatca",
		"gcc_bims",
		"eu_vies",
		"us_sales_tax",
		"custom",
	]),
	einvoice_region: TEXT("einvoiceRegion"),
	einvoice_provider: TEXT("einvoiceProvider"),
	einvoice_registration_no: TEXT("einvoiceRegistrationNo"),
	einvoice_transmission: SELECT("einvoiceTransmission", [
		"portal",
		"realtime",
		"offline",
	]),
	food_safety_tracking: CHECKBOX("foodSafetyTracking"),
	data_retention_days: NUMBER("dataRetentionDays", {
		min: 90,
		max: 36500,
		step: 30,
	}),

	// Legacy aliases (read-only; superseded by einvoice_framework / food_safety_tracking)
	enable_zalina: CHECKBOX("enableZalinaLegacy"),
	enable_sfd: CHECKBOX("enableSfdLegacy"),
}

// Operational modules: ordering matters for the UI tabs.
export const SETTINGS_MODULES = [
	{
		key: "core",
		label: "Core",
		labelKey: "core",
		icon: "cog",
		fields: ["pos_profile", "enabled"],
	},
	{
		key: "billing",
		label: "Billing & Payments",
		labelKey: "billing",
		icon: "credit-card",
		fields: [
			"allow_credit_sale",
			"allow_customer_credit_payment",
			"allow_write_off_change",
			"allow_partial_payment",
			"use_exact_amount",
			"disable_rounded_total",
			"default_payment_method",
		],
	},
	{
		key: "operations",
		label: "Operations & Returns",
		labelKey: "operations",
		icon: "refresh",
		fields: [
			"allow_sales_order",
			"allow_select_sales_order",
			"create_only_sales_order",
			"allow_return",
			"allow_return_without_invoice",
			"allow_free_batch_return",
			"allow_change_posting_date",
			"allow_submissions_in_background_job",
		],
	},
	{
		key: "inventory",
		label: "Inventory & Stock",
		labelKey: "inventory",
		icon: "box",
		fields: [
			"allow_negative_stock",
			"allow_user_to_edit_rate",
			"input_qty",
			"show_variants_as_items",
			"cart_lifo",
		],
	},
	{
		key: "catalog",
		label: "Catalog & Display",
		labelKey: "catalog",
		icon: "layout-grid",
		fields: [
			"default_card_view",
			"display_item_code",
			"display_discount_percentage",
			"display_discount_amount",
			"show_customer_balance",
			"hide_expected_amount",
		],
	},
	{
		key: "discounts",
		label: "Discounts & Promotions",
		labelKey: "discounts",
		icon: "percent",
		fields: [
			"max_discount_allowed",
			"use_percentage_discount",
			"allow_user_to_edit_additional_discount",
			"allow_user_to_edit_item_discount",
			"minimum_discount",
			"maximum_discount",
			"fetch_coupon",
		],
	},
	{
		key: "taxation",
		label: "Taxation",
		labelKey: "taxation",
		icon: "calculator",
		fields: [
			"tax_regime",
			"tax_inclusive",
			"decimal_precision",
			"tax_rounding_method",
			"tax_registration_no",
		],
	},
	{
		key: "customers",
		label: "Customers",
		labelKey: "customers",
		icon: "users",
		fields: [
			"allow_customer_purchase_order",
			"allow_duplicate_customer_names",
			"require_customer_on_sale",
		],
	},
	{
		key: "loyalty",
		label: "Loyalty & Wallet",
		labelKey: "loyalty",
		icon: "gift",
		fields: [
			"enable_loyalty_program",
			"default_loyalty_program",
			"wallet_account",
			"auto_create_wallet",
			"loyalty_to_wallet",
		],
	},
	{
		key: "invoicing",
		label: "Invoicing & E-Documents",
		labelKey: "invoicing",
		icon: "file-text",
		fields: ["invoice_format"],
	},
	{
		key: "printing",
		label: "Printing & Peripherals",
		labelKey: "printing",
		icon: "printer",
		fields: [
			"allow_print_last_invoice",
			"allow_print_draft_invoices",
			"silent_print",
			"auto_kick_drawer_on_cash",
		],
	},
	{
		key: "desktop",
		label: "Desktop & Recovery",
		labelKey: "desktop",
		icon: "monitor",
		fields: [
			"auto_save_open_invoice",
			"autosave_interval_seconds",
			"desktop_recent_invoices_count",
		],
	},
	{
		key: "localization",
		label: "Localization",
		labelKey: "localization",
		icon: "globe",
		fields: [
			"locale",
			"timezone",
			"currency",
			"date_format",
			"number_format",
			"rtl_support",
			"currency_symbol_position",
		],
	},
	{
		key: "offline",
		label: "Offline & Sync",
		labelKey: "offline",
		icon: "cloud-off",
		fields: [
			"allow_delete_offline_invoice",
			"offline_sync_interval",
			"offline_cache_expiry_days",
		],
	},
	{
		key: "search",
		label: "Search & Performance",
		labelKey: "search",
		icon: "search",
		fields: ["use_limit_search", "search_limit"],
	},
	{
		key: "security",
		label: "Security & Audit",
		labelKey: "security",
		icon: "lock",
		fields: [
			"enable_session_lock",
			"session_lock_timeout",
			"audit_trail_enabled",
		],
	},
	{
		key: "sales_team",
		label: "Sales Team",
		labelKey: "salesTeam",
		icon: "user",
		fields: ["enable_sales_persons"],
	},
	{
		key: "delivery",
		label: "Delivery & Fulfillment",
		labelKey: "delivery",
		icon: "truck",
		fields: ["use_delivery_charges", "auto_set_delivery_charges"],
	},
	{
		key: "company",
		label: "Company & Branches",
		labelKey: "company",
		icon: "building",
		fields: [
			"company_name",
			"company_logo",
			"company_address",
			"company_phone",
			"company_email",
			"company_tax_id",
			"branch_name",
			"branch_code",
			"branch_address",
		],
	},
	{
		key: "compliance",
		label: "Compliance & E-Invoicing",
		labelKey: "compliance",
		icon: "shield",
		fields: [
			"einvoice_enabled",
			"einvoice_framework",
			"einvoice_region",
			"einvoice_provider",
			"einvoice_registration_no",
			"einvoice_transmission",
			"food_safety_tracking",
			"data_retention_days",
			"enable_zalina",
			"enable_sfd",
		],
	},
]

// =============================================================================
// Helpers
// =============================================================================

/** Country-agnostic default timezone: browser/system timezone or UTC. */
function getBrowserTimezone() {
	if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
		} catch {
			return "UTC"
		}
	}
	return "UTC"
}

/** Map POS UI locale -> numeric formatting locale used by Intl.NumberFormat. */
const NUMERIC_LOCALES = {
	ar: "ar-SA-u-nu-latn",
	en: "en",
	id: "id-ID",
	"pt-br": "pt-BR",
}

// =============================================================================
// STORE
// =============================================================================

export const usePOSSettingsStore = defineStore("posSettings", () => {
	// State (grouped by operational module; flat keys keep doctype compat)
	const settings = ref({
		// ---- Module: Core ----
		pos_profile: "",
		enabled: 0,

		// ---- Module: Billing & Payments ----
		allow_credit_sale: 0,
		allow_customer_credit_payment: 0,
		allow_write_off_change: 0,
		allow_partial_payment: 0,
		use_exact_amount: 0,
		disable_rounded_total: 1,
		default_payment_method: "",

		// ---- Module: Operations & Returns ----
		allow_sales_order: 0,
		allow_select_sales_order: 0,
		create_only_sales_order: 0,
		allow_return: 0,
		allow_return_without_invoice: 0,
		allow_free_batch_return: 0,
		allow_change_posting_date: 0,
		allow_submissions_in_background_job: 0,

		// ---- Module: Inventory & Stock ----
		allow_negative_stock: 0,
		allow_user_to_edit_rate: 0,
		input_qty: 0,
		show_variants_as_items: 0,
		cart_lifo: 0,

		// ---- Module: Catalog & Display ----
		default_card_view: 0,
		display_item_code: 0,
		display_discount_percentage: 0,
		display_discount_amount: 0,
		show_customer_balance: 0,
		hide_expected_amount: 0,

		// ---- Module: Discounts & Promotions ----
		max_discount_allowed: 0,
		use_percentage_discount: 0,
		allow_user_to_edit_additional_discount: 0,
		allow_user_to_edit_item_discount: 1,
		minimum_discount: 0,
		maximum_discount: 0,
		fetch_coupon: 0,

		// ---- Module: Taxation ----
		tax_regime: "standard", // standard, vat, gst, sales_tax, none
		tax_inclusive: 0, // Prices include tax
		decimal_precision: "2",
		tax_rounding_method: "standard",
		tax_registration_no: "",

		// ---- Module: Customers ----
		allow_customer_purchase_order: 0,
		allow_duplicate_customer_names: 0,
		require_customer_on_sale: 1,

		// ---- Module: Loyalty & Wallet ----
		enable_loyalty_program: 0,
		default_loyalty_program: "",
		wallet_account: "",
		auto_create_wallet: 1,
		loyalty_to_wallet: 1,

		// ---- Module: Invoicing & E-Documents ----
		invoice_format: "standard", // standard, simplified, tax, electronic

		// ---- Module: Printing & Peripherals ----
		allow_print_last_invoice: 0,
		allow_print_draft_invoices: 0,
		silent_print: 0,
		auto_kick_drawer_on_cash: 1,

		// ---- Module: Desktop & Recovery ----
		auto_save_open_invoice: 1,
		autosave_interval_seconds: 2,
		desktop_recent_invoices_count: 10,

		// ---- Module: Localization (country-agnostic, empty = auto/system) ----
		locale: "", // UI locale; "" = detect (browser -> server -> app default)
		timezone: "", // "" = browser/system timezone
		currency: "", // "" = system default currency
		date_format: "yyyy-mm-dd",
		number_format: "#,###.##",
		rtl_support: 0,
		currency_symbol_position: "left",

		// ---- Module: Offline & Sync ----
		allow_delete_offline_invoice: 0,
		offline_sync_interval: 30, // seconds
		offline_cache_expiry_days: 30,

		// ---- Module: Search & Performance ----
		use_limit_search: 0,
		search_limit: 1000,

		// ---- Module: Security & Audit ----
		enable_session_lock: 0,
		session_lock_timeout: 5, // minutes
		audit_trail_enabled: 1,

		// ---- Module: Sales Team ----
		enable_sales_persons: "Disabled", // Disabled, Single, Multiple

		// ---- Module: Delivery & Fulfillment ----
		use_delivery_charges: 0,
		auto_set_delivery_charges: 0,

		// ---- Module: Company & Branches (report header source) ----
		company_name: "",
		company_logo: "",
		company_address: "",
		company_phone: "",
		company_email: "",
		company_tax_id: "",
		branch_name: "",
		branch_code: "",
		branch_address: "",

		// ---- Module: Compliance & E-Invoicing (generic, not country-exclusive) ----
		einvoice_enabled: 0, // e-invoicing / electronic documents
		einvoice_framework: "none", // none, zatca, gcc_bims, eu_vies, us_sales_tax, custom
		einvoice_region: "", // "SA", "AE", "EU", "US", ...
		einvoice_provider: "", // zatca-fatooh, tabadul, peppol, avalara, ...
		einvoice_registration_no: "",
		einvoice_transmission: "portal", // portal, realtime, offline
		food_safety_tracking: 0, // food safety lot tracking (SFDA / FSMA / ...)
		data_retention_days: 3650, // invoice/audit retention (local law / ISO 9001)

		// Legacy aliases (deprecated; kept for backward compatibility with the
		// POS Settings doctype. Superseded by einvoice_framework and
		// food_safety_tracking.)
		enable_zalina: 0,
		enable_sfd: 0,
	})

	const isLoading = ref(false)
	const isLoaded = ref(false)

	// ================================================================
	// Computed — Billing & Payments
	// ================================================================
	const allowCreditSale = computed(() =>
		Boolean(settings.value.allow_credit_sale),
	)
	const allowCustomerCreditPayment = computed(() =>
		Boolean(settings.value.allow_customer_credit_payment),
	)
	const allowWriteOffChange = computed(() =>
		Boolean(settings.value.allow_write_off_change),
	)
	const allowPartialPayment = computed(() =>
		Boolean(settings.value.allow_partial_payment),
	)
	const useExactAmount = computed(() =>
		Boolean(settings.value.use_exact_amount),
	)
	const disableRoundedTotal = computed(() =>
		Boolean(settings.value.disable_rounded_total),
	)
	const defaultPaymentMethod = computed(
		() => String(settings.value.default_payment_method || "").trim(),
	)

	// ================================================================
	// Computed — Operations & Returns
	// ================================================================
	const allowSalesOrder = computed(() =>
		Boolean(settings.value.allow_sales_order),
	)
	const allowSelectSalesOrder = computed(() =>
		Boolean(settings.value.allow_select_sales_order),
	)
	const createOnlySalesOrder = computed(() =>
		Boolean(settings.value.create_only_sales_order),
	)
	const allowReturn = computed(() => Boolean(settings.value.allow_return))
	const allowReturnWithoutInvoice = computed(() =>
		Boolean(settings.value.allow_return_without_invoice),
	)
	const allowFreeBatchReturn = computed(() =>
		Boolean(settings.value.allow_free_batch_return),
	)
	const allowChangePostingDate = computed(() =>
		Boolean(settings.value.allow_change_posting_date),
	)
	const allowSubmissionsInBackgroundJob = computed(() =>
		Boolean(settings.value.allow_submissions_in_background_job),
	)

	// ================================================================
	// Computed — Inventory & Stock
	// ================================================================
	const allowNegativeStock = computed(() =>
		Boolean(settings.value.allow_negative_stock),
	)
	const allowUserToEditRate = computed(() =>
		Boolean(settings.value.allow_user_to_edit_rate),
	)
	const inputQty = computed(() => Boolean(settings.value.input_qty))
	const showVariantsAsItems = computed(() =>
		Boolean(settings.value.show_variants_as_items),
	)
	const cartLifo = computed(() => Boolean(settings.value.cart_lifo))

	// ================================================================
	// Computed — Catalog & Display
	// ================================================================
	const defaultCardView = computed(() =>
		Boolean(settings.value.default_card_view),
	)
	const displayItemCode = computed(() =>
		Boolean(settings.value.display_item_code),
	)
	const displayDiscountPercentage = computed(() =>
		Boolean(settings.value.display_discount_percentage),
	)
	const displayDiscountAmount = computed(() =>
		Boolean(settings.value.display_discount_amount),
	)
	const showCustomerBalance = computed(() =>
		Boolean(settings.value.show_customer_balance),
	)
	const hideExpectedAmount = computed(() =>
		Boolean(settings.value.hide_expected_amount),
	)

	// ================================================================
	// Computed — Discounts & Promotions
	// ================================================================
	const isEnabled = computed(() => Boolean(settings.value.enabled))
	const maxDiscountAllowed = computed(
		() => Number.parseFloat(settings.value.max_discount_allowed) || 0,
	)
	const usePercentageDiscount = computed(() =>
		Boolean(settings.value.use_percentage_discount),
	)
	const allowAdditionalDiscount = computed(() =>
		Boolean(settings.value.allow_user_to_edit_additional_discount),
	)
	const allowItemDiscount = computed(() =>
		Boolean(settings.value.allow_user_to_edit_item_discount),
	)
	const minimumDiscount = computed(
		() => Number.parseInt(settings.value.minimum_discount) || 0,
	)
	const maximumDiscount = computed(
		() => Number.parseInt(settings.value.maximum_discount) || 0,
	)
	const fetchCoupon = computed(() => Boolean(settings.value.fetch_coupon))

	// ================================================================
	// Computed — Taxation
	// ================================================================
	const taxRegime = computed(() => settings.value.tax_regime || "standard")
	const taxInclusive = computed(() => Boolean(settings.value.tax_inclusive))
	const decimalPrecision = computed(
		() => Number.parseInt(settings.value.decimal_precision) || 2,
	)
	const taxRoundingMethod = computed(
		() => settings.value.tax_rounding_method || "standard",
	)
	const taxRegistrationNo = computed(
		() => settings.value.tax_registration_no || "",
	)

	// ================================================================
	// Computed — Customers
	// ================================================================
	const allowCustomerPurchaseOrder = computed(() =>
		Boolean(settings.value.allow_customer_purchase_order),
	)
	const allowDuplicateCustomerNames = computed(() =>
		Boolean(settings.value.allow_duplicate_customer_names),
	)
	const requireCustomerOnSale = computed(
		() => settings.value.require_customer_on_sale !== 0,
	)

	// ================================================================
	// Computed — Loyalty & Wallet
	// ================================================================
	const enableLoyaltyProgram = computed(() =>
		Boolean(settings.value.enable_loyalty_program),
	)
	const defaultLoyaltyProgram = computed(
		() => settings.value.default_loyalty_program || "",
	)
	const walletAccount = computed(() => settings.value.wallet_account || "")
	const autoCreateWallet = computed(() =>
		Boolean(settings.value.auto_create_wallet),
	)
	const loyaltyToWallet = computed(() =>
		Boolean(settings.value.loyalty_to_wallet),
	)

	// ================================================================
	// Computed — Invoicing & E-Documents
	// ================================================================
	const invoiceFormat = computed(
		() => settings.value.invoice_format || "standard",
	)

	// ================================================================
	// Computed — Printing & Peripherals
	// ================================================================
	const allowPrintLastInvoice = computed(() =>
		Boolean(settings.value.allow_print_last_invoice),
	)
	const allowPrintDraftInvoices = computed(() =>
		Boolean(settings.value.allow_print_draft_invoices),
	)
	const silentPrint = computed(() => Boolean(settings.value.silent_print))
	const autoKickDrawerOnCash = computed(
		() => settings.value.auto_kick_drawer_on_cash !== 0,
	)

	// ================================================================
	// Computed — Desktop & Recovery
	// ================================================================
	const autoSaveOpenInvoice = computed(() =>
		Boolean(settings.value.auto_save_open_invoice),
	)
	const autosaveIntervalSeconds = computed(() => {
		const n = Number.parseInt(settings.value.autosave_interval_seconds)
		if (!Number.isFinite(n)) return 2
		return Math.max(1, Math.min(n, 60))
	})
	const desktopRecentInvoicesCount = computed(() => {
		const n = Number.parseInt(settings.value.desktop_recent_invoices_count)
		if (!Number.isFinite(n)) return 10
		return Math.max(0, Math.min(n, 50))
	})

	// ================================================================
	// Computed — Localization (country-agnostic)
	// ================================================================
	const locale = computed(() => settings.value.locale || "")
	const timezone = computed(
		() => settings.value.timezone || getBrowserTimezone(),
	)
	const currency = computed(() => settings.value.currency || "")
	const dateFormat = computed(() => settings.value.date_format || "yyyy-mm-dd")
	const numberFormat = computed(
		() => settings.value.number_format || "#,###.##",
	)
	const rtlSupport = computed(() => Boolean(settings.value.rtl_support))
	const currencySymbolPosition = computed(
		() => settings.value.currency_symbol_position || "left",
	)

	// ================================================================
	// Computed — Offline & Sync
	// ================================================================
	const allowDeleteOfflineInvoice = computed(() =>
		Boolean(settings.value.allow_delete_offline_invoice),
	)
	const offlineSyncInterval = computed(
		() => Number.parseInt(settings.value.offline_sync_interval) || 30,
	)
	const offlineCacheExpiryDays = computed(
		() => Number.parseInt(settings.value.offline_cache_expiry_days) || 30,
	)

	// ================================================================
	// Computed — Search & Performance
	// ================================================================
	const useLimitSearch = computed(() =>
		Boolean(settings.value.use_limit_search),
	)
	const searchLimit = computed(
		() => Number.parseInt(settings.value.search_limit) || 1000,
	)

	// ================================================================
	// Computed — Security & Audit
	// ================================================================
	const enableSessionLock = computed(() =>
		Boolean(settings.value.enable_session_lock),
	)
	const sessionLockTimeout = computed(
		() => Number.parseInt(settings.value.session_lock_timeout) || 5,
	)
	const auditTrailEnabled = computed(() =>
		Boolean(settings.value.audit_trail_enabled),
	)

	// ================================================================
	// Computed — Sales Team
	// ================================================================
	const enableSalesPersons = computed(
		() => settings.value.enable_sales_persons !== "Disabled",
	)
	const salesPersonsMode = computed(
		() => settings.value.enable_sales_persons || "Disabled",
	)
	const isSingleSalesPerson = computed(
		() => settings.value.enable_sales_persons === "Single",
	)
	const isMultipleSalesPersons = computed(
		() => settings.value.enable_sales_persons === "Multiple",
	)

	// ================================================================
	// Computed — Delivery & Fulfillment
	// ================================================================
	const useDeliveryCharges = computed(() =>
		Boolean(settings.value.use_delivery_charges),
	)
	const autoSetDeliveryCharges = computed(() =>
		Boolean(settings.value.auto_set_delivery_charges),
	)

	// ================================================================
	// Computed — Company & Branches
	// ================================================================
	const companyName = computed(() => settings.value.company_name || "")
	const companyLogo = computed(() => settings.value.company_logo || "")
	const companyAddress = computed(() => settings.value.company_address || "")
	const companyPhone = computed(() => settings.value.company_phone || "")
	const companyEmail = computed(() => settings.value.company_email || "")
	const companyTaxId = computed(() => settings.value.company_tax_id || "")
	const branchName = computed(() => settings.value.branch_name || "")
	const branchCode = computed(() => settings.value.branch_code || "")
	const branchAddress = computed(() => settings.value.branch_address || "")

	// ================================================================
	// Computed — Compliance & E-Invoicing (generic framework)
	// ================================================================
	const einvoiceEnabled = computed(() =>
		Boolean(settings.value.einvoice_enabled),
	)
	const enableEInvoice = einvoiceEnabled
	const einvoiceFramework = computed(
		() => settings.value.einvoice_framework || "none",
	)
	const einvoiceRegion = computed(() => settings.value.einvoice_region || "")
	const einvoiceProvider = computed(
		() => settings.value.einvoice_provider || "",
	)
	const einvoiceRegistrationNo = computed(
		() => settings.value.einvoice_registration_no || "",
	)
	const einvoiceTransmission = computed(
		() => settings.value.einvoice_transmission || "portal",
	)
	const foodSafetyTracking = computed(() =>
		Boolean(settings.value.food_safety_tracking),
	)
	const dataRetentionDays = computed(
		() => Number.parseInt(settings.value.data_retention_days) || 3650,
	)

	// Backward-compatible getters: enableZATCA/enableSFD derive from the generic
	// compliance framework (ZATCA region) OR the legacy doctype flags.
	const enableZATCA = computed(
		() =>
			(einvoiceEnabled.value && einvoiceFramework.value === "zatca") ||
			Boolean(settings.value.enable_zalina),
	)
	const enableSFD = computed(
		() => foodSafetyTracking.value || Boolean(settings.value.enable_sfd),
	)

	// ================================================================
	// Runtime sync: keep formatting + locale caches aligned with settings
	// ================================================================
	function applyToRuntime() {
		const { currency: cur, locale: loc } = settings.value

		// Keep currency.js defaults in sync with the configured locale.
		const numericLocale = loc ? NUMERIC_LOCALES[loc] || loc : undefined
		if (cur || numericLocale) {
			configureCurrency({ currency: cur || undefined, locale: numericLocale })
		}

		// Cache the effective locale so useLocale() can honor it when offline.
		try {
			if (loc) {
				localStorage.setItem("DyPOS_default_locale", loc)
			}
		} catch {
			// localStorage unavailable (SSR/privacy mode) — ignore
		}
	}

	// Resource
	const settingsResource = createResource({
		url: "DyPOS.DyPOS.doctype.pos_settings.pos_settings.get_pos_settings",
		onSuccess(data) {
			if (data) {
				Object.assign(settings.value, data)
				isLoaded.value = true
				applyToRuntime()
			}
			isLoading.value = false
		},
		onError(error) {
			isLoading.value = false
		},
	})

	// ================================================================
	// Actions
	// ================================================================
	async function loadSettings(posProfile) {
		if (!posProfile) {
			return false
		}

		isLoading.value = true
		settings.value.pos_profile = posProfile

		// OPTIMIZATION: Check if bootstrap has preloaded the settings
		try {
			const bootstrapStore = useBootstrapStore()
			const preloadedSettings = bootstrapStore.getPreloadedPOSSettings()
			if (preloadedSettings && Object.keys(preloadedSettings).length > 0) {
				Object.assign(settings.value, preloadedSettings)
				isLoaded.value = true
				isLoading.value = false
				applyToRuntime()
				return true
			}
		} catch {
			// Bootstrap store may not be available, fall through to API call
		}

		// Fallback to API call
		try {
			await settingsResource.submit({ pos_profile: posProfile })
			return true
		} catch {
			return false
		}
	}

	function resetSettings() {
		settings.value = {
			// ---- Module: Core ----
			pos_profile: "",
			enabled: 0,

			// ---- Module: Billing & Payments ----
			allow_credit_sale: 0,
			allow_customer_credit_payment: 0,
			allow_write_off_change: 0,
			allow_partial_payment: 0,
			use_exact_amount: 0,
			disable_rounded_total: 1,
			default_payment_method: "",

			// ---- Module: Operations & Returns ----
			allow_sales_order: 0,
			allow_select_sales_order: 0,
			create_only_sales_order: 0,
			allow_return: 0,
			allow_return_without_invoice: 0,
			allow_free_batch_return: 0,
			allow_change_posting_date: 0,
			allow_submissions_in_background_job: 0,

			// ---- Module: Inventory & Stock ----
			allow_negative_stock: 0,
			allow_user_to_edit_rate: 0,
			input_qty: 0,
			show_variants_as_items: 0,
			cart_lifo: 0,

			// ---- Module: Catalog & Display ----
			default_card_view: 0,
			display_item_code: 0,
			display_discount_percentage: 0,
			display_discount_amount: 0,
			show_customer_balance: 0,
			hide_expected_amount: 0,

			// ---- Module: Discounts & Promotions ----
			max_discount_allowed: 0,
			use_percentage_discount: 0,
			allow_user_to_edit_additional_discount: 0,
			allow_user_to_edit_item_discount: 1,
			minimum_discount: 0,
			maximum_discount: 0,
			fetch_coupon: 0,

			// ---- Module: Taxation ----
			tax_regime: "standard",
			tax_inclusive: 0,
			decimal_precision: "2",
			tax_rounding_method: "standard",
			tax_registration_no: "",

			// ---- Module: Customers ----
			allow_customer_purchase_order: 0,
			allow_duplicate_customer_names: 0,
			require_customer_on_sale: 1,

			// ---- Module: Loyalty & Wallet ----
			enable_loyalty_program: 0,
			default_loyalty_program: "",
			wallet_account: "",
			auto_create_wallet: 1,
			loyalty_to_wallet: 1,

			// ---- Module: Invoicing & E-Documents ----
			invoice_format: "standard",

			// ---- Module: Printing & Peripherals ----
			allow_print_last_invoice: 0,
			allow_print_draft_invoices: 0,
			silent_print: 0,
			auto_kick_drawer_on_cash: 1,

			// ---- Module: Desktop & Recovery ----
			auto_save_open_invoice: 1,
			autosave_interval_seconds: 2,
			desktop_recent_invoices_count: 10,

			// ---- Module: Localization (country-agnostic, empty = auto/system) ----
			locale: "",
			timezone: "",
			currency: "",
			date_format: "yyyy-mm-dd",
			number_format: "#,###.##",
			rtl_support: 0,
			currency_symbol_position: "left",

			// ---- Module: Offline & Sync ----
			allow_delete_offline_invoice: 0,
			offline_sync_interval: 30,
			offline_cache_expiry_days: 30,

			// ---- Module: Search & Performance ----
			use_limit_search: 0,
			search_limit: 1000,

			// ---- Module: Security & Audit ----
			enable_session_lock: 0,
			session_lock_timeout: 5,
			audit_trail_enabled: 1,

			// ---- Module: Sales Team ----
			enable_sales_persons: "Disabled",

			// ---- Module: Delivery & Fulfillment ----
			use_delivery_charges: 0,
			auto_set_delivery_charges: 0,

			// ---- Module: Company & Branches ----
			company_name: "",
			company_logo: "",
			company_address: "",
			company_phone: "",
			company_email: "",
			company_tax_id: "",
			branch_name: "",
			branch_code: "",
			branch_address: "",

			// ---- Module: Compliance & E-Invoicing (generic) ----
			einvoice_enabled: 0,
			einvoice_framework: "none",
			einvoice_region: "",
			einvoice_provider: "",
			einvoice_registration_no: "",
			einvoice_transmission: "portal",
			food_safety_tracking: 0,
			data_retention_days: 3650,
			enable_zalina: 0,
			enable_sfd: 0,
		}
		isLoaded.value = false
		applyToRuntime()
	}

	/**
	 * Validate discount amount against max discount setting
	 * @param {number} discountPercentage - The discount percentage to validate
	 * @returns {boolean} - True if discount is allowed, false otherwise
	 */
	function validateDiscount(discountPercentage) {
		if (!isEnabled.value || maxDiscountAllowed.value === 0) {
			return true // No restriction if settings disabled or max = 0
		}

		return discountPercentage <= maxDiscountAllowed.value
	}

	/**
	 * Check if negative stock is allowed
	 * @returns {boolean} - True if negative stock is allowed
	 */
	function isNegativeStockAllowed() {
		return isEnabled.value && Boolean(settings.value.allow_negative_stock)
	}

	/**
	 * Check if stock validation should be enforced
	 * @returns {boolean} - True if stock validation should prevent negative stock
	 */
	function shouldEnforceStockValidation() {
		return isEnabled.value && !settings.value.allow_negative_stock
	}

	/**
	 * Check if minimum discount is allowed
	 * @param {number} discount - The discount percentage to validate
	 * @returns {boolean} - True if discount meets minimum requirement
	 */
	function validateMinimumDiscount(discount) {
		return discount >= minimumDiscount.value
	}

	/**
	 * Check if discount exceeds maximum allowed
	 * @param {number} discount - The discount percentage to validate
	 * @returns {boolean} - True if discount is within maximum limit
	 */
	function validateMaximumDiscount(discount) {
		return discount <= maximumDiscount.value
	}

	/**
	 * Get effective discount range (min to max)
	 * @returns {Object} - { min: number, max: number }
	 */
	function getDiscountRange() {
		return {
			min: minimumDiscount.value,
			max: maximumDiscount.value,
		}
	}

	/**
	 * Force reload settings from server
	 * This is called when settings are changed in the settings dialog
	 * to ensure all components have the latest settings immediately
	 */
	async function reloadSettings() {
		if (!settings.value.pos_profile) {
			return false
		}

		isLoading.value = true

		try {
			// Use submit with pos_profile to ensure proper reload
			await settingsResource.submit({ pos_profile: settings.value.pos_profile })
			return true
		} catch {
			return false
		}
	}

	/**
	 * Resolve a module to a list of { key, value, meta } field entries
	 * so the Settings UI can render per-module tabs.
	 * @param {string} moduleKey - Key from SETTINGS_MODULES
	 * @returns {Object|null} { module, fields }
	 */
	function getSettingsByModule(moduleKey) {
		const mod = SETTINGS_MODULES.find((m) => m.key === moduleKey)
		if (!mod) return null
		return {
			module: mod,
			fields: mod.fields.map((key) => ({
				key,
				value: settings.value[key],
				meta: SETTINGS_FIELDS[key] || { type: "text", labelKey: key },
			})),
		}
	}

	return {
		// State
		settings,
		isLoading,
		isLoaded,

		// Module registry (for the Settings UI)
		modules: SETTINGS_MODULES,
		fields: SETTINGS_FIELDS,

		// Computed — Billing & Payments
		allowCreditSale,
		allowCustomerCreditPayment,
		allowWriteOffChange,
		allowPartialPayment,
		useExactAmount,
		disableRoundedTotal,
		defaultPaymentMethod,

		// Computed — Operations & Returns
		allowSalesOrder,
		allowSelectSalesOrder,
		createOnlySalesOrder,
		allowReturn,
		allowReturnWithoutInvoice,
		allowFreeBatchReturn,
		allowChangePostingDate,
		allowSubmissionsInBackgroundJob,

		// Computed — Inventory & Stock
		allowNegativeStock,
		allowUserToEditRate,
		inputQty,
		showVariantsAsItems,
		cartLifo,

		// Computed — Catalog & Display
		defaultCardView,
		displayItemCode,
		displayDiscountPercentage,
		displayDiscountAmount,
		showCustomerBalance,
		hideExpectedAmount,

		// Computed — Discounts & Promotions
		isEnabled,
		maxDiscountAllowed,
		usePercentageDiscount,
		allowAdditionalDiscount,
		allowItemDiscount,
		minimumDiscount,
		maximumDiscount,
		fetchCoupon,

		// Computed — Taxation
		taxRegime,
		taxInclusive,
		decimalPrecision,
		taxRoundingMethod,
		taxRegistrationNo,

		// Computed — Customers
		allowCustomerPurchaseOrder,
		allowDuplicateCustomerNames,
		requireCustomerOnSale,

		// Computed — Loyalty & Wallet
		enableLoyaltyProgram,
		defaultLoyaltyProgram,
		walletAccount,
		autoCreateWallet,
		loyaltyToWallet,

		// Computed — Invoicing & E-Documents
		invoiceFormat,

		// Computed — Printing & Peripherals
		allowPrintLastInvoice,
		allowPrintDraftInvoices,
		silentPrint,
		autoKickDrawerOnCash,

		// Computed — Desktop & Recovery
		autoSaveOpenInvoice,
		autosaveIntervalSeconds,
		desktopRecentInvoicesCount,

		// Computed — Localization
		locale,
		timezone,
		currency,
		dateFormat,
		numberFormat,
		rtlSupport,
		currencySymbolPosition,

		// Computed — Offline & Sync
		allowDeleteOfflineInvoice,
		offlineSyncInterval,
		offlineCacheExpiryDays,

		// Computed — Search & Performance
		useLimitSearch,
		searchLimit,

		// Computed — Security & Audit
		enableSessionLock,
		sessionLockTimeout,
		auditTrailEnabled,

		// Computed — Sales Team
		enableSalesPersons,
		salesPersonsMode,
		isSingleSalesPerson,
		isMultipleSalesPersons,

		// Computed — Delivery & Fulfillment
		useDeliveryCharges,
		autoSetDeliveryCharges,

		// Computed — Company & Branches
		companyName,
		companyLogo,
		companyAddress,
		companyPhone,
		companyEmail,
		companyTaxId,
		branchName,
		branchCode,
		branchAddress,

		// Computed — Compliance & E-Invoicing (generic)
		einvoiceEnabled,
		enableEInvoice,
		einvoiceFramework,
		einvoiceRegion,
		einvoiceProvider,
		einvoiceRegistrationNo,
		einvoiceTransmission,
		foodSafetyTracking,
		dataRetentionDays,

		// Computed — Backward-compatible compliance getters
		enableZATCA,
		enableSFD,

		// Actions
		loadSettings,
		reloadSettings,
		resetSettings,
		applyToRuntime,
		getSettingsByModule,
		validateDiscount,
		isNegativeStockAllowed,
		shouldEnforceStockValidation,
		validateMinimumDiscount,
		validateMaximumDiscount,
		getDiscountRange,
	}
})
