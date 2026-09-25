/**
 * Payment Entries Management Composable
 * Handles payment entry CRUD operations and state management
 */

import { ref, computed, watch } from 'vue'

export function usePaymentEntries(props, emit) {
  // State
  const entries = ref(props.initialEntries || [])
  const lastSelectedMethod = ref(null)
  const selectedReceivableAccount = ref(null)

  // Payment entries management
  const entries = ref(props.initialEntries || [])

  // Computed
  const totalPaid = computed(() => {
    return entries.value.reduce((sum, entry) => sum + (entry.amount || 0), 0)
  })

  const remainingAmount = computed(() => {
    const grandTotal = props.grandTotal || 0
    const paid = totalPaid.value
    return Math.max(0, grandTotal - paid)
  })

  const changeAmount = computed(() => {
    return totalPaid.value - (props.grandTotal || 0)
  )

  const hasNonCashPayment = computed(() => {
    return entries.value.some(
      (entry) =>
        !entry.mode_of_payment?.toLowerCase().includes('cash') &&
        !entry.mode_of_payment?.toLowerCase().includes('wallet')
    )
  })

  // Methods
  const addEntry = (entry) => {
    const newEntry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    }
    entries.value.push(newEntry)
    return newEntry
  }

  const addCustomPayment = (method, amount) => {
    if (!method || amount <= 0) return null

    const entry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mode_of_payment: method.mode_of_payment,
      method_name: method.mode_of_payment,
      type: method.type,
      amount,
      is_exact: true,
      timestamp: new Date().toISOString(),
    }
    entries.value.push(entry)
    return entry
  }

  const removeEntry = (entryId) => {
    const index = entries.value.findIndex((e) => e.id === entryId)
    if (index !== -1) {
      entries.value.splice(index, 1)
    }
  }

  const updateEntry = (entryId, updates) => {
    const index = entries.value.findIndex((e) => e.id === entryId)
    if (index !== -1) {
      entries.value[index] = { ...entries.value[index], ...updates }
    }
  }

  const clearAll = () => {
    entries.value = []
  }

  const getMethodTotal = (modeOfPayment) => {
    return entries.value
      .filter((e) => e.mode_of_payment === modeOfPayment)
      .reduce((sum, e) => sum + (e.amount || 0), 0)
  }

  const hasMethod = (modeOfPayment) => {
    return entries.value.some((e) => e.mode_of_payment === modeOfPayment)
  }

  const getEntriesByMethod = (modeOfPayment) => {
    return entries.value.filter((e) => e.mode_of_payment === modeOfPayment)
  }

  const clearAll = () => {
    entries.value = []
  }

  const getMethodTotal = (modeOfPayment) => {
    return entries.value
      .filter((e) => e.mode_of_payment === modeOfPayment)
      .reduce((sum, e) => sum + (e.amount || 0), 0)
  }

  // Watch for changes and emit events
  watch(
    () => entries.value,
    (newEntries) => {
      emit('entries-changed', newEntries)
    },
    { deep: true }
  )

  // Expose methods
  return {
    entries,
    totalPaid: computed(() => entries.value.reduce((sum, e) => sum + (e.amount || 0), 0)),
    remainingAmount: computed(() => Math.max(0, (props.grandTotal || 0) - entries.value.reduce((sum, e) => sum + (e.amount || 0), 0))),
    changeAmount: computed(() => entries.value.reduce((sum, e) => sum + (e.amount || 0), 0) - (props.grandTotal || 0)),
    hasNonCashPayment: computed(() => entries.value.some((e) => !e.mode_of_payment?.toLowerCase().includes('cash') && !e.mode_of_payment?.toLowerCase().includes('wallet'))),

    // Methods
    addEntry,
    addCustomPayment,
    removeEntry,
    updateEntry,
    clearAll,
    getMethodTotal,
    hasMethod: (mode) => entries.value.some((e) => e.mode_of_payment === mode),
    getEntriesByMethod: (mode) => entries.value.filter((e) => e.mode_of_payment === mode),
    clearAll,
    getMethodTotal,
  }
}