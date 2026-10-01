/**
 * تركيب القطاعات — تعريف واحد يربط نشاط المنشأة بالقدرات التي يحتاجها.
 *
 * الملف وصفي فقط: لا يحمّل شاشات ولا يجري اتصالًا. يمكن للميزات الحالية
 * والجديدة أن تقرأ القدرات المفعّلة دون معرفة نوع القطاع نفسه.
 */

export const CAPABILITIES = Object.freeze({
	PRODUCT: "product",
	SERVICE: "service",
	CUSTOMER: "customer",
	MEASUREMENT: "measurement",
	APPOINTMENT: "appointment",
	WORK_ORDER: "work_order",
	PRODUCTION: "production",
	RENTAL: "rental",
	SUBSCRIPTION: "subscription",
	PRESCRIPTION: "prescription",
	SERIAL_IMEI: "serial_imei",
	BATCH_EXPIRY: "batch_expiry",
	WEIGHING: "weighing",
	COMMISSION: "commission",
	DELIVERY: "delivery",
	BOOKING: "booking",
	LEDGER: "ledger",
	WORKFLOW: "workflow",
	DEVICE_IOT: "device_iot",
	OFFLINE: "offline",
})

export const CAPABILITY_LABELS = Object.freeze({
	[CAPABILITIES.PRODUCT]: "المنتجات",
	[CAPABILITIES.SERVICE]: "الخدمات",
	[CAPABILITIES.CUSTOMER]: "العملاء",
	[CAPABILITIES.MEASUREMENT]: "المقاسات",
	[CAPABILITIES.APPOINTMENT]: "المواعيد",
	[CAPABILITIES.WORK_ORDER]: "أوامر العمل",
	[CAPABILITIES.PRODUCTION]: "الإنتاج",
	[CAPABILITIES.RENTAL]: "التأجير",
	[CAPABILITIES.SUBSCRIPTION]: "الاشتراكات",
	[CAPABILITIES.PRESCRIPTION]: "الوصفات",
	[CAPABILITIES.SERIAL_IMEI]: "الأرقام التسلسلية",
	[CAPABILITIES.BATCH_EXPIRY]: "التشغيلات والصلاحية",
	[CAPABILITIES.WEIGHING]: "الوزن",
	[CAPABILITIES.COMMISSION]: "العمولات",
	[CAPABILITIES.DELIVERY]: "التوصيل",
	[CAPABILITIES.BOOKING]: "الحجوزات",
	[CAPABILITIES.LEDGER]: "الحسابات",
	[CAPABILITIES.WORKFLOW]: "سير العمل",
	[CAPABILITIES.DEVICE_IOT]: "الأجهزة",
	[CAPABILITIES.OFFLINE]: "العمل دون اتصال",
})

export const CAPABILITY_META = Object.freeze({
	[CAPABILITIES.PRODUCT]: { tier: "core", icon: "package" },
	[CAPABILITIES.SERVICE]: { tier: "core", icon: "briefcase" },
	[CAPABILITIES.CUSTOMER]: { tier: "core", icon: "users" },
	[CAPABILITIES.WORK_ORDER]: { tier: "workflow", icon: "clipboard" },
	[CAPABILITIES.PRODUCTION]: { tier: "workflow", icon: "layers" },
	[CAPABILITIES.WORKFLOW]: { tier: "workflow", icon: "git-branch" },
	[CAPABILITIES.LEDGER]: { tier: "core", icon: "book-open" },
	[CAPABILITIES.OFFLINE]: { tier: "platform", icon: "wifi-off" },
})

export const COMMERCE_MODULES = Object.freeze([
	{
		id: "catalog",
		label: "المنتجات والخدمات",
		icon: "package",
		capabilities: [CAPABILITIES.PRODUCT, CAPABILITIES.SERVICE],
	},
	{
		id: "customers",
		label: "العملاء",
		icon: "users",
		capabilities: [CAPABILITIES.CUSTOMER],
	},
	{
		id: "work-orders",
		label: "أوامر العمل",
		icon: "clipboard",
		capabilities: [CAPABILITIES.WORK_ORDER],
	},
	{
		id: "production",
		label: "الإنتاج",
		icon: "layers",
		capabilities: [CAPABILITIES.PRODUCTION],
	},
	{
		id: "appointments",
		label: "المواعيد والحجوزات",
		icon: "calendar",
		capabilities: [CAPABILITIES.APPOINTMENT, CAPABILITIES.BOOKING],
	},
	{
		id: "traceability",
		label: "التشغيلات والتتبع",
		icon: "shield",
		capabilities: [
			CAPABILITIES.BATCH_EXPIRY,
			CAPABILITIES.SERIAL_IMEI,
			CAPABILITIES.PRESCRIPTION,
		],
	},
	{
		id: "delivery",
		label: "التوصيل",
		icon: "truck",
		capabilities: [CAPABILITIES.DELIVERY],
	},
])

const CAPABILITY_DEPENDENCIES = Object.freeze({
	[CAPABILITIES.MEASUREMENT]: [CAPABILITIES.PRODUCT],
	[CAPABILITIES.APPOINTMENT]: [CAPABILITIES.CUSTOMER],
	[CAPABILITIES.WORK_ORDER]: [CAPABILITIES.CUSTOMER],
	[CAPABILITIES.PRODUCTION]: [CAPABILITIES.PRODUCT, CAPABILITIES.WORKFLOW],
	[CAPABILITIES.PRESCRIPTION]: [CAPABILITIES.PRODUCT, CAPABILITIES.CUSTOMER],
	[CAPABILITIES.COMMISSION]: [CAPABILITIES.CUSTOMER],
	[CAPABILITIES.DELIVERY]: [CAPABILITIES.CUSTOMER],
})

const profile = (id, name, description, capabilities, keywords = []) =>
	Object.freeze({
		id,
		name,
		description,
		capabilities: Object.freeze([...new Set(capabilities)]),
		keywords: Object.freeze(keywords),
	})

export const INDUSTRY_PROFILES = Object.freeze([
	profile(
		"retail",
		"متجر تجزئة",
		"بيع المنتجات وإدارة المخزون والعملاء والمدفوعات.",
		[CAPABILITIES.PRODUCT, CAPABILITIES.CUSTOMER, CAPABILITIES.LEDGER],
		["متجر", "تجزئة", "بقالة", "ملابس"],
	),
	profile(
		"tailoring",
		"الخياطة والملابس",
		"مقاسات وطلبات تفصيل ومراحل إنتاج وتسليم.",
		[
			CAPABILITIES.PRODUCT,
			CAPABILITIES.CUSTOMER,
			CAPABILITIES.MEASUREMENT,
			CAPABILITIES.WORK_ORDER,
			CAPABILITIES.PRODUCTION,
			CAPABILITIES.WORKFLOW,
			CAPABILITIES.LEDGER,
		],
		["خياطة", "تفصيل", "تطريز", "ملابس"],
	),
	profile(
		"pharmacy",
		"الصيدليات",
		"تشغيلات وصلاحية وبدائل وتنبيهات المخزون.",
		[
			CAPABILITIES.PRODUCT,
			CAPABILITIES.CUSTOMER,
			CAPABILITIES.BATCH_EXPIRY,
			CAPABILITIES.PRESCRIPTION,
			CAPABILITIES.WORKFLOW,
			CAPABILITIES.LEDGER,
		],
		["صيدلية", "دواء", "أدوية"],
	),
	profile(
		"workshop",
		"الورش وميكانيكا السيارات",
		"أوامر إصلاح ومركبات وفنيون وقطع غيار.",
		[
			CAPABILITIES.PRODUCT,
			CAPABILITIES.SERVICE,
			CAPABILITIES.CUSTOMER,
			CAPABILITIES.WORK_ORDER,
			CAPABILITIES.COMMISSION,
			CAPABILITIES.WORKFLOW,
			CAPABILITIES.LEDGER,
		],
		["ورشة", "سيارات", "ميكانيكا", "إصلاح"],
	),
	profile(
		"salon",
		"الصالونات والسبا",
		"مواعيد وخدمات وموظفون وعمولات وباقات.",
		[
			CAPABILITIES.PRODUCT,
			CAPABILITIES.SERVICE,
			CAPABILITIES.CUSTOMER,
			CAPABILITIES.APPOINTMENT,
			CAPABILITIES.SUBSCRIPTION,
			CAPABILITIES.COMMISSION,
			CAPABILITIES.LEDGER,
		],
		["صالون", "حلاق", "سبا", "تجميل"],
	),
	profile(
		"laundry",
		"المغاسل والتنظيف الجاف",
		"استلام وتتبع القطع والتسليم والوزن.",
		[
			CAPABILITIES.SERVICE,
			CAPABILITIES.CUSTOMER,
			CAPABILITIES.WORK_ORDER,
			CAPABILITIES.WEIGHING,
			CAPABILITIES.WORKFLOW,
			CAPABILITIES.DELIVERY,
			CAPABILITIES.LEDGER,
		],
		["مغسلة", "تنظيف", "كي"],
	),
	profile(
		"electronics",
		"الإلكترونيات والجوالات",
		"أرقام تسلسلية وضمان وإصلاح واستبدال.",
		[
			CAPABILITIES.PRODUCT,
			CAPABILITIES.SERVICE,
			CAPABILITIES.CUSTOMER,
			CAPABILITIES.SERIAL_IMEI,
			CAPABILITIES.WORK_ORDER,
			CAPABILITIES.WORKFLOW,
			CAPABILITIES.LEDGER,
		],
		["جوال", "إلكترونيات", "هاتف", "IMEI"],
	),
	profile(
		"construction",
		"مواد البناء والأدوات",
		"بيع بالوحدة والقياس والوزن مع التوصيل.",
		[
			CAPABILITIES.PRODUCT,
			CAPABILITIES.CUSTOMER,
			CAPABILITIES.MEASUREMENT,
			CAPABILITIES.WEIGHING,
			CAPABILITIES.DELIVERY,
			CAPABILITIES.LEDGER,
		],
		["مواد بناء", "أدوات", "متر", "طن"],
	),
	profile(
		"food",
		"الأغذية والمخابز",
		"إنتاج ووصفات وتشغيلات وطلبات مسبقة ووزن.",
		[
			CAPABILITIES.PRODUCT,
			CAPABILITIES.CUSTOMER,
			CAPABILITIES.PRODUCTION,
			CAPABILITIES.BATCH_EXPIRY,
			CAPABILITIES.WEIGHING,
			CAPABILITIES.DELIVERY,
			CAPABILITIES.LEDGER,
		],
		["مخبز", "حلويات", "مطعم", "غذاء"],
	),
])

export const DEFAULT_INDUSTRY_ID = "retail"

export function getIndustryProfile(id) {
	return (
		INDUSTRY_PROFILES.find((entry) => entry.id === id) ||
		INDUSTRY_PROFILES.find((entry) => entry.id === DEFAULT_INDUSTRY_ID)
	)
}

export function getCapabilitiesForIndustry(id) {
	return composeCapabilities([id])
}

export function composeCapabilities(industryIds = []) {
	const selected = new Set([CAPABILITIES.OFFLINE, CAPABILITIES.LEDGER])
	const pending = [...industryIds]

	while (pending.length) {
		const id = pending.shift()
		const industry = getIndustryProfile(id)
		for (const capability of industry.capabilities) {
			if (selected.has(capability)) continue
			selected.add(capability)
			for (const dependency of CAPABILITY_DEPENDENCIES[capability] || []) {
				if (!selected.has(dependency)) {
					selected.add(dependency)
				}
			}
		}
	}

	return [...selected]
}

export function getCapabilityDependencies(capability) {
	return CAPABILITY_DEPENDENCIES[capability] || []
}

export function getEnabledCommerceModules(capabilities = []) {
	const active = new Set(capabilities)
	return COMMERCE_MODULES.filter((module) =>
		module.capabilities.some((capability) => active.has(capability)),
	)
}

export function recommendIndustryProfiles(text, limit = 3) {
	const query = String(text ?? "")
		.trim()
		.toLocaleLowerCase("ar")
	if (!query) return []

	return INDUSTRY_PROFILES.map((entry) => ({
		...entry,
		matchScore: entry.keywords.reduce(
			(score, keyword) =>
				query.includes(keyword.toLocaleLowerCase("ar"))
					? score + keyword.length
					: score,
			0,
		),
	}))
		.filter((entry) => entry.matchScore > 0)
		.sort((a, b) => b.matchScore - a.matchScore)
		.slice(0, Math.max(1, limit))
}

export function suggestIndustryProfile(text) {
	return (
		recommendIndustryProfiles(text, 1)[0] ||
		getIndustryProfile(DEFAULT_INDUSTRY_ID)
	)
}
