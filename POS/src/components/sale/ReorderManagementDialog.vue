<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]" @click.self="handleClose">
      <div class="fixed inset-0 flex items-center justify-center p-4">
        <div class="w-full max-w-4xl bg-white shadow-xl rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <div class="flex items-center gap-2">
              <FeatherIcon name="alert-triangle" class="w-5 h-5 text-amber-600" />
              <h2 class="text-lg font-semibold text-gray-900">{{ __("إدارة إعادة الطلب") }}</h2>
            </div>
            <Button variant="ghost" size="sm" @click="handleClose" icon="x" />
          </div>
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" @click="loadReorderData" :loading="loading">
                <template #prefix>
                  <FeatherIcon name="refresh-cw" class="w-4 h-4" />
                </template>
                {{ __("تحديث") }}
              </Button>
              <Button variant="outline" @click="exportReorderList">
                <template #prefix>
                  <FeatherIcon name="download" class="w-4 h-4" />
                </template>
                {{ __("تصدير") }}
              </Button>
              <div class="flex-1 min-w-[200px]">
                <FormControl
                  type="text"
                  v-model="searchQuery"
                  :placeholder="__('ابحث في الأصناف...')"
                >
                  <template #prefix>
                    <FeatherIcon name="search" class="w-4 h-4 text-gray-500" />
                  </template>
                </FormControl>
              </div>
              <SelectInput
                v-model="filterCategory"
                :options="categoryOptions"
                :placeholder="__('كل التصنيفات')"
                class="w-48"
              />
              <SelectInput
                v-model="warehouseFilter"
                :options="warehouseOptions"
                :placeholder="__('اختر المستودع')"
                class="w-48"
              />
            </div>
            <p
              v-if="loadError"
              role="alert"
              class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {{ loadError }}
            </p>
            <p
              v-if="truncated"
              class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            >
              {{ __("تم عرض أول 5000 صنف مطابق فقط. استخدم البحث لتضييق النتائج.") }}
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <KpiCard
                :label="__('تحت حد إعادة الطلب')"
                :value="summary.belowReorder"
                icon="alert-triangle"
                status="danger"
              />
              <KpiCard
                :label="__('اقتراح إعادة الطلب')"
                :value="summary.suggested"
                icon="package"
                status="warning"
              />
              <KpiCard
                :label="__('قيمة إعادة الطلب التقديرية')"
                :value="formatCurrency(summary.reorderValue)"
                icon="dollar-sign"
                status="good"
              />
            </div>
            <div class="overflow-x-auto">
              <ReportTable
                :columns="reorderColumns"
                :rows="paginatedItems"
                :row-clickable="true"
                @row-click="openReorderDetails"
              >
                <template #col-available_qty="{ row }">
                  <div class="flex items-center gap-2">
                    <span>{{ row.available_qty }}</span>
                    <span class="text-xs text-gray-500">{{ __("محجوز: {0}", [row.reserved_qty]) }}</span>
                    <span class="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">حد: {{ row.reorder_point }}</span>
                  </div>
                </template>
                <template #col-reorder_point="{ row }">
                  <input
                    v-model.number="draftReorderPoints[row.id]"
                    type="number"
                    min="0"
                    max="1000000"
                    step="0.001"
                    class="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                    :aria-label="__('حد إعادة الطلب لـ {0}', [row.name])"
                    @click.stop
                  />
                </template>
                <template #col-suggested_qty="{ row }">
                  <span :class="row.suggested_qty > 0 ? 'text-amber-600 font-medium' : ''">
                    {{ row.suggested_qty || 0 }}
                  </span>
                </template>
                <template #col-status="{ row }">
                  <Badge :theme="getReorderStatusTheme(row.status)">{{ statusLabel(row.status) }}</Badge>
                </template>
                <template #col-actions="{ row }">
                  <Button
                    size="sm"
                    variant="ghost"
                    :loading="savingItemId === row.id"
                    :disabled="savingItemId === row.id || Number(draftReorderPoints[row.id] ?? row.reorder_point) === row.reorder_point"
                    @click.stop="saveReorderPoint(row)"
                    :aria-label="__('حفظ حد إعادة الطلب')"
                  >
                    <FeatherIcon name="check" class="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" @click.stop="exportReorderRow(row)" :aria-label="__('تصدير')">
                    <FeatherIcon name="download" class="w-4 h-4" />
                  </Button>
                </template>
              </ReportTable>
            </div>
            <Pagination
              v-if="totalPages > 1"
              :current-page="currentPage"
              :total-pages="totalPages"
              @page-change="currentPage = $event"
            />
            <p v-if="!loading && !reorderItems.length" class="text-center text-sm text-gray-500 py-8">
              {{ __("لا توجد أصناف مطابقة في هذا المستودع") }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
<script setup>
import SelectInput from "@/components/common/SelectInput.vue"
import KpiCard from "@/components/reports/ui/cards/KpiCard.vue"
import ReportTable from "@/components/reports/ui/tables/ReportTable.vue"
import Pagination from "@/components/ui/Pagination.vue"
import { useToast } from "@/composables/useToast"
import { formatCurrencySafe as formatCurrency } from "@/utils/currency"
import { logger } from "@/utils/logger"
import { apiGet, apiPatch } from "@/utils/restApi"
import { Badge, Button, FeatherIcon, FormControl } from "dypos-ui"
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import { buildReorderPlan, summarizeReorderPlan } from "./reorderPlanning"
const log = logger.create("ReorderManagementDialog")
const props = defineProps({
	modelValue: Boolean,
	warehouses: { type: Array, default: () => [] },
	categories: { type: Array, default: () => [] },
})
const emit = defineEmits(["update:modelValue", "saved"])
const { showSuccess, showError } = useToast()
const show = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})
const searchQuery = ref("")
const filterCategory = ref("")
const warehouseFilter = ref("")
const pageSize = 50
const currentPage = ref(1)
const loading = ref(false)
const reorderItems = ref([])
const summary = ref({ belowReorder: 0, suggested: 0, reorderValue: 0 })
const loadError = ref("")
const truncated = ref(false)
const savingItemId = ref(null)
const draftReorderPoints = reactive({})
let requestSequence = 0
let searchTimer = null
const categoryOptions = computed(() =>
	props.categories.map((c) => ({ value: c, label: c })),
)
const warehouseOptions = computed(() =>
	props.warehouses
		.filter((warehouse) => warehouse?.id && warehouse.isActive !== false)
		.map((warehouse) => ({
			value: warehouse.id,
			label: warehouse.name || warehouse.id,
		})),
)
const reorderColumns = [
	{ key: "code", label: "الكود", sortable: true },
	{ key: "name", label: "الاسم", sortable: true },
	{ key: "category", label: "التصنيف", sortable: true },
	{ key: "warehouse", label: "المستودع", sortable: true },
	{
		key: "available_qty",
		label: "المتاح",
		sortable: true,
		format: "number",
	},
	{ key: "reorder_point", label: "حد الطلب", sortable: true, format: "number" },
	{
		key: "suggested_qty",
		label: "الكمية المقترحة",
		sortable: true,
		format: "number",
	},
	{
		key: "stock_value",
		label: "قيمة المخزون",
		sortable: true,
		format: "currency",
	},
	{ key: "status", label: "الحالة", sortable: true },
	{ key: "actions", label: "إجراءات", width: 80 },
]
const paginatedItems = computed(() => {
	const start = (currentPage.value - 1) * pageSize
	return reorderItems.value.slice(start, start + pageSize)
})
const totalPages = computed(() =>
	Math.ceil(reorderItems.value.length / pageSize),
)
async function loadReorderData() {
	const requestId = ++requestSequence
	if (!warehouseFilter.value) {
		reorderItems.value = []
		summary.value = { belowReorder: 0, suggested: 0, reorderValue: 0 }
		loadError.value = "تعذر تحميل اقتراحات التوريد: لا يوجد مستودع نشط محدد."
		loading.value = false
		return
	}
	loading.value = true
	loadError.value = ""
	truncated.value = false
	try {
		const all = []
		let offset = 0
		const pageSizeApi = 200
		while (all.length < 5000) {
			const data = await apiGet("/products", {
				limit: pageSizeApi,
				offset,
				warehouse: warehouseFilter.value,
				count: "false",
				...(searchQuery.value ? { q: searchQuery.value } : {}),
				...(filterCategory.value ? { category: filterCategory.value } : {}),
			})
			const rows = data?.products || []
			all.push(...rows)
			if (!data?.hasMore || rows.length === 0) {
				break
			}
			if (all.length >= 5000 && data?.hasMore) truncated.value = true
			offset += rows.length
		}
		if (requestId !== requestSequence) return
		const warehouseName =
			warehouseOptions.value.find(
				(option) => option.value === warehouseFilter.value,
			)?.label || warehouseFilter.value
		const items = buildReorderPlan(all, warehouseName)
		reorderItems.value = items
		summary.value = summarizeReorderPlan(items)
		for (const item of items) draftReorderPoints[item.id] = item.reorder_point
		currentPage.value = 1
	} catch (error) {
		if (requestId !== requestSequence) return
		log.error("Failed to load reorder data", error)
		loadError.value = error.message || "فشل تحميل بيانات إعادة الطلب"
		showError(loadError.value)
	} finally {
		if (requestId === requestSequence) loading.value = false
	}
}
async function saveReorderPoint(row) {
	const reorderPoint = Number(draftReorderPoints[row.id])
	if (
		!Number.isFinite(reorderPoint) ||
		reorderPoint < 0 ||
		reorderPoint > 1_000_000
	) {
		showError("يجب أن يكون حد إعادة الطلب رقمًا بين 0 و1,000,000.")
		return
	}
	savingItemId.value = row.id
	try {
		await apiPatch(`/products/${encodeURIComponent(row.id)}`, {
			reorderPoint,
		})
		row.reorder_point = reorderPoint
		draftReorderPoints[row.id] = reorderPoint
		showSuccess("تم حفظ حد إعادة الطلب")
		emit("saved")
		await loadReorderData()
	} catch (error) {
		log.error("Failed to save reorder point", error)
		showError(error.message || "فشل حفظ حد إعادة الطلب")
	} finally {
		savingItemId.value = null
	}
}
function getReorderStatusTheme(status) {
	switch (status) {
		case "below_reorder":
			return "red"
		case "suggested":
			return "amber"
		case "unconfigured":
			return "gray"
		default:
			return "green"
	}
}
function statusLabel(status) {
	if (status === "below_reorder") return "تحت الحد"
	if (status === "suggested") return "مقترح"
	if (status === "unconfigured") return "غير مضبوط"
	return "طبيعي"
}
function openReorderDetails(row) {
	showSuccess(
		`${row.name}: المتاح ${row.available_qty} / حد إعادة الطلب ${row.reorder_point}`,
	)
}
function exportReorderList() {
	const headers = [
		"code",
		"name",
		"category",
		"warehouse",
		"available_qty",
		"reorder_point",
		"suggested_qty",
		"unit_cost",
		"status",
	]
	const lines = [headers.join(",")]
	for (const r of reorderItems.value) {
		lines.push(
			[
				r.code,
				r.name,
				r.category,
				r.warehouse,
				r.available_qty,
				r.reorder_point,
				r.suggested_qty,
				r.unit_cost,
				r.status,
			]
				.map(csvCell)
				.join(","),
		)
	}
	const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = `reorder_alerts_${Date.now()}.csv`
	a.click()
	URL.revokeObjectURL(url)
	showSuccess("تم تصدير قائمة إعادة الطلب")
}
function exportReorderRow(row) {
	const csv = [
		[
			"code",
			"name",
			"warehouse",
			"available_qty",
			"reorder_point",
			"suggested_qty",
			"unit_cost",
			"status",
		],
		[
			row.code,
			row.name,
			row.warehouse,
			row.available_qty,
			row.reorder_point,
			row.suggested_qty,
			row.unit_cost,
			row.status,
		],
	]
		.map((line) => line.map(csvCell).join(","))
		.join("\n")
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = `reorder_${row.code}.csv`
	a.click()
	URL.revokeObjectURL(url)
}
function csvCell(value) {
	const text = String(value ?? "")
	const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text
	return `"${safeText.replace(/"/g, '""')}"`
}
onMounted(() => {
	if (show.value) loadReorderData()
})
watch([searchQuery, filterCategory, warehouseFilter], () => {
	currentPage.value = 1
	clearTimeout(searchTimer)
	searchTimer = setTimeout(loadReorderData, 250)
})
watch(show, (val) => {
	if (val) if (show.value) searchTimer = setTimeout(loadReorderData, 250)
})
watch(
	warehouseOptions,
	(options) => {
		if (!options.some((option) => option.value === warehouseFilter.value)) {
			warehouseFilter.value = options[0]?.value || ""
		}
	},
	{ immediate: true },
)
onBeforeUnmount(() => {
	clearTimeout(searchTimer)
	requestSequence += 1
})
</script>
