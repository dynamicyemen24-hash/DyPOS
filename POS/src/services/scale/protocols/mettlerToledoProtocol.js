/**
 * بروتوكول Mettler-Toledo.
 *
 * ملاحظتان قبل الشكل: أسرة MT-SICS ترسل إطارًا بأبجدية واحدة
 * (SWeight / NetWeight) أو إطارًا مفهرسًا (Z / Z2 / Z3)، وأغلب موازين
 * المتاجر تستخدم الشكل الأبسط:
 *
 *     S+0001.234kg      إجمالي مستقر
 *     SI+0012.345 kg    إجمالي مستقر (مع مسافة)
 *     S-0001.234kg      إشارة سالبة بعد تصفير
 *     D+0001.234kg      غير مستقر (D = dynamic)
 *     N+0001.234kg      صافي
 *
 * الحرف الأول هو المؤشر: S مستقر · N صافي · D غير مستقر · T تصفير.
 *
 * **فارق مهم عن CAS**: بعض إعدادات MT تُرسل الوزن **بدون وحدة** لأن الوحدة
 * مُعرَّفة مسبقًا في كابل التوصيل. لذلك `withoutUnit: true` في هذا البروتوكول
 * هو وضع أصيل لا افتراض، والوحدة تُفترض كجم (وحدة retail افتراضية) مع
 * الإبقاء على `unitAssumed` في النتيجة حتى لا يدّعي HAL ما لم يقله الميزان.
 */

import { convertToKilograms } from "@/utils/scale"

/** S / SI / N / D / T — ثم الإشارة والوزن، والوحدة اختيارية في هذه الأسرة. */
const FRAME = /^([SNDT])\s*([+-])\s*(\d+(?:\.\d+)?)\s*(kg|g|lb)?\s*$/i

/** المؤشر → (مستقر، صافي). */
const STATE = {
	S: { stable: true, net: false },
	N: { stable: true, net: true },
	D: { stable: false, net: false },
	T: { stable: false, net: false, taring: true },
}

export const id = "mettler-toledo"
export const label = "Mettler-Toledo"
export const labelAr = "ميتلر-توليدو"
export const withoutUnit = true

/** `S+12.34` · `SI+ 1.234 kg` — المؤشر يسبق الإشارة رقميًا. */
export function detect(frame) {
	return (
		typeof frame === "string" && /^[SNDT]I?\s*[+-]\s*\d/i.test(frame.trim())
	)
}

export function parse(frame) {
	const match = String(frame ?? "")
		.trim()
		.match(FRAME)
	if (!match) return { ok: false, reason: "mt-frame-mismatch", raw: frame }

	const [, stateCode, sign, digits, rawUnit] = match
	const state = STATE[stateCode.toUpperCase()]
	if (!state) return { ok: false, reason: "mt-unknown-state", raw: frame }

	const magnitude = Number(digits)
	if (!Number.isFinite(magnitude)) {
		return { ok: false, reason: "mt-non-finite", raw: frame }
	}

	// لا وحدة في الإطار ⇒ kilogram حسب إعداد الكابل، لا حسب خيال HAL.
	const unit = rawUnit ? rawUnit.toLowerCase() : "kg"
	const weightKg = convertToKilograms(magnitude, unit)
	if (!Number.isFinite(weightKg)) {
		return { ok: false, reason: "mt-invalid-weight", raw: frame }
	}

	return {
		ok: true,
		weightKg,
		unit,
		unitAssumed: !rawUnit,
		stable: state.stable === true,
		net: state.net === true,
		error: false,
		taring: state.taring === true,
		negative: sign === "-",
		protocol: id,
		raw: frame,
	}
}

export default { id, label, labelAr, detect, parse, withoutUnit }
