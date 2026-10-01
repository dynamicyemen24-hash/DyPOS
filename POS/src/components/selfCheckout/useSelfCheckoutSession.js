/**
 * useSelfCheckoutSession — حالة جلسة الكاشير الذاتي.
 *
 * الشاشة (`.vue`) تبقى عرضًا فقط؛ كل ما هو حالة أو هيمنة على I/O يعيش هنا.
 *
 * invariants (AGENTS.md):
 *  - **بلا شبكة إطلاقًا**: لا `fetch` ولا `methodCall` في هذا الملف ولا في
 *    الشاشة. الكتابة محليًا في Dexie ثم `pushLocalChange` تضعها في طابور
 *    المزامنة، والدفع الفوري منها لا يُنفَّذ إلا بموافقة مستخدم صريحة من
 *    `link-consent`. شاشة الكاشير الذاتي تعمل على جهاز لا شبكة له إطلاقًا.
 *  - **البيانات المجهولة ليست فراغًا**: الكتالوج يُقرأ عبر
 *    `methodGetListWithSource` بمنهج `server | local | unavailable`،
 *    و`unavailable` يظهر كتنبيه «تعذّر تحميل الأصناف» لا كشبكة صفر أصناف.
 *  - **الهوية محلية**: `sessionUser()` من الجلسة المحلية، لا من متغيّر عام.
 */
import { computed, ref, shallowRef } from "vue"

import { sessionUser } from "@/data/session"
import { logger } from "@/utils/logger"
import { toMajor } from "@/utils/money"
import { DATA_SOURCE, methodGetListWithSource } from "@/utils/methodClient"
import { normalizeProduct } from "@/utils/posSalePure"
import { nextOfflineInvoiceNumber } from "@/services/offline-numbering"
import { pushLocalChange } from "@/services/sync-manager"

import {
	PAYMENT_LABELS,
	SESSION_STATES,
	addLineToCart,
	evaluateTender,
	idleSession,
	paidSession,
	removeLine,
	setLineQty,
	summarizeCart,
} from "./selfCheckoutState.js"
import { BASE_CURRENCY } from "./selfCheckoutMoney.js"

const log = logger.create("SelfCheckoutSession")

/** كيان الطابور — رمز يميّز بيع الكاشير الذاتي عن بيع نقطة البيع. */
export const SELF_CHECKOUT_FIELDS = Object.freeze([
	"item_code",
	"item_name",
	"standard_rate",
	"barcode",
	"stock_uom",
	"disabled",
])

/** حدّ الكتالوج المحمّل — الشاشة كشك، لا حاجة لآلاف الأصناف دفعة واحدة. */
const CATALOG_LIMIT = 300
const SELF_CHECKOUT_ENTITY = "self_checkout_sale"

/**
 * يبني كائن البيع المُدفوع — بنفس شكل بيع `POSSale` كي يقبله طابور
 * المزامنة بلا طبقة ترجمة ثانية.
 *
 * @param {Object} input
 * @returns {object}
 */
export function buildSelfCheckoutSale({
	invoiceNo,
	cart,
	totals,
	method,
	tenderMinor,
	changeMinor,
	cashier,
	currency,
	exchangeRate = 1,
}) {
	return {
		invoiceNo,
		selfCheckout: true,
		cashier: cashier || null,
		items: (cart || []).map((line) => ({
			productId: line.productId,
			code: line.code,
			name: line.name,
			quantity: line.qty,
			unitPrice: line.unitPriceMinor / 100,
			uom: line.uom || null,
			taxRate: line.taxRate,
		})),
		pricing: {
			subtotal: toMajor(totals.subtotalMinor),
			tax: toMajor(totals.taxTotalMinor),
			discount: toMajor(totals.discountMinor),
			total: toMajor(totals.totalMinor),
		},
		payment: {
			method,
			received: toMajor(tenderMinor),
			change: toMajor(changeMinor),
			remaining: 0,
		},
		currency: currency || BASE_CURRENCY,
		exchangeRate: Number(exchangeRate) || 1,
		// سعر الصرف يُخزَّن على السطر كما يفعل journal_entries.exchange_rate:
		createdAt: new Date().toISOString(),
	}
}

/**
 * composable جلسة الكاشير الذاتي.
 *
 * @param {{branch?:string, terminal?:string}} [options]
 */
export function useSelfCheckoutSession(options = {}) {
	const state = ref(SESSION_STATES.IDLE)
	const cart = ref([])
	const method = ref("cash")
	const tenderMinor = ref(0)
	const catalog = shallowRef([])
	const catalogSource = ref("")
	const catalogError = ref("")
	const loadingCatalog = ref(false)
	const processing = ref(false)
	const error = ref("")
	const receipt = ref(null)

	/** الإجماليات: مصدر واحد للحساب عبر `computeCartTotals`. */
	const totals = computed(() => summarizeCart(cart.value))
	const totalMinor = computed(() => totals.value.totalMinor)
	const itemCount = computed(() =>
		cart.value.reduce((sum, line) => sum + line.qty, 0),
	)
	const isEmpty = computed(() => cart.value.length === 0)
	const canPay = computed(
		() =>
			state.value === SESSION_STATES.OPEN &&
			!isEmpty.value &&
			!processing.value,
	)
	const tender = computed(() =>
		evaluateTender(totalMinor.value, tenderMinor.value),
	)
	const canConfirm = computed(() => tender.value.paid && !processing.value)

	/** مصدر الكتالوج معرو — «لا توجد بيانات» ليست إجابة صادقة. */
	const sourceNote = computed(() => {
		if (catalogSource.value === DATA_SOURCE.LOCAL)
			return "الأصناف معروضة من النسخة المحلية (السيرفر غير متاح)"
		if (catalogSource.value === DATA_SOURCE.UNAVAILABLE)
			return "تعذّر الوصول للسيرفر ولا توجد نسخة محلية — الأصناف غير معروفة"
		return ""
	})

	/**
	 * تحميل الكتالوج. لا يرمي: الفشل يعلن `unavailable` صراحةً حتى لا
	 * تُعرض شبكة فارغة كأنها «لا يوجد أصناف».
	 */
	async function loadCatalog() {
		loadingCatalog.value = true
		catalogError.value = ""
		try {
			const result = await methodGetListWithSource("Item", {
				fields: [...SELF_CHECKOUT_FIELDS],
				filters: [["disabled", "=", 0]],
				limit: CATALOG_LIMIT,
			})
			catalog.value = (result.rows || []).map(normalizeProduct).filter(Boolean)
			catalogSource.value = String(result.source ?? "")
			if (result.error)
				log.warn("self-checkout catalog from fallback", result.error)
		} catch (error_) {
			catalog.value = []
			catalogSource.value = DATA_SOURCE.UNAVAILABLE
			catalogError.value = error_?.message || "تعذّر تحميل الأصناف"
			log.error("self-checkout catalog load failed", error_)
		} finally {
			loadingCatalog.value = false
		}
	}

	/** يبدأ جلسة جديدة (يعيد كل شيء لنقطة أولى). */
	function startSession() {
		state.value = SESSION_STATES.OPEN
		cart.value = []
		method.value = "cash"
		tenderMinor.value = 0
		receipt.value = null
		error.value = ""
	}

	/** يضيف صنفًا — الطلب يتجاهَل أثناء الدفع أو قبل البدء. */
	function addItem(product, qty = 1) {
		if (state.value !== SESSION_STATES.OPEN) return
		cart.value = addLineToCart(cart.value, product, qty)
	}

	function changeQty(productId, qty) {
		if (state.value !== SESSION_STATES.OPEN) return
		cart.value = setLineQty(cart.value, productId, qty)
	}

	function removeItem(productId) {
		if (state.value !== SESSION_STATES.OPEN) return
		cart.value = removeLine(cart.value, productId)
	}

	/** يدخل وضع الدفع — الإضافات تتوقف هنا. */
	function beginPayment() {
		if (!canPay.value) return
		state.value = SESSION_STATES.PAYING
		tenderMinor.value = totalMinor.value
		error.value = ""
	}

	/**
	 * يقرّ الدفع: يولّد رقم فاتورة محلي ذرّي، يبني سجل البيع، يدخله في
	 * الطابور المحلي، ثم يفرغ الجلسة. لا شبكة في أي خطوة.
	 */
	async function confirmPayment() {
		if (!canConfirm.value) return
		processing.value = true
		error.value = ""
		try {
			const { invoiceNo } = await nextOfflineInvoiceNumber({
				branch: options.branch,
				terminal: options.terminal,
				kind: "selfCheckoutSeq",
				prefix: "SC",
			})
			const sale = buildSelfCheckoutSale({
				invoiceNo,
				cart: cart.value,
				totals: totals.value,
				method: method.value,
				tenderMinor: tenderMinor.value,
				changeMinor: tender.value.changeMinor,
				cashier: sessionUser(),
			})
			await pushLocalChange(SELF_CHECKOUT_ENTITY, invoiceNo, "create", sale)
			receipt.value = {
				invoiceNo,
				methodLabel: PAYMENT_LABELS[method.value] ?? method.value,
				items: cart.value.length,
				totalMinor: totalMinor.value,
				changeMinor: tender.value.changeMinor,
			}
			const finished = paidSession()
			state.value = finished.state
			cart.value = finished.cart
			tenderMinor.value = 0
		} catch (error_) {
			error.value = error_?.message || "تعذّر إتمام الدفع"
			log.error("self-checkout payment failed", error_)
		} finally {
			processing.value = false
		}
	}

	/** يلغي الجلسة ويعيدها للفراغ (بدون إيصال). */
	function cancel() {
		const cleared = idleSession()
		state.value = cleared.state
		cart.value = cleared.cart
		tenderMinor.value = 0
		receipt.value = null
		error.value = ""
	}

	/** جلسة جديدة بعد إيصال. */
	function dismissReceipt() {
		receipt.value = null
		startSession()
	}

	return {
		// حالة
		state,
		cart,
		method,
		tenderMinor,
		catalog,
		catalogSource,
		catalogError,
		loadingCatalog,
		processing,
		error,
		receipt,
		// مشتقات
		totals,
		totalMinor,
		itemCount,
		isEmpty,
		canPay,
		tender,
		canConfirm,
		sourceNote,
		// إجراءات
		loadCatalog,
		startSession,
		addItem,
		changeQty,
		removeItem,
		beginPayment,
		backToCart,
		chooseMethod,
		setTenderMinor,
		bumpTenderMinor,
		confirmPayment,
		cancel,
		dismissReceipt,
	}
}

export default useSelfCheckoutSession
