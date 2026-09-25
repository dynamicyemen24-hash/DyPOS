/**
 * POS Keyboard Shortcuts Composable
 * Handles all keyboard shortcuts and navigation
 */

import { ref, computed } from 'vue'

export function usePOSKeyboard(props, emit, {
  canCheckout,
  showPaymentPanel,
  showDiscountPanel,
  showCustomerPanel,
  showHeldSalesPanel,
  showShortcutsPanel,
  quantityEditor,
  activeProductIndex,
  cart,
  filteredProducts,
  focusSearch,
  openPayment,
  holdSale,
  closeQuantityEditor,
  closePayment,
  closeQuantityEditor,
  showDiscountPanel,
  showCustomerPanel,
  showHeldSalesPanel,
  showShortcutsPanel,
}) {
  // Keyboard shortcuts configuration
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

  function handleKeydown(event) {
    const target = event.target

    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement

    // F2 — البحث
    if (event.key === "F2") {
      event.preventDefault()
      focusSearch()
      return
    }

    // F8 — إظهار/إخفاء الكاشير الذكي
    if (event.key === "F8") {
      event.preventDefault()
      showSmartDock.value = !showSmartDock.value
      return
    }

    // ? — مساعدة الاختصارات (يعمل مع Shift+؟ العربية)
    if ((event.key === "?" || event.key === "؟") && !isTyping) {
      event.preventDefault()
      showShortcutsPanel.value = !showShortcutsPanel.value
      return
    }

    // Escape — إغلاق overlay
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

    // Ctrl/Cmd + Enter — الدفع
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      if (canCheckout.value && !showPaymentPanel.value) {
        event.preventDefault()
        // openPayment()
      }
    }

    // F4 — تعليق البيع
    if (event.key === "F4" && props.allowHold) {
      event.preventDefault()
      // holdSale()
    }

    // Delete — حذف العنصر المحدد
    if (event.key === "Delete" && activeProductIndex.value >= 0 && !isTyping) {
      // const item = cart.value[activeProductIndex.value]
      // if (item) removeItem(item)
    }
  }

  // Product grid keyboard navigation
  function handleProductGridKeydown(event) {
    const items = [] // filteredProducts.value

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
        // activeProductIndex.value = isRTL
        //   ? Math.max(0, activeProductIndex.value - 1)
        //   : Math.min(items.length - 1, activeProductIndex.value + 1)
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

  // Online/Offline handlers
  function handleOnline() {
    // isOnline.value = true
    // syncState.value = "ready"
  }

  function handleOffline() {
    // isOnline.value = false
    // syncState.value = "offline"
  }

  return {
    POS_SHORTCUTS,
    handleKeydown,
    handleProductGridKeydown,
    handleOnline,
    handleOffline,
  }
}