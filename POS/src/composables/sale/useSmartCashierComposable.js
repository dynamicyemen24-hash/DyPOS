/**
 * Smart Cashier Composable for POS
 * Handles learning, suggestions, and cashier assistance
 */

import { computed, ref } from 'vue'

export function useSmartCashierComposable({ catalog, cart, discountAmount, total, maxSuggestions, cashTenderLimit }) {
  // State
  const suggestions = ref([])
  const quickSell = ref([])
  const alerts = ref([])
  const shiftPulse = ref({})
  const cartHealth = ref({})
  const smartCashTender = ref([])

  // Learning
  const productUsageBoosts = ref(new Map())
  const quickSellData = ref([])

  // Computed
  const smartSuggestionsList = computed(() => suggestions.value)
  const smartQuickSell = computed(() => quickSell.value)
  const smartAlerts = computed(() => alerts.value)
  const smartShiftPulse = computed(() => shiftPulse.value)
  const smartCartHealth = computed(() => cartHealth.value)
  const smartCashTender = computed(() => smartCashTender.value)

  const productUsageBoosts = computed(() => {
    const map = new Map()
    for (const entry of quickSell.value) {
      const id = entry?.product?.id ?? entry?.id
      if (id) {
        map.set(String(id), Number(entry?.score || 0) * 10)
      }
    }
    return map
  })

  const smartOpportunities = computed(() => {
    // Pair opportunities based on co-purchase patterns
    return []
  })

  // Methods
  function trackProductAdded({ productId, name }) {
    const key = String(productId)
    const current = productUsageBoosts.value.get(key) || 0
    productUsageBoosts.value.set(key, current + 1)

    // Update quick sell
    const existing = quickSell.value.find((item) => item.id === productId)
    if (existing) {
      existing.count++
      existing.score = (existing.score || 0) + 1
    } else {
      quickSell.value.push({ id: productId, name, count: 1, score: 1 })
    }

    // Sort by score
    quickSell.value.sort((a, b) => b.score - a.score)
    if (quickSell.value.length > 20) {
      quickSell.value = quickSell.value.slice(0, 20)
    }
  }

  function handleSmartAdd(product) {
    // addProduct would be from cart composable
    // addProduct(product)
  }

  function handleSmartAddAll(productList) {
    for (const product of Array.isArray(productList) ? productList : []) {
      // addProduct(product)
    }
  }

  // Smart suggestions based on cart content
  const smartSuggestions = computed(() => {
    if (!cart.value.length) return []

    // Get product categories in cart
    const categories = new Set()
    // cart.value.forEach(item => {
    //   if (item.category) categories.add(item.category)
    // })

    // Return suggestions based on categories
    return []
  }

  // Smart alerts
  const smartAlerts = computed(() => {
    const alerts = []

    // Low stock alerts
    // cart.value.forEach(item => {
    //   if (item.stock && item.quantity >= item.stock * 0.8) {
    //     alerts.push({ type: 'low-stock', productId: item.productId, message: `Low stock for ${item.name}` })
    //   }
    // })

    // Margin alerts
    // cart.value.forEach(item => {
    //   if (item.margin && item.margin < 0.1) {
    //     alerts.push({ type: 'low-margin', productId: item.productId, message: `Low margin on ${item.name}` })
    //   }
    // })

    return alerts
  }

  // Cash tender learning
  function trackCashTendered(amount) {
    smartCashTender.value.push({ amount, timestamp: Date.now() })
    if (smartCashTender.value.length > 100) {
      smartCashTender.value.shift()
    }
  }

  function learnFromSale(items, totals) {
    // Learn from completed sale
    items.forEach(item => {
      trackProductAdded({ productId: item.productId, name: item.name })
    })
  }

  function handleSmartAdd(product) {
    // addProduct(product)
  }

  function handleSmartAddAll(productList) {
    for (const product of Array.isArray(productList) ? productList : []) {
      // addProduct(product)
    }
  }

  // Smart cash tender suggestions
  const smartCashTenderSuggestions = computed(() => {
    if (!smartCashTender.value.length) return []
    // Return common tender amounts based on history
    const amounts = [...smartCashTender.value].reverse().slice(0, 4)
    return amounts.map(t => t.amount)
  }

  // Pair opportunities
  const smartOpportunities = computed(() => {
    // Find products frequently bought together
    return []
  })

  return {
    // State
    smartSuggestions,
    smartQuickSell,
    smartAlerts,
    smartShiftPulse,
    smartCartHealth,
    smartCashTender,
    smartOpportunities,
    productUsageBoosts,
    smartQuickSell,
    smartSuggestions,
    smartOpportunities,
    smartCashTenderSuggestions,

    // Methods
    trackProductAdded,
    learnFromSale,
    trackCashTendered,
    handleSmartAdd,
    handleSmartAddAll,
  }
}