/**
 * سياسة الوصول التشغيلية — المصدر الوحيد لربط العرض بالصلاحيات الفعلية.
 *
 * القاعدة (SAP): ما يُعرض يُشتق من دور المستخدم الفعلي (`sessionRole`) وقدرات
 * المشترك (`posContext` + ملف الصناعة)، لا من قوالب ثابتة. الخادم يبقى
 * المرجع fail-closed — هذا يشكّل الواجهة فقط.
 *
 * الحفاظ (S0): الدور الافتراضي/المجهول ("POS User") يرى كل شيء كما اليوم —
 * مالك المحل لا يُقفل خارج متجره. التضييق يطال الأدوار الصريحة فقط:
 *  - المشغّل (كاشير/بائع): بيع + قراءة، بلا إدارة وبلا سجل تدقيق.
 *  - المراجع (مراجع/محاسب): قراءة كل شيء بما فيه التدقيق، بلا إدارة.
 *  - الباقي (مدير/مشرف/مالك/مسؤول): كامل.
 */

export function normalizeRole(role) {
	return String(role ?? "")
		.trim()
		.toLowerCase()
}

const OPERATOR_ROLES = new Set([
	"cashier",
	"seller",
	"salesman",
	"كاشير",
	"بائع",
])
const AUDIT_ROLES = new Set([
	"auditor",
	"accountant",
	"reviewer",
	"internal-auditor",
	"مراجع",
	"محاسب",
	"مدقق",
])

export function isOperatorRole(role) {
	return OPERATOR_ROLES.has(normalizeRole(role))
}

export function isAuditRole(role) {
	return AUDIT_ROLES.has(normalizeRole(role))
}

/** قراءة فقط: المشغّل في شاشات العمل + المراجع في كل شيء. */
export function isReadOnlyRole(role) {
	const r = normalizeRole(role)
	return OPERATOR_ROLES.has(r) || AUDIT_ROLES.has(r)
}

/** رؤية الإدارة (الإعدادات/الأرصدة/المرجعية/الاستيراد): كل من ليس مشغّلًا ولا مراجعًا. */
export function canSeeAdmin(role) {
	const r = normalizeRole(role)
	return !OPERATOR_ROLES.has(r) && !AUDIT_ROLES.has(r)
}

/** سجل التدقيق: الجميع عدا المشغّل (المراجع يراه قراءة). */
export function canSeeScreen(screenId, role) {
	if (String(screenId ?? "") === "audit") return !isOperatorRole(role)
	return true
}

/** مسارات الإدارة في router.js — تُحرس بـ meta.adminOnly. */
const ADMIN_ROUTE_NAMES = new Set([
	"Settings",
	"OpeningBalances",
	"ReferenceData",
	"MasterDataImport",
])

export function isAdminRoute(routeName) {
	return ADMIN_ROUTE_NAMES.has(String(routeName ?? ""))
}

/**
 * بلاطات منصة التشغيل (الرئيسية). `to` لمسار مباشر، `screen` لشاشة عمل،
 * `capability: "queue"` لما تملكه اشتراكات بعينها، `adminOnly` للإدارة.
 */
export const HOME_MODULES = Object.freeze([
	{
		id: "pos",
		title: "نقطة البيع",
		sub: "بيع، دفع، خصومات وفواتير",
		icon: "shopping-cart",
		to: { name: "POSSale" },
		primary: true,
		permission: "pos.sell",
	},
	{
		id: "invoices",
		title: "الفواتير",
		sub: "مراجعة العمليات والمرتجعات",
		icon: "file-text",
		screen: "invoices",
		permission: "work.invoices",
	},
	{
		id: "stock",
		title: "المخزون",
		sub: "الأصناف والكميات والتنبيهات",
		icon: "package",
		to: { name: "StockManagement" },
		permission: "stock.view",
	},
	{
		id: "work",
		title: "شاشات العمل",
		sub: "عمليات المتجر اليومية",
		icon: "layers",
		to: { name: "WorkScreens" },
		permission: "work.view",
	},
	{
		id: "customers",
		title: "العملاء",
		sub: "بيانات العملاء وسجلاتهم",
		icon: "users",
		screen: "customers",
		permission: "work.customers",
	},
	{
		id: "settlements",
		title: "الورديات والتسويات",
		sub: "الأرصدة والفروقات والإغلاق",
		icon: "clipboard",
		screen: "settlements",
		permission: "work.settlements",
	},
	{
		id: "items",
		title: "دليل الأصناف",
		sub: "الأكواد والوحدات وحالة الصنف",
		icon: "box",
		screen: "items",
		permission: "work.items",
	},
	{
		id: "settings",
		title: "الإعدادات",
		sub: "تهيئة النظام والفرع",
		icon: "settings",
		to: { name: "Settings" },
		permission: "admin.settings",
		adminOnly: true,
	},
	{
		id: "queue",
		title: "الطوابير",
		sub: "إدارة خدمة العملاء",
		icon: "users",
		to: { name: "Queue" },
		permission: "queue.view",
		capability: "queue",
	},
])

/** عناصر تنقل قشرة اللوحة — نفس القاعدة. */
export const DASH_NAV = Object.freeze([
	{
		id: "pos",
		label: "نقطة البيع",
		to: { name: "POSSale" },
		icon: "shopping-cart",
	},
	{
		id: "invoices",
		label: "الفواتير",
		to: { name: "WorkScreens", query: { screen: "invoices" } },
		icon: "file-text",
	},
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
		icon: "layers",
	},
	{
		id: "settings",
		label: "الإعدادات",
		to: { name: "Settings" },
		icon: "settings",
		adminOnly: true,
	},
	{
		id: "queue",
		label: "الطوابير",
		to: { name: "Queue" },
		icon: "users",
		capability: "queue",
	},
])

function passesModuleGate(module, role, queueEnabled) {
	if (module.adminOnly && !canSeeAdmin(role)) return false
	if (module.capability === "queue" && !queueEnabled) return false
	return true
}

export function filterHomeModules({ role, queueEnabled = false } = {}) {
	return HOME_MODULES.filter((m) => passesModuleGate(m, role, queueEnabled))
}

export function filterDashNav({ role, queueEnabled = false } = {}) {
	return DASH_NAV.filter((m) => passesModuleGate(m, role, queueEnabled))
}

const ROLE_LABELS = {
	cashier: "كاشير",
	seller: "بائع",
	auditor: "مراجع",
	accountant: "محاسب",
	manager: "مدير",
	supervisor: "مشرف",
	owner: "مالك",
	admin: "مدير النظام",
	"pos user": "مستخدم",
}

/** تسمية الدور للعرض: المعروف يُترجم، المجهول يمر خامًا (لا معنى مخترعًا). */
export function roleLabel(role) {
	const raw = String(role ?? "").trim()
	if (!raw) return ""
	return ROLE_LABELS[normalizeRole(role)] ?? raw
}

/**
 * شرائح سياق التشغيل (من يعمل: مستخدم/دور/مشترك/فرع/وردية).
 * المجهول يُسقط — الشريحة الفارغة كذبة بصرية.
 */
export function opsContextItems({
	user,
	role,
	tenantName,
	branchName,
	shiftOpen,
} = {}) {
	const items = []
	if (user) items.push({ icon: "users", label: String(user) })
	const labeled = roleLabel(role)
	if (labeled) items.push({ icon: "shield", label: labeled })
	if (tenantName) items.push({ icon: "briefcase", label: String(tenantName) })
	if (branchName) items.push({ icon: "map-pin", label: String(branchName) })
	if (shiftOpen === true) items.push({ icon: "clock", label: "وردية مفتوحة" })
	else if (shiftOpen === false)
		items.push({ icon: "clock", label: "لا وردية مفتوحة" })
	return items
}
