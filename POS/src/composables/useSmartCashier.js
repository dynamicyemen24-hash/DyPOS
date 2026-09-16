/**
 * useSmartCashier — الربط التفاعلي بين شاشة الكاشير ومحرك الذكاء.
 *
 * - محرك واحد مشترك (Singleton) لكل التطبيق مع تخزين دائم آمن.
 * - بلا أي اعتماديات خارجية — يعمل حتى دون اتصال.
 */
import { computed, ref } from "vue"

import { createSmartCashierEngine } from "@/utils/smartCashier"

function createSafeStorage() {
	try {
		if (
			typeof window !== "undefined" &&
			window.localStorage &&
			typeof window.localStorage.getItem === "function"
		) {
			return window.localStorage
		}
	} catch {
		/* المتصفح يحجب التخزين — يعمل المحرك بالذاكرة */
	}

	return null
}

let sharedEngine = null

/** محرك مشترك عبر صفحات التطبيق (يتعلم عبر الجلسات بفضل التخزين الدائم). */
export function getSmartCashierEngine() {
	if (!sharedEngine) {
		sharedEngine = createSmartCashierEngine({
			storage: createSafeStorage(),
		})
	}

	return sharedEngine
}

/**
 * حالة الكاشير الذكي لشاشة البيع.
 *
 * @param {Object} [options]
 * @param {import("vue").Ref<Array>} [options.catalog] الكتالوج الظاهر حاليًا.
 * @param {import("vue").Ref<Array>} [options.cart] سلة البيع الحالية.
 * @param {import("vue").Ref<number>} [options.discountAmount] مقدار الخصم العام.
 * @param {import("vue").Ref<number>} [options.total] إجمالي الفاتورة من طبقة التسعير.
 * @param {number} [options.maxSuggestions] أقصى اقتراحات معروضة.
 * @param {number} [options.cashTenderLimit] أقصى اقتراحات نقدية معروضة.
 */
export function useSmartCashier(options = {}) {
	const engine = getSmartCashierEngine()

	const {
		catalog = ref([]),
		cart = ref([]),
		discountAmount = ref(0),
		total = null,
		maxSuggestions = 6,
		cashTenderLimit = 4,
	} = options

	/** إصدار داخلي لتشغيل إعادة الحساب بعد كل تعلّم. */
	const learnVersion = ref(0)

	function notifyLearned() {
		learnVersion.value += 1
	}

	/** «يُشترى غالبًا مع» محتويات السلة الحالية. */
	const smartSuggestions = computed(() => {
		// إعادة الحساب عند كل تعلّم جديد — tick جزء من الاعتماديات.
		const tick = learnVersion.value

		const suggestions = engine.suggestCrossSell(
			cart.value,
			catalog.value,
			maxSuggestions,
		)

		return tick >= 0 ? suggestions : []
	})

	/** الأكثر مبيعًا/استخدامًا — البيع السريع. */
	const quickSell = computed(() => {
		const tick = learnVersion.value

		const items = engine.getQuickSell(catalog.value, maxSuggestions)

		return tick >= 0 ? items : []
	})

	/** تنبيهات تشغيلية للسلة الحالية. */
	const alerts = computed(() => {
		return engine.getAlerts(cart.value, {
			discountAmount: discountAmount.value,
		})
	})

	/** نبض النوبة — مبيعات اليوم الفعلية. */
	const shiftPulse = computed(() => {
		const tick = learnVersion.value

		const pulse = engine.getShiftPulse()

		return tick >= 0 ? pulse : engine.getShiftPulse()
	})

	/** صحة السلة الحالية (0–100). */
	const cartHealth = computed(() => {
		return engine.getCartHealth(cart.value, {
			discountAmount: discountAmount.value,
		})
	})

	/** اقتراح الفئات النقدية الأسرع لتحصيل المبلغ الحالي. */
	const smartCashTender = computed(() => {
		const tick = learnVersion.value

		// مبلغ الفاتورة النهائي يأتي من طبقة التسعير في الشاشة (ضريبة + خصم).
		const amount =
			total && typeof total.value === "number"
				? total.value
				: cart.value.reduce((sum, item) => {
						const quantity = Number(item?.quantity || 0)
						const unitPrice = Number(item?.unitPrice || 0)
						const discount = Number(item?.discount || 0)

						return sum + Math.max(0, quantity * unitPrice - discount)
					}, 0)

		const suggestions = engine.suggestCashTender(amount, {
			limit: cashTenderLimit,
		})

		return tick >= 0 ? suggestions : []
	})

	/**
	 * تسجيل الفئة النقدية المستلمة — يتعلم منها النظام «الفئة المعتادة».
	 * @param {number} amount المبلغ النقدي المستلم.
	 */
	function trackCashTendered(amount) {
		engine.learnTender(amount)

		notifyLearned()
	}

	/**
	 * تسجيل إضافة صنف من الكاشير.
	 * @param {{ id?: string, productId?: string, name?: string }} product
	 */
	function trackProductAdded(product) {
		engine.recordInteraction({
			id: product?.productId ?? product?.id,
			name: product?.name,
		})

		notifyLearned()
	}

	/**
	 * تعلّم من عملية بيع مكتملة.
	 * @param {Array<{ productId?: string, id?: string, quantity?: number }>} items
	 * @param {{ total?: number }} [meta]
	 */
	function learnFromSale(items, meta) {
		engine.recordSale(items, meta)

		notifyLearned()
	}

	/** درجة شعبية أي صنف — لترتيب نتائج البحث الذكي. */
	function popularityOf(product) {
		return engine.getPopularityScore(product)
	}

	/** فرص الرف — أقوى ارتباطات «يُشترى معًا» في المتجر (عرض للمالك). */
	const pairOpportunities = computed(() => {
		const tick = learnVersion.value

		const opportunities = engine.getPairOpportunities(
			catalog.value,
			maxSuggestions,
		)

		return tick >= 0 ? opportunities : []
	})

	return {
		smartSuggestions,
		quickSell,
		alerts,
		shiftPulse,
		cartHealth,
		smartCashTender,
		pairOpportunities,
		trackProductAdded,
		learnFromSale,
		trackCashTendered,
		popularityOf,
		engine,
	}
}

export default useSmartCashier
