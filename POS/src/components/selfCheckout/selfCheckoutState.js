/**
 * الكاشير الذاتي — الثوابت والأدوات النقيّة (بلا Vue وبلا I/O).
 *
 * ملف وصفي بالكامل: كل ما تحتاجه الشاشة من تسميات وحالات وعمليات حسابية
 * صافية يعيش هنا، فتبقى الشاشة نفسها طبقة عرض فقط. هذا يعني أن أي أداة
 * احترافية ذكية تُضاف لاحقًا (قوائم ذكية، ترشيحات، باقات عضوية) تقرأ من
 * نفس المصدر بدل أن تحسب حسابها الخاص — وبذلك لا يوجد «حسابان للمال»
 * في الكاشير الذاتي كما في أي مكان آخر.
 *
 * كل المبالغ تتحرّك بوحدات هللة صحيحة، وحساب السطر يمرّ حصريًا عبر
 * `computeCartTotals` من `@/utils/money` (AGENTS.md invariant 3): لا يُعاد
 * هنا تقسيم ضريبة ولا تقريب مستقل.
 */
import { computeCartTotals } from "@/utils/money"

/** حالات دورة حياة جلسة الكاشير الذاتي. */
export const SESSION_STATES = Object.freeze({
	/** بانتظار بدء الزبون للجلسة. */
	IDLE: "idle",
	/** الجلسة مفتوحة والأصناف قابلة للإضافة. */
	OPEN: "open",
	/** الدفع قيد الاعتماد (لا تُقبل إضافات). */
	PAYING: "paying",
	/** الدفع اعتُمد — الإيصال جاهز. */
	PAID: "paid",
})

/** طرق الدفع المتاحة في الكاشير الذاتي. */
export const PAYMENT_METHODS = Object.freeze([
	{ id: "cash", label: "نقدًا", icon: "credit-card", keypad: true, availableOffline: true },
	{ id: "card", label: "بطاقة", icon: "credit-card", keypad: false, availableOffline: false, requiresIntegration: true },
	{ id: "wallet", label: "محفظة رقمية", icon: "smartphone", keypad: false, availableOffline: false, requiresIntegration: true },
	{ id: "transfer", label: "تحويل بنكي", icon: "repeat", keypad: false, availableOffline: false, requiresIntegration: true },
])

export const SELF_CHECKOUT_PAYMENT_INTEGRATION_MESSAGE = "هذه الطريقة تحتاج تكامل دفع معتمدًا؛ لا يمكن اعتمادها محليًا قبل تهيئة موفّر الدفع."

export const PAYMENT_LABELS = Object.freeze(
	Object.fromEntries(
		PAYMENT_METHODS.map((method) => [method.id, method.label]),
	),
)

/** يبحث عن طريقة دفع بالمعرّف (يعيد `null` بدل `undefined`). */
export function paymentMethodById(id) {
	return PAYMENT_METHODS.find((method) => method.id === id) ?? null
}

/**
 * خطوة الدفع لكل طريقة — كل واحدة لها إجراء مختلف فعليًا في المطاعم
 * والنوادي والمتاجر: النقد يحتاج حساب الباقي، البطاقة تحتاج آلة، المحفظة
 * تحتاج QR. الشاشة تعرض الخطوة الصحيحة بدل شاشة واحدة تُجمّع كل الحالات.
 */
export const PAYMENT_STEPS = Object.freeze({
	cash: "cash-drawer",
	card: "pin-pad",
	wallet: "qr-scan",
	transfer: "reference",
})

/** أقصى مبلغ نقدي مسموح بدفعة واحدة (حماية من تجاوز الحدّ الآمن). */
export const MAX_TENDER_MINOR = 100_000_000

/**
 * ترشيح الكتالوج بالاسم أو الرمز أو الباركود — بحث فوري محلي.
 * الفارغ يعني الكل؛ والغياب ليس خطأً بل قائمة فارغة صادقة.
 */
export function filterCatalog(rows = [], query = "") {
	const list = Array.isArray(rows) ? rows : []
	const needle = String(query ?? "").trim().toLocaleLowerCase()
	if (!needle) return list
	return list.filter((product) => {
		if (!product) return false
		return (
			String(product.name ?? "").toLocaleLowerCase().includes(needle) ||
			String(product.code ?? "").toLocaleLowerCase().includes(needle) ||
			String(product.barcode ?? "").toLocaleLowerCase().includes(needle)
		)
	})
}

/**
 * يوحّد شكل السطر: أي صنف يدخل من أي مسار (مسح/لمس/كتابة) يصبح السطر
 * نفسه، فتبقى الحسابات في مكان واحد.
 *
 * @param {object} product - الصنف بعد التطبيع (`normalizeProduct`).
 * @param {number} [qty=1]
 * @returns {{productId:string, code:string, name:string, qty:number, unitPriceMinor:number, taxRate:number, notes:string}|null}
 */
export function buildCartLine(product, qty = 1) {
	const quantity = Number(qty)
	if (!product?.id) return null
	if (!Number.isFinite(quantity) || quantity <= 0) return null
	const priceMinor = Math.round(Number(product.price ?? 0) * 100)
	if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) return null
	return {
		productId: String(product.id),
		code: String(product.code ?? product.id),
		name: String(product.name ?? "منتج"),
		qty: Math.round(quantity * 1000) / 1000,
		unitPriceMinor: priceMinor,
		taxRate: Number(product.taxRate ?? 0) || 0,
		uom: String(product.unit ?? product.uom ?? "PCS"),
		notes: "",
	}
}

/**
 * يضيف صنفًا للسلة أو يزيد كميته (السطر يتوحّد بالـ productId).
 * نقي: يُعيد سلة جديدة ولا يلمس حالة الشاشة.
 *
 * @param {Array} cart
 * @param {object} product
 * @param {number} [qty=1]
 * @returns {Array} سلة جديدة
 */
export function addLineToCart(cart, product, qty = 1) {
	const line = buildCartLine(product, qty)
	if (!line) return cart
	const next = [...(cart || [])]
	const index = next.findIndex((row) => row.productId === line.productId)
	if (index === -1) {
		next.push(line)
		return next
	}
	const existing = next[index]
	next[index] = {
		...existing,
		qty: Math.round((existing.qty + line.qty) * 1000) / 1000,
	}
	return next
}

/**
 * يغيّر كمية سطر. السطر يختفي عند البلوغ صفر — السلة الفارغة ليست «سطر
 * بكمية صفر» الذي يُطبع في الإيصال ويُربك الحساب.
 *
 * @param {Array} cart
 * @param {string} productId
 * @param {number} qty
 * @returns {Array}
 */
export function setLineQty(cart, productId, qty) {
	const id = String(productId)
	const quantity = Number(qty)
	return (cart || [])
		.map((line) =>
			line.productId === id
				? { ...line, qty: Math.round(quantity * 1000) / 1000 }
				: line,
		)
		.filter((line) => !(line.productId === id && !(line.qty > 0)))
}

/** يحذف سطرًا بالـ productId. */
export function removeLine(cart, productId) {
	const id = String(productId)
	return (cart || []).filter((line) => line.productId !== id)
}

/**
 * يحوّل سطور السلة إلى صيغة `computeCartTotals` (التي تتوقع `unitPrice`
 * بالريال لا بالهللة) — جسر واحد وواضح بين التمثيلين، بدل تحويل متشتت
 * في كل مكان.
 *
 * @param {Array} cart
 * @returns {Array<{qty:number, unitPrice:number, taxRate:number}>}
 */
export function toTotalsLines(cart) {
	return (cart || []).map((line) => ({
		...line,
		unitPrice: line.unitPriceMinor / 100,
	}))
}

/**
 * إجماليات السلة — الغلاف النظيف فوق `computeCartTotals`.
 * لا تُكتب حسابات هنا ولا في الشاشة.
 *
 * @param {Array} cart
 * @param {{discountAmount?:number, taxInclusive?:boolean}} [opts]
 * @returns {object} ناتج `computeCartTotals`
 */
export function summarizeCart(cart, opts = {}) {
	return computeCartTotals(toTotalsLines(cart), opts)
}

/**
 * حالة الدفع بعد إدخال مبلغ (بالهللة). الباقي لا يصبح سالبًا أبدًا،
 * والدفع الناقص صريح: «مدفوع جزئيًا» ليس «مدفوع».
 *
 * @param {number} totalMinor
 * @param {number} tenderMinor
 * @returns {{changeMinor:number, remainingMinor:number, paid:boolean, over:boolean, short:boolean, exact:boolean}}
 */
export function evaluateTender(totalMinor, tenderMinor) {
	const total = Math.round(Number(totalMinor) || 0)
	const tender = Math.round(Number(tenderMinor) || 0)
	if (total < 0) throw new Error("إجمالي غير صالح")
	if (tender < 0) throw new Error("المبلغ المدفوع غير صالح")
	if (tender > MAX_TENDER_MINOR)
		throw new Error("المبلغ المدفوع يتجاوز الحد الآمن")
	const difference = total - tender
	return {
		changeMinor: Math.max(0, -difference),
		remainingMinor: Math.max(0, difference),
		paid: difference <= 0,
		over: difference < 0,
		short: difference > 0,
		exact: difference === 0,
	}
}

/** ينتهي الدفع ويحرّر السلة. نقي. */
export function paidSession() {
	return { state: SESSION_STATES.PAID, cart: [] }
}

/** يلغي الجلسة ويُعيدها إلى الفراغ. */
export function idleSession() {
	return { state: SESSION_STATES.IDLE, cart: [] }
}

export default {
	SESSION_STATES,
	PAYMENT_METHODS,
	PAYMENT_LABELS,
	PAYMENT_STEPS,
	MAX_TENDER_MINOR,
	buildCartLine,
	addLineToCart,
	setLineQty,
	removeLine,
	toTotalsLines,
	summarizeCart,
	evaluateTender,
	paidSession,
	idleSession,
}
