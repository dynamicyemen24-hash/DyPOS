/**
 * POS Cart Composable
 * Handles all cart operations: add, remove, increment, decrement, clear, quantity editor
 */

import { ref, computed } from 'vue'
import { normalizeProduct } from '@/utils/posSalePure'

export function usePOSCart(emit, cart, trackProductAdded) {
  // State
  const quantityEditor = ref(null)
  const quantityInput = ref(null)
  const activeProductIndex = ref(-1)

  // Computed
  const cartItemCount = computed(() => {
    return cart.value.reduce(
      (total, item) => total + Number(item.quantity || 0),
      0,
    )
  })

  const cartLineCount = computed(() => {
    return cart.value.length
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

  // Methods
  function addProduct(product) {
    const normalized = normalizeProduct(product)

    if (!normalized || normalized.disabled) {
      return
    }

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
    // emit('cart-cleared') // If needed
    // showNotification("تم إفراغ السلة", "success") // If notification available
  }

  // Quantity Editor
  function openQuantityEditor(item) {
    quantityEditor.value = item
    nextTick(() => {
      quantityInput.value?.focus?.()
      quantityInput.value?.select?.()
    })
  }

  function closeQuantityEditor() {
    quantityEditor.value = null
    // focusSearch() // If available
  }

  function commitQuantity() {
    if (!quantityEditor.value) {
      return
    }
    setItemQuantity(quantityEditor.value, quantityEditor.value.quantity)
    closeQuantityEditor()
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

  return {
    // State
    quantityEditor,
    quantityInput,
    activeProductIndex,

    // Computed
    cartItemCount,
    cartLineCount,
    cartEmpty,
    cartLabel,

    // Methods
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
  }
}