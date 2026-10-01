/**
 * الكاشير الذاتي — العملة ووحدة القياس.
 *
 * لماذا ملف مستقل: المحرك `utils/uom.js` هو **مصدر الحقيقة الوحيد** للعملات
 * ووحدات القياس (11 عملة، ~40 وحدة، سياسات تقريب، ZATCA). قبل هذا الملف كان
 * الكاشير الذاتي يمرّر `currency: ""` فارغة ويتجاهل المحرّك تمامًا — أي أن
 * «تعدد العملات» كان معلنًا في المشروع ومطبَّقًا في مكان واحد فقط من
 * الواجهة (شاشة الجرد). هنا نربطه دون أن ننسخ أي جدول: كل قيمة تقرأ من
 * `uom.js` ولا تُعاد كتابتها.
 *
 * invariant محاسبي: التحويل **لا يغيّر قيمة الفاتورة المخزّنة**. الفاتورة
 * تُحفظ بعملة الإصدار (transaction currency) والأسعار الأصلية، ويُخزَّن سعر
 * الصرف في السطر — تماماً كما يفعل `journal_entries.exchange_rate` في
 * قاعدة البيانات. تحويل هنا لأغراض العرض فقط.
 */
import {
	CURRENCY_DEFINITIONS,
	UOM_DEFINITIONS,
	convertAmount as convertAmountRaw,
	convertQty,
	formatMoney as formatMoneyRaw,
	formatQty,
} from "@/utils/uom"

/** كل العملات، بترتيب: الأساسية أولًا ثم أبجديًا. */
export const CURRENCIES = Object.freeze(
	Object.values(CURRENCY_DEFINITIONS).sort((a, b) => {
		if (a.isBase !== b.isBase) return a.isBase ? -1 : 1
		return a.code.localeCompare(b.code)
	}),
)

/** العملة الأساسية للمشروع — SAR. */
export const BASE_CURRENCY =
	CURRENCIES.find((currency) => currency.isBase)?.code ?? "SAR"

/** كل وحدات القياس. */
export const UOMS = Object.freeze(Object.values(UOM_DEFINITIONS))

export const BASE_UOM = Object.freeze(
	UOM_DEFINITIONS.PCS ?? UOMS[0] ?? { code: "Unit", nameAr: "وحدة", factor: 1 },
)

/** يبحث عن عملة (يعيد `null` — لا `undefined`). */
export function currencyByCode(code) {
	return CURRENCIES.find((currency) => currency.code === code) ?? null
}

/** يبحث عن وحدة قياس (يعيد `null`). */
export function uomByCode(code) {
	return UOMS.find((uom) => uom.code === code) ?? null
}

/**
 * دقة العرض لعملة (خانات عشرية). الكوين KWD/BHD/JOD ثلاثية — وعرضها
 * بخانتين **يخسر ربع دينار** في كل سطر، فالدقة هنا من تعريف العملة لا
 * من إعداد عام.
 *
 * @param {string} code
 * @returns {number}
 */
export function currencyPrecision(code) {
	const currency = currencyByCode(code)
	return Number.isInteger(currency?.precision) ? currency.precision : 2
}

/**
 * يحوّل مبلغًا بين عملتين بالسعر المعرّف في المحرك.
 * @param {number} amount
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
export function convertAmount(amount, from, to) {
	if (from === to) return Number(amount) || 0
	return convertAmountRaw(amount, from, to, CURRENCIES)
}

/**
 * يحوّل كمية بين وحدات من نفس النوع (كجم ⇄غرام). الوحدات من أنواع
 * مختلفة (قطعة ⇄كجم) لا تُحوَّل — الكمية تُرجَع كما هي، لأن تحويلها
 * بلا معنى فيزيائي.
 *
 * @param {number} qty
 * @param {string} from
 * @param {string} to
 * @returns {number}
 */
export function convertUomQty(qty, from, to) {
	return convertQty(qty, from, to, UOMS)
}

/**
 * تنسيق مبلغ بعملته، بالفواصل والدقة التي تخص عملته لا عملة المشروع.
 * @param {number} amount
 * @param {string} code
 * @returns {string}
 */
export function formatAmount(amount, code) {
	const currency = currencyByCode(code)
	if (!currency) return String(amount)
	try {
		const text = Number(amount).toLocaleString("ar-SA-u-nu-latn", {
			minimumFractionDigits: currency.precision,
			maximumFractionDigits: currency.precision,
		})
		return `${text} ${currency.symbol}`
	} catch {
		// محرك uom.js يملك تنسيقًا احتياطيًا بنفس المعنى.
		return formatMoneyRaw(amount, code, CURRENCIES)
	}
}

/** تنسيق كمية بوحدتها. */
export function formatQuantity(qty, uomCode) {
	return formatQty(qty, uomCode, UOMS)
}

export default {
	CURRENCIES,
	UOMS,
	BASE_CURRENCY,
	BASE_UOM,
	currencyByCode,
	uomByCode,
	currencyPrecision,
	convertAmount,
	convertUomQty,
	formatAmount,
	formatQuantity,
}
