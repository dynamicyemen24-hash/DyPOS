/**
 * Payment Write-Off Composable
 * Handles write-off logic for payment dialog
 */

import { ref, computed, watch } from 'vue'

export function usePaymentWriteOff(props, emit) {
  // State
  const applyWriteOff = ref(false)

  // Props-derived
  const remainingAmount = computed(() => {
    const grandTotal = props.grandTotal || 0
    const paid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return Math.max(0, grandTotal - paid)
  })

  // Write-off settings
  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  })

  const writeOffLimit = computed(() => {
    return Math.min(remainingAmount.value, props.writeOffLimit || remainingAmount.value)
  }

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  }

  // Methods
  const applyWriteOff = ref(false)

  const writeOffLimit = computed(() => {
    return Math.min(remainingAmount.value, props.writeOffLimit || remainingAmount.value)
  }

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  }

  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  }

  const remainingAmount = computed(() => {
    const grandTotal = props.grandTotal || 0
    const paid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return Math.max(0, grandTotal - paid)
  }

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  }

  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  }

  const writeOffLimit = computed(() => {
    return Math.min(remainingAmount.value, props.writeOffLimit || remainingAmount.value)
  }

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  }

  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  }

  // Watch for changes
  const applyWriteOff = ref(false)

  watch(() => applyWriteOff.value, (newVal) => {
    // emit('write-off-change', { apply: newVal, amount: newVal ? remainingAmount.value : 0 })
  })

  // Methods
  const applyWriteOff = ref(false)

  const writeOffLimit = computed(() => {
    return Math.min(remainingAmount.value, props.writeOffLimit || remainingAmount.value)
  }

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  }

  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  }

  const remainingAmount = computed(() => {
    const grandTotal = props.grandTotal || 0
    const paid = props.paymentEntries?.reduce((sum, entry) => sum + (entry.amount || 0), 0) || 0
    return Math.max(0, grandTotal - paid)
  }

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  }

  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  }

  const writeOffLimit = computed(() => {
    return Math.min(remainingAmount.value, props.writeOffLimit || remainingAmount.value)
  }

  const writeOffAmount = computed(() => {
    return applyWriteOff.value ? remainingAmount.value : 0
  }

  const canWriteOff = computed(() => {
    return props.canWriteOff && remainingAmount.value > 0
  }

  // Watch for changes
  const applyWriteOff = ref(false)

  watch(() => applyWriteOff.value, (newVal) => {
    // emit('write-off-change', { apply: newVal, amount: newVal ? remainingAmount.value : 0 })
  })

  // Methods
  const toggleWriteOff = () => {
    applyWriteOff.value = !applyWriteOff.value
  }

  const clearWriteOff = () => {
    applyWriteOff.value = false
  }

  const setWriteOff = (value) => {
    applyWriteOff.value = value
  }

  return {
    // State
    applyWriteOff,

    // Computed
    remainingAmount,
    writeOffLimit,
    writeOffAmount,
    canWriteOff,

    // Methods
    toggleWriteOff,
    clearWriteOff,
    setWriteOff,
  }
}