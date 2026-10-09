/**
 * قاموس الإجراءات الموحد + محرك السياق — المصدر الوحيد للأوامر.
 *
 * القاعدة المؤسسية: الواجهة ليست مجموعة أزرار مستقلة، بل طبقة تحوّل حالة
 * النظام الحقيقية (الشاشة + السجل + الدور + المصدر) إلى إجراءات مناسبة —
 * دون اختلاق بيانات أو نتائج أو صلاحيات. كل إجراء مسجّل هنا فقط إذا كان له
 * معالج فعلي اليوم؛ زر بلا معالج كذبة، لا ميزة.
 *
 * - `ACTIONS`: id ثابت، تسمية عربية، أيقونة Feather (تُتحقق بالاختبار)، نوع
 *   (primary/secondary/nav/danger)، صلاحية، سياسة تأكيد (none/explicit)،
 *   وعدم تكرار (idempotent + آلية المنع الموثقة).
 * - `resolveStripActions`: إجراءات شريط السجلات بالترتيب الثابت
 *   (رئيسي ← ثانوي) مع سبب التعطيل — يُعرض كـ title لا صمتًا.
 * - `normalizeRecordState`: حالات السجل (مدفوع/مسودة/ملغي…) — الملغي تاريخ
 *   للقراءة والطباعة والتصدير، ولا إجراء مدمر مسجّل أصلًا.
 */

export const ACTION_KINDS = Object.freeze(["primary", "secondary", "nav", "danger"])
export const CONFIRM_POLICIES = Object.freeze(["none", "explicit"])

export const ACTIONS = Object.freeze({
	"record.refresh": {
		label: "تحديث",
		icon: "refresh-cw",
		kind: "primary",
		permission: "work.view",
		confirm: "none",
		idempotent: true,
	},
	"record.exportCsv": {
		label: "تصدير CSV",
		icon: "download",
		kind: "secondary",
		permission: "work.view",
		confirm: "none",
		idempotent: true,
	},
	"record.print": {
		label: "طباعة",
		icon: "printer",
		kind: "secondary",
		permission: "work.view",
		confirm: "none",
		idempotent: true,
	},
	"record.open": {
		label: "عرض التفاصيل",
		icon: "eye",
		kind: "secondary",
		permission: "work.view",
		confirm: "none",
		idempotent: true,
	},
	"sale.new": {
		label: "بدء بيع جديد",
		icon: "shopping-cart",
		kind: "primary",
		permission: "pos.sell",
		confirm: "none",
		idempotent: true,
	},
	// اعتماد البيع: حارس الطيران `paymentProcessing` في POSSale (فحص + finally)
	// يمنع النقر المزدوج، والخادم idempotent (v39 + idempotency.test.js) —
	// فإعادة الإرسال لا تنشئ فاتورة ثانية.
	"sale.complete": {
		label: "اعتماد البيع",
		icon: "check",
		kind: "primary",
		permission: "pos.sell",
		confirm: "none",
		idempotent: true,
	},
	"ops.logout": {
		label: "إنهاء الجلسة",
		icon: "log-out",
		kind: "danger",
		permission: "session.own",
		confirm: "none",
		idempotent: true,
	},
	"sys.share": {
		label: "مشاركة النظام",
		icon: "share-2",
		kind: "secondary",
		permission: "session.own",
		confirm: "none",
		idempotent: true,
	},
	"nav.pos": { label: "نقطة البيع", icon: "shopping-cart", kind: "nav", permission: "pos.sell", confirm: "none", idempotent: true, route: "POSSale" },
	"nav.invoices": { label: "الفواتير", icon: "file-text", kind: "nav", permission: "work.invoices", confirm: "none", idempotent: true, route: "WorkScreens", screen: "invoices" },
	"nav.stock": { label: "المخزون", icon: "package", kind: "nav", permission: "stock.view", confirm: "none", idempotent: true, route: "StockManagement" },
	"nav.work": { label: "شاشات العمل", icon: "layers", kind: "nav", permission: "work.view", confirm: "none", idempotent: true, route: "WorkScreens" },
	"nav.customers": { label: "العملاء", icon: "users", kind: "nav", permission: "work.customers", confirm: "none", idempotent: true, route: "WorkScreens", screen: "customers" },
	"nav.settlements": { label: "الورديات والتسويات", icon: "clipboard", kind: "nav", permission: "work.settlements", confirm: "none", idempotent: true, route: "WorkScreens", screen: "settlements" },
	"nav.items": { label: "دليل الأصناف", icon: "box", kind: "nav", permission: "work.items", confirm: "none", idempotent: true, route: "WorkScreens", screen: "items" },
	"nav.settings": { label: "الإعدادات", icon: "settings", kind: "nav", permission: "admin.settings", confirm: "none", idempotent: true, route: "Settings" },
	"nav.queue": { label: "الطوابير", icon: "users", kind: "nav", permission: "queue.view", confirm: "none", idempotent: true, route: "Queue" },
})

export function describeAction(id) {
	return ACTIONS[id] ?? null
}

/** حالات السجل المعروفة (StatusBadge) — ما عداها يمر خامًا بلا معنى مخترع. */
const VOID_STATES = new Set(["voided", "cancelled", "ملغي", "ملغاة", "void"])

export function normalizeRecordState(status) {
	const raw = String(status ?? "").trim().toLowerCase()
	if (VOID_STATES.has(raw)) return "voided"
	if (raw === "draft" || raw === "مسودة") return "draft"
	if (raw === "paid" || raw === "مدفوع") return "paid"
	return raw || "unknown"
}

/**
 * إجراءات شريط السجلات بالترتيب الثابت: رئيسي (تحديث) ← ثانوي.
 * القواعد (SAP): التحميل يجمّد الكل، وانعدام المصدر يبقي التحديث وحده،
 * وغياب الصفوف يمنع التصدير والطباعة — كل منع بسبب معلن.
 */
export function resolveStripActions({ loading = false, hasRows = false, source = "" } = {}) {
	const defs = [
		{ id: "record.refresh", shortcut: undefined },
		{ id: "record.exportCsv", shortcut: "ctrl+s" },
		{ id: "record.print", shortcut: undefined },
	]
	if (loading) {
		return defs.map((d) => ({ ...ACTIONS[d.id], id: d.id, shortcut: d.shortcut, disabled: true, reason: "جارٍ التحميل…" }))
	}
	if (!source || source === "unavailable") {
		return defs.map((d) => ({
			...ACTIONS[d.id],
			id: d.id,
			shortcut: d.shortcut,
			disabled: d.id !== "record.refresh",
			reason: d.id === "record.refresh" ? undefined : "لا مصدر للبيانات",
		}))
	}
	if (!hasRows) {
		return defs.map((d) => ({
			...ACTIONS[d.id],
			id: d.id,
			shortcut: d.shortcut,
			disabled: d.id !== "record.refresh",
			reason: d.id === "record.refresh" ? undefined : "لا سجلات",
		}))
	}
	return defs.map((d) => ({ ...ACTIONS[d.id], id: d.id, shortcut: d.shortcut, disabled: false, reason: undefined }))
}
