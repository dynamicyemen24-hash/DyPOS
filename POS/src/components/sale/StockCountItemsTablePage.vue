<template>
  <div class="stock-count-items-table h-full flex flex-col">
    <!-- Toolbar -->
    <div class="p-4 border-b bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <!-- Search & Filters -->
      <div class="flex flex-col sm:flex-row gap-3 w-full sm:flex-1">
        <div class="relative w-full sm:w-64">
          <FeatherIcon name="search" class="absolute inset-y-0 right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="__('البحث بالكود، الاسم، الباركود...')"
            class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            @keydown.enter="loadItems"
          />
        </div>

        <SelectInput
          v-model="filterWarehouse"
          :options="warehouseOptions"
          :placeholder="__('جميع المستودعات')"
          class="w-48"
        />

        <SelectInput
          v-model="filterCategory"
          :options="categoryOptions"
          :placeholder="__('جميع التصنيفات')"
          class="w-48"
        />

        <SelectInput
          v-model="filterStockStatus"
          :options="stockStatusOptions"
          :placeholder="__('حالة المخزون')"
          class="w-40"
        />

        <SelectInput
          v-model="filterUom"
          :options="uomOptions"
          :placeholder="__('وحدة القياس')"
          class="w-36"
        />

        <Button @click="loadItems" variant="outline" :loading="loading">
          <template #prefix>
            <FeatherIcon name="refresh-cw" class="w-4 h-4" />
          </template>
          {{ __("تحديث") }}
        </Button>

        <Button @click="downloadImportTemplate" variant="outline">
          <template #prefix>
            <FeatherIcon name="download" class="w-4 h-4" />
          </template>
          {{ __("قالب الاستيراد") }}
        </Button>

        <Button @click="$emit('import')" variant="outline">
          <template #prefix>
            <FeatherIcon name="upload" class="w-4 h-4" />
          </template>
          {{ __("استيراد") }}
        </Button>
      </div>

      <!-- Currency/UoM Quick Select -->
      <div class="flex items-center gap-3 w-full sm:hidden">
        <span class="text-xs text-gray-500">{{ __("العملة") }}</span>
        <select
          v-model="selectedCurrency"
          @change="$emit('currency-change', $event)"
          class="px-2 py-1 border border-gray-300 rounded text-xs"
        >
          <option v-for="c in currencies" :key="c.code" :value="c.code">
            {{ c.symbol }} {{ c.code }}
          </option>
        </select>
        <span class="text-xs text-gray-500">{{ __("وحدة") }}</span>
        <select
          v-model="selectedUom"
          @change="$emit('uom-change', $event)"
          class="px-2 py-1 border border-gray-300 rounded text-xs"
        >
          <option v-for="u in uoms" :key="u.code" :value="u.code">
            {{ u.code }}
          </option>
        </select>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
      <SummaryCard
        :label="__('إجمالي الأصناف')"
        :value="summary.totalItems"
        icon="package"
        color="blue"
      />
      <SummaryCard
        :label="__('إجمالي الكمية')"
        :value="formatQty(summary.totalQty)"
        icon="package"
        color="green"
      />
      <SummaryCard
        :label="__('قيمة المخزون')"
        :value="formatMoney(summary.totalValue)"
        icon="dollar-sign"
        color="purple"
      />
      <SummaryCard
        :label="__('أصناف منخفضة')"
        :value="summary.lowStockCount"
        icon="alert-triangle"
        color="orange"
      />
    </div>

    <!-- Items Table -->
    <div class="flex-1 overflow-hidden">
      <div v-if="loading && !hasData" class="flex items-center justify-center h-full">
        <div class="text-center">
          <LoadingIndicator class="w-10 h-10 mx-auto mb-3" />
          <p class="text-sm text-gray-500">{{ __("جاري تحميل بيانات المخزون...") }}</p>
        </div>
      </div>

      <div v-else-if="error" class="flex items-center justify-center h-full p-4">
        <div class="text-center">
          <FeatherIcon name="alert-circle" class="w-12 h-12 text-red-400 mx-auto mb-2" />
          <p class="text-red-700 font-medium">{{ __("فشل تحميل البيانات") }}</p>
          <p class="text-red-500 text-sm mt-1">{{ error }}</p>
          <Button class="mt-3" variant="solid" @click="loadItems">
            {{ __("إعادة المحاولة") }}
          </Button>
        </div>
      </div>

      <div v-else class="h-full overflow-auto">
        <div class="overflow-x-auto h-full">
          <table class="w-full min-w-[1000px]">
            <thead class="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10" style="width: 50px;">
                  #
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-50 bg-gray-50 z-10" style="width: 120px;">
                  {{ __("كود الصنف") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 200px;">
                  {{ __("اسم الصنف") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 120px;">
                  {{ __("التصنيف") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 120px;">
                  {{ __("المستودع") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 100px;">
                  {{ __("الوحدة") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 120px;">
                  {{ __("الكمية النظامية") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 120px;">
                  {{ __("الكمية المحجوزة") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 120px;">
                  {{ __("المتاح") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 120px;">
                  {{ __("الكمية المحصاة") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 100px;">
                  {{ __("الفرق") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 100px;">
                  {{ __("القيمة") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 100px;">
                  {{ __("الحالة") }}
                </th>
                <th class="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 120px;">
                  {{ __("الإجراءات") }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="(row, index) in paginatedItems"
                :key="row.id || index"
                class="hover:bg-gray-50 transition-colors"
                :class="{
                  'bg-red-50': row.variance < 0,
                  'bg-yellow-50': row.variance > 0 && row.variance !== 0,
                  'bg-green-50': row.variance === 0 && row.countedQty !== null,
                }"
              >
                <td class="px-3 py-2 text-right text-sm text-gray-500 sticky left-0 bg-white z-10">
                  {{ (currentPage - 1) * pageSize + index + 1 }}
                </td>
                <td class="px-3 py-2 text-right text-sm font-mono text-gray-900 sticky left-50 bg-white z-10">
                  {{ row.code }}
                </td>
                <td class="px-3 py-2 text-right text-sm text-gray-900 max-w-[200px] truncate">
                  {{ row.name }}
                  <div v-if="row.nameAr" class="text-xs text-gray-400">{{ row.nameAr }}</div>
                </td>
                <td class="px-3 py-2 text-right text-sm text-gray-500">
                  {{ row.category }}
                </td>
                <td class="px-3 py-2 text-right text-sm text-gray-500">
                  {{ row.warehouseName || row.warehouse_id }}
                </td>
                <td class="px-3 py-2 text-right text-sm text-gray-500">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="getUomBadgeClass(row.uom)">
                    {{ row.uom }}
                  </span>
                </td>
                <td class="px-3 py-2 text-right text-sm font-mono text-gray-700">
                  {{ formatQty(row.qty, row.uom) }}
                </td>
                <td class="px-3 py-2 text-right text-sm font-mono text-gray-500">
                  {{ formatQty(row.reservedQty || 0, row.uom) }}
                </td>
                <td class="px-3 py-2 text-right text-sm font-mono text-gray-700">
                  {{ formatQty((row.qty || 0) - (row.reservedQty || 0), row.uom) }}
                </td>
                <td class="px-3 py-2 text-right">
                  <input
                    v-model="row.countedQty"
                    type="number"
                    step="any"
                    min="0"
                    class="w-full px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-right font-mono"
                    @change="onCountedQtyChange(row)"
                    @focus="row.editing = true"
                    @blur="row.editing = false"
                  />
                </td>
                <td class="px-3 py-2 text-right text-sm font-mono font-semibold"
                  :class="{
                    'text-red-600': row.variance < 0,
                    'text-green-600': row.variance > 0,
                    'text-gray-500': row.variance === 0,
                  }">
                    <span v-if="row.countedQty !== null && row.countedQty !== undefined">
                      {{ row.variance >= 0 ? '+' : '' }}{{ formatQty(row.variance, row.uom) }}
                    </span>
                    <span v-else class="text-gray-300">—</span>
                  </td>
                <td class="px-3 py-2 text-right text-sm font-mono text-gray-700">
                  {{ row.countedValue !== null ? formatMoney(row.countedValue) : '—' }}
                </td>
                <td class="px-3 py-2 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <Badge
                      :theme="getStatusTheme(row)"
                      size="xs"
                    >
                      {{ getStatusLabel(row) }}
                    </Badge>
                    <span v-if="row.countedQty !== null && row.variance !== 0"
                      class="text-xs"
                      :class="row.variance > 0 ? 'text-green-600' : 'text-red-600'">
                      {{ row.variance > 0 ? '+' : '' }}{{ formatQty(Math.abs(row.variance), row.uom) }}
                    </span>
                  </div>
                </td>
                <td class="px-3 py-2 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <Button
                      size="xs"
                      variant="ghost"
                      @click="openAdjustment(row)"
                      :disabled="loading"
                      class="text-xs"
                    >
                      <FeatherIcon name="edit-2" class="w-3 h-3" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      @click="openTransfer(row)"
                      :disabled="loading"
                      class="text-xs"
                    >
                      <FeatherIcon name="move" class="w-3 h-3" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      @click="openHistory(row)"
                      :disabled="loading"
                      class="text-xs"
                    >
                      <FeatherIcon name="clock" class="w-3 h-3" />
                    </Button>
                  </div>
                </td>
              </tr>
              <tr v-if="!paginatedItems.length" class="bg-gray-50">
                <td colspan="14" class="px-6 py-12 text-center text-gray-400">
                  <FeatherIcon name="inbox" class="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p class="text-gray-500">{{ __("لا توجد أصناف مطابقة") }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="px-4 py-3 border-t bg-gray-50">
          <Pagination
            :current-page="currentPage"
            :total-pages="totalPages"
            :page-size="pageSize"
            :total-items="totalItems"
            @page-change="currentPage = $event"
            @page-size-change="onPageSizeChange"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { DEFAULT_CURRENCY } from "@/utils/currency"
import { Badge, Button, FeatherIcon, LoadingIndicator } from "frappe-ui"
import { t } from "@/utils/translation"
import { apiGet, apiPost, apiDownload } from "@/utils/restApi"
import { logger } from "@/utils/logger"
import { formatCurrency } from "@/utils/currency"
import { convertUom } from "@/utils/uom"
import Pagination from "@/components/ui/Pagination.vue"
import StockAdjustmentDialog from "./StockAdjustmentDialog.vue"
import StockTransferDialog from "./StockTransferDialog.vue"
import StockHistoryDialog from "./StockHistoryDialog.vue"
import SummaryCard from "@/components/work/SummaryCard.vue"
import SelectInput from "@/components/common/SelectInput.vue"

const props = defineProps({
	warehouses: { type: Array, default: () => [] },
	categories: { type: Array, default: () => [] },
	currencies: { type: Array, default: () => [] },
	uoms: { type: Array, default: () => [] },
	selectedCurrency: { type: String, default: () => DEFAULT_CURRENCY },
	selectedUom: { type: String, default: "PCS" },
})

const emit = defineEmits(["currency-change", "uom-change", "export", "import"])

const { showSuccess, showError } = useToast()
const log = logger.create("StockCountItemsTable")

// State
const loading = ref(false)
const searchQuery = ref("")
const filterWarehouse = ref("")
const filterCategory = ref("")
const filterStockStatus = ref("")
const filterUom = ref("")
const selectedCurrency = ref(props.selectedCurrency)
const selectedUom = ref(props.selectedUom)

const pageSize = ref(50)
const currentPage = ref(1)

const items = ref([])
const totalItems = ref(0)

const selectedCurrencyObj = computed(
	() =>
		props.currencies.find((c) => c.code === selectedCurrency.value) ||
		props.currencies[0],
)
const selectedUomObj = computed(
	() => props.uoms.find((u) => u.code === selectedUom) || props.uoms[0],
)

const warehouseOptions = computed(() =>
	props.warehouses.map((w) => ({
		value: w.id,
		label: w.name || w.nameAr || w.id,
	})),
)

const categoryOptions = computed(() =>
	props.categories.map((c) => ({ value: c, label: c })),
)

const stockStatusOptions = [
	{ value: "", label: "الكل" },
	{ value: "normal", label: "عادي" },
	{ value: "low", label: "منخفض" },
	{ value: "out", label: "نفذ" },
	{ value: "overstocked", label: "زائد" },
]

const uomOptions = computed(() =>
	props.uoms.map((u) => ({ value: u.code, label: `${u.code} - ${u.nameAr}` })),
)

// Computed
const hasData = computed(() => items.value.length > 0)

const filteredItems = computed(() => {
	let result = items.value
	if (searchQuery.value) {
		const q = searchQuery.value.toLowerCase()
		result = result.filter(
			(r) =>
				r.code?.toLowerCase().includes(q) ||
				r.name?.toLowerCase().includes(q) ||
				r.nameAr?.toLowerCase().includes(q) ||
				r.barcode?.includes(q),
		)
	}
	if (filterWarehouse.value)
		result = result.filter((r) => r.warehouse_id === filterWarehouse.value)
	if (filterCategory.value)
		result = result.filter((r) => r.category === filterCategory.value)
	if (filterUom.value) result = result.filter((r) => r.uom === filterUom.value)
	if (filterStockStatus.value)
		result = result.filter((r) => getStatus(r) === filterStockStatus.value)
	return result
})
const totalItemsCount = computed(() => filteredItems.value.length)
const totalPages = computed(() =>
	Math.ceil(totalItemsCount.value / pageSize.value),
)

const paginatedItems = computed(() => {
	const start = (currentPage.value - 1) * pageSize.value
	return filteredItems.value.slice(start, start + pageSize.value)
})

const summary = computed(() => {
	const all = items.value
	return {
		totalItems: all.length,
		totalQty: all.reduce((sum, r) => sum + (r.qty || 0), 0),
		totalValue: all.reduce(
			(sum, r) => sum + (r.qty || 0) * (r.unitCost || 0),
			0,
		),
		lowStockCount: all.filter((r) => getStatus(r) === "low").length,
		outOfStockCount: all.filter((r) => getStatus(r) === "out").length,
	}
})

// Methods
async function loadItems() {
	loading.value = true
	try {
		// In real app, this would call the API
		// For now, we'll use mock data or API call
		const result = await apiGet("/api/stock", {
			warehouse: filterWarehouse.value,
			category: filterCategory.value,
			filterUom: filterUom.value,
			stockStatus: filterStockStatus.value,
			currency: selectedCurrency.value,
			selectedUom: selectedUom.value,
			limit: 10000,
		})
		items.value = result.stock || result || []
		totalItems.value = items.value.length
	} catch (error) {
		log.error("Failed to load items", error)
		showError(error.message || "فشل تحميل البيانات")
	} finally {
		loading.value = false
	}
}

function getStatus(item) {
	if ((item.qty || 0) <= 0) return "out"
	if (item.reorderPoint && item.qty <= item.reorderPoint) return "low"
	if (item.maxStock && item.qty > item.maxStock) return "overstocked"
	return "normal"
}

function getStatusTheme(item) {
	const status = getStatus(item)
	switch (status) {
		case "out":
			return "red"
		case "low":
			return "orange"
		case "overstocked":
			return "blue"
		default:
			return "green"
	}
}

function getStatusLabel(item) {
	const status = getStatus(item)
	const labels = {
		normal: "عادي",
		low: "منخفض",
		out: "نفذ",
		overstocked: "زائد",
	}
	return labels[status] || status
}

function getUomBadgeClass(uom) {
	const u = props.uoms.find((u) => u.code === uom)
	if (!u) return "gray"
	switch (u.type) {
		case "count":
			return "blue"
		case "weight":
			return "green"
		case "length":
			return "purple"
		case "volume":
			return "orange"
		case "area":
			return "red"
		default:
			return "gray"
	}
}

function formatMoney(amount, currencyCode = selectedCurrency.value) {
	const currency =
		props.currencies.find((c) => c.code === currencyCode) || props.currencies[0]
	if (!currency) return String(amount)
	return `${currency.symbol} ${Number(amount).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatQty(qty, uomCode = selectedUom.value) {
	const uom = props.uoms.find((u) => u.code === uomCode) || props.uoms[0]
	if (!uom) return String(qty)
	return `${Number(qty).toLocaleString("ar-SA")} ${uom.nameAr}`
}

function onCountedQtyChange(row) {
	row.variance = (row.countedQty || 0) - (row.qty || 0)
	row.countedValue = (row.countedQty || 0) * (row.unitCost || 0)
}

async function openAdjustment(row) {
	emit("adjustment", row)
}

async function openTransfer(row) {
	emit("transfer", row)
}

async function openHistory(row) {
	emit("history", row)
}

function onPageSizeChange(size) {
	pageSize.value = size
	currentPage.value = 1
}

function downloadImportTemplate() {
	const headers = [
		"product_code",
		"warehouse_id",
		"qty",
		"uom",
		"currency",
		"unit_cost",
		"reason",
		"reference",
		"batch_number",
		"expiry_date",
	]
	// Template currency column follows the selected/configured currency.
	const cur = selectedCurrency.value
	const csv = [
		headers.join(","),
		`PROD-001,W-01,100,PCS,${cur},25.50,Opening Balance,OB-2024-001,BATCH-001,2025-12-31`,
		`PROD-002,W-01,50,BOX,${cur},15.75,Opening Balance,OB-2024-002,BATCH-002,2025-06-30`,
		`PROD-003,W-02,25,KG,${cur},120.00,Transfer In,TRF-001,,`,
	].join("\n")
	downloadBlob(csv, "text/csv", "stock_count_import_template.csv")
}

function downloadBlob(content, type, filename) {
	const blob = new Blob([content], { type })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

watch([selectedCurrency, selectedUom], () => {
	// Recalculate displayed values when currency/UoM changes
	// This is handled by the format functions which use the reactive values
})
</script>

<style scoped>
/* Table Styles */
table {
  border-collapse: collapse;
}

th {
  background: #f9fafb;
  border-bottom: 2px solid #e5e7eb;
  white-space: nowrap;
}

td {
  white-space: nowrap;
}

tr:hover {
  background: #f9fafb;
}

input[type="number"] {
  -moz-appearance: textfield;
}

input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* Sticky columns */
th[style*="sticky"],
td[style*="sticky"] {
  box-shadow: inset -1px 0 0 #e5e7eb;
}

/* Variance colors */
.bg-red-50 { background-color: #fef2f2; }
.bg-yellow-50 { background-color: #fffbeb; }
.bg-green-50 { background-color: #f0fdf4; }

.text-red-600 { color: #dc2626; }
.text-green-600 { color: #16a34a; }
.text-gray-500 { color: #6b7280; }

/* Badge sizes */
.badge-xs { padding: 2px 6px; font-size: 0.625rem; }

/* Responsive */
@media (max-width: 1200px) {
  table { min-width: 1200px; }
}
</style>