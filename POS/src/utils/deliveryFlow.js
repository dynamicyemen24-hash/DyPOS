/**
 * DeliveryFlow — آلة حالات طلب التوصيل وحسابات الشركاء (منطق نقي).
 *
 * دورة حياة الطلب:
 *   pending → assigned → out_for_delivery → delivered
 *      ↘ cancelled (من pending/assigned فقط)
 *
 * مبدأ SAP: كل انتقال حالة يُسجَّل بطابع زمني، والإلغاء مقيد قبل الإرسال
 * حتى لا يضيع سائق في الطريق لطلبٍ ملغي.
 */

export const DELIVERY_STATUS = Object.freeze({
	PENDING: "pending", // بانتظار إسناد سائق
	ASSIGNED: "assigned", // سائق مُسند
	OUT_FOR_DELIVERY: "out_for_delivery", // في الطريق
	DELIVERED: "delivered", // تم التسليم
	CANCELLED: "cancelled", // ملغي
})

export const STATUS_LABELS = Object.freeze({
	[DELIVERY_STATUS.PENDING]: "بانتظار الإسناد",
	[DELIVERY_STATUS.ASSIGNED]: "سائق مُسند",
	[DELIVERY_STATUS.OUT_FOR_DELIVERY]: "في الطريق",
	[DELIVERY_STATUS.DELIVERED]: "تم التسليم",
	[DELIVERY_STATUS.CANCELLED]: "ملغي",
})

/** انتقالات الحالات المسموحة: الحالة ← الحالات التالية. */
const TRANSITIONS = Object.freeze({
	[DELIVERY_STATUS.PENDING]: [
		DELIVERY_STATUS.ASSIGNED,
		DELIVERY_STATUS.CANCELLED,
	],
	[DELIVERY_STATUS.ASSIGNED]: [
		DELIVERY_STATUS.OUT_FOR_DELIVERY,
		DELIVERY_STATUS.CANCELLED,
	],
	[DELIVERY_STATUS.OUT_FOR_DELIVERY]: [DELIVERY_STATUS.DELIVERED],
	[DELIVERY_STATUS.DELIVERED]: [],
	[DELIVERY_STATUS.CANCELLED]: [],
})

/** حقول الطابع الزمني لكل انتقال. */
const TRANSITION_TIMESTAMP_FIELDS = Object.freeze({
	[DELIVERY_STATUS.ASSIGNED]: "assignedAt",
	[DELIVERY_STATUS.OUT_FOR_DELIVERY]: "dispatchedAt",
	[DELIVERY_STATUS.DELIVERED]: "deliveredAt",
	[DELIVERY_STATUS.CANCELLED]: "cancelledAt",
})

/**
 * هل الانتقال من حالة إلى أخرى مسموح؟
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransition(from, to) {
	return (TRANSITIONS[from] || []).includes(to)
}

/**
 * التحقق من انتقال حالة الطلب وإرجاع الرقع المطلوبة.
 * @param {Object} order - طلب التوصيل الحالي.
 * @param {string} to - الحالة الجديدة.
 * @param {Object} [extra] - حقول إضافية (driverId مثلاً).
 * @param {number|string|Date} [now] - لحظة الانتقال.
 * @returns {{ok: boolean, error?: string, patch: Object}}
 */
export function transitionDeliveryOrder(
	order,
	to,
	extra = {},
	now = new Date(),
) {
	if (!order) {
		return { ok: false, error: "الطلب غير موجود", patch: {} }
	}
	if (!canTransition(order.status, to)) {
		return {
			ok: false,
			error: `انتقال غير مسموح من "${STATUS_LABELS[order.status] || order.status}" إلى "${STATUS_LABELS[to] || to}"`,
			patch: {},
		}
	}

	const patch = { status: to, updatedAt: new Date(now).toISOString() }
	const timestampField = TRANSITION_TIMESTAMP_FIELDS[to]
	if (timestampField) patch[timestampField] = new Date(now).toISOString()

	// إسناد السائق أو تغييره يُحدَّث ضمن نفس الرقعة
	if (extra.driverId !== undefined) patch.driverId = extra.driverId
	if (extra.note !== undefined) patch.note = extra.note

	return { ok: true, patch }
}

/**
 * حساب عمولة الوسيط على الفاتورة.
 * @param {number} amount - قيمة الفاتورة (صافي).
 * @param {number} ratePercent - نسبة العمولة (0-100).
 * @param {Object} [opts] - { minCommission, maxCommission } بالعملة.
 * @returns {{commission: number, rate: number, appliedCap: string|null}}
 */
export function calcIntermediaryCommission(amount, ratePercent, opts = {}) {
	const total = Number(amount) || 0
	const rate = Math.min(Math.max(Number(ratePercent) || 0, 0), 100)
	let commission = (total * rate) / 100
	let appliedCap = null

	if (opts.minCommission != null && commission < Number(opts.minCommission)) {
		commission = Number(opts.minCommission)
		appliedCap = "min"
	}
	if (opts.maxCommission != null && commission > Number(opts.maxCommission)) {
		commission = Number(opts.maxCommission)
		appliedCap = "max"
	}

	// تقريب مالي آمن لأقرب قرشين
	commission = Math.round(commission * 100) / 100
	return { commission, rate, appliedCap }
}

/**
 * إجمالي طلب التوصيل = إجمالي الفاتورة + رسوم التوصيل − أي خصم توصيل.
 * @param {Object} opts - { invoiceTotal, deliveryFee, deliveryDiscount }
 * @returns {number}
 */
export function calcDeliveryTotal({
	invoiceTotal = 0,
	deliveryFee = 0,
	deliveryDiscount = 0,
} = {}) {
	const total =
		(Number(invoiceTotal) || 0) +
		(Number(deliveryFee) || 0) -
		(Number(deliveryDiscount) || 0)
	return Math.max(0, Math.round(total * 100) / 100)
}

/**
 * هل يمكن إسناد السائق؟ (متاح فقط — ليس مشغولًا أو معطلًا)
 * @param {Object} driver
 * @returns {boolean}
 */
export function isDriverAvailable(driver) {
	if (!driver || driver.status === "offline" || driver.status === "busy") {
		return false
	}
	return true
}

export default {
	DELIVERY_STATUS,
	STATUS_LABELS,
	canTransition,
	transitionDeliveryOrder,
	calcIntermediaryCommission,
	calcDeliveryTotal,
	isDriverAvailable,
}
