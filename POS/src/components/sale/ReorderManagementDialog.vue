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
            </div>

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
                <template #col-qty="{ row }">
                  <div class="flex items-center gap-2">
                    <span>{{ row.current_qty }}</span>
                    <span class="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">حد: {{ row.reorder_point }}</span>
                  </div>
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
              {{ __("لا توجد أصناف تحت حد إعادة الطلب حاليًا") }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { Badge, Button, FormControl, FeatherIcon } from "frappe-ui"
import SelectInput from "@/components/common/SelectInput.vue"
import ReportTable from "@/components/reports/ui/tables/ReportTable.vue"
import Pagination from "@/components/ui/Pagination.vue"
import KpiCard from "@/components/reports/ui/cards/KpiCard.vue"
import { useToast } from "@/composables/useToast"
import { apiGet } from "@/utils/restApi"
import { logger } from "@/utils/logger"
import { formatCurrency as formatCurrencyUtil } from "@/utils/currency"

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
const pageSize = 50
const currentPage = ref(1)
const loading = ref(false)
const reorderItems = ref([])
const summary = ref({ belowReorder: 0, suggested: 0, reorderValue: 0 })

const categoryOptions = computed(() =>
	props.categories.map((c) => ({ value: c, label: c })),
)

const reorderColumns = [
	{ key: "code", label: "الكود", sortable: true },
	{ key: "name", label: "الاسم", sortable: true },
	{ key: "category", label: "التصنيف", sortable: true },
	{ key: "warehouse", label: "المستودع", sortable: true },
	{
		key: "current_qty",
		label: "الكمية الحالية",
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

function formatCurrency(amount) {
	return formatCurrencyUtil(Number.parseFloat(amount || 0))
}

async function loadReorderData() {
	loading.value = true
	try {
		const all = []
		let offset = 0
		const pageSizeApi = 200
		while (all.length < 5000) {
			const data = await apiGet("/products", {
				limit: pageSizeApi,
				offset,
				warehouse: "W-01",
				count: "false",
				...(searchQuery.value ? { q: searchQuery.value } : {}),
				...(filterCategory.value ? { category: filterCategory.value } : {}),
			})
			const rows = data?.products || []
			all.push(...rows)
			if (!data?.hasMore || rows.length === 0) break
			offset += rows.length
		}

		const items = all
			.map((p) => {
				const qty = Number(p.stock_qty) || 0
				const reorderPoint = Math.max(Math.floor(qty * 0.3), 5)
				const suggested = qty <= reorderPoint ? reorderPoint * 2 - qty : 0
				const unitPrice = Number(p.unit_price) || 0
				let status = "ok"
				if (qty <= 0) status = "below_reorder"
				else if (qty <= reorderPoint) status = "suggested"
				return {
					id: p.id,
					code: p.code,
					name: p.name_ar || p.name || p.code,
					category: p.category || "",
					warehouse: "W-01",
					current_qty: qty,
					reorder_point: reorderPoint,
					suggested_qty: Math.max(0, suggested),
					stock_value: qty * unitPrice,
					status,
				}
			})
			.filter((r) => r.status !== "ok")
			.sort((a, b) => a.current_qty - b.current_qty)

		reorderItems.value = items
		summary.value = {
			belowReorder: items.filter((i) => i.status === "below_reorder").length,
			suggested: items.filter((i) => i.suggested_qty > 0).length,
			reorderValue: items.reduce(
				(s, i) =>
					s + i.suggested_qty * (i.stock_value / Math.max(i.current_qty, 1)),
				0,
			),
		}
		currentPage.value = 1
	} catch (error) {
		log.error("Failed to load reorder data", error)
		showError(error.message || "فشل تحميل بيانات إعادة الطلب")
	} finally {
		loading.value = false
	}
}

function getReorderStatusTheme(status) {
	switch (status) {
		case "below_reorder":
			return "red"
		case "suggested":
			return "amber"
		default:
			return "green"
	}
}

function statusLabel(status) {
	if (status === "below_reorder") return "تحت الحد"
	if (status === "suggested") return "مقترح"
	return "طبيعي"
}

function openReorderDetails(row) {
	showSuccess(
		`${row.name}: الكمية ${row.current_qty} / الحد ${row.reorder_point}`,
	)
}

function exportReorderList() {
	const headers = [
		"code",
		"name",
		"category",
		"warehouse",
		"current_qty",
		"reorder_point",
		"suggested_qty",
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
				r.current_qty,
				r.reorder_point,
				r.suggested_qty,
				r.status,
			].join(","),
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
	const csv = `code,name,current_qty,reorder_point,suggested_qty,status\n${row.code},"${row.name}",${row.current_qty},${row.reorder_point},${row.suggested_qty},${row.status}`
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = `reorder_${row.code}.csv`
	a.click()
	URL.revokeObjectURL(url)
}

onMounted(loadReorderData)

watch([searchQuery, filterCategory], () => {
	currentPage.value = 1
	loadReorderData()
})

watch(show, (val) => {
	if (val) loadReorderData()
})
</script>
