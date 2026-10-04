/**
 * بروتوكول CAS / Digi Star.
 *
 * الإطار النموذجي (مطابق لمواصفات CAS التجارية):
 *
 *     <وضع>,<حالة>,<إشارة> <وزن><وحدة>
 *     ST,GS,+  1.234kg
 *
 * الحقول:
 *   - الوضع:  `ST` ثابت · `WT` وزن صافي · `T` وضع التصفير
 *   - الحالة: `GS` إجمالي مستقر · `GN` مستقر مع صافي · `US` غير مستقر
 *             · `MD` الحركة · `BT` خطأ
 *   - الإشارة: `+` أو `-` (إشارة سالبة بعد فرق التصفير، شائعة في أسواق
 *     البيع بالوزن)
 *
 * لماذا ملف مستقل لا سطر في محلّل عام: إطار CAS يحمل **حالة استقرار**
 * صريحة، وهذا أقوى ما تملكه الميزان لتقرير أن الحقل آمن للتعبئة التلقائية.
 * المحلّل العام لا يستطيع استنتاجها من رقم مجرد.
 */

import { convertToKilograms } from "@/utils/scale"

/** `ST,GS,+  1.234kg` — الوضع والحالة ثم الإشارة والوزن. */
const FRAME = /^([A-Z]{2}),([A-Z]{2}),([+-])\s*(\d+(?:\.\d+)?)\s*(kg|g|lb)\s*$/i

/** تُترجم رموز CAS إلى علامات منطقية يفهمها بقية النظام. */
const STATUS = {
	GS: { stable: true, net: false },
	GN: { stable: true, net: true },
	US: { stable: false, net: false },
	MD: { stable: false, net: false },
	BT: { stable: false, net: false, error: true },
}

export const id = "cas"
export const label = "CAS / Digi Star"
export const labelAr = "CAS / ديجي ستار"

/** هل هذا الإطار من CAS؟ الإطار storms مميّز ولا يطابق غيره. */
export function detect(frame) {
	return (
		typeof frame === "string" &&
		/^[A-Z]{2},[A-Z]{2},[+-]\s*\d/i.test(frame.trim())
	)
}

export function parse(frame) {
	const match = String(frame ?? "")
		.trim()
		.match(FRAME)
	if (!match) return { ok: false, reason: "cas-frame-mismatch", raw: frame }

	const [, mode, statusCode, sign, digits, unit] = match
	const status = STATUS[statusCode.toUpperCase()]
	if (!status) return { ok: false, reason: "cas-unknown-status", raw: frame }

	const magnitude = Number(digits)
	if (!Number.isFinite(magnitude)) {
		return { ok: false, reason: "cas-non-finite", raw: frame }
	}

	const negative = sign === "-"
	// الوزن المادي دائمًا قيمة مطلقة: إشارة CAS تصف إزاحة التصفير لا وزنًا
	// سالبًا، وإلا تحوّل تفريغ إلى مرتجع.
	const weightKg = convertToKilograms(magnitude, unit.toLowerCase())
	if (!Number.isFinite(weightKg)) {
		return { ok: false, reason: "cas-invalid-weight", raw: frame }
	}

	return {
		ok: true,
		weightKg,
		unit: unit.toLowerCase(),
		// Stability comes from the STATUS field only. The mode field is
		// two characters by the grammar above, so a "tare mode" check there
		// would be dead code pretending to be a safety rule.
		stable: status.stable === true,
		net: status.net === true || mode.toUpperCase() === "WT",
		error: status.error === true,
		negative,
		protocol: id,
		raw: frame,
	}
}

export default { id, label, labelAr, detect, parse }
