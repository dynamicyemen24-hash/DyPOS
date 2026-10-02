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
			{
				// الكشك نفسه: مسار قابل للوصول من التنقل، لا رابط ميت.
				// `to: { name }` بلا `capability` لأن الكاشير الذاتي يخدم
				// كل قطاع (مطعم/نادٍ/متجر/منشأة خدمة) — القدرات تصف
				// ما يُباع لا كيف يُدفع.
				id: "self-checkout",
				label: "الكاشير الذاتي",
				to: { name: "SelfCheckout" },
				icon: "smartphone",
			},
			{
				// الطابور: يُصدر التذكرة ويزنّها للكاونتر. خدمة لكل قطاع
				// فيه تدفّق نقدي (مطعم، نادٍ، عيادة، ورشة) فبذاته في
				// «البيع» لا «الإدارة».
				id: "queue",
				label: "الطوابير",
				to: { name: "Queue" },
				icon: "list-ordered",
			},
			{
				id: "third-party-sales",
				label: "البيع بالنيابة",
				to: { name: "ThirdPartySales" },
				icon: "repeat",
				capability: "third_party_sale",
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
				capability: "product",
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
			{
				id: "settings",
				label: "الإعدادات العامة",
				to: { name: "Settings" },
				icon: "settings",
			},
			{
				id: "settlements",
				label: "التسويات",
				to: { name: "WorkScreens", query: { screen: "settlements" } },
				icon: "clipboard",
			},
			{
				id: "opening-balances",
				label: "الأرصدة الافتتاحية",
				to: { name: "OpeningBalances" },
				icon: "book",
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
