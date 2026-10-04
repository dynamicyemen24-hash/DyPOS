/**
 * بروتوكول Zebra / Avery Berkel / Symmetric (بث متصل).
 *
 * هذه موازين **لا ترسل إطارًا**، بل تبث رقمًا كل جزء من الثانية بلا حدود
 * واضحة — «streaming mode» في أدبيات هذه الشركات. لذلك لا يوجد `ST` ولا
 * فاصلة: المسألة كلها **حدود الإطار**، وهي حدود يحدّدها HAL (نقل) لا
 * البروتوكول. ما هنا هو تقطيع **السطر** واستخراج الرقم منه.
 *
 *     "  12.345 kg\r\n"
 *
 * الفروق العملية عن CAS/MT:
 *   - **لا حالة استقرار في الإطار.** البثّ = القراءة تتغيّر دائمًا، وHAL
 *     يستنتج الاستقرار بالتكرار (انظر `isSettled` في خدمة الميزان) وهذا
 *     استنتاج صريح، لا ادّعاء من الميزان.
 *   - بعض النماذج ترسل كلمة `ST` أو `US` كحقل مستقل قبل الرقم.
 *
 * @see ../scaleService.js — تجميع القراءات المتطابقة هو منطق HAL
 */

import { convertToKilograms } from "@/utils/scale"

/** `12.345 kg` · `+ 12.345kg` — إشارة اختيارية، وحدة اختيارية. */
const READING = /^([+-]?)\s*(\d+(?:\.\d+)?)\s*(kg|g|lb)?\s*$/i

/** كلمات stability التي ترسلها بعض النماذج كحقل مستقل. */
const STABLE_WORD = /\bST\b/i
const UNSTABLE_WORD = /\b(US|UNSTABLE|MOTION|MOV|DYN)\b/i

export const id = "zebra-avery"
export const label = "Zebra / Avery Berkel (stream)"
export const labelAr = "زبرا / أفيري بيركل (بث متصل)"
/** يحتاج طبقة تجميع: لا استقرار في الإطار. */
export const needsSettling = true

/** يُكتشف بأي رقم متبوع بوحدة أو سطر نظيف — أعرض بروتوكول. */
export function detect(frame) {
	if (typeof frame !== "string") return false
	const text = frame.trim()
	if (!text) return false
	return READING.test(text) && !/^[A-Z]{2},[A-Z]{2},/i.test(text)
}

export function parse(frame) {
	const text = String(frame ?? "")
		.replace(/\0/g, "")
		.trim()
	if (!text) return { ok: false, reason: "stream-empty", raw: frame }

	// كلمة instability حاكمة: لا يُملأ حقل من قراءة تتحرك.
	if (UNSTABLE_WORD.test(text)) {
		return {
			ok: true,
			weightKg: null,
			unit: null,
			stable: false,
			net: false,
			error: false,
			negative: false,
			protocol: id,
			reason: "stream-unstable-word",
			raw: text,
		}
	}

	// التقط أول token رقمي: البث قد يسبق الرقم حروف تحكّم أو رمز وحدة.
	const match = text.match(READING)
	if (!match) return { ok: false, reason: "stream-no-reading", raw: text }

	const [, sign, digits, rawUnit] = match
	const magnitude = Number(digits)
	if (!Number.isFinite(magnitude)) {
		return { ok: false, reason: "stream-non-finite", raw: text }
	}

	const unit = rawUnit ? rawUnit.toLowerCase() : "kg"
	const weightKg = convertToKilograms(magnitude, unit)
	if (!Number.isFinite(weightKg)) {
		return { ok: false, reason: "stream-invalid-weight", raw: text }
	}

	return {
		ok: true,
		weightKg,
		unit,
		unitAssumed: !rawUnit,
		// stability صريحة فقط إن قالها الميزان؛ وإلا ف unsettled عن قصد.
		stable: STABLE_WORD.test(text),
		net: false,
		error: false,
		negative: sign === "-",
		protocol: id,
		raw: text,
	}
}

export default { id, label, labelAr, detect, parse, needsSettling }
