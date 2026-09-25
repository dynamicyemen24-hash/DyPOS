/**
 * إعدادات التنقل الموحد لشاشات العمل.
 *
 * Arabic-first: كل التسميات عربية. الأيقونات أسماء FeatherIcon.
 * الصلاحية اختيارية (permission) وتُستخدم لإخفاء العنصر فقط —
 * التحقق الحقيقي يبقى في السيرفر (fail-closed).
 */

export const WORK_NAV_SECTIONS = Object.freeze([
	{
		id: "sell",
		title: "البيع",
		items: [
			{
				id: "pos",
				label: "نقطة البيع",
				to: { name: "POSSale" },
				icon: "shopping-cart",
				exact: true,
			},
			{
				id: "invoices",
				label: "الفواتير",
				to: { name: "WorkScreens", query: { screen: "invoices" } },
				icon: "file-text",
			},
		],
	},
	{
		id: "manage",
		title: "الإدارة",
		items: [
			{
				id: "stock",
				label: "المخزون",
				to: { name: "StockManagement" },
				icon: "package",
			},
			{
				id: "reports",
				label: "التقارير",
				to: { name: "Reports" },
				icon: "bar-chart-2",
			},
			{
				id: "work",
				label: "شاشات العمل",
				to: { name: "WorkScreens" },
				icon: "layout",
			},
		],
	},
])

/** كل عناصر التنقل مسطّحة للبحث عن العنصر النشط. */
export function flatWorkNav() {
	return WORK_NAV_SECTIONS.flatMap((section) =>
		section.items.map((item) => ({ ...item, section: section.id })),
	)
}

/** هل مسار التنقل يطابق المسار الحالي؟ */
export function isNavActive(item, route) {
	if (!item?.to || !route) return false
	if (item.exact) return route.name === item.to.name
	if (route.name !== item.to.name) return false
	const wantScreen = item.to.query?.screen
	if (!wantScreen) return true
	return route.query?.screen === wantScreen
}
