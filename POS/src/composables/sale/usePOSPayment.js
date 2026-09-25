/**
 * POS Payment Composable
 * Handles payment flow, methods, and processing
 */

import { ref, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'

export function usePOSPayment(props, emit, {
  total,
  canCheckout,
  canConfirmPayment,
  remainingAmount,
  amountReceived,
  changeAmount,
  formatMoney,
}) {
  const settingsStore = usePOSSettingsStore()

  // State
  const showPaymentPanel = ref(false)
  const paymentAmount = ref("")
  const paymentMethod = ref("cash")
  const paymentProcessing = ref(false)
  const paymentError = ref("")
  const paymentMethods = ref([
    { id: "cash", label: "نقدي", icon: "credit-card" },
    { id: "card", label: "بطاقة", icon: "credit-card" },
    { id: "mixed", label: "دفع مختلط", icon: "layers" },
  ])

  // Computed
  const canCheckout = computed(() => {
    return (
      // cart.value.length > 0 &&
      // total.value >= 0 &&
      !paymentProcessing.value
    )
  })

  const canConfirmPayment = computed(() => {
    // if (!canCheckout.value) return false
    // if (paymentMethod.value === "cash") {
    //   return amountReceived.value >= total.value
    // }
    // return true
    return false
  })

  // Methods
  function openPayment() {
    // if (!canCheckout.value) return
    // paymentError.value = ""
    // paymentAmount.value = paymentMethod.value === "cash" ? String(total.value) : ""
    // showPaymentPanel.value = true
    // emit("payment-requested", { total: total.value })
    // nextTick(() => {
    //   if (paymentMethod.value === "cash") {
    //     document.getElementById("dypos-payment-amount")?.focus?.()
    //   }
    // })
  }

  function closePayment() {
    if (paymentProcessing.value) return
    showPaymentPanel.value = false
    paymentError.value = ""
    // nextTick(() => focusSearch())
  }

  async function confirmPayment() {
    // if (!canConfirmPayment.value || paymentProcessing.value) return
    // paymentProcessing.value = true
    // paymentError.value = ""
    // syncState.value = "syncing"
    // try {
    //   const payload = { ...buildSalePayload(), payment: buildPaymentBlock({...}) }
    //   const result = await submitSale(payload)
    //   completedSale.value = result || payload
    //   lastSaleInvoiceId.value = result?.invoice_id || result?.offline_id || result?.name || null
    //   receiptVisible.value = true
    //   showPaymentPanel.value = false
    //   syncState.value = "ready"
    //   emit("sale-completed", completedSale.value)
    //   showNotification("تم إتمام عملية البيع بنجاح", "success")
    // } catch (error) {
    //   syncState.value = "error"
    //   paymentError.value = normalizePaymentError(error)
    //   logger?.error?.("DyPOS checkout failed", error)
    // } finally {
    //   paymentProcessing.value = false
    // }
  }

  function closePayment() {
    if (paymentProcessing.value) return
    showPaymentPanel.value = false
    paymentError.value = ""
  }

  return {
    showPaymentPanel,
    paymentAmount,
    paymentMethod,
    paymentProcessing,
    paymentError,
    paymentMethods,
    canCheckout,
    canConfirmPayment,
    openPayment,
    closePayment,
    confirmPayment,
    closePayment,
  }
}