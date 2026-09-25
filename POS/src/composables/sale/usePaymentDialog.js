/**
 * Main Payment Dialog Composable
 * Composes all payment-related composables into a unified interface
 */

import { usePaymentSalesPersons } from './usePaymentSalesPersons'
import { usePaymentMethods } from './usePaymentMethods'
import { usePaymentCalculations } from './usePaymentCalculations'
import { usePaymentEntries } from './usePaymentEntries'
import { usePaymentWriteOff } from './usePaymentWriteOff'

/**
 * Main Payment Dialog Composable
 * Orchestrates all payment-related functionality
 * @param {Object} props - Component props
 * @param {Object} emit - Vue emit function
 * @returns {Object} Unified payment dialog interface
 */
export function usePaymentDialog(props, emit) {
  // Compose all sub-composables
  const salesPersons = usePaymentSalesPersons(props, emit)
  const paymentMethods = usePaymentMethods(props, emit)
  const calculations = usePaymentCalculations(props, emit, {})
  const paymentEntries = usePaymentEntries(props, emit)
  const writeOff = usePaymentWriteOff(props, emit)

  // Unified interface
  return {
    // Sales Persons
    ...salesPersons,

    // Payment Methods
    ...paymentMethods,

    // Calculations
    ...calculations,

    // Payment Entries
    ...paymentEntries,

    // Write-off
    ...writeOff,

    // Unified methods
    submitPayment: async () => {
      // Validation
      if (calculations.remainingAmount.value > 0 && !calculations.isExactAmountValid.value) {
        throw new Error('Payment amount must equal invoice total')
      }

      if (calculations.remainingAmount.value > 0 && !calculations.canWriteOff.value) {
        throw new Error('Remaining amount must be paid or written off')
      }

      // Collect payment data
      const paymentData = {
        entries: paymentEntries.entries.value,
        writeOff: writeOff.applyWriteOff.value ? writeOff.writeOffAmount.value : 0,
        salesPersons: salesPersons.selectedSalesPersons.value,
      }

      emit('submit-payment', paymentData)
      return paymentData
    },

    // Validation
    isValid: computed(() => {
      if (calculations.remainingAmount.value > 0 && !calculations.isExactAmountValid.value) {
        return false
      }
      if (calculations.remainingAmount.value > 0 && !writeOff.canWriteOff.value) {
        return false
      }
      return true
    }),
  }
}

export default usePaymentDialog