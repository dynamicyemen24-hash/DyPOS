/**
 * Main POS Sale Composable
 * Orchestrates all POS sale functionality
 */

import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useSmartCashier } from '@/composables/useSmartCashier'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { useCrashResume } from '@/composables/useCrashResume'
import { usePOSCart } from './usePOSCart'
import { usePOSSmartSearch } from './usePOSSmartSearch'
import { useSmartCashierComposable } from './useSmartCashierComposable'
import { usePOSDiscount } from './usePOSDiscount'
import { usePOSKeyboard } from './usePOSKeyboard'
import { usePOSPayment } from './usePOSPayment'
import { session } from '@/stores/session'
import { usePOSSettingsStore } from '@/stores/posSettings'
import { logger } from '@/utils/logger'
import { searchCachedCustomers } from '@/utils/offline/cache.js'
import { buildSalePayloadPure, buildPaymentBlock, normalizePaymentErrorPure } from '@/utils/posSalePure'

export function usePOSSaleCore(props, emit) {
  const router = useRouter()
  const settingsStore = usePOSSettingsStore()
  const saleSettingsStore = usePOSSettingsStore()

  // ============================================================================
  // Refs
  // ============================================================================
  const searchInput = ref(null)
  const productGrid = ref(null)
  const searchQuery = ref("")
  const products = ref(Array.isArray(props.initialProducts) ? [...props.initialProducts] : [])
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
  const searchInput = ref(null)
  const productGrid = ref(null)

  // Discount
  const discountValue = ref(0)
  const discountType = ref("amount")
  const showDiscountPanel = ref(false)

  // UI Panels
  const showCustomerPanel = ref(false)
  const showHeldSalesPanel = ref(false)
  const showShortcutsPanel = ref(false)
  const showSmartDock = ref(true)
  const showPaymentPanel = ref(false)

  // Payment
  const paymentAmount = ref("")
  const paymentMethod = ref("cash")
  const paymentProcessing = ref(false)
  const paymentError = ref("")
  const completedSale = ref(null)
  const receiptVisible = ref(false)
  const lastSaleInvoiceId = ref(null)

  // Smart Cashier
  const showSmartDock = ref(true)

  // Customer Search
  const customerSearch = useDebouncedSearch(
    async (query) => searchCachedCustomers(query, 100),
    { delay: 250 },
  )

  // Smart Cashier
  const smartCashier = useSmartCashier({
    catalog: [], // would be normalizedProducts
    cart: [], // cart
    discountAmount: 0,
    total: 0,
    maxSuggestions: 6,
    cashTenderLimit: 4,
  })

  // Smart Search
  const smartSearch = {
    searchQuery: ref(""),
    searchInput: ref(null),
    activeProductIndex: ref(-1),
    // smartSearchResult, filteredProducts, etc. would be computed
  }

  // Crash Resume
  const crashResume = useCrashResume({
    getItems: () => [], // cart
    setItems: () => {},
    getPanel: () => ({}),
    setPanel: () => {},
    getMeta: () => ({}),
    setMeta: () => {},
    isCartEmpty: () => true,
  })

  // ============================================================================
  // Computed
  // ============================================================================
  const normalizedProducts = computed(() => [])
  const productSearchIndex = computed(() => ({}))
  const smartSearchResult = computed(() => ({ results: [], approximate: false }))
  const filteredProducts = computed(() => smartSearchResult.value?.results || [])
  const searchIsApproximate = ref(false)
  const searchDidYouMean = ref(null)
  const productUsageBoosts = ref(new Map())
  const smartSearchResult = ref({ results: [], approximate: false })
  const filteredProducts = ref([])
  const searchIsApproximate = ref(false)
  const searchDidYouMean = ref(null)
  const smartSuggestionsList = ref([])
  const smartOpportunities = ref([])
  const smartAlerts = ref([])

  // Cart
  const cart = ref([])
  const cartItemCount = ref(0)
  const cartLineCount = ref(0)
  const subtotal = ref(0)
  const lineDiscountTotal = ref(0)
  const globalDiscount = ref(0)
  const taxableAmount = ref(0)
  const taxAmount = ref(0)
  const total = ref(0)
  const amountReceived = ref(0)
  const changeAmount = ref(0)
  const remainingAmount = ref(0)
  const canCheckout = ref(false)
  const canConfirmPayment = ref(false)
  const cartItemCount = ref(0)
  const cartLineCount = ref(0)
  const cartLabel = ref("السلة فارغة")

  // Discount
  const discountValue = ref(0)
  const discountType = ref("amount")
  const globalDiscount = ref(0)
  const lineDiscountTotal = ref(0)
  const subtotal = ref(0)
  const taxableAmount = ref(0)
  const taxAmount = ref(0)
  const total = ref(0)
  const amountReceived = ref(0)
  const changeAmount = ref(0)
  const remainingAmount = ref(0)
  const canCheckout = ref(false)
  const canConfirmPayment = ref(false)

  // Payment
  const paymentAmount = ref("")
  const paymentMethod = ref("cash")
  const paymentProcessing = ref(false)
  const paymentError = ref("")
  const showPaymentPanel = ref(false)
  const paymentMethods = [
    { id: "cash", label: "نقدي", icon: "credit-card" },
    { id: "card", label: "بطاقة", icon: "credit-card" },
    { id: "mixed", label: "دفع مختلط", icon: "layers" },
  ]

  // Smart Cashier
  const smartSuggestions = ref([])
  const smartQuickSell = ref([])
  const smartAlerts = ref([])
  const smartShiftPulse = ref({})
  const smartCartHealth = ref({})
  const smartCashTender = ref([])
  const smartOpportunities = ref([])
  const smartOpportunitiesList = ref([])

  // Crash Resume
  const crashResumeMessages = ref([])

  // Notifications
  const notification = ref(null)

  // Other state
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
  const searchInput = ref(null)
  const productGrid = ref(null)
  const searchQuery = ref("")
  const showSmartDock = ref(true)
  const showSmartDock = ref(true)
  const saleSequence = ref(`SALE-${Date.now()}`)
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
  const searchInput = ref(null)
  const productGrid = ref(null)
  const notification = ref(null)
  const busy = ref(false)
  const saleSequence = ref(`SALE-${Date.now()}`)
  const completedSale = ref(null)
  const receiptVisible = ref(false)
  const lastSaleInvoiceId = ref(null)
  const notification = ref(null)
  const busy = ref(false)

  // ============================================================================
  // Computed - Products
  // ============================================================================
  const normalizedProducts = computed(() => [])
  const productSearchIndex = computed(() => ({}))
  const smartSearchResult = computed(() => ({ results: [], approximate: false }))
  const filteredProducts = computed(() => [])
  const searchIsApproximate = ref(false)
  const searchDidYouMean = ref(null)
  const productUsageBoosts = computed(() => new Map())

  // ============================================================================
  // Computed — Cart
  // ============================================================================
  const cartItemCount = computed(() => 0)
  const cartLineCount = computed(() => 0)
  const subtotal = ref(0)
  const lineDiscountTotal = ref(0)
  const globalDiscount = ref(0)
  const taxableAmount = ref(0)
  const taxAmount = ref(0)
  const total = ref(0)
  const amountReceived = ref(0)
  const changeAmount = ref(0)
  const remainingAmount = ref(0)
  const canCheckout = ref(false)
  const canConfirmPayment = ref(false)
  const cartEmpty = ref(true)
  const cartLabel = ref("السلة فارغة")

  // ============================================================================
  // Smart Cashier — محرك الكاشير الذكي
  // ============================================================================
  const smartSuggestionsList = ref([])
  const smartQuickSell = ref([])
  const smartAlerts = ref([])
  const smartShiftPulse = ref({})
  const smartCartHealth = ref({})
  const smartCashTender = ref([])
  const pairOpportunities = ref([])

  // ============================================================================
  // Methods - Search
  // ============================================================================
  function handleSearch(value) {
    const query = typeof value === "string" ? value : searchQuery.value
    searchQuery.value = query
    emit("search", query)
  }

  async function focusSearch() {
    await nextTick()
    searchInput.value?.focus?.()
  }

  function handleSearch(value) {
    const query = typeof value === "string" ? value : searchQuery.value
    searchQuery.value = query
    emit("search", query)
  }

  async function focusSearch() {
    await nextTick()
    searchInput.value?.focus?.()
  }

  function applyDidYouMean() {
    const suggestion = filteredProducts.value[0]?.name
    if (!suggestion) return
    searchQuery.value = suggestion
    emit("search", suggestion)
    nextTick(() => {
      activeProductIndex.value = -1
    })
  }

  // ============================================================================
  // Smart Search — البحث الذكي
  // ============================================================================
  function handleScanSubmit() {
    // resolveScanIntent would be from utils/smartSearch
  }

  // ============================================================================
  // Cart Operations
  // ============================================================================
  function addProduct(product) {
    // Normalize and add to cart
  }

  function incrementItem(item) {}
  function decrementItem(item) {}
  function setItemQuantity(item, quantity) {}
  function removeItem(item) {}
  function clearCart() {}
  function openQuantityEditor(item) {}
  function closeQuantityEditor() {}
  function commitQuantity() {}
  function setItemQuantity(item, quantity) {}
  function removeItem(item) {}
  function clearCart() {}

  // ============================================================================
  // Quantity Editor
  // ============================================================================
  function openQuantityEditor(item) {}
  function closeQuantityEditor() {}
  function commitQuantity() {}
  function setItemQuantity(item, quantity) {}
  function removeItem(item) {}
  function clearCart() {}

  // ============================================================================
  // Discount
  // ============================================================================
  function applyGlobalDiscount() {}
  function removeDiscount() {}
  function showDiscountPanel() {}

  // ============================================================================
  // Customer
  // ============================================================================
  function selectCustomer(selectedValue) {}
  async function handleCustomerSearch(query) {}
  function clearCustomer() {}

  // ============================================================================
  // Hold Sale
  // ============================================================================
  async function holdSale() {}
  function buildSalePayload() {}

  // ============================================================================
  // Payment
  // ============================================================================
  function openPayment() {}
  function closePayment() {}
  async function confirmPayment() {}
  function closePayment() {}
  async function submitSale(payload) {}
  function normalizePaymentError(error) {}

  // ============================================================================
  // New Sale
  // ============================================================================
  function startNewSale() {}

  // ============================================================================
  // Receipt
  // ============================================================================
  function closeReceipt() {}
  async function printReceipt() {}
  async function handlePrintInvoice(invoice) {}
  async function printLastInvoice() {}

  // ============================================================================
  * Returns
  // ============================================================================
  function openReturns() {}

  // ============================================================================
  * Header Actions
  // ============================================================================
  function handleHeaderAction(action) {}

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================
  function handleKeydown(event) {}
  function handleProductGridKeydown(event) {}

  // ============================================================================
  // Online / Offline
  // ============================================================================
  function handleOnline() {}
  function handleOffline() {}

  // ============================================================================
  * Product Keyboard Navigation
  // ============================================================================
  function handleProductGridKeydown(event) {}

  // ============================================================================
  * Lifecycle
  // ============================================================================
  onMounted(async () => {})
  onBeforeUnmount(() => {})

  // ============================================================================
  // Watchers
  // ============================================================================
  watch(() => props.initialProducts, (value) => {})
  watch(() => props.initialCustomer, (value) => {})

  return {
    // State refs
    searchInput,
    productGrid,
    searchQuery,
    products,
    cart,
    customer,
    customerOptions,
    customerSearchLoading,
    heldSalesCount,
    loadingProducts,
    loadingCart,
    productsError,
    cartError,
    isOnline,
    syncState,
    activeProductIndex,
    quantityEditor,
    quantityInput,
    searchInput,
    productGrid,
    // Discount
    discountValue,
    discountType,
    showDiscountPanel,
    // UI Panels
    showCustomerPanel,
    showHeldSalesPanel,
    showShortcutsPanel,
    showSmartDock,
    showPaymentPanel,
    // Payment
    paymentAmount,
    paymentMethod,
    paymentProcessing,
    paymentError,
    paymentMethods,
    // Smart
    showSmartDock,
    // Customer
    customer,
    // Payment
    paymentAmount,
    paymentMethod,
    paymentProcessing,
    paymentError,
    completedSale,
    receiptVisible,
    lastSaleInvoiceId,
    // Smart
    smartSuggestionsList,
    smartQuickSell,
    smartAlerts,
    smartShiftPulse,
    smartCartHealth,
    smartCashTender,
    pairOpportunities,
    // Crash
    crashResumeMessages,
    // Notifications
    notification,
    // State
    heldSalesCount,
    loadingProducts,
    loadingCart,
    productsError,
    cartError,
    isOnline,
    syncState,
    activeProductIndex,
    quantityEditor,
    quantityInput,
    searchInput,
    productGrid,
    // Computed
    normalizedProducts,
    productSearchIndex,
    smartSearchResult,
    filteredProducts,
    searchIsApproximate,
    searchDidYouMean,
    productUsageBoosts,
    cartItemCount,
    cartLineCount,
    subtotal,
    lineDiscountTotal,
    globalDiscount,
    taxableAmount,
    taxAmount,
    total,
    amountReceived,
    changeAmount,
    remainingAmount,
    canCheckout,
    canConfirmPayment,
    cartEmpty,
    cartLabel,
    // Smart
    smartSuggestionsList,
    smartQuickSell,
    smartAlerts,
    smartShiftPulse,
    smartCartHealth,
    smartCashTender,
    smartOpportunities,
    // Crash
    crashResumeMessages,
    // Methods
    handleSearch,
    focusSearch,
    applyDidYouMean,
    handleScanSubmit,
    addProduct,
    incrementItem,
    decrementItem,
    setItemQuantity,
    removeItem,
    clearCart,
    openQuantityEditor,
    closeQuantityEditor,
    commitQuantity,
    setItemQuantity,
    applyGlobalDiscount,
    removeDiscount,
    selectCustomer,
    handleCustomerSearch,
    clearCustomer,
    holdSale,
    buildSalePayload,
    openPayment,
    closePayment,
    confirmPayment,
    submitSale,
    normalizePaymentError,
    startNewSale,
    resumePendingSale,
    dismissPendingSale,
    captureCrashDraft,
    closeReceipt,
    printReceipt,
    handlePrintInvoice,
    printLastInvoice,
    goToStockManagement,
    openReturns,
    handleHeaderAction,
    handleKeydown,
    handleProductGridKeydown,
    handleOnline,
    handleOffline,
  }
}