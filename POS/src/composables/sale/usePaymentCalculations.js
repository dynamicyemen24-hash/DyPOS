/**
 * Payment Calculations Composable for Payment Dialog
 * Handles all payment calculations, discounts, tax, totals
 */

import { computed, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'

export function usePaymentCalculations(props, emit, paymentState) {
  const settingsStore = useSettingsStore()

  // State
  const localAdditionalDiscount = ref(0)
  const additionalDiscountType = ref('percentage')
  const mobileCustomAmount = ref(null)

  // Settings
  const allowAdditionalDiscount = computed(() => settingsStore.allowAdditionalDiscount)
  const currencySymbol = computed(() => props.currencySymbol || 'SAR')

  // Computed from props
  const subtotal = computed(() => props.subtotal || 0)
  const taxAmount = computed(() => props.taxAmount || 0)
  const grandTotal = computed(() => props.grandTotal || 0)
  const items = computed(() => props.items || [])

  // Payment state from parent
  const paymentEntries = computed(() => paymentState.entries || [])
  const lastSelectedMethod = computed(() => paymentState.lastSelectedMethod || null)
  const selectedReceivableAccount = computed(() => paymentState.selectedReceivableAccount || null)

  // Wallet state
  const availableWalletBalance = computed(() => {
    if (!props.walletInfo?.wallet_enabled) return 0
    return Math.max(0, (props.walletInfo?.wallet_balance || 0) - (props.walletInfo?.reserved_amount || 0))
  })

  // Customer credit
  const remainingAvailableCredit = computed(() => {
    if (!props.customer) return 0
    const limit = props.customer.credit_limit || 0
    const used = props.customer.credit_used || 0
    return Math.max(0, limit - used)
  })

  // Payment entries and totals
  const paymentEntries = computed(() => props.paymentEntries || [])
  const totalPaid = computed(() => {
    return paymentEntries.value.reduce((sum, entry) => sum + (entry.amount || 0), 0)
  })

  const subtotal = computed(() => props.subtotal || 0)
  const taxAmount = computed(() => props.taxAmount || 0)
  const discountAmount = computed(() => props.discountAmount || 0)
  const grandTotal = computed(() => props.grandTotal || 0)

  const totalPaid = computed(() => {
    return props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
  })

  const remainingAmount = computed(() => {
    const grandTotal = props.grandTotal || 0
    const paid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return Math.max(0, grandTotal - paid)
  })

  const changeAmount = computed(() => {
    const total = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return total - (props.grandTotal || 0)
  )

  const hasNonCashPayment = computed(() => {
    return (props.paymentEntries || []).some(
      (entry) =>
        !entry.mode_of_payment?.toLowerCase().includes('cash') &&
        !entry.mode_of_payment?.toLowerCase().includes('wallet')
    )
  })

  const isCashPaymentMethod = (method) => {
    if (!method) return false
    const cashTypes = ['cash', 'cash payment', 'cash on delivery']
    return cashTypes.some((t) => method?.mode_of_payment?.toLowerCase().includes(t))
  }

  const isExactAmountModeActive = computed(() => {
    const totalPaid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return totalPaid > 0 && !isCashPaymentMethod(props.lastSelectedMethod)
  })

  const isExactAmountValid = computed(() => {
    if (!isExactAmountModeActive.value) return true
    const totalPaid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return Math.abs(totalPaid - (props.grandTotal || 0)) < 0.01
  })

  // Discount
  const calculatedAdditionalDiscount = computed(() => {
    if (additionalDiscountType.value === 'percentage') {
      return (subtotal.value * localAdditionalDiscount.value) / 100
    }
    return localAdditionalDiscount.value
  })

  const discountAmount = computed(() => {
    const baseDiscount = props.discountAmount || 0
    return baseDiscount + calculatedAdditionalDiscount.value
  })

  const totalPaid = computed(() => {
    return props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
  })

  const remainingAmount = computed(() => {
    const grandTotal = props.grandTotal || 0
    const paid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return Math.max(0, grandTotal - paid)
  })

  const changeAmount = computed(() => {
    const total = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return total - (props.grandTotal || 0)
  )

  const hasNonCashPayment = computed(() => {
    return (props.paymentEntries || []).some(
      (entry) =>
        !entry.mode_of_payment?.toLowerCase().includes('cash') &&
        !entry.mode_of_payment?.toLowerCase().includes('wallet')
    )
  })

  const isExactAmountModeActive = computed(() => {
    const totalPaid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return totalPaid > 0 && !isCashPaymentMethod(props.lastSelectedMethod)
  })

  const isExactAmountValid = computed(() => {
    if (!isExactAmountModeActive.value) return true
    const totalPaid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return Math.abs(totalPaid - (props.grandTotal || 0)) < 0.01
  })

  const isCashPaymentMethod = (method) => {
    if (!method) return false
    const cashTypes = ['cash', 'cash payment', 'cash on delivery']
    return cashTypes.some((t) => method?.mode_of_payment?.toLowerCase().includes(t))
  }

  const isExactAmountModeActive = computed(() => {
    const totalPaid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return totalPaid > 0 && !isCashPaymentMethod(props.lastSelectedMethod)
  })

  const isExactAmountValid = computed(() => {
    if (!isExactAmountModeActive.value) return true
    const totalPaid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return Math.abs(totalPaid - (props.grandTotal || 0)) < 0.01
  })

  const isCashPaymentMethod = (method) => {
    if (!method) return false
    const cashTypes = ['cash', 'cash payment', 'cash on delivery']
    return cashTypes.some((t) => method?.mode_of_payment?.toLowerCase().includes(t))
  }

  // Watch for discount type change
  watch(additionalDiscountType, (newType) => {
    localAdditionalDiscount.value = 0
    if (newType === 'percentage') {
      localAdditionalDiscount.value = 0
    }
  })

  const handleAdditionalDiscountChange = () => {
    // Trigger recalculation
    emit('additional-discount-change', {
      amount: calculatedAdditionalDiscount.value,
      type: additionalDiscountType.value,
    })
  }

  const handleAdditionalDiscountTypeChange = () => {
    localAdditionalDiscount.value = 0
    emit('additional-discount-type-change', additionalDiscountType.value)
  }

  const decrementDiscount = () => {
    if (localAdditionalDiscount.value > 0) {
      localAdditionalDiscount.value = Math.max(0, localAdditionalDiscount.value - 1)
    }
  }

  const incrementDiscount = () => {
    const max = additionalDiscountType.value === 'percentage' ? 100 : subtotal.value
    if (localAdditionalDiscount.value < max) {
      localAdditionalDiscount.value += 1
    }
  }

  const isQuickAmountDisabled = (amount) => {
    if (remainingAmount.value <= 0) return true
    return amount > remainingAmount.value + 0.01
  }

  const quickAmounts = computed(() => {
    const remaining = remainingAmount.value
    if (remaining <= 0) return []
    const amounts = [remaining]
    const increments = [1, 5, 10, 20, 50, 100, 500]
    increments.forEach((inc) => {
      if (inc < remaining && !amounts.includes(inc)) {
        amounts.push(inc)
      }
    }
    const rounded = Math.ceil(remaining)
    if (rounded !== remaining && !amounts.includes(rounded)) {
      amounts.push(rounded)
    }
    return amounts.sort((a, b) => a - b)
  })

  const isQuickAmountDisabled = (amount) => {
    if (remainingAmount.value <= 0) return true
    return amount > remainingAmount.value + 0.01
  }

  const isQuickAmountDisabled = (amount) => {
    if (remainingAmount.value <= 0) return true
    return amount > remainingAmount.value + 0.01
  }

  const formatCurrency = (amount) => {
    // Use the centralized formatter
    if (typeof formatCurrencySafe === 'function') {
      return formatCurrencySafe(amount, props.currencyCode)
    }
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const applyWriteOff = ref(false)
  const writeOffLimit = computed(() => {
    return Math.min(remainingAmount.value, props.writeOffLimit || remainingAmount.value)
  })

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  })

  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  })

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  })

  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  })

  const writeOffLimit = computed(() => {
    return Math.min(remainingAmount.value, props.writeOffLimit || remainingAmount.value)
  })

  const applyWriteOff = ref(false)
  const writeOffLimit = computed(() => {
    return Math.min(remainingAmount.value, props.writeOffLimit || remainingAmount.value)
  })

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  })

  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  })

  // Watch for write-off changes
  watch(applyWriteOff, (newVal) => {
    emit('write-off-change', { apply: newVal, amount: newVal ? remainingAmount.value : 0 })
  })

  // Mobile custom amount
  const mobileCustomAmount = ref(null)

  const addMobileCustomPayment = () => {
    if (!props.lastSelectedMethod) return
    const amount = parseFloat(props.mobileCustomAmount)
    if (amount > 0) {
      // emit('add-custom-payment', { method: props.lastSelectedMethod, amount })
      // props.mobileCustomAmount = null
    }
  }

  const addMobileCustomPayment = () => {
    if (!props.lastSelectedMethod) return
    const amount = parseFloat(props.mobileCustomAmount)
    if (amount > 0) {
      // emit('add-custom-payment', { method: props.lastSelectedMethod, amount })
      // props.mobileCustomAmount = null
    }
  }

  // Write-off
  const applyWriteOff = ref(false)

  const writeOffLimit = computed(() => {
    return Math.min(remainingAmount.value, props.writeOffLimit || remainingAmount.value)
  })

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  })

  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  })

  watch(applyWriteOff, (newVal) => {
    // emit('write-off-change', { apply: newVal, amount: newVal ? remainingAmount.value : 0 })
  })

  // Quick amounts
  const quickAmounts = computed(() => {
    const remaining = remainingAmount.value
    if (remaining <= 0) return []
    const amounts = [remaining]
    const increments = [1, 5, 10, 20, 50, 100, 500]
    increments.forEach((inc) => {
      if (inc < remaining && !amounts.includes(inc)) {
        amounts.push(inc)
      }
    }
    const rounded = Math.ceil(remaining)
    if (rounded !== remaining && !amounts.includes(rounded)) {
      amounts.push(rounded)
    }
    return amounts.sort((a, b) => a - b)
  })

  const isQuickAmountDisabled = (amount) => {
    if (remainingAmount.value <= 0) return true
    return amount > remainingAmount.value + 0.01
  }

  return {
    // Discount
    localAdditionalDiscount,
    additionalDiscountType,
    calculatedAdditionalDiscount,
    handleAdditionalDiscountChange,
    handleAdditionalDiscountTypeChange,
    decrementDiscount,
    incrementDiscount,

    // Discount
    localAdditionalDiscount,
    additionalDiscountType,
    calculatedAdditionalDiscount,
    handleAdditionalDiscountChange,
    handleAdditionalDiscountTypeChange,
    decrementDiscount,
    incrementDiscount,

    // Mobile custom amount
    mobileCustomAmount,
    addMobileCustomPayment,

    // Write-off
    applyWriteOff,
    writeOffLimit,
    writeOffAmount,
    canWriteOff,

    // Quick amounts
    quickAmounts,
    isQuickAmountDisabled,

    // Mobile custom amount
    mobileCustomAmount,
    addMobileCustomPayment,

    // Write-off
    applyWriteOff,
    writeOffLimit,
    writeOffAmount,
    canWriteOff,

    // Quick amounts
    quickAmounts,
    isQuickAmountDisabled,

    // Currency
    formatCurrency,
    currencySymbol,
  }
}