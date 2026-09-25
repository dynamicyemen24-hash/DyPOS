/**
 * POS Smart Search Composable
 * Handles product search with fuzzy matching, popularity boosting, and Arabic normalization
 */

import { computed, ref, watch } from 'vue'
import {
  buildProductIndex,
  DEFAULT_FUZZY_SCAN_LIMIT,
  resolveScanIntent,
  searchProductIndex,
} from '@/utils/smartSearch'
import { getPopularityBoost } from '@/utils/posSalePure'

export function usePOSSmartSearch(props, emit, products, trackProductAdded) {
  const searchQuery = ref("")
  const searchInput = ref(null)
  const activeProductIndex = ref(-1)
  const filteredProducts = ref([])
  const searchIsApproximate = ref(false)
  const searchDidYouMean = ref(null)

  // Product index for search
  const normalizedProducts = computed(() => {
    // normalizeProduct should be available from posSalePure
    return products.value.map(normalizeProduct).filter(Boolean)
  })

  const productSearchIndex = computed(() =>
    buildProductIndex(normalizedProducts.value),
  )

  // Smart Suggestions - from useSmartCashier
  const productUsageBoosts = computed(() => {
    const map = new Map()
    // This would come from smart cashier composable
    // For now, return empty map
    return map
  })

  // Search result with fuzzy matching and popularity
  const smartSearchResult = computed(() => {
    return searchProductIndex(productSearchIndex.value, searchQuery.value, {
      limit: 160,
      fuzzyScanLimit: DEFAULT_FUZZY_SCAN_LIMIT,
      popularity: (product) => getPopularityBoost(/* boosts */ {}, product),
    })
  })

  const filteredProducts = computed(() => smartSearchResult.value.results)
  const searchIsApproximate = computed(() => smartSearchResult.value.approximate)

  const searchDidYouMean = computed(() => {
    if (!smartSearchResult.value.approximate) {
      return null
    }
    return filteredProducts.value[0]?.name || null
  })

  // Search methods
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
    if (!suggestion) {
      return
    }
    searchQuery.value = suggestion
    emit("search", suggestion)
    nextTick(() => {
      activeProductIndex.value = -1
    })
  }

  // Scan submit - quick scan and add
  function handleScanSubmit() {
    const intent = resolveScanIntent(
      productSearchIndex.value,
      searchQuery.value,
      {
        minLength: 3,
        // popularity would come from smart cashier
      },
    )

    if (intent.action === "add" && intent.product) {
      // addProduct would be from cart composable
      // addProduct(intent.product)
      searchQuery.value = ""
      emit("search", "")
      activeProductIndex.value = -1

      const reasonLabel =
        intent.reason === "barcode"
          ? "مسح باركود"
          : intent.reason === "code"
          ? "رمز صنف"
          : "إضافة سريعة"

      // showNotification would be from notification composable
      // showNotification(`${reasonLabel}: أُضيف «${intent.product.name}»`, "success")

      nextTick(() => {
        searchInput.value?.focus?.()
      })
      return
    }

    if (intent.action === "empty" && searchQuery.value.trim()) {
      // showNotification("لا يوجد منتج مطابق — تحقق من الرمز", "warning")
    }
  }

  // Product grid keyboard navigation
  function handleProductGridKeydown(event) {
    const items = [] // would be filteredProducts.value
    if (!items.length) {
      return
    }

    const columns = 4

    const isRTL =
      typeof document !== "undefined" &&
      (document.documentElement?.getAttribute?.("dir") || "rtl") === "rtl"

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault()
        // activeProductIndex.value would be managed by parent
        break
      case "ArrowLeft":
        event.preventDefault()
        break
      case "ArrowDown":
        event.preventDefault()
        break
      case "ArrowUp":
        event.preventDefault()
        break
      case "Enter": {
        event.preventDefault()
        // const product = items[activeProductIndex.value]
        // if (product) addProduct(product)
        break
      }
    }
  }

  return {
    searchQuery,
    searchInput,
    activeProductIndex,
    searchQuery,
    filteredProducts,
    searchIsApproximate,
    searchDidYouMean,
    handleSearch,
    focusSearch,
    applyDidYouMean,
    handleScanSubmit,
    handleProductGridKeydown,
  }
}