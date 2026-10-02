/**
 * شاشات العمل — السجل Declarative.
 *
 * كل شاشة تُعرَّف ببيانات فقط (أعمدة + مصدر + صلاحية)؛ الصفحة `WorkScreens.vue`
 * تبني الشبكة والأدوات والحالات من هذا السجل. السبب: حين تُعرَّف الشاشة مرتين
 * (صفحة + سجل) تنحرف الأعمدة عن المصدر بصمت، والتعديل يحتاج مكانًا واحدًا.
 *
 * مصادر البيانات تحترم عقد الإقامة-أوّلًا (AGENTS.md invariant 9): القائمة
 * تُقرأ من السيرفر عبر `methodGetListWithSource`، وإن تعذّر فترجع للمرآة المحلية
 * مع `source = local`، وإلا `unavailable` — لا "قائمة فارغة" تُقدَّم كقياس.
 * الشاشة `stock` استثناء موثّق: مصدره مستودع المخزون المحلي (Dexie) لأن
 * حدّ إعادة الطلب يعتمد على التوفر المحسوب محليًا.
 */
import { methodGetListWithSource } from "@/utils/methodClient"
import { productRepository } from "@/repositories/productRepository"

const money = (row) => Number(row?.grand_total ?? row?.total ?? 0)
const amount = (field) => (row) => Number(row?.[field] ?? 0).toFixed(2)

/** @type {ReadonlyArray<{id:string,label:string,emptyTitle:string,icon:string,doctype:string,permission:string,orderBy:string,columns:Array<object>,load:Function}>} */
export const WORK_SCREENS = Object.freeze([
	{
		id: "invoices",
		label: "الفواتير",
		emptyTitle: "لا توجد فواتير",
		icon: "file-text",
		doctype: "Sales Invoice",
		permission: "work.invoices",
		orderBy: "creation desc",
		columns: [
			{ key: "name", label: "رقم الفاتورة", frozen: "right", sortable: true },
			{ key: "customer_name", label: "العميل", sortable: true },
			{
				key: "posting_date",
				label: "التاريخ",
				sortable: true,
				format: (row) => String(row?.posting_date ?? "—").slice(0, 10),
			},
			{
				key: "grand_total",
				label: "الإجمالي",
				align: "end",
				sortable: true,
				aggregate: "sum",
				format: (row) => money(row).toFixed(2),
			},
			{ key: "status", label: "الحالة", filterable: true },
		],
		load: (limit) =>
			methodGetListWithSource("Sales Invoice", {
				fields: [
					"name",
					"customer_name",
					"posting_date",
					"grand_total",
					"status",
				],
				orderBy: "creation desc",
				limit,
			}),
	},
	{
		id: "items",
		label: "الأصناف",
		emptyTitle: "لا توجد أصناف",
		icon: "package",
		doctype: "Item",
		permission: "work.items",
		orderBy: "modified desc",
		columns: [
			{ key: "item_code", label: "الكود", frozen: "right", sortable: true },
			{
				key: "item_name",
				label: "اسم الصنف",
				sortable: true,
				filterable: true,
			},
			{ key: "stock_uom", label: "الوحدة" },
			{ key: "disabled", label: "متوقف", filterable: true },
		],
		load: (limit) =>
			methodGetListWithSource("Item", {
				fields: ["item_code", "item_name", "stock_uom", "disabled"],
				orderBy: "modified desc",
				limit,
			}),
	},
	{
		id: "customers",
		label: "العملاء",
		emptyTitle: "لا يوجد عملاء",
		icon: "users",
		doctype: "Customer",
		permission: "work.customers",
		orderBy: "modified desc",
		columns: [
			{ key: "name", label: "العميل", frozen: "right", sortable: true },
			{ key: "customer_name", label: "الاسم", filterable: true },
			{ key: "mobile_no", label: "الجوال" },
			{ key: "email_id", label: "البريد" },
		],
		load: (limit) =>
			methodGetListWithSource("Customer", {
				fields: ["name", "customer_name", "mobile_no", "email_id"],
				orderBy: "modified desc",
				limit,
			}),
	},
	{
		id: "settlements",
		label: "التسويات",
		emptyTitle: "لا توجد تسويات",
		icon: "clipboard",
		doctype: "POS Opening Shift",
		permission: "work.settlements",
		orderBy: "creation desc",
		columns: [
			{ key: "name", label: "رقم الوردية", frozen: "right", sortable: true },
			{ key: "terminal_id", label: "الطرفية", sortable: true },
			{
				key: "opening_cash",
				label: "رصيد الافتتاح",
				align: "end",
				format: amount("opening_cash"),
			},
			{
				key: "closing_cash",
				label: "الرصيد الفعلي",
				align: "end",
				sortable: true,
				format: amount("closing_cash"),
			},
			{
				key: "expected_cash",
				label: "المتوقع",
				align: "end",
				sortable: true,
				format: amount("expected_cash"),
			},
			{
				key: "variance",
				label: "الفرق",
				align: "end",
				sortable: true,
				format: amount("variance"),
			},
			{ key: "status", label: "الحالة", filterable: true },
			{
				key: "closed_at",
				label: "تاريخ الإغلاق",
				sortable: true,
				format: (row) =>
					String(row?.closed_at ?? "—")
						.slice(0, 19)
						.replace("T", " "),
			},
		],
		load: (limit) =>
			methodGetListWithSource("POS Opening Shift", {
				fields: [
					"name",
					"terminal_id",
					"opening_cash",
					"closing_cash",
					"expected_cash",
					"variance",
					"status",
					"closed_at",
				],
				orderBy: "creation desc",
				limit,
			}),
	},
	{
		id: "stock",
		label: "تنبيه المخزون",
		emptyTitle: "لا يوجد صنف بحاجة إلى إعادة طلب",
		icon: "alert-triangle",
		doctype: "Item",
		permission: "work.stock",
		orderBy: "",
		/** Local-first by design: the threshold comparison needs local quantities. */
		localOnly: true,
		columns: [
			{ key: "item_code", label: "الكود", frozen: "right" },
			{ key: "item_name", label: "الصنف" },
			{ key: "available", label: "المتاح", align: "end" },
			{ key: "reorder_level", label: "حد إعادة الطلب", align: "end" },
		],
		load: async (limit) => {
			const rows = await productRepository.lowStock(limit)
			return { rows, source: "local", error: null }
		},
	},
])

/** Finds a screen by id, falling back to the first one (never `undefined`). */
export function workScreenById(id) {
	return WORK_SCREENS.find((screen) => screen.id === id) ?? WORK_SCREENS[0]
}
