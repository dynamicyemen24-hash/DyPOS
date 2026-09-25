/**
 * POS Discount Composable
 * Handles global discount logic
 */

import { ref, computed, watch } from 'vue'

export function usePOSDiscount(props, emit, cart, settingsStore) {
  // State
  const discountValue = ref(0)
  const discountType = ref("amount")
  const showDiscountPanel = ref(false)

  // Computed
  const subtotal = computed(() => {
    // Would come from cart composable
    return 0
  })

  const lineDiscountTotal = computed(() => {
    return 0
  })

  const globalDiscount = computed(() => {
    // From posSalePure
    return 0
  })

  // Methods
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

  function openDiscountPanel() {
    showDiscountPanel.value = true
  }

  function closeDiscountPanel() {
    showDiscountPanel.value = false
  }

  function toggleDiscountPanel() {
    showDiscountPanel.value = !showDiscountPanel.value
  }

  // Watch for discount type change
  watch(discountType, () => {
    discountValue.value = 0
  })

  return {
    discountValue,
    discountType,
    showDiscountPanel,
    applyGlobalDiscount,
    removeDiscount,
    openDiscountPanel,
    closeDiscountPanel,
    toggleDiscountPanel,
  }
}