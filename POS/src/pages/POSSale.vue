<!--
===============================================================================
DyPOS — POSSale.vue
Enterprise POS Sales Workspace
Production Grade / SaaS / RTL-first / Arabic-first
===============================================================================

مسار التشغيل:

Product Discovery
      ↓
Cart
      ↓
Pricing / Discount / Tax
      ↓
Customer Context
      ↓
Payment
      ↓
Receipt / Completion
      ↓
New Sale

مبادئ:
- POS-only UX
- Arabic-first / RTL
- Keyboard + Touch optimized
- Offline-aware
- Idempotent checkout
- لا توجد عمليات ERP داخل الشاشة
- الحسابات النهائية يجب أن تأتي من طبقة التسعير المركزية
- الواجهة لا تثق بالقيم المالية القادمة من العميل وحده
===============================================================================
-->

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

import { FeatherIcon } from "frappe-ui"

import POSHeader from "@/components/pos/POSHeader.vue"
import SmartCashierDock from "@/components/pos/SmartCashierDock.vue"
import SyncStatusIndicator from "@/components/pos/SyncStatusIndicator.vue"
import AutocompleteSelect from "@/components/common/AutocompleteSelect.vue"
import IconButton from "@/components/ui/IconButton.vue"
import DyButton from "@/components/ui/DyButton.vue"

import { useSmartCashier } from "@/composables/useSmartCashier"
import { useDebouncedSearch } from "@/composables/useDebouncedSearch"
import { useCrashResume } from "@/composables/useCrashResume"
import {
	buildPaymentBlock,
	buildSalePayloadPure,
	calcAmountReceived,
	calcChange,
	calcGlobalDiscount,
	calcLineDiscount,
	calcRemaining,
	calcSubtotal,
	calcTax,
	calcTaxable,
	calcTotal,
	formatMoneyValue,
	formatNumber,
	getPopularityBoost,
	normalizePaymentErrorPure,
	normalizeProduct,
} from "@/utils/posSalePure"
import { session } from "@/stores/session"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { logger } from "@/utils/logger"
import { searchCachedCustomers } from "@/utils/offline/cache.js"
import {
	buildProductIndex,
	DEFAULT_FUZZY_SCAN_LIMIT,
	resolveScanIntent,
	searchProductIndex,
} from "@/utils/smartSearch"

/* ============================================================================
 * Props
 * ========================================================================== */

const props = defineProps({
	/**
	 * منتجات أولية يمكن تمريرها من parent / route / bootstrap.
	 */
	initialProducts: {
		type: Array,
		default: () => [],
	},

	/**
	 * عميل البيع الافتراضي.
	 */
	initialCustomer: {
		type: Object,
		default: null,
	},

	/**
	 * العملة المعروضة في الواجهة.
	 */
	currency: {
		type: String,
		default: "ر.س",
	},

	/**
	 * هل يتم إظهار العميل في منطقة السلة.
	 */
	showCustomer: {
		type: Boolean,
		default: true,
	},

	/**
	 * هل يسمح بالخصم اليدوي.
	 */
	allowDiscount: {
		type: Boolean,
		default: true,
	},

	/**
	 * هل يسمح بتعليق البيع.
	 */
	allowHold: {
		type: Boolean,
		default: true,
	},

	/**
	 * هل يسمح بإرجاع آخر عملية.
	 */
	allowReturn: {
		type: Boolean,
		default: true,
	},

	/**
	 * عدد المنتجات في الصفحة.
	 */
	pageSize: {
		type: Number,
		default: 30,
	},
})

/* ============================================================================
 * Emits
 * ========================================================================== */

const emit = defineEmits([
	"product-selected",
	"sale-completed",
	"sale-held",
	"sale-cancelled",
	"payment-requested",
	"return-requested",
	"search",
])

/* ============================================================================
 * Refs
 * ========================================================================== */

const searchInput = ref(null)
const productGrid = ref(null)

const searchQuery = ref("")

const products = ref(
	Array.isArray(props.initialProducts) ? [...props.initialProducts] : [],
)

const cart = ref([])

const customer = ref(props.initialCustomer || null)

const customerOptions = ref([])
const customerSearchLoading = ref(false)

const heldSalesCount = ref(0)

const loadingProducts = ref(false)
const loadingCart = ref(false)

const productsError = ref("")
const cartError = ref("")

const isOnline = ref(typeof navigator === "undefined" ? true : navigator.onLine)

const syncState = ref("ready")

const activeProductIndex = ref(-1)

const quantityEditor = ref(null)
const quantityInput = ref(null)

const discountValue = ref(0)
const discountType = ref("amount")

const showDiscountPanel = ref(false)
const showCustomerPanel = ref(false)
const showHeldSalesPanel = ref(false)
const showShortcutsPanel = ref(false)

const POS_SHORTCUTS = Object.freeze([
	{ keys: "F2", action: "التركيز على البحث" },
	{ keys: "Ctrl + Enter", action: "فتح الدفع" },
	{ keys: "F4", action: "تعليق البيع" },
	{ keys: "F8", action: "الكاشير الذكي" },
	{ keys: "Delete", action: "حذف الصنف المحدد" },
	{ keys: "↑ ↓ ← →", action: "التنقل في الشبكة" },
	{ keys: "Enter", action: "إضافة الصنف" },
	{ keys: "Esc", action: "إغلاق النوافذ" },
	{ keys: "؟", action: "هذه المساعدة" },
])

const showClearCartDialog = ref(false)

const showPaymentPanel = ref(false)

const paymentAmount = ref("")
const paymentMethod = ref("cash")

const paymentProcessing = ref(false)
const paymentError = ref("")

const completedSale = ref(null)
const receiptVisible = ref(false)

/** Last sale invoice (session-scoped) for the "print last invoice" header action. */
const lastSaleInvoiceId = ref(null)

/** Gate for the "print last invoice" header action (settings → store). */
const allowPrintLastInvoice = computed(
	() => Boolean(usePOSSettingsStore().allowPrintLastInvoice),
)

const notification = ref(null)

const busy = ref(false)

const saleSequence = ref(`SALE-${Date.now()}`)

/* ============================================================================
 * Payment Methods
 * ========================================================================== */

const paymentMethods = [
	{
		id: "cash",
		label: "نقدي",
		icon: "credit-card",
	},
	{
		id: "card",
		label: "بطاقة",
		icon: "credit-card",
	},
	{
		id: "mixed",
		label: "دفع مختلط",
		icon: "layers",
	},
]

/* ============================================================================
 * Product Normalization — canonical pure implementation in
 * `@/utils/posSalePure` (imported above). Kept out of the SFC so the
 * 6k-line workspace stays a thin reactive shell over tested functions.
 * ========================================================================== */

/* ============================================================================
 * Computed — Products
 * ========================================================================== */

const normalizedProducts = computed(() => {
	return products.value.map(normalizeProduct).filter(Boolean)
})

/**
 * فهرس البحث الذكي — يُبنى مرة واحدة لكل تغيير في الكتالوج،
 * لا لكل ضغطة مفتاح، ليبقى البحث فوريًا مع كتالوجات ضخمة.
 */
const productSearchIndex = computed(() =>
	buildProductIndex(normalizedProducts.value),
)

/* ============================================================================
 * Computed — Cart
 * ========================================================================== */

const cartItemCount = computed(() => {
	return cart.value.reduce(
		(total, item) => total + Number(item.quantity || 0),
		0,
	)
})

const cartLineCount = computed(() => {
	return cart.value.length
})

const subtotal = computed(() => {
	return calcSubtotal(cart.value)
})

const lineDiscountTotal = computed(() => {
	return calcLineDiscount(cart.value)
})

const globalDiscount = computed(() => {
	return calcGlobalDiscount({
		subtotal: subtotal.value,
		lineDiscount: lineDiscountTotal.value,
		discountType: discountType.value,
		discountValue: discountValue.value,
	})
})

const taxableAmount = computed(() => {
	return calcTaxable(
		subtotal.value,
		lineDiscountTotal.value,
		globalDiscount.value,
	)
})

const taxAmount = computed(() => {
	return calcTax(cart.value)
})

const total = computed(() => {
	return calcTotal(taxableAmount.value, taxAmount.value)
})

const amountReceived = computed(() => {
	return calcAmountReceived(paymentAmount.value)
})

const changeAmount = computed(() => {
	return calcChange(amountReceived.value, total.value)
})

const remainingAmount = computed(() => {
	return calcRemaining(total.value, amountReceived.value)
})

const canCheckout = computed(() => {
	return (
		cart.value.length > 0 &&
		total.value >= 0 &&
		!paymentProcessing.value &&
		!busy.value
	)
})

const canConfirmPayment = computed(() => {
	if (!canCheckout.value) {
		return false
	}

	if (paymentMethod.value === "cash") {
		return amountReceived.value >= total.value
	}

	return true
})

const cartEmpty = computed(() => {
	return cart.value.length === 0
})

const cartLabel = computed(() => {
	if (cartItemCount.value === 0) {
		return "السلة فارغة"
	}

	return `${formatNumber(cartItemCount.value)} صنف`
})

/* ============================================================================
 * Smart Cashier — محرك الكاشير الذكي
 *
 * يتعلم DyPOS من تشغيل المتجر نفسه:
 * - كل صنف يضيفه الكاشير يرفع نقاط البيع السريع.
 * - كل عملية بيع مكتملة تُغذي مصفوفة «يُشترى غالبًا مع».
 * - يعمل بالكامل دون اتصال ويُخزَّن محليًا.
 * ========================================================================== */

const showSmartDock = ref(true)

const {
	smartSuggestions: smartSuggestionsList,
	quickSell: smartQuickSell,
	alerts: smartAlerts,
	shiftPulse: smartShiftPulse,
	cartHealth: smartCartHealth,
	smartCashTender,
	pairOpportunities: smartOpportunities,
	trackProductAdded,
	learnFromSale,
	trackCashTendered,
} = useSmartCashier({
	catalog: normalizedProducts,
	cart,
	discountAmount: globalDiscount,
	total,
	maxSuggestions: 6,
	cashTenderLimit: 4,
})

function handleSmartAdd(product) {
	addProduct(product)
}

function handleSmartAddAll(productList) {
	for (const product of Array.isArray(productList) ? productList : []) {
		addProduct(product)
	}
}

/* ============================================================================
 * Smart Search — البحث الذكي
 *
 * - تطبيع عربي كامل (همزات/تشكيل/أرقام هندية) وتقبل ترتيب الكلمات.
 * - أولوية للباركود/الرمز المطابق تامًّا (سلوك المسح السريع).
 * - عند الخطأ الإملائي: مطابقة تقريبية وعرض «هل تقصد…؟» بدل شاشة فارغة.
 * - عند تعادل الصلة: الأسرع بيعًا في هذا المتجر يتقدم (ترتيب تعلّمي).
 * ========================================================================== */

/** ترجيح تعلّمي: الأصناف الأكثر بيعًا/استخدامًا تُقدَّم عند تعادل الصلة. */
const productUsageBoosts = computed(() => {
	const map = new Map()

	for (const entry of smartQuickSell.value) {
		const id = entry?.product?.id ?? entry?.id

		if (id) {
			map.set(String(id), Number(entry?.score || 0) * 10)
		}
	}

	return map
})

/** نتيجة البحث الذكية (دقيق أولًا، ثم تقريبي عند الخطأ الإملائي). */
const smartSearchResult = computed(() => {
	return searchProductIndex(productSearchIndex.value, searchQuery.value, {
		limit: 160,
		fuzzyScanLimit: DEFAULT_FUZZY_SCAN_LIMIT,
		popularity: (product) =>
			getPopularityBoost(productUsageBoosts.value, product),
	})
})

/** المنتجات المعروضة في الشبكة. */
const filteredProducts = computed(() => smartSearchResult.value.results)

/** هل جاءت النتائج من المطابقة التقريبية (خطأ إملائي)؟ */
const searchIsApproximate = computed(() => smartSearchResult.value.approximate)

/** أول بديل مقترح عند الخطأ الإملائي — يُعرض في زر «هل تقصد…؟». */
const searchDidYouMean = computed(() => {
	if (!searchIsApproximate.value) {
		return null
	}

	return filteredProducts.value[0]?.name || null
})

/** تطبيق اقتراح «هل تقصد…؟» مباشرة في البحث. */
function applyDidYouMean() {
	const suggestion = filteredProducts.value[0]?.name
	if (!suggestion) {
		return
	}

	searchQuery.value = suggestion

	emit("search", suggestion)

	nextTick(() => {
		activeProductIndex.value = -1
	})
}

/* ============================================================================
 * Utilities
 * ========================================================================== */

/* Utilities — pure sale math lives in `@/utils/posSalePure`; the screen
 * keeps one thin wrapper binding `props.currency` for template calls. */

function formatMoney(value) {
	return formatMoneyValue(value, props.currency)
}

function showNotification(message, type = "info") {
	notification.value = {
		id: Date.now(),
		message,
		type,
	}

	window.clearTimeout(showNotification.timeout)

	showNotification.timeout = window.setTimeout(() => {
		notification.value = null
	}, 3500)
}

/* ============================================================================
 * Product Search
 * ========================================================================== */

function handleSearch(value) {
	const query = typeof value === "string" ? value : searchQuery.value

	searchQuery.value = query

	emit("search", query)
}

async function focusSearch() {
	await nextTick()

	searchInput.value?.focus?.()
}

/**
 * المسح/الكتابة السريعة: Enter في حقل البحث = «أضف الآن».
 *
 * ثورة تشغيلية للكاشير: لا نقر على الشبكة، لا عودة بالماوس — مسح متواصل
 * بيد واحدة. القرار يُتخذ فقط عند وجود مطابقة قاطعة (باركود/رمز/نتيجة وحيدة)،
 * وإلا نُبقي القائمة أمام الكاشير للاختيار.
 */
function handleScanSubmit() {
	const intent = resolveScanIntent(
		productSearchIndex.value,
		searchQuery.value,
		{
			minLength: 3,
			popularity: (product) =>
				getPopularityBoost(productUsageBoosts.value, product),
		},
	)

	if (intent.action === "add" && intent.product) {
		addProduct(intent.product)

		searchQuery.value = ""

		emit("search", "")

		activeProductIndex.value = -1

		const reasonLabel =
			intent.reason === "barcode"
				? "مسح باركود"
				: intent.reason === "code"
					? "رمز صنف"
					: "إضافة سريعة"

		showNotification(`${reasonLabel}: أُضيف «${intent.product.name}»`, "success")

		nextTick(() => {
			searchInput.value?.focus?.()
		})

		return
	}

	if (intent.action === "empty" && searchQuery.value.trim()) {
		showNotification("لا يوجد منتج مطابق — تحقق من الرمز", "warning")
	}
}

/* ============================================================================
 * Cart Operations
 * ========================================================================== */

function addProduct(product) {
	const normalized = normalizeProduct(product)

	if (!normalized || normalized.disabled) {
		return
	}

	// الكاشير الذكي: تتبع سلوك الكاشير (بيع سريع/توصيات مستقبلية).
	trackProductAdded({ productId: normalized.id, name: normalized.name })

	const existing = cart.value.find((item) => item.productId === normalized.id)

	if (existing) {
		existing.quantity += 1

		emit("product-selected", normalized)

		return
	}

	cart.value.push({
		id: `${normalized.id}-${Date.now()}`,

		productId: normalized.id,

		code: normalized.code,

		name: normalized.name,

		image: normalized.image,

		unit: normalized.unit,

		quantity: 1,

		unitPrice: Number(normalized.price) || 0,

		discount: 0,

		taxRate: Number(normalized.taxRate ?? 0),

		notes: "",
	})

	emit("product-selected", normalized)
}

function incrementItem(item) {
	if (!item) {
		return
	}

	item.quantity = Math.max(1, Number(item.quantity || 0) + 1)
}

function decrementItem(item) {
	if (!item) {
		return
	}

	const quantity = Number(item.quantity || 0)

	if (quantity <= 1) {
		removeItem(item)
		return
	}

	item.quantity = quantity - 1
}

function setItemQuantity(item, quantity) {
	if (!item) {
		return
	}

	const parsed = Number(quantity)

	if (!Number.isFinite(parsed) || parsed <= 0) {
		removeItem(item)
		return
	}

	item.quantity = Math.min(9999, Math.floor(parsed))
}

function removeItem(item) {
	const index = cart.value.findIndex((entry) => entry.id === item.id)

	if (index === -1) {
		return
	}

	cart.value.splice(index, 1)
}

function clearCart() {
	if (cartEmpty.value) {
		return
	}

	cart.value = []

	discountValue.value = 0

	showClearCartDialog.value = false

	showNotification("تم إفراغ السلة", "success")
}

/* ============================================================================
 * Quantity Editor
 * ========================================================================== */

function openQuantityEditor(item) {
	quantityEditor.value = item

	nextTick(() => {
		quantityInput.value?.focus?.()

		quantityInput.value?.select?.()
	})
}

function closeQuantityEditor() {
	quantityEditor.value = null
	// Return focus to search so the cashier never loses keyboard flow.
	nextTick(() => focusSearch())
}

function commitQuantity() {
	if (!quantityEditor.value) {
		return
	}

	setItemQuantity(quantityEditor.value, quantityEditor.value.quantity)

	closeQuantityEditor()
}

/* ============================================================================
 * Discount
 * ========================================================================== */

function applyGlobalDiscount() {
	const value = Number(discountValue.value || 0)

	if (!Number.isFinite(value)) {
		discountValue.value = 0
		return
	}

	if (discountType.value === "percent") {
		discountValue.value = Math.min(100, Math.max(0, value))

		return
	}

	discountValue.value = Math.min(subtotal.value, Math.max(0, value))
}

function removeDiscount() {
	discountValue.value = 0
	showDiscountPanel.value = false
}

/* ============================================================================
 * Customer
 * ========================================================================== */

function selectCustomer(selectedValue) {
	const match = customerOptions.value.find(
		(option) => option.value === selectedValue,
	)

	customer.value = selectedValue
		? {
				id: match?.id ?? selectedValue,
				name: match?.name ?? match?.label ?? selectedValue,
				customer_name: match?.customer_name ?? match?.label ?? selectedValue,
			}
		: null

	showCustomerPanel.value = false
}

async function handleCustomerSearch(query) {
	// Debounced + stale-guarded via useDebouncedSearch: rapid keystrokes
	// collapse into one IndexedDB lookup and late responses never overwrite
	// newer ones. Empty query (panel open) runs immediately, no debounce lag.
	if (!String(query || "").trim()) {
		await customerSearch.runImmediate(query)
		return
	}
	customerSearch.setQuery(query)
}

// Single professional search pipeline for the customer dialog.
const customerSearch = useDebouncedSearch(
	async (query) => searchCachedCustomers(query, 100),
	{ delay: 250 },
)

watch(customerSearch.results, (rows) => {
	customerOptions.value = (rows || []).map((c) => ({
		value: c.name ?? c.customer_name,
		id: c.name,
		label: c.customer_name || c.name,
		name: c.customer_name || c.name,
		customer_name: c.customer_name || c.name,
		subtitle: c.mobile_no || "",
	}))
})

watch(customerSearch.isSearching, (searching) => {
	customerSearchLoading.value = searching
})

watch(customerSearch.error, (error) => {
	if (!error) return
	logger?.error?.("DyPOS customer search failed", error)
	customerOptions.value = []
})

watch(showCustomerPanel, (isOpen) => {
	if (isOpen) {
		handleCustomerSearch("")
	}
})

function clearCustomer() {
	customer.value = null
}

/* ============================================================================
 * Hold Sale
 * ========================================================================== */

async function holdSale() {
	if (!props.allowHold || cartEmpty.value || busy.value) {
		return
	}

	busy.value = true

	try {
		const payload = buildSalePayload()

		/*
		 * طبقة persistence الفعلية يمكن ربطها هنا.
		 * لا نستخدم localStorage مباشرة لحفظ عملية بيع
		 * حساسة في production.
		 */

		emit("sale-held", payload)

		heldSalesCount.value += 1

		cart.value = []

		resetSaleState()

		showNotification("تم تعليق عملية البيع", "success")
	} catch (error) {
		logger?.error?.("DyPOS hold sale failed", error)

		showNotification("تعذر تعليق عملية البيع", "error")
	} finally {
		busy.value = false
	}
}

/* ============================================================================
 * Sale Payload
 * ========================================================================== */

function buildSalePayload() {
	return buildSalePayloadPure({
		clientSequence: saleSequence.value,
		customer: customer.value,
		cart: cart.value,
		pricing: {
			subtotal: subtotal.value,
			lineDiscount: lineDiscountTotal.value,
			globalDiscount: globalDiscount.value,
			taxableAmount: taxableAmount.value,
			tax: taxAmount.value,
			total: total.value,
		},
		currency: props.currency,
		createdAt: new Date().toISOString(),
	})
}

/* ============================================================================
 * Payment
 * ========================================================================== */

function openPayment() {
	if (!canCheckout.value) {
		return
	}

	paymentError.value = ""

	paymentAmount.value =
		paymentMethod.value === "cash" ? String(total.value) : ""

	showPaymentPanel.value = true

	emit("payment-requested", {
		total: total.value,
		payload: buildSalePayload(),
	})

	nextTick(() => {
		if (paymentMethod.value === "cash") {
			document.getElementById("dypos-payment-amount")?.focus?.()
		}
	})
}

function closePayment() {
	if (paymentProcessing.value) {
		return
	}

	showPaymentPanel.value = false
	paymentError.value = ""
	// Return focus to search for the next sale.
	nextTick(() => focusSearch())
}

async function confirmPayment() {
	if (!canConfirmPayment.value || paymentProcessing.value) {
		return
	}

	paymentProcessing.value = true
	paymentError.value = ""
	syncState.value = "syncing"

	try {
		const payload = {
			...buildSalePayload(),

			payment: buildPaymentBlock({
				method: paymentMethod.value,
				received: amountReceived.value,
				change: changeAmount.value,
				remaining: remainingAmount.value,
			}),
		}

		/*
		 * نقطة التكامل الأساسية مع API البيع.
		 *
		 * يجب أن تكون العملية في backend:
		 * - Idempotent
		 * - Transactional
		 * - Server-priced
		 * - Server-authoritative
		 *
		 * ولا نعتمد على total المحسوب في المتصفح
		 * باعتباره مصدر الحقيقة المحاسبي.
		 */

		const result = await submitSale(payload)

		completedSale.value = result || payload
		// Track the last invoice for the "print last invoice" header action.
		lastSaleInvoiceId.value =
			result?.invoice_id || result?.offline_id || result?.name || null

		receiptVisible.value = true

		showPaymentPanel.value = false

		syncState.value = "ready"

		// الكاشير الذكي: التعلم من عملية البيع المكتملة
		// أفضل جهد داخل try/catch منعزل حتى لا يؤثر أي خطأ تحليلي على نجاح البيع
		try {
			learnFromSale(
				cart.value.map((item) => ({
					productId: item.productId,
					quantity: item.quantity,
					name: item.name,
				})),
				{ total: total.value },
			)

			if (paymentMethod.value === "cash" && amountReceived.value > 0) {
				trackCashTendered(amountReceived.value)
			}
		} catch (learnErr) {
			logger?.warn?.("Analytics learning skipped", learnErr)
		}

		emit("sale-completed", completedSale.value)

		showNotification("تم إتمام عملية البيع بنجاح", "success")

		// درج النقود: يُفتح تلقائياً عند البيع النقدي (حسب الإعدادات).
		// أفضل جهد ولا يحجب البيع أبداً — يعمل online وoffline.
		try {
			const isCashSale =
				String(paymentMethod.value || "").toLowerCase() === "cash"
			if (isCashSale && usePOSSettingsStore().autoKickDrawerOnCash !== false) {
				const { kickCashDrawer } = await import("@/utils/qzTray")
				kickCashDrawer().catch(() => {})
			}
		} catch {
			// Drawer kick never breaks sales.
		}
	} catch (error) {
		syncState.value = "error"

		paymentError.value = normalizePaymentError(error)

		logger?.error?.("DyPOS checkout failed", {
			message: error?.message,
		})
	} finally {
		paymentProcessing.value = false
	}
}

async function submitSale(payload) {
	/*
	 * إذا كان session store يحتوي API مركزي للبيع
	 * يتم استخدامه.
	 */

	if (typeof session.submitSale === "function") {
		return await session.submitSale(payload)
	}

	throw new Error("جلسة البيع غير مهيأة (session.submitSale غير متوفر)")
}

function normalizePaymentError(error) {
	return normalizePaymentErrorPure(error, isOnline.value)
}

/* ============================================================================
 * New Sale
 * ========================================================================== */

function startNewSale() {
	completedSale.value = null

	receiptVisible.value = false

	cart.value = []

	customer.value = props.initialCustomer || null

	discountValue.value = 0

	discountType.value = "amount"

	paymentAmount.value = ""

	paymentMethod.value = "cash"

	searchQuery.value = ""

	saleSequence.value = `SALE-${Date.now()}`

	syncState.value = "ready"

	focusSearch()
}

/* ============================================================================
 * Crash Resume — استئناف عملية البيع المعلّقة
 *
 * Adapter يقرأ حالة الكاشير الحية (الأصناف + العميل + المجاميع + الطرفية +
 * وضع الدفع + عرض الضريبة) ويمرّرها إلى مسودة الانهيار. عند فتح الصفحة وسلة
 * فارغة وتوافُر مسودة صالحة، تُعرض أزرار «استئناف البيع» / «تجاهل».
 * ========================================================================== */

const saleSettingsStore = usePOSSettingsStore()

const crashResume = useCrashResume({
	getItems: () => cart.value,

	setItems: (items) => {
		cart.value = Array.isArray(items) ? items : []
	},

	getPanel: () => ({
		paymentMethod: paymentMethod.value,
		paymentAmount: paymentAmount.value,
	}),

	setPanel: (panel) => {
		if (!panel || typeof panel !== "object") return

		if (typeof panel.paymentMethod === "string") {
			paymentMethod.value = panel.paymentMethod
		}

		if (
			typeof panel.paymentAmount === "string" ||
			typeof panel.paymentAmount === "number"
		) {
			paymentAmount.value = String(panel.paymentAmount)
		}
	},

	getMeta: () => ({
		customer: customer.value,
		discountValue: discountValue.value,
		discountType: discountType.value,
		saleSequence: saleSequence.value,
		totals: {
			subtotal: subtotal.value,
			lineDiscount: lineDiscountTotal.value,
			globalDiscount: globalDiscount.value,
			taxable: taxableAmount.value,
			tax: taxAmount.value,
			total: total.value,
		},
		terminal: session.terminalId || null,
		mode: paymentMethod.value,
		taxDisplay: {
			inclusive: Boolean(saleSettingsStore.settings.value?.tax_inclusive),
			regime: saleSettingsStore.settings.value?.tax_regime || "standard",
		},
	}),

	setMeta: (meta) => {
		if (!meta || typeof meta !== "object") return

		if (meta.customer && typeof meta.customer === "object") {
			const entry = meta.customer

			const name = entry.customer_name || entry.name || entry.label || entry.id

			if (name) {
				customer.value = {
					id: entry.id ?? name,
					name,
					customer_name: entry.customer_name || name,
				}
			}
		}

		if (typeof meta.discountValue === "number") {
			discountValue.value = meta.discountValue
		}

		if (meta.discountType === "percent" || meta.discountType === "amount") {
			discountType.value = meta.discountType
		}

		if (typeof meta.saleSequence === "string" && meta.saleSequence) {
			saleSequence.value = meta.saleSequence
		}
	},

	isCartEmpty: () => cartEmpty.value,
})

/** كشف تسامطي للقالب: refs داخل كائن عادي لا تُفك تلقائيًا في القالب. */
const crashResumeMessages = computed(() => crashResume.messages.value)

function resumePendingSale() {
	crashResume.accept()

	nextTick(() => focusSearch())
}

function dismissPendingSale() {
	crashResume.dismiss()
}

function captureCrashDraft() {
	crashResume.captureNow()
}

/* ============================================================================
 * Receipt
 * ========================================================================== */

function closeReceipt() {
	receiptVisible.value = false
}

async function printReceipt() {
	const sale = completedSale.value
	const invoiceId = sale?.invoice_id || sale?.offline_id || sale?.name
	if (!invoiceId) {
		window.print()
		return
	}

	try {
		const settings = usePOSSettingsStore().settings

		// Registered / offline invoice → route through the spool (SAP-style).
		const { submitAndWait } = await import("@/print/index")
		const job = await submitAndWait(
			{
				docType: "invoice",
				docId: invoiceId,
				title: `Invoice ${invoiceId}`,
				payload: null,
				formId: settings.value?.print_format || "",
				requestedBy: null,
				posProfile: settings.value?.pos_profile || null,
			},
			{ timeoutMs: 25000 },
		)
		if (job?.status === "COMPLETED") return
		throw new Error(job?.lastError || "Receipt did not print")
	} catch (error) {
		// Spool unavailable or failed — never block the cashier; keep the
		// historical browser-print behaviour as a safe fallback.
		logger?.warn?.("Receipt spool print failed; browser fallback", error?.message)
		try {
			const { printInvoiceByName } = await import("@/utils/printInvoice")
			await printInvoiceByName(invoiceId, usePOSSettingsStore().settings.value?.print_format || null)
		} catch {
			window.print()
		}
	}
}

/* ============================================================================
 * Spool wiring — route manual/after-sale prints through the print queue.
 * ========================================================================== */

/**
 * Handle a `print-invoice` / `printer-click` event: hydrate the invoice and
 * enqueue it on the print spool (never blocks the sale). Falls back to the
 * legacy direct print when the spool is unavailable.
 * @param {Object|string} invoice
 */
async function handlePrintInvoice(invoice) {
	const invoiceName =
		typeof invoice === "string" ? invoice : invoice?.name || invoice?.offline_id
	if (!invoiceName) return

	try {
		const { printInvoiceByName, isLocalOnlyInvoiceName } = await import(
			"@/utils/printInvoice"
		)
		let invoiceData = null
		if (isLocalOnlyInvoiceName(invoiceName)) {
			const { hydrateLocalOnlyInvoice } = await import("@/utils/printInvoice")
			invoiceData = await hydrateLocalOnlyInvoice({ name: invoiceName })
		}

		const { submitPrintJob } = await import("@/print/index")
		const settings = usePOSSettingsStore().settings
		const job = await submitPrintJob({
			docType: "invoice",
			docId: invoiceName,
			title: invoiceName,
			payload: invoiceData || null,
			formId: settings.value?.print_format || "",
			requestedBy: invoice?.requestedBy,
			posProfile: settings.value?.pos_profile || null,
		})
		logger?.info?.("Invoice queued for print", { spoolNo: job?.spoolNo })
	} catch (error) {
		logger?.warn?.("Spool unavailable; direct print fallback", error?.message)
		try {
			const { printInvoiceByName } = await import("@/utils/printInvoice")
			await printInvoiceByName(invoiceName)
		} catch (printError) {
			logger?.error?.("Direct print failed", printError?.message)
		}
	}
}

/** Reprint the last completed invoice (idempotent; spool dedupes rapid taps). */
async function printLastInvoice() {
	const invoiceId = lastSaleInvoiceId.value
	if (!invoiceId) {
		showNotification("لا توجد فاتورة سابقة للطباعة", "info")
		return
	}
	await handlePrintInvoice(invoiceId)
}

/* ============================================================================
 * Returns
 * ========================================================================== */

function openReturns() {
	if (!props.allowReturn) {
		return
	}

	emit("return-requested")
}

/* ============================================================================
 * Header Actions
 * ========================================================================== */

function handleHeaderAction(action) {
	switch (action) {
		case "held":
			showHeldSalesPanel.value = true
			break

		case "returns":
			openReturns()
			break

		case "customer":
			showCustomerPanel.value = true
			break

		default:
			break
	}
}

/* ============================================================================
 * Keyboard Shortcuts
 * ========================================================================== */

function handleKeydown(event) {
	const target = event.target

	const isTyping =
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement

	/*
	 * F2 — البحث
	 */
	if (event.key === "F2") {
		event.preventDefault()

		focusSearch()

		return
	}

	/*
	 * F8 — إظهار/إخفاء الكاشير الذكي
	 */
	if (event.key === "F8") {
		event.preventDefault()

		showSmartDock.value = !showSmartDock.value

		return
	}

	/*
	 * ? — مساعدة الاختصارات (يعمل مع Shift+؟ العربية)
	 */
	if ((event.key === "?" || event.key === "؟") && !isTyping) {
		event.preventDefault()
		showShortcutsPanel.value = !showShortcutsPanel.value
		return
	}

	/*
	 * Escape — إغلاق overlay
	 */
	if (event.key === "Escape") {
		if (showShortcutsPanel.value) {
			showShortcutsPanel.value = false

			return
		}

		if (quantityEditor.value) {
			closeQuantityEditor()

			return
		}

		if (showPaymentPanel.value) {
			closePayment()

			return
		}

		if (showDiscountPanel.value) {
			showDiscountPanel.value = false

			return
		}

		if (showCustomerPanel.value) {
			showCustomerPanel.value = false

			return
		}

		if (showHeldSalesPanel.value) {
			showHeldSalesPanel.value = false

			return
		}

		return
	}

	/*
	 * Ctrl/Cmd + Enter — الدفع (يعمل حتى من داخل حقل البحث لسرعة الكاشير)
	 */
	if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
		if (canCheckout.value && !showPaymentPanel.value) {
			event.preventDefault()

			openPayment()
		}
	}

	/*
	 * F4 — تعليق البيع
	 */
	if (event.key === "F4" && props.allowHold) {
		event.preventDefault()

		holdSale()
	}

	/*
	 * Delete — حذف العنصر المحدد
	 */
	if (event.key === "Delete" && activeProductIndex.value >= 0 && !isTyping) {
		const item = cart.value[activeProductIndex.value]

		if (item) {
			removeItem(item)
		}
	}
}

/* ============================================================================
 * Online / Offline
 * ========================================================================== */

function handleOnline() {
	isOnline.value = true

	syncState.value = "ready"
}

function handleOffline() {
	isOnline.value = false

	syncState.value = "offline"
}

/* ============================================================================
 * Product Keyboard Navigation
 * ========================================================================== */

function handleProductGridKeydown(event) {
	const items = filteredProducts.value

	if (!items.length) {
		return
	}

	const columns = 4

	// RTL-aware horizontal navigation: in RTL the visual "right" is the
	// previous item. Read once per keypress (cheap) so mixed-dir sessions stay correct.
	const isRTL =
		typeof document !== "undefined" &&
		(document.documentElement?.getAttribute?.("dir") || "rtl") === "rtl"

	switch (event.key) {
		case "ArrowRight":
			event.preventDefault()

			activeProductIndex.value = isRTL
				? Math.max(0, activeProductIndex.value - 1)
				: Math.min(items.length - 1, activeProductIndex.value + 1)

			break

		case "ArrowLeft":
			event.preventDefault()

			activeProductIndex.value = isRTL
				? Math.min(items.length - 1, activeProductIndex.value + 1)
				: Math.max(0, activeProductIndex.value - 1)

			break

		case "ArrowDown":
			event.preventDefault()

			activeProductIndex.value = Math.min(
				items.length - 1,
				activeProductIndex.value + columns,
			)

			break

		case "ArrowUp":
			event.preventDefault()

			activeProductIndex.value = Math.max(0, activeProductIndex.value - columns)

			break

		case "Enter": {
			event.preventDefault()

			const product = items[activeProductIndex.value]

			if (product) {
				addProduct(product)
			}

			break
		}

		default:
			break
	}
}

/* ============================================================================
 * Lifecycle
 * ========================================================================== */

onMounted(async () => {
	window.addEventListener("keydown", handleKeydown)

	window.addEventListener("online", handleOnline)

	window.addEventListener("offline", handleOffline)

	window.addEventListener("beforeunload", captureCrashDraft)

	await nextTick()

	focusSearch()
})

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleKeydown)

	window.removeEventListener("online", handleOnline)

	window.removeEventListener("offline", handleOffline)

	window.removeEventListener("beforeunload", captureCrashDraft)

	// لقطة سلة أخيرة قبل مغادرة الصفحة (الكتابة محمية بالثروتل الموقوت).
	captureCrashDraft()

	window.clearTimeout(showNotification.timeout)
})

/* ============================================================================
 * Watchers
 * ========================================================================== */

watch(
	() => props.initialProducts,
	(value) => {
		if (Array.isArray(value)) {
			products.value = [...value]
		}
	},
	{
		deep: true,
	},
)

watch(
	() => props.initialCustomer,
	(value) => {
		customer.value = value || null
	},
)
</script>

<template>
    <div
        class="dy-pos-sale"
        dir="rtl"
        data-testid="pos-root"
        :aria-busy="
            loadingProducts ||
            paymentProcessing
        "
    >
        <!-- =================================================================
             Header
             =============================================================== -->

        <POSHeader
            title="نقطة البيع"
            subtitle="البيع"
            :held-sales-count="
                heldSalesCount
            "
            :connection-status="
                isOnline
                    ? 'online'
                    : 'offline'
            "
            :show-held-sales="
                allowHold
            "
            :show-connection-status="true"
            :show-settings="true"
            :busy="busy"
            @held-sales-clicked="
                showHeldSalesPanel = true
            "
            @menu-clicked="
                handleHeaderAction('menu')
            "
        >
            <!-- مؤشر حالة المزامنة الحي (معلّق/متصل/مزامنة أولية) -->
            <template #actions>
                <SyncStatusIndicator />
                <button
                    v-if="allowPrintLastInvoice"
                    type="button"
                    class="dy-pos-header-action"
                    :title="__('طباعة آخر فاتورة')"
                    :aria-label="__('طباعة آخر فاتورة')"
                    @click="printLastInvoice"
                >
                    <FeatherIcon name="printer" class="h-[18px] w-[18px]" />
                </button>
            </template>
        </POSHeader>

        <!-- =================================================================
             Operational Status
             =============================================================== -->

        <div
            class="dy-pos-sale__status"
            :class="[
                `dy-pos-sale__status--${syncState}`,
            ]"
            role="status"
            aria-live="polite"
        >
            <span
                class="dy-pos-sale__status-dot"
                aria-hidden="true"
            />

            <span v-if="syncState === 'ready'">
                جاهز للبيع
            </span>

            <span
                v-else-if="
                    syncState === 'syncing'
                "
            >
                جاري مزامنة العملية...
            </span>

            <span
                v-else-if="
                    syncState === 'offline'
                "
            >
                وضع العمل دون اتصال
            </span>

            <span
                v-else
            >
                توجد مشكلة في الاتصال
            </span>

            <span
                v-if="cartItemCount"
                class="dy-pos-sale__status-separator"
            >
                ·
            </span>

            <span
                v-if="cartItemCount"
                class="dy-pos-sale__status-cart"
            >
                {{ cartLabel }}
            </span>
        </div>

        <!-- =================================================================
             Crash Resume
             =============================================================== -->

        <Teleport to="body">
            <div
                v-if="
                    crashResumeMessages &&
                    cartEmpty
                "
                class="dy-pos-sale__crash-resume"
                role="alert"
                aria-live="assertive"
                data-testid="pos-crash-resume"
            >
                <div
                    class="dy-pos-sale__crash-resume-icon"
                    aria-hidden="true"
                >
                    <FeatherIcon
                        name="rotate-ccw"
                        :size="20"
                    />
                </div>

                <div
                    class="dy-pos-sale__crash-resume-content"
                >
                    <strong>
                        {{ crashResumeMessages.title }}
                    </strong>

                    <span>
                        {{ crashResumeMessages.body }}
                    </span>

                    <small
                        v-if="
                            crashResumeMessages.subtitle
                        "
                    >
                        {{ crashResumeMessages.subtitle }}
                    </small>
                </div>

                <div
                    class="dy-pos-sale__crash-resume-actions"
                >
                    <DyButton
                        size="sm"
                        variant="primary"
                        @click="
                            resumePendingSale
                        "
                    >
                        {{ crashResumeMessages.accept }}
                    </DyButton>

                    <DyButton
                        size="sm"
                        variant="secondary"
                        @click="
                            dismissPendingSale
                        "
                    >
                        {{ crashResumeMessages.dismiss }}
                    </DyButton>
                </div>
            </div>
        </Teleport>

        <!-- =================================================================
             Workspace
             =============================================================== -->

        <main
            class="dy-pos-sale__workspace"
        >
            <!-- =============================================================
                 Product Discovery
                 =========================================================== -->

            <section
                class="dy-pos-sale__catalog"
                aria-label="المنتجات"
            >
                <div
                    class="dy-pos-sale__catalog-toolbar"
                >
                    <div
                        class="dy-pos-sale__search"
                    >
                        <FeatherIcon
                            name="search"
                            :size="20"
                            class="dy-pos-sale__search-icon"
                            aria-hidden="true"
                        />

                        <input
                            ref="searchInput"
                            v-model="
                                searchQuery
                            "
                            type="search"
                            class="dy-pos-sale__search-input"
                            data-testid="pos-search"
                            placeholder="امسح الباركود أو اكتب اسم المنتج ثم Enter..."
                            autocomplete="off"
                            enterkeyhint="search"
                            aria-label="البحث عن المنتجات"
                            @input="
                                handleSearch(
                                    searchQuery
                                )
                            "
                            @keydown.enter.prevent="
                                handleScanSubmit
                            "
                        />

                        <kbd
                            class="dy-pos-sale__shortcut"
                        >
                            F2
                        </kbd>

                        <button
                            v-if="
                                searchQuery
                            "
                            type="button"
                            class="dy-pos-sale__search-clear"
                            aria-label="مسح البحث"
                            @click="
                                searchQuery = ''
                            "
                        >
                            <FeatherIcon
                                name="x"
                                :size="16"
                            />
                        </button>
                    </div>

                    <!-- الكاشير الذكي: مؤشر البحث الذكي و«هل تقصد…؟» -->

                    <div
                        v-if="
                            searchQuery
                        "
                        class="dy-pos-sale__smart-search"
                    >
                        <span
                            class="dy-pos-sale__smart-search-badge"
                            :class="{
                                'is-fuzzy':
                                    searchIsApproximate,
                            }"
                        >
                            <FeatherIcon
                                :name="
                                    searchIsApproximate
                                        ? 'zap'
                                        : 'check-circle'
                                "
                                :size="14"
                            />

                            {{
                                searchIsApproximate
                                    ? "بحث تقريبي ذكي"
                                    : "ترتيب ذكي للمنتجات"
                            }}
                        </span>

                        <button
                            v-if="
                                searchDidYouMean
                            "
                            type="button"
                            class="dy-pos-sale__smart-search-suggestion"
                            @click="
                                applyDidYouMean
                            "
                        >
                            <FeatherIcon
                                name="corner-up-right"
                                :size="14"
                            />

                            <span>
                                هل تقصد:
                            </span>

                            <strong>
                                {{ searchDidYouMean }}
                            </strong>
                        </button>
                    </div>

                    <div
                        class="dy-pos-sale__catalog-actions"
                    >
                        <IconButton
                            icon="users"
                            variant="gray"
                            size="md"
                            title="العميل"
                            aria-label="اختيار العميل"
                            @click="
                                showCustomerPanel =
                                    true
                            "
                        />

                        <IconButton
                            v-if="
                                allowReturn
                            "
                            icon="corner-up-left"
                            variant="gray"
                            size="md"
                            title="مرتجع"
                            aria-label="فتح المرتجعات"
                            @click="
                                openReturns
                            "
                        />
                    </div>
                </div>

                <!-- Product count -->

                <div
                    class="dy-pos-sale__catalog-meta"
                >
                    <span>
                        {{
                            searchQuery
                                ? "نتائج البحث"
                                : "المنتجات"
                        }}
                    </span>

                    <span>
                        {{
                            formatNumber(
                                filteredProducts.length
                            )
                        }}
                    </span>
                </div>

                <!-- الكاشير الذكي: اقتراحات وتنبيهات لحظية (F8 للإخفاء/الإظهار) -->

                <SmartCashierDock
                    v-if="
                        showSmartDock
                    "
                    class="dy-pos-sale__smart-dock"
                    :suggestions="
                        smartSuggestionsList
                    "
                    :quick-sell="
                        smartQuickSell
                    "
                    :alerts="
                        smartAlerts
                    "
                    :shift-pulse="
                        smartShiftPulse
                    "
                    :cart-health="
                        smartCartHealth
                    "
                    :opportunities="
                        smartOpportunities
                    "
                    :currency="
                        currency
                    "
                    @add="
                        handleSmartAdd
                    "
                    @add-all="
                        handleSmartAddAll
                    "
                />

                <!-- Product Error -->

                <div
                    v-if="
                        productsError
                    "
                    class="dy-pos-sale__state dy-pos-sale__state--error"
                    role="alert"
                >
                    <FeatherIcon
                        name="alert-circle"
                        :size="24"
                    />

                    <strong>
                        تعذر تحميل المنتجات
                    </strong>

                    <span>
                        {{ productsError }}
                    </span>

                    <DyButton
                        size="sm"
                        variant="secondary"
                        @click="
                            productsError = ''
                        "
                    >
                        إعادة المحاولة
                    </DyButton>
                </div>

                <!-- Loading -->

                <div
                    v-else-if="
                        loadingProducts
                    "
                    class="dy-pos-sale__product-grid"
                    aria-busy="true"
                    aria-label="جاري تحميل المنتجات"
                >
                    <div
                        v-for="index in 12"
                        :key="index"
                        class="dy-pos-sale__product-skeleton"
                    >
                        <span />
                        <span />
                        <span />
                    </div>
                </div>

                <!-- Empty -->

                <div
                    v-else-if="
                        !filteredProducts.length
                    "
                    class="dy-pos-sale__state"
                >
                    <span
                        class="dy-pos-sale__state-icon"
                    >
                        <FeatherIcon
                            name="search"
                            :size="26"
                        />
                    </span>

                    <strong>
                        لا توجد منتجات
                    </strong>

                    <span>
                        جرّب البحث باسم المنتج أو الرمز.
                    </span>

                    <DyButton
                        v-if="
                            searchQuery
                        "
                        size="sm"
                        variant="secondary"
                        @click="
                            searchQuery = ''
                        "
                    >
                        عرض كل المنتجات
                    </DyButton>
                </div>

                <!-- Products -->

                <div
                    v-else
                    ref="productGrid"
                    class="dy-pos-sale__product-grid"
                    tabindex="0"
                    data-testid="pos-product-grid"
                    aria-label="شبكة المنتجات"
                    @keydown="
                        handleProductGridKeydown
                    "
                >
                    <button
                        v-for="(
                            product,
                            index
                        ) in filteredProducts"
                        :key="
                            product.id
                        "
                        type="button"
                        class="dy-pos-sale__product"
                        data-testid="pos-product-item"
                        :data-product-id="product.id"
                        :class="{
                            'is-active':
                                activeProductIndex ===
                                index,
                            'is-disabled':
                                product.disabled,
                        }"
                        :disabled="
                            product.disabled
                        "
                        :aria-label="
                            `${product.name}، ${formatMoney(product.price)}`
                        "
                        @mouseenter="
                            activeProductIndex =
                                index
                        "
                        @click="
                            addProduct(
                                product
                            )
                        "
                    >
                        <span
                            class="dy-pos-sale__product-image"
                        >
                            <img
                                v-if="
                                    product.image
                                "
                                :src="
                                    product.image
                                "
                                :alt="
                                    product.name
                                "
                                loading="lazy"
                                decoding="async"
                            />

                            <FeatherIcon
                                v-else
                                name="package"
                                :size="30"
                                aria-hidden="true"
                            />
                        </span>

                        <span
                            class="dy-pos-sale__product-info"
                        >
                            <strong
                                class="dy-pos-sale__product-name"
                            >
                                {{
                                    product.name
                                }}
                            </strong>

                            <span
                                class="dy-pos-sale__product-code"
                            >
                                {{
                                    product.code
                                }}
                            </span>
                        </span>

                        <span
                            class="dy-pos-sale__product-price"
                        >
                            {{
                                formatMoney(
                                    product.price
                                )
                            }}
                        </span>
                    </button>
                </div>
            </section>

            <!-- =============================================================
                 Cart
                 =========================================================== -->

            <aside
                class="dy-pos-sale__cart"
                data-testid="pos-cart"
                aria-label="سلة البيع"
            >
                <!-- Cart header -->

                <header
                    class="dy-pos-sale__cart-header"
                >
                    <div>
                        <span
                            class="dy-pos-sale__cart-eyebrow"
                        >
                            البيع الحالي
                        </span>

                        <h2>
                            السلة
                        </h2>
                    </div>

                    <div
                        class="dy-pos-sale__cart-header-actions"
                    >
                        <span
                            v-if="
                                cartItemCount
                            "
                            class="dy-pos-sale__count"
                        >
                            {{
                                formatNumber(
                                    cartItemCount
                                )
                            }}
                        </span>

                        <IconButton
                            v-if="
                                !cartEmpty
                            "
                            icon="trash-2"
                            variant="red"
                            size="sm"
                            title="إفراغ السلة"
                            aria-label="إفراغ السلة"
                            @click="
                                showClearCartDialog =
                                    true
                            "
                        />
                    </div>
                </header>

                <!-- Customer -->

                <button
                    v-if="
                        showCustomer
                    "
                    type="button"
                    class="dy-pos-sale__customer"
                    @click="
                        showCustomerPanel =
                            true
                    "
                >
                    <span
                        class="dy-pos-sale__customer-avatar"
                    >
                        <FeatherIcon
                            :name="
                                customer
                                    ? 'user'
                                    : 'user-plus'
                            "
                            :size="18"
                        />
                    </span>

                    <span
                        class="dy-pos-sale__customer-content"
                    >
                        <strong>
                            {{
                                customer?.name ||
                                "عميل نقدي"
                            }}
                        </strong>

                        <small>
                            {{
                                customer
                                    ? "عميل محدد"
                                    : "اضغط لاختيار عميل"
                            }}
                        </small>
                    </span>

                    <FeatherIcon
                        name="chevron-left"
                        :size="17"
                        aria-hidden="true"
                    />
                </button>

                <!-- Cart body -->

                <div
                    class="dy-pos-sale__cart-body"
                >
                    <div
                        v-if="
                            cartEmpty
                        "
                        class="dy-pos-sale__cart-empty"
                    >
                        <span
                            class="dy-pos-sale__cart-empty-icon"
                        >
                            <FeatherIcon
                                name="shopping-bag"
                                :size="28"
                            />
                        </span>

                        <strong>
                            السلة فارغة
                        </strong>

                        <span>
                            اختر منتجًا من القائمة لبدء البيع.
                        </span>

                        <button
                            type="button"
                            @click="
                                focusSearch
                            "
                        >
                            ابدأ البحث
                        </button>
                    </div>

                    <div
                        v-else
                        class="dy-pos-sale__cart-items"
                    >
                        <article
                            v-for="(
                                item,
                                index
                            ) in cart"
                            :key="
                                item.id
                            "
                            class="dy-pos-sale__cart-item"
                            data-testid="pos-cart-item"
                            :class="{
                                'is-active':
                                    activeProductIndex ===
                                    index,
                            }"
                            @mouseenter="
                                activeProductIndex =
                                    index
                            "
                        >
                            <button
                                type="button"
                                class="dy-pos-sale__item-remove"
                                aria-label="حذف الصنف"
                                @click="
                                    removeItem(
                                        item
                                    )
                                "
                            >
                                <FeatherIcon
                                    name="x"
                                    :size="14"
                                />
                            </button>

                            <div
                                class="dy-pos-sale__item-main"
                            >
                                <strong>
                                    {{
                                        item.name
                                    }}
                                </strong>

                                <span>
                                    {{
                                        formatMoney(
                                            item.unitPrice
                                        )
                                    }}
                                </span>
                            </div>

                            <div
                                class="dy-pos-sale__item-controls"
                            >
                                <button
                                    type="button"
                                    aria-label="تقليل الكمية"
                                    @click="
                                        decrementItem(
                                            item
                                        )
                                    "
                                >
                                    <FeatherIcon
                                        name="minus"
                                        :size="15"
                                    />
                                </button>

                                <button
                                    type="button"
                                    class="dy-pos-sale__item-quantity"
                                    aria-label="تعديل الكمية"
                                    @click="
                                        openQuantityEditor(
                                            item
                                        )
                                    "
                                >
                                    {{
                                        formatNumber(
                                            item.quantity
                                        )
                                    }}
                                </button>

                                <button
                                    type="button"
                                    aria-label="زيادة الكمية"
                                    @click="
                                        incrementItem(
                                            item
                                        )
                                    "
                                >
                                    <FeatherIcon
                                        name="plus"
                                        :size="15"
                                    />
                                </button>
                            </div>

                            <strong
                                class="dy-pos-sale__item-total"
                            >
                                {{
                                    formatMoney(
                                        item.quantity *
                                            item.unitPrice -
                                            item.discount
                                    )
                                }}
                            </strong>
                        </article>
                    </div>
                </div>

                <!-- Cart totals -->

                <footer
                    class="dy-pos-sale__cart-footer"
                >
                    <div
                        class="dy-pos-sale__totals"
                    >
                        <div>
                            <span>
                                المجموع الفرعي
                            </span>

                            <strong>
                                {{
                                    formatMoney(
                                        subtotal
                                    )
                                }}
                            </strong>
                        </div>

                        <div
                            v-if="
                                lineDiscountTotal ||
                                globalDiscount
                            "
                        >
                            <span>
                                الخصم
                            </span>

                            <strong
                                class="dy-pos-sale__discount"
                            >
                                -
                                {{
                                    formatMoney(
                                        lineDiscountTotal +
                                            globalDiscount
                                    )
                                }}
                            </strong>
                        </div>

                        <div>
                            <span>
                                الضريبة
                            </span>

                            <strong>
                                {{
                                    formatMoney(
                                        taxAmount
                                    )
                                }}
                            </strong>
                        </div>
                    </div>

                    <!-- Discount -->

                    <button
                        v-if="
                            allowDiscount &&
                            !cartEmpty
                        "
                        type="button"
                        class="dy-pos-sale__discount-action"
                        @click="
                            showDiscountPanel =
                                !showDiscountPanel
                        "
                    >
                        <FeatherIcon
                            name="percent"
                            :size="15"
                        />

                        {{
                            globalDiscount
                                ? "تعديل الخصم"
                                : "إضافة خصم"
                        }}
                    </button>

                    <div
                        v-if="
                            showDiscountPanel
                        "
                        class="dy-pos-sale__discount-panel"
                    >
                        <div
                            class="dy-pos-sale__segmented"
                        >
                            <button
                                type="button"
                                :class="{
                                    active:
                                        discountType ===
                                        'amount',
                                }"
                                @click="
                                    discountType =
                                        'amount'
                                "
                            >
                                مبلغ
                            </button>

                            <button
                                type="button"
                                :class="{
                                    active:
                                        discountType ===
                                        'percent',
                                }"
                                @click="
                                    discountType =
                                        'percent'
                                "
                            >
                                نسبة
                            </button>
                        </div>

                        <input
                            v-model.number="
                                discountValue
                            "
                            type="text"
                            inputmode="decimal"
                            autocomplete="off"
                            min="0"
                            :max="
                                discountType ===
                                'percent'
                                    ? 100
                                    : subtotal
                            "
                            class="dy-pos-sale__discount-input"
                            :aria-label="
                                discountType ===
                                'percent'
                                    ? 'نسبة الخصم'
                                    : 'قيمة الخصم'
                            "
                            @change="
                                applyGlobalDiscount
                            "
                        />

                        <button
                            type="button"
                            class="dy-pos-sale__discount-remove"
                            @click="
                                removeDiscount
                            "
                        >
                            إزالة
                        </button>
                    </div>

                    <!-- Grand total -->

                    <div
                        class="dy-pos-sale__grand-total"
                    >
                        <span>
                            الإجمالي
                        </span>

                        <strong>
                            {{
                                formatMoney(
                                    total
                                )
                            }}
                        </strong>
                    </div>

                    <!-- Actions -->

                    <div
                        class="dy-pos-sale__primary-actions"
                    >
                        <DyButton
                            variant="primary"
                            size="xl"
                            class="dy-pos-sale__checkout"
                            data-testid="pos-proceed-to-payment"
                            :disabled="
                                !canCheckout
                            "
                            @click="
                                openPayment
                            "
                        >
                            <FeatherIcon
                                name="credit-card"
                                :size="19"
                            />

                            <span>
                                الدفع
                            </span>

                            <strong>
                                {{
                                    formatMoney(
                                        total
                                    )
                                }}
                            </strong>
                        </DyButton>

                        <button
                            v-if="
                                allowHold
                            "
                            type="button"
                            class="dy-pos-sale__hold"
                            :disabled="
                                cartEmpty ||
                                busy
                            "
                            @click="
                                holdSale
                            "
                        >
                            <FeatherIcon
                                name="pause-circle"
                                :size="17"
                            />

                            تعليق البيع

                            <kbd>
                                F4
                            </kbd>
                        </button>
                    </div>
                </footer>
            </aside>
        </main>

        <!-- =================================================================
             Quantity Dialog
             =============================================================== -->

        <Teleport to="body">
            <div
                v-if="
                    quantityEditor
                "
                class="dy-pos-sale__overlay"
                role="dialog"
                aria-modal="true"
                aria-label="تعديل الكمية"
                @click.self="
                    closeQuantityEditor
                "
            >
                <div
                    class="dy-pos-sale__dialog dy-pos-sale__quantity-dialog"
                >
                    <header>
                        <span>
                            تعديل الكمية
                        </span>

                        <button
                            type="button"
                            aria-label="إغلاق"
                            @click="
                                closeQuantityEditor
                            "
                        >
                            <FeatherIcon
                                name="x"
                                :size="18"
                            />
                        </button>
                    </header>

                    <div
                        class="dy-pos-sale__dialog-body"
                    >
                        <strong>
                            {{
                                quantityEditor.name
                            }}
                        </strong>

                        <input
                            ref="quantityInput"
                            v-model.number="
                                quantityEditor.quantity
                            "
                            type="text"
                            min="1"
                            max="9999"
                            inputmode="numeric"
                            autocomplete="off"
                            class="dy-pos-sale__quantity-input"
                            @keydown.enter="
                                commitQuantity
                            "
                        />
                    </div>

                    <footer
                        class="dy-pos-sale__dialog-actions"
                    >
                        <DyButton
                            variant="secondary"
                            @click="
                                closeQuantityEditor
                            "
                        >
                            إلغاء
                        </DyButton>

                        <DyButton
                            variant="primary"
                            @click="
                                commitQuantity
                            "
                        >
                            تأكيد
                        </DyButton>
                    </footer>
                </div>
            </div>
        </Teleport>

        <!-- =================================================================
             Clear Cart
             =============================================================== -->

        <Teleport to="body">
            <div
                v-if="
                    showClearCartDialog
                "
                class="dy-pos-sale__overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dypos-clear-cart-title"
                @click.self="
                    showClearCartDialog =
                        false
                "
            >
                <div
                    class="dy-pos-sale__dialog"
                >
                    <header>
                        <span
                            id="dypos-clear-cart-title"
                        >
                            إفراغ السلة
                        </span>

                        <button
                            type="button"
                            aria-label="إغلاق"
                            @click="
                                showClearCartDialog =
                                    false
                            "
                        >
                            <FeatherIcon
                                name="x"
                                :size="18"
                            />
                        </button>
                    </header>

                    <div
                        class="dy-pos-sale__dialog-body"
                    >
                        <span
                            class="dy-pos-sale__warning-icon"
                        >
                            <FeatherIcon
                                name="alert-triangle"
                                :size="24"
                            />
                        </span>

                        <strong>
                            هل تريد إفراغ السلة؟
                        </strong>

                        <p>
                            سيتم حذف جميع الأصناف من عملية البيع الحالية.
                        </p>
                    </div>

                    <footer
                        class="dy-pos-sale__dialog-actions"
                    >
                        <DyButton
                            variant="secondary"
                            @click="
                                showClearCartDialog =
                                    false
                            "
                        >
                            إلغاء
                        </DyButton>

                        <DyButton
                            variant="danger"
                            @click="
                                clearCart
                            "
                        >
                            إفراغ السلة
                        </DyButton>
                    </footer>
                </div>
            </div>
        </Teleport>

        <!-- =================================================================
             Payment
             =============================================================== -->

        <Teleport to="body">
            <div
                v-if="
                    showPaymentPanel
                "
                class="dy-pos-sale__overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dypos-payment-title"
                @click.self="
                    closePayment
                "
            >
                <section
                    class="dy-pos-sale__dialog dy-pos-sale__payment-dialog"
                >
                    <header>
                        <div>
                            <span>
                                إتمام البيع
                            </span>

                            <h2
                                id="dypos-payment-title"
                            >
                                الدفع
                            </h2>
                        </div>

                        <button
                            type="button"
                            aria-label="إغلاق"
                            :disabled="
                                paymentProcessing
                            "
                            @click="
                                closePayment
                            "
                        >
                            <FeatherIcon
                                name="x"
                                :size="20"
                            />
                        </button>
                    </header>

                    <div
                        class="dy-pos-sale__payment-body"
                    >
                        <!-- Total -->

                        <div
                            class="dy-pos-sale__payment-total"
                        >
                            <span>
                                المبلغ المطلوب
                            </span>

                            <strong>
                                {{
                                    formatMoney(
                                        total
                                    )
                                }}
                            </strong>
                        </div>

                        <!-- Methods -->

                        <div
                            class="dy-pos-sale__payment-methods"
                            role="radiogroup"
                            aria-label="طريقة الدفع"
                        >
                            <button
                                v-for="
                                    method in paymentMethods
                                "
                                :key="
                                    method.id
                                "
                                type="button"
                                role="radio"
                                :aria-checked="
                                    paymentMethod ===
                                    method.id
                                "
                                :class="{
                                    active:
                                        paymentMethod ===
                                        method.id,
                                }"
                                @click="
                                    paymentMethod =
                                        method.id
                                "
                            >
                                <FeatherIcon
                                    :name="
                                        method.icon
                                    "
                                    :size="20"
                                />

                                <span>
                                    {{
                                        method.label
                                    }}
                                </span>
                            </button>
                        </div>

                        <!-- Cash amount -->

                        <div
                            v-if="
                                paymentMethod ===
                                'cash'
                            "
                            class="dy-pos-sale__payment-field"
                        >
                            <label
                                for="dypos-payment-amount"
                            >
                                المبلغ المستلم
                            </label>

                            <input
                                id="dypos-payment-amount"
                                data-testid="pos-payment-amount"
                                v-model="
                                    paymentAmount
                                "
                                type="text"
                                min="0"
                                step="0.01"
                                inputmode="decimal"
                                autocomplete="off"
                                class="dy-pos-sale__payment-input"
                                @keydown.enter="
                                    confirmPayment
                                "
                            />

                            <div
                                class="dy-pos-sale__quick-amounts"
                            >
                                <button
                                    type="button"
                                    @click="
                                        paymentAmount =
                                            String(
                                                total
                                            )
                                    "
                                >
                                    المبلغ كاملًا
                                </button>

                                <button
                                    type="button"
                                    @click="
                                        paymentAmount =
                                            String(
                                                Math.ceil(
                                                    total
                                                )
                                            )
                                    "
                                >
                                    تقريب
                                </button>
                            </div>

                            <!-- الكاشير الذكي: فئات نقدية مقترحة + «الفئة المعتادة» المُتعلَّمة -->

                            <div
                                v-if="
                                    smartCashTender.length
                                "
                                class="dy-pos-sale__smart-tender"
                            >
                                <span
                                    class="dy-pos-sale__smart-tender-title"
                                >
                                    <FeatherIcon
                                        name="cpu"
                                        :size="14"
                                    />

                                    الكاشير الذكي: أسرع مبلغ للتحصيل
                                </span>

                                <div
                                    class="dy-pos-sale__smart-tender-chips"
                                >
                                    <button
                                        v-for="tender in smartCashTender"
                                        :key="
                                            tender.amount
                                        "
                                        type="button"
                                        class="dy-pos-sale__smart-tender-chip"
                                        :class="{
                                            'is-learned':
                                                tender.source ===
                                                'learned',
                                            'is-exact':
                                                tender.source ===
                                                'exact',
                                        }"
                                        :title="
                                            tender.change
                                                ? `الباقي للعميل: ${formatMoney(tender.change)}`
                                                : 'بدون باقٍ'
                                        "
                                        @click="
                                            paymentAmount =
                                                String(
                                                    tender.amount
                                                )
                                        "
                                    >
                                        <strong>
                                            {{
                                                formatNumber(
                                                    tender.amount
                                                )
                                            }}
                                        </strong>

                                        <small>
                                            {{
                                                tender.label
                                            }}
                                        </small>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Change -->

                        <div
                            v-if="
                                paymentMethod ===
                                'cash'
                            "
                            class="dy-pos-sale__payment-summary"
                        >
                            <div>
                                <span>
                                    المتبقي
                                </span>

                                <strong>
                                    {{
                                        formatMoney(
                                            remainingAmount
                                        )
                                    }}
                                </strong>
                            </div>

                            <div>
                                <span>
                                    الباقي
                                </span>

                                <strong
                                    class="is-change"
                                >
                                    {{
                                        formatMoney(
                                            changeAmount
                                        )
                                    }}
                                </strong>
                            </div>
                        </div>

                        <!-- Error -->

                        <div
                            v-if="
                                paymentError
                            "
                            class="dy-pos-sale__payment-error"
                            role="alert"
                        >
                            <FeatherIcon
                                name="alert-circle"
                                :size="17"
                            />

                            {{ paymentError }}
                        </div>
                    </div>

                    <footer
                        class="dy-pos-sale__dialog-actions dy-pos-sale__payment-actions"
                    >
                        <DyButton
                            variant="secondary"
                            size="lg"
                            :disabled="
                                paymentProcessing
                            "
                            @click="
                                closePayment
                            "
                        >
                            إلغاء
                        </DyButton>

                        <DyButton
                            variant="primary"
                            size="lg"
                            data-testid="pos-complete-payment"
                            :loading="
                                paymentProcessing
                            "
                            :disabled="
                                !canConfirmPayment
                            "
                            @click="
                                confirmPayment
                            "
                        >
                            تأكيد الدفع
                        </DyButton>
                    </footer>
                </section>
            </div>
        </Teleport>

        <!-- =================================================================
             Receipt
             =============================================================== -->

        <Teleport to="body">
            <div
                v-if="
                    receiptVisible &&
                    completedSale
                "
                class="dy-pos-sale__overlay"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dypos-receipt-title"
            >
                <section
                    class="dy-pos-sale__dialog dy-pos-sale__receipt"
                    data-testid="pos-receipt"
                >
                    <div
                        class="dy-pos-sale__receipt-success"
                    >
                        <span>
                            <FeatherIcon
                                name="check"
                                :size="28"
                            />
                        </span>

                        <strong
                            id="dypos-receipt-title"
                        >
                            تمت عملية البيع
                        </strong>

                        <small>
                            تم اعتماد العملية بنجاح.
                        </small>
                    </div>

                    <div
                        class="dy-pos-sale__receipt-total"
                    >
                        <span>
                            الإجمالي
                        </span>

                        <strong>
                            {{
                                formatMoney(
                                    completedSale
                                        ?.pricing
                                        ?.total ??
                                        total
                                )
                            }}
                        </strong>
                    </div>

                    <div
                        class="dy-pos-sale__receipt-actions"
                    >
                        <DyButton
                            variant="secondary"
                            size="lg"
                            @click="
                                printReceipt
                            "
                        >
                            <FeatherIcon
                                name="printer"
                                :size="17"
                            />

                            طباعة الإيصال
                        </DyButton>

                        <DyButton
                            variant="primary"
                            size="lg"
                            @click="
                                startNewSale
                            "
                        >
                            <FeatherIcon
                                name="plus"
                                :size="17"
                            />

                            بيع جديد
                        </DyButton>
                    </div>
                </section>
            </div>
        </Teleport>

        <!-- =================================================================
             Customer Surface
             =============================================================== -->

        <Teleport to="body">
            <div
                v-if="
                    showCustomerPanel
                "
                class="dy-pos-sale__overlay"
                role="dialog"
                aria-modal="true"
                aria-label="اختيار العميل"
                @click.self="
                    showCustomerPanel =
                        false
                "
            >
                <section
                    class="dy-pos-sale__dialog dy-pos-sale__customer-dialog"
                >
                    <header>
                        <div>
                            <span>
                                العميل
                            </span>

                            <h2>
                                اختيار العميل
                            </h2>
                        </div>

                        <button
                            type="button"
                            aria-label="إغلاق"
                            @click="
                                showCustomerPanel =
                                    false
                            "
                        >
                            <FeatherIcon
                                name="x"
                                :size="20"
                            />
                        </button>
                    </header>

                    <div
                        class="dy-pos-sale__customer-selector"
                    >
                        <AutocompleteSelect
                            :model-value="
                                customer?.id ??
                                customer?.name ??
                                customer
                            "
                            :options="customerOptions"
                            :loading="customerSearchLoading"
                            placeholder="ابحث عن العميل..."
                            aria-label="البحث عن العميل"
                            @update:model-value="
                                selectCustomer
                            "
                            @search="
                                handleCustomerSearch
                            "
                        />

                        <button
                            v-if="
                                customer
                            "
                            type="button"
                            class="dy-pos-sale__clear-customer"
                            @click="
                                clearCustomer
                            "
                        >
                            استخدام عميل نقدي
                        </button>
                    </div>
                </section>
            </div>
        </Teleport>

        <!-- =================================================================
             Held Sales
             =============================================================== -->

        <Teleport to="body">
            <div
                v-if="
                    showHeldSalesPanel
                "
                class="dy-pos-sale__overlay"
                role="dialog"
                aria-modal="true"
                aria-label="المبيعات المعلقة"
                @click.self="
                    showHeldSalesPanel =
                        false
                "
            >
                <section
                    class="dy-pos-sale__dialog dy-pos-sale__held-dialog"
                >
                    <header>
                        <div>
                            <span>
                                العمليات المؤجلة
                            </span>

                            <h2>
                                المبيعات المعلقة
                            </h2>
                        </div>

                        <button
                            type="button"
                            aria-label="إغلاق"
                            @click="
                                showHeldSalesPanel =
                                    false
                            "
                        >
                            <FeatherIcon
                                name="x"
                                :size="20"
                            />
                        </button>
                    </header>

                    <div
                        class="dy-pos-sale__held-empty"
                    >
                        <span>
                            <FeatherIcon
                                name="pause-circle"
                                :size="28"
                            />
                        </span>

                        <strong>
                            المبيعات المعلقة
                        </strong>

                        <p>
                            سيتم عرض العمليات المعلقة من طبقة إدارة المبيعات عند توفرها.
                        </p>
                    </div>
                </section>
            </div>
        </Teleport>

        <!-- =================================================================
             Shortcuts Help (؟)
             =============================================================== -->

        <Teleport to="body">
            <div
                v-if="
                    showShortcutsPanel
                "
                class="dy-pos-sale__overlay"
                role="dialog"
                aria-modal="true"
                aria-label="اختصارات لوحة المفاتيح"
                @click.self="
                    showShortcutsPanel =
                        false
                "
            >
                <section
                    class="dy-pos-sale__dialog dy-pos-sale__held-dialog"
                >
                    <header>
                        <div>
                            <span>
                                مساعدة سريعة
                            </span>

                            <h2>
                                اختصارات لوحة المفاتيح
                            </h2>
                        </div>

                        <button
                            type="button"
                            aria-label="إغلاق"
                            @click="
                                showShortcutsPanel =
                                    false
                            "
                        >
                            <FeatherIcon
                                name="x"
                                :size="20"
                            />
                        </button>
                    </header>

                    <ul
                        class="dy-pos-sale__shortcuts-list"
                    >
                        <li
                            v-for="s in POS_SHORTCUTS"
                            :key="s.keys"
                        >
                            <kbd>{{ s.keys }}</kbd>
                            <span>{{ s.action }}</span>
                        </li>
                    </ul>
                </section>
            </div>
        </Teleport>

        <!-- =================================================================
             Global Notification
             =============================================================== -->

        <Teleport to="body">
            <div
                v-if="
                    notification
                "
                class="dy-pos-sale__notification"
                :class="[
                    `dy-pos-sale__notification--${notification.type}`,
                ]"
                role="status"
                aria-live="polite"
            >
                <FeatherIcon
                    :name="
                        notification.type ===
                        'success'
                            ? 'check-circle'
                            : notification.type ===
                                'error'
                            ? 'alert-circle'
                            : 'info'
                    "
                    :size="18"
                />

                <span>
                    {{
                        notification.message
                    }}
                </span>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
/* =============================================================================
   DyPOS Sale Workspace
   ============================================================================= */

.dy-pos-sale {
    --sale-sidebar-width: clamp(
        390px,
        31vw,
        500px
    );

    display: flex;
    flex-direction: column;

    min-width: 0;
    min-height: 100vh;
    min-height: 100dvh;

    overflow: hidden;

    background: var(--dy-bg);
    color: var(--dy-text);

    font-family: var(--dy-font-arabic);
}

/* =============================================================================
   Status
   ============================================================================= */
.dy-pos-sale__status {
    display: flex;
    align-items: center;
    gap: 7px;

    min-height: 34px;

    padding-inline: var(--dy-space-5);

    border-bottom:
        1px solid
        var(--dy-border);

    background:
        var(--dy-surface);

    color:
        var(--dy-text-muted);

    font-size: 0.72rem;
    font-weight: 650;
}

.dy-pos-header-action {
    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;

    width: 40px;
    height: 40px;

    border: 0;
    border-radius: 12px;

    background: transparent;

    color:
        rgb(71 85 105);

    outline: none;

    cursor: pointer;

    transition:
        background-color 140ms ease,
        color 140ms ease,
        transform 140ms ease;
}

.dy-pos-header-action:hover {
    background: rgb(248 250 252);

    color: rgb(15 23 42);
}

.dy-pos-header-action:active {
    transform: scale(0.96);
}

.dy-pos-header-action:focus-visible {
    outline: 2px solid rgb(5 150 105);

    outline-offset: 2px;
}

.dy-pos-sale__status-dot {
    width: 7px;
    height: 7px;

    border-radius: 50%;

    background:
        var(--dy-mint-500);
}

.dy-pos-sale__status--syncing
    .dy-pos-sale__status-dot {
    background:
        var(--dy-amber-500);

    animation:
        dy-pulse
        1.2s
        ease-in-out
        infinite;
}

.dy-pos-sale__status--offline
    .dy-pos-sale__status-dot {
    background:
        var(--dy-amber-500);
}

.dy-pos-sale__status--error
    .dy-pos-sale__status-dot {
    background:
        var(--dy-crimson-500);
}

.dy-pos-sale__status-separator {
    opacity: 0.5;
}

/* =============================================================================
   Workspace
   ============================================================================= */

.dy-pos-sale__workspace {
    display: grid;

    grid-template-columns:
        minmax(0, 1fr)
        var(--sale-sidebar-width);

    flex: 1;

    min-height: 0;
}

/* =============================================================================
   Catalog
   ============================================================================= */

.dy-pos-sale__catalog {
    display: flex;
    flex-direction: column;

    min-width: 0;
    min-height: 0;

    overflow: hidden;

    background:
        var(--dy-bg);
}

.dy-pos-sale__catalog-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;

    padding:
        var(--dy-space-4)
        var(--dy-space-5);

    border-bottom:
        1px solid
        var(--dy-border);

    background:
        var(--dy-surface);
}

/* ============================================================================
   البحث الذكي — Smart Search
   ========================================================================= */

.dy-pos-sale__smart-search {
    display: flex;
    align-items: center;
    flex-wrap: wrap;

    flex: 1 0 100%;
    order: 3;

    gap: 8px;

    margin-top: 2px;
}

.dy-pos-sale__smart-search-badge {
    display: inline-flex;
    align-items: center;

    gap: 6px;

    padding:
        3px
        10px;

    border-radius: 999px;

    background:
        var(--dy-success-soft);

    color: var(--dy-success);

    font-size: 11.5px;
    font-weight: 600;

    white-space: nowrap;
}

.dy-pos-sale__smart-search-badge.is-fuzzy {
    background:
        var(--dy-warning-soft);

    color: var(--dy-warning);
}

.dy-pos-sale__smart-search-suggestion {
    display: inline-flex;
    align-items: center;

    gap: 6px;

    max-width: 100%;

    padding:
        3px
        10px;

    border:
        1px dashed
        var(--dy-border-strong);

    border-radius: 999px;

    background: transparent;

    color: var(--dy-text);

    font-size: 12px;

    cursor: pointer;
}

.dy-pos-sale__smart-search-suggestion:hover {
    border-color: var(--dy-accent);

    color: var(--dy-accent);
}

.dy-pos-sale__smart-search-suggestion strong {
    overflow: hidden;

    max-width: 220px;

    text-overflow: ellipsis;
    white-space: nowrap;
}

.dy-pos-sale__search {
    position: relative;

    display: flex;
    align-items: center;

    flex: 1;

    min-width: 0;
}

.dy-pos-sale__search-icon {
    position: absolute;
    inset-inline-start: 15px;

    color: var(--dy-text-muted);

    pointer-events: none;
}

.dy-pos-sale__search-input {
    width: 100%;
    min-height: 48px;

    padding:
        0
        58px
        0
        44px;

    border:
        1px solid
        var(--dy-input-border);

    border-radius:
        var(--dy-radius-lg);

    outline: none;

    background:
        var(--dy-input-bg);

    color:
        var(--dy-text);

    font-family:
        var(--dy-font-arabic);

    font-size: 0.9rem;

    transition:
        border-color
            var(--dy-dur-fast)
            var(--dy-ease-standard),
        box-shadow
            var(--dy-dur-fast)
            var(--dy-ease-standard);
}

.dy-pos-sale__search-input:focus {
    border-color:
        var(--dy-accent);

    box-shadow:
        0 0 0 3px
        rgb(
            var(--dy-brand-c-500) /
            0.11
        );
}

.dy-pos-sale__search-input::-webkit-search-cancel-button {
    display: none;
}

.dy-pos-sale__shortcut {
    position: absolute;
    inset-inline-end: 13px;

    padding:
        3px 6px;

    border:
        1px solid
        var(--dy-border);

    border-radius: 5px;

    background:
        var(--dy-surface-strong);

    color:
        var(--dy-text-muted);

    font-family:
        var(--dy-font-mono);

    font-size: 0.65rem;
}

.dy-pos-sale__search-clear {
    position: absolute;
    inset-inline-end: 52px;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: 32px;
    height: 32px;

    border: 0;
    border-radius: 8px;

    background:
        var(--dy-surface-soft);

    color:
        var(--dy-text-muted);

    cursor: pointer;
}

.dy-pos-sale__catalog-actions {
    display: flex;
    gap: 6px;
}

.dy-pos-sale__catalog-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;

    padding:
        12px
        var(--dy-space-5);

    color:
        var(--dy-text-muted);

    font-size: 0.73rem;
}

.dy-pos-sale__catalog-meta span:last-child {
    font-variant-numeric:
        tabular-nums;
}

/* =============================================================================
    Smart Cashier Dock — شريط الكاشير الذكي
    ============================================================================= */

.dy-pos-sale__smart-dock {
    margin:
        0
        var(--dy-space-5)
        var(--dy-space-3);

    flex-shrink: 0;
}

/* =============================================================================
   Product Grid
   ============================================================================= */

.dy-pos-sale__product-grid {
    display: grid;

    grid-template-columns:
        repeat(
            auto-fill,
            minmax(
                150px,
                1fr
            )
        );

    align-content: start;

    gap:
        var(--dy-product-tile-gap, 12px);

    flex: 1;

    min-height: 0;

    padding:
        0
        var(--dy-space-5)
        var(--dy-space-5);

    overflow-y: auto;

    overscroll-behavior: contain;
}

.dy-pos-sale__product-grid:focus-visible {
    outline:
        var(--dy-focus-width)
        solid
        var(--dy-focus-color);

    outline-offset:
        -2px;
}

.dy-pos-sale__product {
    position: relative;

    display: flex;
    flex-direction: column;

    min-width: 0;
    min-height: 180px;

    padding: 10px;

    border:
        1px solid
        var(--dy-border);

    border-radius:
        var(--dy-radius-xl);

    background:
        var(--dy-surface);

    color:
        var(--dy-text);

    font: inherit;

    text-align: start;

    cursor: pointer;

    box-shadow:
        var(--dy-elevation-1);

    transition:
        border-color
            var(--dy-dur-fast)
            var(--dy-ease-standard),
        box-shadow
            var(--dy-dur-fast)
            var(--dy-ease-standard),
        transform
            var(--dy-dur-fast)
            var(--dy-ease-standard);
}

.dy-pos-sale__product:hover,
.dy-pos-sale__product.is-active {
    border-color:
        rgb(
            var(--dy-brand-c-500) /
            0.46
        );

    box-shadow:
        var(--dy-elevation-2);

    transform:
        translateY(-1px);
}

.dy-pos-sale__product:active {
    transform:
        translateY(0)
        scale(0.985);
}

.dy-pos-sale__product:focus-visible {
    outline:
        var(--dy-focus-width)
        solid
        var(--dy-focus-color);

    outline-offset: 2px;
}

.dy-pos-sale__product.is-disabled {
    cursor: not-allowed;
    opacity:
        var(--dy-disabled-opacity);
}

.dy-pos-sale__product-image {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 100%;
    height: 104px;

    margin-bottom: 10px;

    overflow: hidden;

    border-radius:
        var(--dy-radius-lg);

    background:
        var(--dy-surface-soft);

    color:
        var(--dy-text-muted);
}

.dy-pos-sale__product-image img {
    width: 100%;
    height: 100%;

    object-fit: cover;
}

.dy-pos-sale__product-info {
    display: flex;
    flex-direction: column;

    min-width: 0;

    gap: 3px;
}

.dy-pos-sale__product-name {
    overflow: hidden;

    color:
        var(--dy-text-strong);

    font-size: 0.82rem;
    font-weight: 750;

    text-overflow: ellipsis;
    white-space: nowrap;
}

.dy-pos-sale__product-code {
    overflow: hidden;

    color:
        var(--dy-text-muted);

    font-family:
        var(--dy-font-english);

    font-size: 0.66rem;

    text-overflow: ellipsis;
    white-space: nowrap;

    direction: ltr;
    text-align: start;
}

.dy-pos-sale__product-price {
    margin-top: auto;

    padding-top: 10px;

    color:
        var(--dy-accent);

    font-family:
        var(--dy-font-english);

    font-size: 0.9rem;
    font-weight: 800;

    direction: ltr;
    text-align: right;
}

/* =============================================================================
   Product Skeleton
   ============================================================================= */

.dy-pos-sale__product-skeleton {
    min-height: 180px;

    padding: 10px;

    border:
        1px solid
        var(--dy-border);

    border-radius:
        var(--dy-radius-xl);

    background:
        var(--dy-surface);
}

.dy-pos-sale__product-skeleton span {
    display: block;

    height: 10px;

    margin-bottom: 9px;

    border-radius: 6px;

    background:
        var(--dy-surface-strong);

    animation:
        dy-shimmer
        1.5s
        linear
        infinite;
}

.dy-pos-sale__product-skeleton span:first-child {
    height: 104px;
}

/* =============================================================================
   Empty / Error
   ============================================================================= */

.dy-pos-sale__state {
    display: flex;
    align-items: center;
    justify-content: center;

    flex-direction: column;

    gap: 8px;

    flex: 1;

    min-height: 300px;

    padding: 40px;

    color:
        var(--dy-text-muted);

    text-align: center;
}

.dy-pos-sale__state strong {
    color:
        var(--dy-text-strong);

    font-size: 0.95rem;
}

.dy-pos-sale__state span:not(
    .dy-pos-sale__state-icon
) {
    max-width: 360px;

    font-size: 0.78rem;
}

.dy-pos-sale__state-icon {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 58px;
    height: 58px;

    margin-bottom: 6px;

    border-radius: 18px;

    background:
        var(--dy-surface);

    color:
        var(--dy-text-muted);
}

.dy-pos-sale__state--error {
    color:
        var(--dy-crimson-600);
}

/* =============================================================================
   Cart
   ============================================================================= */

.dy-pos-sale__cart {
    display: flex;
    flex-direction: column;

    min-width: 0;
    min-height: 0;

    border-inline-start:
        1px solid
        var(--dy-border);

    background:
        var(--dy-surface);

    box-shadow:
        var(--dy-elevation-2);
}

.dy-pos-sale__cart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    min-height: 72px;

    padding:
        12px
        var(--dy-space-5);

    border-bottom:
        1px solid
        var(--dy-border);
}

.dy-pos-sale__cart-eyebrow {
    display: block;

    margin-bottom: 2px;

    color:
        var(--dy-text-muted);

    font-size: 0.68rem;
}

.dy-pos-sale__cart-header h2 {
    margin: 0;

    color:
        var(--dy-text-strong);

    font-size: 1.05rem;
    font-weight: 800;
}

.dy-pos-sale__cart-header-actions {
    display: flex;
    align-items: center;
    gap: 7px;
}

.dy-pos-sale__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;

    min-width: 30px;
    height: 30px;

    padding-inline: 7px;

    border-radius: 9px;

    background:
        rgb(
            var(--dy-brand-c-500) /
            0.09
        );

    color:
        var(--dy-accent);

    font-family:
        var(--dy-font-english);

    font-size: 0.72rem;
    font-weight: 800;
}

/* =============================================================================
   Customer
   ============================================================================= */

.dy-pos-sale__customer {
    display: flex;
    align-items: center;
    gap: 10px;

    width: calc(
        100% - 24px
    );

    margin: 12px;

    padding: 9px;

    border:
        1px solid
        var(--dy-border);

    border-radius:
        var(--dy-radius-lg);

    background:
        var(--dy-surface-soft);

    color:
        var(--dy-text);

    font: inherit;

    text-align: start;

    cursor: pointer;
}

.dy-pos-sale__customer:hover {
    border-color:
        var(--dy-border-strong);
}

.dy-pos-sale__customer-avatar {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 38px;
    height: 38px;

    flex: 0 0 auto;

    border-radius: 11px;

    background:
        rgb(
            var(--dy-brand-c-500) /
            0.10
        );

    color:
        var(--dy-accent);
}

.dy-pos-sale__customer-content {
    display: flex;
    flex-direction: column;

    flex: 1;

    min-width: 0;
}

.dy-pos-sale__customer-content strong {
    overflow: hidden;

    color:
        var(--dy-text-strong);

    font-size: 0.78rem;

    text-overflow: ellipsis;
    white-space: nowrap;
}

.dy-pos-sale__customer-content small {
    color:
        var(--dy-text-muted);

    font-size: 0.65rem;
}

/* =============================================================================
   Cart Body
   ============================================================================= */

.dy-pos-sale__cart-body {
    display: flex;
    flex: 1;

    min-height: 0;

    overflow: hidden;
}

.dy-pos-sale__cart-items {
    width: 100%;

    padding:
        0
        12px;

    overflow-y: auto;

    overscroll-behavior: contain;
}

.dy-pos-sale__cart-item {
    position: relative;

    display: grid;

    grid-template-columns:
        minmax(0, 1fr)
        auto
        auto;

    align-items: center;

    gap: 9px;

    min-height: var(--dy-cart-row-h, 68px);

    padding:
        8px
        4px;

    border-bottom:
        1px solid
        var(--dy-border);

    transition:
        background-color
            var(--dy-dur-fast)
            var(--dy-ease-standard);
}

.dy-pos-sale__cart-item:hover,
.dy-pos-sale__cart-item.is-active {
    background:
        var(--dy-surface-soft);
}

.dy-pos-sale__item-remove {
    position: absolute;

    inset-inline-start: 0;
    top: 8px;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 23px;
    height: 23px;

    border: 0;
    border-radius: 7px;

    background:
        transparent;

    color:
        var(--dy-text-muted);

    opacity: 0;

    cursor: pointer;
}

.dy-pos-sale__cart-item:hover
    .dy-pos-sale__item-remove {
    opacity: 1;
}

.dy-pos-sale__item-remove:hover {
    background:
        rgb(
            var(--dy-crimson-c-500) /
            0.08
        );

    color:
        var(--dy-crimson-600);
}

.dy-pos-sale__item-main {
    display: flex;
    flex-direction: column;

    min-width: 0;

    gap: 2px;
}

.dy-pos-sale__item-main strong {
    overflow: hidden;

    color:
        var(--dy-text-strong);

    font-size: 0.76rem;

    text-overflow: ellipsis;
    white-space: nowrap;
}

.dy-pos-sale__item-main span {
    color:
        var(--dy-text-muted);

    font-family:
        var(--dy-font-english);

    font-size: 0.66rem;
}

.dy-pos-sale__item-controls {
    display: flex;
    align-items: center;

    border:
        1px solid
        var(--dy-border);

    border-radius: 9px;

    background:
        var(--dy-surface);
}

.dy-pos-sale__item-controls button {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 29px;
    height: 30px;

    border: 0;

    background: transparent;

    color:
        var(--dy-text-secondary);

    cursor: pointer;
}

.dy-pos-sale__item-controls button:hover {
    color:
        var(--dy-accent);

    background:
        var(--dy-surface-soft);
}

.dy-pos-sale__item-quantity {
    min-width: 31px !important;

    color:
        var(--dy-text-strong) !important;

    font-family:
        var(--dy-font-english);

    font-size: 0.73rem;
    font-weight: 800;
}

.dy-pos-sale__item-total {
    min-width: 72px;

    color:
        var(--dy-text-strong);

    font-family:
        var(--dy-font-english);

    font-size: 0.78rem;
    font-weight: 800;

    direction: ltr;
    text-align: end;
}

.dy-pos-sale__cart-empty {
    display: flex;
    align-items: center;
    justify-content: center;

    flex: 1;

    flex-direction: column;

    gap: 7px;

    padding: 30px;

    color:
        var(--dy-text-muted);

    text-align: center;
}

.dy-pos-sale__cart-empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 64px;
    height: 64px;

    margin-bottom: 5px;

    border-radius: 20px;

    background:
        var(--dy-surface-soft);
}

.dy-pos-sale__cart-empty strong {
    color:
        var(--dy-text-strong);

    font-size: 0.9rem;
}

.dy-pos-sale__cart-empty span {
    max-width: 230px;

    font-size: 0.72rem;
    line-height: 1.7;
}

.dy-pos-sale__cart-empty button {
    margin-top: 6px;

    border: 0;

    background: transparent;

    color:
        var(--dy-accent);

    font: inherit;
    font-size: 0.75rem;
    font-weight: 750;

    cursor: pointer;
}

/* =============================================================================
   Cart Footer / Totals
   ============================================================================= */

.dy-pos-sale__cart-footer {
    padding:
        12px;

    border-top:
        1px solid
        var(--dy-border);

    background:
        var(--dy-surface);
}

.dy-pos-sale__totals {
    display: flex;
    flex-direction: column;

    gap: 7px;

    padding:
        2px
        4px
        8px;
}

.dy-pos-sale__totals > div {
    display: flex;
    align-items: center;
    justify-content: space-between;

    gap: 12px;

    color:
        var(--dy-text-muted);

    font-size: 0.73rem;
}

.dy-pos-sale__totals strong {
    color:
        var(--dy-text-secondary);

    font-family:
        var(--dy-font-english);

    font-size: 0.75rem;
}

.dy-pos-sale__discount {
    color:
        var(--dy-crimson-600) !important;
}

.dy-pos-sale__discount-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;

    padding:
        5px
        4px;

    border: 0;

    background: transparent;

    color:
        var(--dy-accent);

    font: inherit;
    font-size: 0.72rem;
    font-weight: 750;

    cursor: pointer;
}

.dy-pos-sale__discount-panel {
    display: flex;
    align-items: center;

    gap: 7px;

    margin:
        4px
        0
        8px;

    padding:
        8px;

    border:
        1px solid
        var(--dy-border);

    border-radius:
        var(--dy-radius-lg);

    background:
        var(--dy-surface-soft);
}

.dy-pos-sale__segmented {
    display: flex;

    border:
        1px solid
        var(--dy-border);

    border-radius: 8px;

    overflow: hidden;
}

.dy-pos-sale__segmented button {
    min-width: 43px;
    height: 32px;

    border: 0;

    background:
        var(--dy-surface);

    color:
        var(--dy-text-muted);

    font: inherit;
    font-size: 0.68rem;
    font-weight: 700;

    cursor: pointer;
}

.dy-pos-sale__segmented button.active {
    background:
        var(--dy-accent);

    color:
        var(--dy-accent-foreground);
}

.dy-pos-sale__discount-input {
    width: 90px;
    height: 32px;

    padding-inline: 8px;

    border:
        1px solid
        var(--dy-border);

    border-radius: 8px;

    outline: none;

    background:
        var(--dy-surface);

    color:
        var(--dy-text);

    font-family:
        var(--dy-font-english);
    font-size: 0.75rem;
}

.dy-pos-sale__discount-input:focus {
    border-color:
        var(--dy-accent);
}

.dy-pos-sale__discount-remove {
    border: 0;

    background: transparent;

    color:
        var(--dy-crimson-600);

    font: inherit;
    font-size: 0.68rem;
    font-weight: 700;

    cursor: pointer;
}

.dy-pos-sale__grand-total {
    display: flex;
    align-items: center;
    justify-content: space-between;

    margin-top: 3px;
    padding:
        12px
        4px;

    border-top:
        1px dashed
        var(--dy-border);

    color:
        var(--dy-text-strong);
}

.dy-pos-sale__grand-total span {
    font-size: 0.82rem;
    font-weight: 750;
}

.dy-pos-sale__grand-total strong {
    color:
        var(--dy-accent);

    font-family:
        var(--dy-font-english);

    font-size: 1.35rem;
    font-weight: 850;

    direction: ltr;
    text-align: end;
}

.dy-pos-sale__primary-actions {
    display: flex;
    flex-direction: column;

    gap: 7px;
}

.dy-pos-sale__checkout {
    width: 100%;
}

.dy-pos-sale__checkout strong {
    margin-inline-start: auto;

    font-family:
        var(--dy-font-english);
}

.dy-pos-sale__hold {
    display: flex;
    align-items: center;
    justify-content: center;

    gap: 7px;

    min-height: 40px;

    border:
        1px solid
        var(--dy-border);

    border-radius:
        var(--dy-radius-lg);

    background:
        var(--dy-surface);

    color:
        var(--dy-text-secondary);

    font: inherit;
    font-size: 0.75rem;
    font-weight: 700;

    cursor: pointer;
}

.dy-pos-sale__hold:hover:not(:disabled) {
    border-color:
        var(--dy-border-strong);

    background:
        var(--dy-surface-soft);
}

.dy-pos-sale__hold:disabled {
    cursor: not-allowed;
    opacity:
        var(--dy-disabled-opacity);
}

.dy-pos-sale__hold kbd {
    margin-inline-start: 3px;

    padding:
        2px
        5px;

    border:
        1px solid
        var(--dy-border);

    border-radius: 4px;

    background:
        var(--dy-surface-soft);

    font-family:
        var(--dy-font-mono);

    font-size: 0.58rem;
}

/* =============================================================================
   Dialogs
   ============================================================================= */

.dy-pos-sale__overlay {
    position: fixed;
    z-index: var(--dy-z-modal);

    inset: 0;

    display: flex;
    align-items: center;
    justify-content: center;

    padding:
        max(20px, env(safe-area-inset-top))
        max(20px, env(safe-area-inset-right))
        max(20px, env(safe-area-inset-bottom))
        max(20px, env(safe-area-inset-left));

    background:
        rgb(
            var(--dy-ink-c-950) /
            0.54
        );

    backdrop-filter:
        blur(8px);

    -webkit-backdrop-filter:
        blur(8px);
}

.dy-pos-sale__dialog {
    width: min(
        100%,
        440px
    );

    overflow: hidden;

    border:
        1px solid
        var(--dy-border);

    border-radius:
        var(--dy-radius-2xl);

    background:
        var(--dy-surface);

    box-shadow:
        var(--dy-elevation-5);
}

.dy-pos-sale__dialog > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;

    gap: 16px;

    padding:
        18px
        20px;

    border-bottom:
        1px solid
        var(--dy-border);
}

.dy-pos-sale__dialog > header > div {
    min-width: 0;
}

.dy-pos-sale__dialog > header span {
    display: block;

    margin-bottom: 3px;

    color:
        var(--dy-text-muted);

    font-size: 0.7rem;
}

.dy-pos-sale__dialog > header h2 {
    margin: 0;

    color:
        var(--dy-text-strong);

    font-size: 1.15rem;
    font-weight: 800;
}

.dy-pos-sale__dialog > header > button {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 36px;
    height: 36px;

    border: 0;
    border-radius: 9px;

    background:
        var(--dy-surface-soft);

    color:
        var(--dy-text-muted);

    cursor: pointer;
}

.dy-pos-sale__dialog-body {
    display: flex;
    flex-direction: column;

    gap: 12px;

    padding: 22px 20px;
}

.dy-pos-sale__dialog-body strong {
    color:
        var(--dy-text-strong);

    font-size: 0.9rem;
}

.dy-pos-sale__dialog-body p {
    margin: 0;

    color:
        var(--dy-text-secondary);

    font-size: 0.78rem;
    line-height: 1.8;
}

.dy-pos-sale__dialog-actions {
    display: flex;
    justify-content: flex-end;

    gap: 8px;

    padding:
        14px
        20px;

    border-top:
        1px solid
        var(--dy-border);

    background:
        var(--dy-surface-soft);
}

/* =============================================================================
   Quantity
   ============================================================================= */

.dy-pos-sale__quantity-input {
    width: 100%;

    min-height: 58px;

    padding-inline: 14px;

    border:
        1px solid
        var(--dy-input-border);

    border-radius:
        var(--dy-radius-lg);

    outline: none;

    background:
        var(--dy-input-bg);

    color:
        var(--dy-text);

    font-family:
        var(--dy-font-english);

    font-size: 1.35rem;
    font-weight: 800;

    text-align: center;
}

.dy-pos-sale__quantity-input:focus {
    border-color:
        var(--dy-accent);

    box-shadow:
        0 0 0 3px
        rgb(
            var(--dy-brand-c-500) /
            0.10
        );
}

/* =============================================================================
   Payment
   ============================================================================= */

.dy-pos-sale__payment-dialog {
    width: min(
        100%,
        500px
    );
}

.dy-pos-sale__payment-body {
    padding: 20px;
}

.dy-pos-sale__payment-total {
    display: flex;
    align-items: center;
    justify-content: space-between;

    padding: 16px;

    border-radius:
        var(--dy-radius-xl);

    background:
        rgb(
            var(--dy-brand-c-500) /
            0.07
        );
}

.dy-pos-sale__payment-total span {
    color:
        var(--dy-text-secondary);

    font-size: 0.8rem;
}

.dy-pos-sale__payment-total strong {
    color:
        var(--dy-accent);

    font-family:
        var(--dy-font-english);

    font-size: 1.5rem;
    font-weight: 850;
}

.dy-pos-sale__payment-methods {
    display: grid;

    grid-template-columns:
        repeat(3, 1fr);

    gap: 8px;

    margin-top: 16px;
}

.dy-pos-sale__payment-methods button {
    display: flex;
    align-items: center;
    justify-content: center;

    flex-direction: column;

    gap: 7px;

    min-height: 76px;

    border:
        1px solid
        var(--dy-border);

    border-radius:
        var(--dy-radius-lg);

    background:
        var(--dy-surface);

    color:
        var(--dy-text-secondary);

    font: inherit;
    font-size: 0.72rem;
    font-weight: 750;

    cursor: pointer;
}

.dy-pos-sale__payment-methods button:hover {
    border-color:
        var(--dy-border-strong);
}

.dy-pos-sale__payment-methods button.active {
    border-color:
        var(--dy-accent);

    background:
        rgb(
            var(--dy-brand-c-500) /
            0.08
        );

    color:
        var(--dy-accent);
}

.dy-pos-sale__payment-field {
    margin-top: 16px;
}

.dy-pos-sale__payment-field label {
    display: block;

    margin-bottom: 7px;

    color:
        var(--dy-text-strong);

    font-size: 0.78rem;
    font-weight: 750;
}

.dy-pos-sale__payment-input {
    width: 100%;

    min-height: 58px;

    padding-inline: 14px;

    border:
        1px solid
        var(--dy-input-border);

    border-radius:
        var(--dy-radius-lg);

    outline: none;

    background:
        var(--dy-input-bg);

    color:
        var(--dy-text);

    font-family:
        var(--dy-font-english);

    font-size: 1.35rem;
    font-weight: 800;

    direction: ltr;
    text-align: right;
}

.dy-pos-sale__payment-input:focus {
    border-color:
        var(--dy-accent);

    box-shadow:
        0 0 0 3px
        rgb(
            var(--dy-brand-c-500) /
            0.10
        );
}

.dy-pos-sale__quick-amounts {
    display: flex;
    gap: 6px;

    margin-top: 7px;
}

.dy-pos-sale__quick-amounts button {
    min-height: 32px;

    padding-inline: 10px;

    border:
        1px solid
        var(--dy-border);

    border-radius: 7px;

    background:
        var(--dy-surface);

    color:
        var(--dy-text-muted);

    font: inherit;
    font-size: 0.67rem;
    font-weight: 700;

    cursor: pointer;
}

/* ============================================================================
   النقد الذكي — Smart Cash Tender
   ========================================================================= */

.dy-pos-sale__smart-tender {
    display: flex;
    flex-direction: column;

    gap: 8px;

    margin-top: 12px;
}

.dy-pos-sale__smart-tender-title {
    display: inline-flex;
    align-items: center;

    gap: 6px;

    color: var(--dy-text-muted);

    font-size: 0.66rem;
    font-weight: 700;
}

.dy-pos-sale__smart-tender-chips {
    display: flex;
    flex-wrap: wrap;

    gap: 8px;
}

.dy-pos-sale__smart-tender-chip {
    display: flex;
    flex-direction: column;
    align-items: center;

    gap: 2px;

    min-width: 86px;

    padding:
        8px
        12px;

    border:
        1px solid
        var(--dy-border);

    border-radius: 10px;

    background:
        var(--dy-surface);

    color: var(--dy-text);

    font: inherit;

    cursor: pointer;

    transition:
        border-color 140ms ease,
        transform 140ms ease;
}

.dy-pos-sale__smart-tender-chip:hover {
    border-color: var(--dy-accent);

    transform: translateY(-1px);
}

.dy-pos-sale__smart-tender-chip strong {
    font-size: 0.9rem;
    font-weight: 800;
}

.dy-pos-sale__smart-tender-chip small {
    color: var(--dy-text-muted);

    font-size: 0.6rem;
    font-weight: 600;
}

.dy-pos-sale__smart-tender-chip.is-exact {
    border-color: var(--dy-success);

    background:
        var(--dy-success-soft);

    color: var(--dy-success);
}

.dy-pos-sale__smart-tender-chip.is-exact small {
    color: var(--dy-success);
}

.dy-pos-sale__smart-tender-chip.is-learned {
    border-color: var(--dy-warning);

    background:
        var(--dy-warning-soft);

    color: var(--dy-warning);
}

.dy-pos-sale__smart-tender-chip.is-learned small {
    color: var(--dy-warning);
}

.dy-pos-sale__payment-summary {
    display: grid;

    grid-template-columns:
        repeat(2, 1fr);

    gap: 8px;

    margin-top: 12px;
}

.dy-pos-sale__payment-summary > div {
    display: flex;
    flex-direction: column;

    gap: 3px;

    padding: 11px;

    border:
        1px solid
        var(--dy-border);

    border-radius:
        var(--dy-radius-lg);

    background:
        var(--dy-surface-soft);
}

.dy-pos-sale__payment-summary span {
    color:
        var(--dy-text-muted);

    font-size: 0.68rem;
}

.dy-pos-sale__payment-summary strong {
    color:
        var(--dy-text-strong);

    font-family:
        var(--dy-font-english);

    font-size: 0.9rem;
}

.dy-pos-sale__payment-summary
    strong.is-change {
    color:
        var(--dy-mint-600);
}

.dy-pos-sale__payment-error {
    display: flex;
    align-items: center;
    gap: 8px;

    margin-top: 12px;
    padding: 10px 12px;

    border:
        1px solid
        rgb(
            var(--dy-crimson-c-500) /
            0.22
        );

    border-radius:
        var(--dy-radius-lg);

    background:
        rgb(
            var(--dy-crimson-c-500) /
            0.07
        );

    color:
        var(--dy-crimson-700);

    font-size: 0.73rem;
}

.dy-pos-sale__payment-actions {
    justify-content: stretch;
}

.dy-pos-sale__payment-actions > * {
    flex: 1;
}

/* =============================================================================
   Receipt
   ============================================================================= */

.dy-pos-sale__receipt {
    width: min(
        100%,
        400px
    );

    padding: 26px;
}

.dy-pos-sale__receipt-success {
    display: flex;
    align-items: center;

    flex-direction: column;

    gap: 7px;

    text-align: center;
}

.dy-pos-sale__receipt-success > span {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 64px;
    height: 64px;

    margin-bottom: 6px;

    border-radius: 50%;

    background:
        rgb(
            var(--dy-mint-c-500) /
            0.12
        );

    color:
        var(--dy-mint-600);
}

.dy-pos-sale__receipt-success strong {
    color:
        var(--dy-text-strong);

    font-size: 1.05rem;
}

.dy-pos-sale__receipt-success small {
    color:
        var(--dy-text-muted);

    font-size: 0.72rem;
}

.dy-pos-sale__receipt-total {
    display: flex;
    align-items: center;
    justify-content: space-between;

    margin-top: 24px;
    padding: 15px;

    border-radius:
        var(--dy-radius-xl);

    background:
        var(--dy-surface-soft);
}

.dy-pos-sale__receipt-total span {
    color:
        var(--dy-text-secondary);

    font-size: 0.76rem;
}

.dy-pos-sale__receipt-total strong {
    color:
        var(--dy-accent);

    font-family:
        var(--dy-font-english);

    font-size: 1.25rem;
}

.dy-pos-sale__receipt-actions {
    display: flex;
    flex-direction: column;

    gap: 8px;

    margin-top: 18px;
}

.dy-pos-sale__receipt-actions > * {
    width: 100%;
}

/* =============================================================================
   Customer / Held
   ============================================================================= */

.dy-pos-sale__customer-dialog,
.dy-pos-sale__held-dialog {
    width: min(
        100%,
        520px
    );
}

.dy-pos-sale__customer-selector {
    padding: 20px;
}

.dy-pos-sale__clear-customer {
    margin-top: 12px;

    border: 0;

    background: transparent;

    color:
        var(--dy-accent);

    font: inherit;
    font-size: 0.75rem;
    font-weight: 750;

    cursor: pointer;
}

.dy-pos-sale__held-empty {
    display: flex;
    align-items: center;
    justify-content: center;

    flex-direction: column;

    gap: 8px;

    min-height: 260px;

    padding: 30px;

    color:
        var(--dy-text-muted);

    text-align: center;
}

.dy-pos-sale__held-empty > span {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 60px;
    height: 60px;

    margin-bottom: 4px;

    border-radius: 18px;

    background:
        var(--dy-surface-soft);
}

.dy-pos-sale__held-empty strong {
    color:
        var(--dy-text-strong);

    font-size: 0.9rem;
}

.dy-pos-sale__held-empty p {
    max-width: 340px;

    margin: 0;

    font-size: 0.75rem;
    line-height: 1.8;
}

.dy-pos-sale__shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: 6px;

    margin: 0;
    padding: 4px 2px 8px;

    list-style: none;
}

.dy-pos-sale__shortcuts-list li {
    display: flex;
    align-items: center;
    gap: 12px;

    padding: 8px 10px;
    border-radius: 10px;

    background: var(--dy-surface-soft);

    font-size: 0.8rem;
}

.dy-pos-sale__shortcuts-list kbd {
    min-width: 110px;

    padding: 4px 10px;
    border: 1px solid var(--dy-border, #e2e8f0);
    border-bottom-width: 2px;
    border-radius: 8px;

    background: var(--dy-bg, #fff);

    font-family: inherit;
    font-size: 0.72rem;
    font-weight: 700;
    text-align: center;
    white-space: nowrap;
}

/* =============================================================================
   Warning
   ============================================================================= */

.dy-pos-sale__warning-icon {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 48px;
    height: 48px;

    border-radius: 14px;

    background:
        rgb(
            var(--dy-amber-c-500) /
            0.10
        );

    color:
        var(--dy-amber-600);
}

/* =============================================================================
   Notification
   ============================================================================= */

.dy-pos-sale__notification {
    position: fixed;

    z-index:
        calc(
            var(--dy-z-toast, 900) + 20
        );

    inset-inline-start: 50%;
    bottom:
        max(
            24px,
            env(safe-area-inset-bottom)
        );

    display: flex;
    align-items: center;
    gap: 9px;

    min-height: 46px;

    max-width:
        calc(
            100vw - 32px
        );

    padding:
        10px
        14px;

    transform:
        translateX(-50%);

    border:
        1px solid
        var(--dy-border);

    border-radius:
        var(--dy-radius-lg);

    background:
        var(--dy-surface-strong);

    color:
        var(--dy-text-strong);

    box-shadow:
        var(--dy-elevation-4);

    font-size: 0.78rem;
    font-weight: 700;
}

.dy-pos-sale__notification--success {
    border-color:
        rgb(
            var(--dy-mint-c-500) /
            0.25
        );

    color:
        var(--dy-mint-700);
}

.dy-pos-sale__notification--error {
    border-color:
        rgb(
            var(--dy-crimson-c-500) /
            0.25
        );

    color:
        var(--dy-crimson-700);
}

/* =============================================================================
   Crash Resume
   ============================================================================= */

.dy-pos-sale__crash-resume {
    position: fixed;

    z-index:
        calc(
            var(--dy-z-toast, 900) + 30
        );

    inset-inline: 50%;

    bottom:
        max(
            24px,
            env(safe-area-inset-bottom)
        );

    display: flex;
    align-items: center;
    gap: 12px;

    width:
        min(
            560px,
            calc(100vw - 32px)
        );

    padding:
        14px
        16px;

    transform:
        translateX(-50%);

    border:
        1px solid
        rgb(
            var(--dy-amber-c-500) /
            0.35
        );

    border-radius:
        var(--dy-radius-lg);

    background:
        var(--dy-surface-strong);

    color:
        var(--dy-text-strong);

    box-shadow:
        var(--dy-elevation-4);
}

.dy-pos-sale__crash-resume-icon {
    display: flex;
    align-items: center;
    justify-content: center;

    flex-shrink: 0;

    width: 38px;
    height: 38px;

    border-radius:
        var(--dy-radius-md);

    background:
        rgb(
            var(--dy-amber-c-500) /
            0.15
        );

    color:
        var(--dy-amber-700);
}

.dy-pos-sale__crash-resume-content {
    display: flex;
    flex-direction: column;
    gap: 2px;

    min-width: 0;

    flex: 1;
}

.dy-pos-sale__crash-resume-content strong {
    font-size: 0.85rem;
}

.dy-pos-sale__crash-resume-content span {
    font-size: 0.78rem;

    color:
        var(--dy-text-muted);
}

.dy-pos-sale__crash-resume-content small {
    font-size: 0.72rem;

    color:
        var(--dy-text-muted);
}

.dy-pos-sale__crash-resume-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    flex-shrink: 0;
}

/* =============================================================================
   Responsive
   ============================================================================= */

@media (max-width: 1100px) {
    .dy-pos-sale {
        --sale-sidebar-width: 390px;
    }

    .dy-pos-sale__product-grid {
        grid-template-columns:
            repeat(
                auto-fill,
                minmax(
                    135px,
                    1fr
                )
            );
    }
}

@media (max-width: 900px) {
    .dy-pos-sale__workspace {
        grid-template-columns: 1fr;

        overflow: auto;
    }

    .dy-pos-sale__catalog {
        min-height: 52vh;
    }

    .dy-pos-sale__cart {
        min-height: 48vh;

        border-inline-start: 0;

        border-top:
            1px solid
            var(--dy-border);
    }

    .dy-pos-sale__cart-body {
        min-height: 220px;
    }
}

@media (max-width: 640px) {
    .dy-pos-sale__catalog-toolbar {
        padding-inline: 12px;
    }

    .dy-pos-sale__catalog-meta {
        padding-inline: 12px;
    }

    .dy-pos-sale__product-grid {
        grid-template-columns:
            repeat(
                2,
                minmax(0, 1fr)
            );

        padding-inline: 12px;
    }

    .dy-pos-sale__product {
        min-height: 165px;
    }

    .dy-pos-sale__product-image {
        height: 90px;
    }

    .dy-pos-sale__cart-footer {
        padding-bottom:
            max(
                12px,
                env(safe-area-inset-bottom)
            );
    }

    .dy-pos-sale__payment-methods {
        grid-template-columns:
            repeat(3, 1fr);
    }

    .dy-pos-sale__payment-methods button {
        min-height: 68px;
    }
}

@media (max-width: 420px) {
    .dy-pos-sale__search-input {
        min-height: 46px;

        padding-inline-start: 40px;
    }

    .dy-pos-sale__shortcut {
        display: none;
    }

    .dy-pos-sale__search-clear {
        inset-inline-end: 8px;
    }

    .dy-pos-sale__catalog-actions {
        display: none;
    }

    .dy-pos-sale__product-grid {
        gap: 7px;
    }

    .dy-pos-sale__product {
        min-height: 150px;

        padding: 8px;
    }

    .dy-pos-sale__product-image {
        height: 76px;
    }

    .dy-pos-sale__item-total {
        min-width: 60px;
    }
}

/* =============================================================================
   Reduced Motion
   ============================================================================= */

@media (prefers-reduced-motion: reduce) {
    .dy-pos-sale *,
    .dy-pos-sale *::before,
    .dy-pos-sale *::after {
        animation-duration:
            0.01ms !important;

        animation-iteration-count:
            1 !important;

        transition-duration:
            0.01ms !important;
    }
}

/* =============================================================================
   Forced Colors
   ============================================================================= */

@media (forced-colors: active) {
    .dy-pos-sale__product,
    .dy-pos-sale__search-input,
    .dy-pos-sale__input,
    .dy-pos-sale__cart-item,
    .dy-pos-sale__dialog,
    .dy-pos-sale__payment-methods button {
        border-color:
            CanvasText;
    }

    .dy-pos-sale__product:focus-visible,
    .dy-pos-sale__search-input:focus {
        outline:
            2px solid
            Highlight;
    }
}

/* =============================================================================
   Print
   ============================================================================= */

@media print {
    .dy-pos-sale__catalog,
    .dy-pos-sale__status,
    .dy-pos-sale__notification {
        display: none !important;
    }

    .dy-pos-sale__workspace {
        display: block;
    }

    .dy-pos-sale__cart {
        border: 0;
        box-shadow: none;
    }
}
</style>
