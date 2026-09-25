/**
 * Sales Persons Selection Composable for Payment Dialog
 * Handles sales person selection logic (single/multiple modes)
 */

import { ref, computed, watch, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'

export function usePaymentSalesPersons(props, emit) {
  const settingsStore = useSettingsStore()

  // State
  const selectedSalesPersons = ref([])
  const salesPersonSearch = ref('')
  const salesPersonDropdownOpen = ref(false)
  const loadingSalesPersons = ref(false)
  const salesPersons = ref([])
  const salesPersonDropdownRef = ref(null)

  // Computed
  const availableSalesPersons = computed(() => {
    if (!salesPersonSearch.value.trim()) {
      return salesPersons.value.filter(
        (p) => !selectedSalesPersons.value.some((sp) => sp.sales_person === p.sales_person),
      )
    }
    return salesPersons.value.filter(
      (p) =>
        !selectedSalesPersons.value.some((sp) => sp.sales_person === p.sales_person) &&
        (p.sales_person_name || p.name || '').toLowerCase().includes(salesPersonSearch.value.toLowerCase()),
    )
  })

  const isSingleSalesPerson = computed(() => settingsStore.isSingleSalesPerson)
  const isSalesPersonValid = computed(() => {
    if (!settingsStore.enableSalesPersons) return true
    return selectedSalesPersons.value.length > 0
  })

  const totalSalesAllocation = computed(() => {
    return selectedSalesPersons.value.reduce((sum, p) => sum + (p.allocated_percentage || 0), 0)
  })

  // Methods
  const loadSalesPersons = async () => {
    if (!settingsStore.enableSalesPersons) return

    loadingSalesPersons.value = true
    try {
      // Load from API or local cache
      const response = await fetch('/api/method/DyPOS.api.sales_person.get_list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: ['name', 'sales_person_name', 'commission_rate'] }),
      })
      const data = await response.json()
      if (data.message) {
        salesPersons.value = data.message
      }
    } catch (error) {
      console.error('Failed to load sales persons:', error)
    } finally {
      loadingSalesPersons.value = false
    }
  }

  const refreshSalesPersons = async () => {
    await loadSalesPersons()
  }

  const addSalesPerson = (person) => {
    if (isSingleSalesPerson.value) {
      selectedSalesPersons.value = [{ ...person, allocated_percentage: 100 }]
    } else {
      const exists = selectedSalesPersons.value.some((sp) => sp.sales_person === person.sales_person)
      if (!exists) {
        const remaining = 100 - totalSalesAllocation.value
        selectedSalesPersons.value.push({
          ...person,
          allocated_percentage: remaining > 0 ? remaining : 0,
        })
      }
    }
    salesPersonSearch.value = ''
    salesPersonDropdownOpen.value = false
    emit('sales-persons-changed', selectedSalesPersons.value)
  }

  const removeSalesPerson = (salesPersonId) => {
    selectedSalesPersons.value = selectedSalesPersons.value.filter((p) => p.sales_person !== salesPersonId)
    // Redistribute percentage equally among remaining
    const remaining = selectedSalesPersons.value.length > 0
      ? 100 / selectedSalesPersons.value.length
      : 0
    selectedSalesPersons.value.forEach((p) => {
      p.allocated_percentage = Math.round(100 / selectedSalesPersons.value.length)
    })
    // Adjust for rounding
    const total = selectedSalesPersons.value.reduce((sum, p) => sum + p.allocated_percentage, 0)
    if (total !== 100 && selectedSalesPersons.value.length > 0) {
      selectedSalesPersons.value[0].allocated_percentage += 100 - total
    }
    emit('sales-persons-changed', selectedSalesPersons.value)
  }

  const clearSalesPersons = () => {
    selectedSalesPersons.value = []
    emit('sales-persons-changed', [])
  }

  const onSalesPersonFocus = () => {
    salesPersonDropdownOpen.value = true
    if (salesPersons.value.length === 0) {
      loadSalesPersons()
    }
  }

  const handleSalesPersonBlur = () => {
    // Delay to allow click on dropdown items
    setTimeout(() => {
      salesPersonDropdownOpen.value = false
    }, 200)
  }

  const handleDocumentClick = (event) => {
    if (salesPersonDropdownRef.value && !salesPersonDropdownRef.value.contains(event.target)) {
      salesPersonDropdownOpen.value = false
    }
  }

  // Initialize
  onMounted(() => {
    document.addEventListener('mousedown', handleDocumentClick)
    if (settingsStore.enableSalesPersons) {
      loadSalesPersons()
    }
  })

  return {
    // State
    selectedSalesPersons,
    salesPersonSearch,
    salesPersonDropdownOpen,
    loadingSalesPersons,
    salesPersons,
    salesPersonDropdownRef,

    // Computed
    availableSalesPersons,
    isSingleSalesPerson,
    isSalesPersonValid,
    totalSalesAllocation,

    // Methods
    loadSalesPersons,
    refreshSalesPersons,
    addSalesPerson,
    removeSalesPerson,
    clearSalesPersons,
    onSalesPersonFocus,
    handleSalesPersonBlur,
  }
}