/**
 * Payment Methods Composable for Payment Dialog
 * Handles payment method selection, filtering, and management
 */

import { ref, computed, watch, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'

export function usePaymentMethods(props, emit) {
  const settingsStore = useSettingsStore()

  // State
  const loadingPaymentMethods = ref(false)
  const paymentMethods = ref([])
  const filteredPaymentMethods = ref([])
  const paymentMethodFilter = ref('')

  // Selected state
  const lastSelectedMethod = ref(null)
  const selectedReceivableAccount = ref(null)
  const paymentEntries = ref([])

  // Wallet/Credit state
  const walletInfo = ref({
    wallet_enabled: false,
    wallet_balance: 0,
    available_wallet_balance: 0,
  })
  const availableWalletBalance = computed(() => walletInfo.value.available_wallet_balance)
  const walletInfoLoaded = ref(false)

  // Customer credit
  const customerCreditEnabled = computed(() => settingsStore.enableCustomerCredit)
  const remainingAvailableCredit = computed(() => {
    if (!props.customer) return 0
    return (props.customer.credit_limit || 0) - (props.customer.credit_used || 0)
  })

  // Receivable accounts
  const receivableAccounts = ref([])

  // Payment state
  const remainingAmount = computed(() => props.grandTotal - totalPaid.value)

  // Computed
  const totalPaid = computed(() => {
    return paymentEntries.value.reduce((sum, entry) => sum + (entry.amount || 0), 0)
  })

  const changeAmount = computed(() => totalPaid.value - props.grandTotal)

  const hasNonCashPayment = computed(() => {
    return paymentEntries.value.some(
      (entry) => !entry.mode_of_payment?.toLowerCase().includes('cash') && !entry.mode_of_payment?.toLowerCase().includes('wallet')
    )
  })

  const isExactAmountModeActive = computed(() => {
    return totalPaid.value > 0 && !isCashPaymentMethod(lastSelectedMethod.value)
  })

  const isExactAmountValid = computed(() => {
    if (!isExactAmountModeActive.value) return true
    return Math.abs(totalPaid.value - props.grandTotal) < 0.01
  })

  const filteredPaymentMethods = computed(() => {
    let methods = paymentMethods.value.filter((m) => m.enabled !== false)
    if (paymentMethodFilter.value) {
      const filter = paymentMethodFilter.value.toLowerCase()
      methods = methods.filter((m) =>
        m.mode_of_payment?.toLowerCase().includes(filter) ||
        m.type?.toLowerCase().includes(filter)
      )
    }
    return methods
  })

  const isExactAmountValidForMethod = computed(() => {
    if (!isExactAmountModeActive.value) return true
    return Math.abs(remainingAmount.value) < 0.01
  })

  // Wallet
  const availableWalletBalance = computed(() => walletInfo.value.available_wallet_balance)

  // Methods
  const loadPaymentMethods = async () => {
    loadingPaymentMethods.value = true
    try {
      const response = await fetch('/api/method/DyPOS.api.payment_method.get_list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: ['name', 'mode_of_payment', 'type', 'enabled', 'default_account'],
        }),
      })
      const data = await response.json()
      if (data.message) {
        paymentMethods.value = data.message.filter((m) => m.enabled !== false)
      }
    } catch (error) {
      console.error('Failed to load payment methods:', error)
    } finally {
      loadingPaymentMethods.value = false
    }
  }

  const loadWalletInfo = async () => {
    if (!walletInfoLoaded.value) {
      try {
        const response = await fetch('/api/method/DyPOS.api.wallet.get_info')
        const data = await response.json()
        if (data.message) {
          walletInfo.value = data.message
          walletInfoLoaded.value = true
        }
      } catch (error) {
        console.error('Failed to load wallet info:', error)
      }
    }
  }

  const loadReceivableAccounts = async () => {
    try {
      const response = await fetch('/api/method/DyPOS.api.receivable_account.get_list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: ['name', 'account_name'] }),
      })
      const data = await response.json()
      if (data.message) {
        receivableAccounts.value = data.message
      }
    } catch (error) {
      console.error('Failed to load receivable accounts:', error)
    }
  }

  // Initial load
  onMounted(() => {
    loadPaymentMethods()
    loadWalletInfo()
    // Receivable accounts loaded when needed
  })

  // Payment method selection
  const selectPaymentMethod = (method) => {
    if (method.mode_of_payment === lastSelectedMethod.value?.mode_of_payment) {
      return // Already selected
    }
    lastSelectedMethod.value = method
    // Reset mobile custom amount
    // emit('payment-method-selected', method)
  }

  const clearAll = () => {
    lastSelectedMethod.value = null
    paymentEntries.value = []
    selectedReceivableAccount.value = null
    emit('payments-cleared')
  }

  // Payment entry management
  const getMethodTotal = (modeOfPayment) => {
    return paymentEntries.value
      .filter((e) => e.mode_of_payment === modeOfPayment)
      .reduce((sum, e) => sum + (e.amount || 0), 0)
  }

  const addCustomPayment = (method, amount) => {
    if (amount <= 0) return
    const newEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mode_of_payment: method.mode_of_payment,
      method_name: method.mode_of_payment,
      type: method.type,
      amount,
      is_exact: true,
      timestamp: new Date().toISOString(),
    }
    paymentEntries.value.push(newEntry)
    emit('payment-entry-added', newEntry)
    return newEntry
  }

  const addCustomPaymentByAmount = (method, amount) => {
    if (amount > 0) {
      addCustomPayment(method, amount)
    }
  }

  const removePaymentEntry = (entryId) => {
    const index = paymentEntries.value.findIndex((e) => e.id === entryId)
    if (index !== -1) {
      paymentEntries.value.splice(index, 1)
      emit('payment-entry-removed', entryId)
    }
  }

  const clearAll = () => {
    paymentEntries.value = []
    lastSelectedMethod.value = null
    selectedReceivableAccount.value = null
  }

  // Wallet payment
  const isWalletPaymentMethod = (modeOfPayment) => {
    const walletTypes = ['wallet', 'wallet balance', 'gift card', 'gift_card']
    return walletTypes.some((t) => modeOfPayment?.toLowerCase().includes(t))
  }

  const isCashPaymentMethod = (method) => {
    if (!method) return false
    const cashTypes = ['cash', 'cash payment', 'cash on delivery']
    return cashTypes.some((t) => method?.toLowerCase().includes(t))
  }

  // Wallet payment
  const applyWalletPayment = () => {
    if (availableWalletBalance.value <= 0) return
    const amount = Math.min(availableWalletBalance.value, remainingAmount.value)
    const walletMethod = paymentMethods.value.find((m) =>
      m.type?.toLowerCase().includes('wallet') || m.mode_of_payment?.toLowerCase().includes('wallet')
    )
    if (walletMethod) {
      addCustomPayment(walletMethod, amount)
    }
  }

  // Customer Credit
  const remainingAvailableCredit = computed(() => {
    if (!props.customer) return 0
    return Math.max(0, (props.customer.credit_limit || 0) - (props.customer.credit_used || 0))
  }

  const applyCustomerCredit = () => {
    const amount = Math.min(remainingAvailableCredit.value, remainingAmount.value)
    if (amount > 0) {
      const entry = {
        id: `credit_${Date.now()}`,
        mode_of_payment: 'Customer Credit',
        method_name: 'Customer Credit',
        type: 'credit',
        amount,
        is_exact: true,
        timestamp: new Date().toISOString(),
      }
      paymentEntries.value.push(entry)
      emit('payment-entry-added', entry)
    }
  }

  // Receivable accounts
  const loadReceivableAccounts = async () => {
    try {
      const response = await fetch('/api/method/DyPOS.api.receivable_account.get_list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: ['name', 'account_name'] }),
      })
      const data = await response.json()
      if (data.message) {
        receivableAccounts.value = data.message
      }
    } catch (error) {
      console.error('Failed to load receivable accounts:', error)
    }
  }

  const toggleReceivableAccount = (account) => {
    selectedReceivableAccount.value = selectedReceivableAccount.value === account.name ? null : account.name
  }

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
    })
    // Add rounded amounts
    const rounded = Math.ceil(remaining)
    if (rounded !== remaining && !amounts.includes(rounded)) {
      amounts.push(rounded)
    }
    return amounts.sort((a, b) => a - b)
  }

  const isQuickAmountDisabled = (amount) => {
    if (remainingAmount.value <= 0) return true
    return amount > remainingAmount.value + 0.01 // Allow small floating point tolerance
  }

  const addCustomPayment = (method, amount) => {
    if (!method || amount <= 0) return
    const entry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mode_of_payment: method.mode_of_payment,
      method_name: method.mode_of_payment,
      type: method.type,
      amount,
      is_exact: true,
      timestamp: new Date().toISOString(),
    }
    paymentEntries.value.push(entry)
    // emit('payment-entry-added', entry)
    return entry
  }

  const addMobileCustomPayment = () => {
    if (!props.lastSelectedMethod) return
    const amount = parseFloat(props.mobileCustomAmount)
    if (amount > 0) {
      addCustomPayment(props.lastSelectedMethod, amount)
      props.mobileCustomAmount = null
    }
  }

  const addCustomPaymentByAmount = (method, amount) => {
    if (amount > 0) {
      addCustomPayment(method, amount)
    }
  }

  const addMobileCustomPayment = () => {
    if (!lastSelectedMethod.value) return
    const amount = parseFloat(props.mobileCustomAmount)
    if (amount > 0) {
      addCustomPayment(lastSelectedMethod.value, amount)
      // props.mobileCustomAmount = null // This should be handled by parent
    }
  }

  const isQuickAmountDisabled = (amount) => {
    if (remainingAmount.value <= 0) return true
    return amount > remainingAmount.value + 0.01
  }

  const onPaymentMethodDown = (method, event) => {
    // Store initial state for potential drag/cancel
  }

  const onPaymentMethodUp = (method) => {
    selectPaymentMethod(method)
  }

  const onPaymentMethodCancel = () => {
    // Cancel any pending actions
  }

  const selectPaymentMethod = (method) => {
    if (lastSelectedMethod.value?.mode_of_payment === method.mode_of_payment) {
      return
    }
    lastSelectedMethod.value = method
    // props.mobileCustomAmount = null // Reset mobile custom amount
  }

  const toggleReceivableAccount = (account) => {
    selectedReceivableAccount.value = selectedReceivableAccount.value === account.name ? null : account.name
  }

  const applyCustomerCredit = () => {
    const amount = Math.min(remainingAvailableCredit.value, remainingAmount.value)
    if (amount > 0) {
      const entry = {
        id: `credit_${Date.now()}`,
        mode_of_payment: 'Customer Credit',
        method_name: 'Customer Credit',
        type: 'credit',
        amount,
        is_exact: true,
        timestamp: new Date().toISOString(),
      }
      paymentEntries.value.push(entry)
      // emit('payment-entry-added', entry)
    }
  }

  const remainingAmount = computed(() => {
    return props.grandTotal - totalPaid.value
  })

  const remainingAmount = computed(() => {
    const grandTotal = props.grandTotal || 0
    const paid = totalPaid.value
    return Math.max(0, grandTotal - paid)
  })

  const totalPaid = computed(() => {
    return paymentEntries.value.reduce((sum, entry) => sum + (entry.amount || 0), 0)
  })

  const changeAmount = computed(() => {
    return totalPaid.value - (props.grandTotal || 0)
  })

  const hasNonCashPayment = computed(() => {
    return paymentEntries.value.some(
      (entry) =>
        !entry.mode_of_payment?.toLowerCase().includes('cash') &&
        !entry.mode_of_payment?.toLowerCase().includes('wallet')
    )
  })

  const isExactAmountModeActive = computed(() => {
    return totalPaid.value > 0 && !isCashPaymentMethod(lastSelectedMethod.value)
  })

  const isCashPaymentMethod = (method) => {
    if (!method) return false
    const cashTypes = ['cash', 'cash payment', 'cash on delivery']
    return cashTypes.some((t) => method?.mode_of_payment?.toLowerCase().includes(t))
  }

  const isExactAmountModeActive = computed(() => {
    return totalPaid.value > 0 && !isCashPaymentMethod(lastSelectedMethod.value)
  })

  const isExactAmountValid = computed(() => {
    if (!isExactAmountModeActive.value) return true
    return Math.abs(totalPaid.value - (props.grandTotal || 0)) < 0.01
  })

  const isExactAmountValid = computed(() => {
    if (!isExactAmountModeActive.value) return true
    return Math.abs(totalPaid.value - (props.grandTotal || 0)) < 0.01
  })

  // Mobile custom amount
  const mobileCustomAmount = ref(null)
  const addMobileCustomPayment = () => {
    if (!props.lastSelectedMethod) return
    const amount = parseFloat(props.mobileCustomAmount)
    if (amount > 0) {
      addCustomPayment(props.lastSelectedMethod, amount)
      // props.mobileCustomAmount = null
    }
  }

  const addMobileCustomPayment = () => {
    if (!lastSelectedMethod.value) return
    const amount = parseFloat(props.mobileCustomAmount)
    if (amount > 0) {
      addCustomPayment(lastSelectedMethod.value, amount)
    }
  }

  const addCustomPaymentByAmount = (method, amount) => {
    if (amount > 0) {
      addCustomPayment(method, amount)
    }
  }

  const isQuickAmountDisabled = (amount) => {
    if (remainingAmount.value <= 0) return true
    return amount > remainingAmount.value + 0.01
  }

  const addCustomPaymentByAmount = (method, amount) => {
    if (amount > 0) {
      addCustomPayment(method, amount)
    }
  }

  const isQuickAmountDisabled = (amount) => {
    if (remainingAmount.value <= 0) return true
    return amount > remainingAmount.value + 0.01
  }

  const mobileCustomAmount = ref(null)

  const addMobileCustomPayment = () => {
    if (!lastSelectedMethod.value) return
    const amount = parseFloat(props.mobileCustomAmount)
    if (amount > 0) {
      addCustomPayment(lastSelectedMethod.value, amount)
    }
  }

  return {
    // State
    loadingPaymentMethods,
    paymentMethods,
    filteredPaymentMethods,
    lastSelectedMethod,
    selectedReceivableAccount,
    paymentEntries,
    walletInfo,
    availableWalletBalance,
    walletInfoLoaded,
    receivableAccounts,
    lastSelectedMethod,
    selectedReceivableAccount,
    paymentEntries,
    loadingPaymentMethods,

    // Computed
    totalPaid,
    changeAmount,
    remainingAmount,
    remainingAvailableCredit,
    isCashPaymentMethod,
    isExactAmountModeActive,
    isExactAmountValid,
    hasNonCashPayment,
    quickAmounts,
    isQuickAmountDisabled,
    walletInfo,
    walletInfoLoaded,
    receivableAccounts,

    // Methods
    loadPaymentMethods,
    loadWalletInfo,
    loadReceivableAccounts,
    selectPaymentMethod,
    clearAll,
    addCustomPayment,
    addCustomPaymentByAmount,
    addMobileCustomPayment,
    removePaymentEntry,
    clearAll,
    applyWalletPayment,
    applyCustomerCredit,
    toggleReceivableAccount,
    loadReceivableAccounts,
    loadPaymentMethods,
    loadWalletInfo,
    selectPaymentMethod,
    clearAll,
    getMethodTotal,
    addCustomPayment,
    isWalletPaymentMethod,
    isCashPaymentMethod,
    isExactAmountModeActive,
    isExactAmountValid,
    quickAmounts,
    isQuickAmountDisabled,
    addCustomPayment,
    addCustomPaymentByAmount,
    addMobileCustomPayment,
    removePaymentEntry,
    clearAll,
    applyWalletPayment,
    applyCustomerCredit,
    toggleReceivableAccount,
    loadReceivableAccounts,
    isCashPaymentMethod,
    isExactAmountModeActive,
    isExactAmountValid,
    quickAmounts,
    isQuickAmountDisabled,
  }
}