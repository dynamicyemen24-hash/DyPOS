/**
 * Arabic translations for all dashboard UI text.
 * All dashboard titles, subtitles, chart labels, and UI strings
 * are translated here for RTL/Arabic support.
 *
 * Usage: Import translate() and use it for dynamic text replacement,
 * or hardcode Arabic strings directly in templates as shown in dashboard files.
 */

export const DASHBOARD_TRANSLATIONS = {
	// Dashboard page titles
	"Sales Dashboard": "لوحة مبيعات",
	"Real-time sales performance overview": "نظرة عامة على أداء المبيعات في الوقت الحقيقي",

	"Finance Dashboard": "لوحة المالية",
	"Cash flow, receivables, and financial health": "التدفق النقدي، والمستحقات، والصحة المالية",

	"Inventory Dashboard": "لوحة المخزون",
	"Stock levels, movement, and ABC analysis": "مستويات المخزون، والحركة، وتحليل ABC",

	"Customers Dashboard": "لوحة العملاء",
	"Customer analytics, segmentation, and retention": "تحليلات العملاء، والتجزئة، والاحتفاظ بهم",

	"Executive Dashboard": "لوحة التنفيذيين",
	"Business intelligence overview": "نظرة عامة على الذكاء التجاري",

	"Operations Dashboard": "لوحة العمليات",
	"Transaction performance, shifts, and payment analysis": "أداء المعاملات، والفترات، وتحليل الدفعات",

	// Chart card titles
	"Sales Trend": "اتجاه المبيعات",
	"Transactions Trend": "اتجاه المعاملات",
	"Category Breakdown": "تحليل التصنيفات",
	"Payment Methods": "طرق الدفع",
	"Hourly Pattern": "النمط الساعي",
	"Cash Flow Trend": "اتجاه التدفق النقدي",
	"Profit Trend": "اتجاه الربحية",
	"Receivables Aging": "تقادم المستحقات",
	"Payables Aging": "تقادم الدائن",
	"Payment Distribution": "توزيع الدفعات",
	"Customer Trend": "اتجاه العملاء",
	"Customer Segmentation": "تجزئة العملاء",
	"Revenue Distribution": "توزيع الإيرادات",
	"Customer Lifetime Value": "قيمة العميل مدى الحياة",
	"Customer Retention": "احتفاظ العملاء",
	"Stock Movement": "حركة المخزون",
	"ABC Analysis": "تحليل ABC",
	"Warehouse Distribution": "توزيع المستودعات",
	"Stock Value by Item": "قيمة المخزون بالصنف",
	"Revenue Overview": "نظرة عامة على الإيرادات",
	"Transactions Overview": "نظرة عامة على المعاملات",
	"Category Performance": "أداء التصنيفات",
	"Business Health": "صحة الأعمال",
	"Hourly Transaction Volume": "حجم المعاملات الساعي",
	"Daily Performance": "الأداء اليومي",
	"Transaction Status": "حالة المعاملة",
	"Top Products": "أهم المنتجات",
	"Shift Analysis": "تحليل الفترات",
	"Low Stock Alerts": "تنبيهات المخزون المنخفض",
	"Shift Analysis": "تحليل الفترات",
	"Recent Activity": "النشاط الأخير",

	// ChartCard empty/error states
	"No data available": "لا توجد بيانات متاحة",
	"Error loading chart": "خطأ في تحميل الرسم البياني",
	"Retry": "إعادة المحاولة",
	"Loading dashboard...": "جاري تحميل لوحة التحكم...",
	"Failed to load data": "فشل تحميل البيانات",
	"Data updated": "تم تحديث البيانات",

	// DashboardLayout
	"Export": "تصدير",
	"Auto": "تلقائي",
	"Retry": "إعادة المحاولة",
	"Loading dashboard...": "جاري تحميل لوحة التحكم...",
	"Skip to content": "انتقل إلى المحتوى",

	// KPI labels
	"Revenue": "الإيرادات",
	"Profit": "الربح",
	"Expenses": "المصروفات",
	"Cash Flow": "التدفق النقدي",
	"Sales": "المبيعات",
	"Transactions": "المعاملات",
	"Customers": "العملاء",
	"Orders": "الطلبات",

	// Date filters
	"From": "من",
	"To": "إلى",
	"Apply": "تطبيق",
	"Reset": "إعادة تعيين",

	// Toast messages
	"Exported as CSV": "تم التصدير كـ CSV",
	"Exported as Excel": "تم التصدير كـ Excel",
	"Exported as PDF": "تم التصدير كـ PDF",
	"Exporting as": "يتم التصدير كـ",
	"Exported": "تم التصدير",
	"Exported {name} as PDF-ready HTML": "تم تصدير {name} كـ HTML جاهز للـ PDF",

	// Time ago
	"just now": "الآن",
	"minute ago": "دقيقة مضت",
	"minutes ago": "دقائق مضت",
	"hour ago": "ساعة مضت",
	"hours ago": "ساعات مضت",
}

/**
 * Get Arabic translation for a key
 * @param {string} key - English text key
 * @returns {string} Arabic translation or original key
 */
export function translate(key) {
	return DASHBOARD_TRANSLATIONS[key] || key
}

/**
 * Apply Arabic translations to all dashboard elements
 * Call this function when the page loads with Arabic locale
 */
export function applyArabicTranslations() {
	if (typeof document === "undefined") return
	if (document.documentElement.dir !== "rtl") return

	document.querySelectorAll("[data-i18n-key]").forEach((el) => {
		const key = el.getAttribute("data-i18n-key")
		if (key && DASHBOARD_TRANSLATIONS[key]) {
			el.textContent = DASHBOARD_TRANSLATIONS[key]
		}
	})
}
