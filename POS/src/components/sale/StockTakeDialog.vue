<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]" @click.self="handleClose">
      <div class="fixed inset-0 flex items-center justify-center p-4">
        <div class="w-full max-w-4xl bg-white shadow-xl rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <div class="flex items-center gap-2">
              <FeatherIcon name="clipboard" class="w-5 h-5 text-indigo-600" />
              <h2 class="text-lg font-semibold text-gray-900">{{ __("الجرد / الجرد الفعلي") }}</h2>
            </div>
            <Button variant="ghost" size="sm" @click="handleClose" icon="x" />
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <div v-if="!activeSession" class="space-y-4">
              <div class="p-4 bg-blue-50 rounded-lg">
                <h4 class="font-medium text-gray-900 mb-2">{{ __("بدء جرد جديد") }}</h4>
                <p class="text-sm text-gray-600 mb-4">{{ __("سجّل الكميات الفعلية وقارنها بكميات النظام") }}</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("المستودع") }}</label>
                    <SelectInput
                      v-model="newSession.warehouseId"
                      :options="warehouseOptions"
                      :placeholder="__('اختر مستودعًا')"
                      required
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("الاسم / المرجع") }}</label>
                    <FormControl
                      type="text"
                      v-model="newSession.name"
                      :placeholder="__('مثال: جرد شهري، مراجعة نهاية العام')"
                    />
                  </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("نوع الجرد") }}</label>
                    <div class="flex gap-2">
                      <label class="flex-1 flex items-center gap-2 p-3 border rounded-lg cursor-pointer" :class="{ 'border-indigo-500 bg-indigo-50': newSession.countType === 'full' }">
                        <input type="radio" v-model="newSession.countType" value="full" class="text-indigo-600" />
                        <span class="text-sm">{{ __("جرد كامل") }}</span>
                      </label>
                      <label class="flex-1 flex items-center gap-2 p-3 border rounded-lg cursor-pointer" :class="{ 'border-indigo-500 bg-indigo-50': newSession.countType === 'cycle' }">
                        <input type="radio" v-model="newSession.countType" value="cycle" class="text-indigo-600" />
                        <span class="text-sm">{{ __("جرد دوري") }}</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("تصفية التصنيف") }}</label>
                    <SelectInput
                      v-model="newSession.category"
                      :options="categoryOptions"
                      :placeholder="__('كل التصنيفات')"
                    />
                  </div>
                </div>

                <Button variant="solid" @click="startStockTake" :loading="starting" class="w-full">
                  {{ __("بدء الجرد") }}
                </Button>
              </div>

              <div v-if="recentSessions.length" class="space-y-3">
                <h4 class="font-medium text-gray-900">{{ __("عمليات الجرد السابقة") }}</h4>
                <div class="max-h-72 overflow-auto space-y-2">
                  <div
                    v-for="s in recentSessions"
                    :key="s.id"
                    class="p-3 border rounded-lg bg-white hover:bg-gray-50 cursor-pointer"
                    @click="loadSession(s.id)"
                  >
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="font-medium text-gray-900">{{ s.name }}</p>
                        <p class="text-xs text-gray-500">
                          {{ s.warehouseId }} • {{ formatDate(s.createdAt) }} • {{ s.itemCount }} صنف
                        </p>
                      </div>
                      <Badge :theme="getStatusTheme(s.status)">{{ statusLabel(s.status) }}</Badge>
                    </div>
                  </div>
                </div>
              </div>

              <p v-if="!recentSessions.length" class="text-center text-sm text-gray-500 py-4">
                {{ __("لا توجد عمليات جرد محفوظة بعد") }}
              </p>
            </div>

            <div v-else class="space-y-4">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 class="text-lg font-semibold text-gray-900">{{ activeSession.name }}</h3>
                  <p class="text-sm text-gray-500">{{ activeSession.warehouseId }} • {{ formatDate(activeSession.createdAt) }}</p>
                </div>
                <div class="flex gap-2">
                  <Button variant="outline" @click="exportSession">{{ __("تصدير") }}</Button>
                  <Button
                    v-if="activeSession.status === 'in_progress'"
                    variant="solid"
                    @click="applyVariances"
                    :loading="applying"
                  >
                    {{ __("تطبيق الفروقات") }}
                  </Button>
                  <Button variant="ghost" theme="red" @click="cancelSession">{{ __("إلغاء") }}</Button>
                </div>
              </div>

              <div class="flex gap-3 flex-wrap">
                <div class="flex-1 min-w-[200px]">
                  <FormControl type="text" v-model="countFilter.search" :placeholder="__('ابحث عن صنف...')">
                    <template #prefix>
                      <FeatherIcon name="search" class="w-4 h-4 text-gray-500" />
                    </template>
                  </FormControl>
                </div>
                <SelectInput
                  v-model="countFilter.category"
                  :options="categoryOptions"
                  :placeholder="__('كل التصنيفات')"
                  class="w-48"
                />
                <SelectInput
                  v-model="countFilter.status"
                  :options="countStatusOptions"
                  :placeholder="__('كل الحالات')"
                  class="w-40"
                />
              </div>

              <div class="overflow-x-auto">
                <ReportTable
                  :columns="countColumns"
                  :rows="filteredCountItems"
                  :row-clickable="true"
                >
                  <template #col-system_qty="{ row }">
                    <span class="text-gray-600">{{ row.system_qty }}</span>
                  </template>
                  <template #col-counted_qty="{ row }">
                    <FormControl
                      type="number"
                      v-model.number="row.counted_qty"
                      :min="0"
                      :step="1"
                      class="w-24"
                      @change="updateVariance(row)"
                    />
                  </template>
                  <template #col-variance="{ row }">
                    <span :class="varianceClass(row.variance)">
                      {{ row.variance >= 0 ? "+" : "" }}{{ row.variance }}
                    </span>
                  </template>
                  <template #col-status="{ row }">
                    <Badge :theme="getCountStatusTheme(row.status)">{{ countStatusLabel(row.status) }}</Badge>
                  </template>
                </ReportTable>
              </div>

              <div class="grid grid-cols-3 gap-3 text-sm">
                <div class="p-3 bg-gray-50 rounded-lg">
                  <p class="text-gray-500">{{ __("إجمالي الأصناف") }}</p>
                  <p class="font-semibold">{{ filteredCountItems.length }}</p>
                </div>
                <div class="p-3 bg-amber-50 rounded-lg">
                  <p class="text-gray-500">{{ __("به فرق") }}</p>
                  <p class="font-semibold text-amber-700">{{ varianceCount }}</p>
                </div>
                <div class="p-3 bg-blue-50 rounded-lg">
                  <p class="text-gray-500">{{ __("تم الجرد") }}</p>
                  <p class="font-semibold text-blue-700">{{ countedCount }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from "vue"
import { Badge, Button, FormControl, FeatherIcon } from "frappe-ui"
import SelectInput from "@/components/common/SelectInput.vue"
import ReportTable from "@/components/reports/ui/tables/ReportTable.vue"
import { useToast } from "@/composables/useToast"
import { apiGet, apiPost } from "@/utils/restApi"
import { logger } from "@/utils/logger"

const log = logger.create("StockTakeDialog")

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

const STORAGE_KEY = "dypos_stock_takes"

const newSession = ref({
	warehouseId: "W-01",
	name: "",
	countType: "full",
	category: "",
})

const activeSession = ref(null)
const recentSessions = ref([])
const starting = ref(false)
const applying = ref(false)

const countFilter = ref({
	search: "",
	category: "",
	status: "",
})

const countStatusOptions = [
	{ value: "", label: "الكل" },
	{ value: "pending", label: "لم يُجرد" },
	{ value: "counted", label: "تم الجرد" },
	{ value: "variance", label: "به فرق" },
]

const countColumns = [
	{ key: "code", label: "الكود", sortable: true },
	{ key: "name", label: "الاسم", sortable: true },
	{ key: "category", label: "التصنيف", sortable: true },
	{ key: "system_qty", label: "كمية النظام", sortable: true, format: "number" },
	{ key: "counted_qty", label: "الكمية المجرودة", sortable: true },
	{ key: "variance", label: "الفرق", sortable: true, format: "number" },
	{ key: "status", label: "الحالة", sortable: true },
]

const warehouseOptions = computed(() =>
	props.warehouses.map((w) => ({ value: w.id, label: w.name || w.id })),
)

const categoryOptions = computed(() =>
	props.categories.map((c) => ({ value: c, label: c })),
)

const filteredCountItems = computed(() => {
	if (!activeSession.value) return []
	let rows = activeSession.value.items || []
	const q = countFilter.value.search.trim().toLowerCase()
	if (q) {
		rows = rows.filter(
			(r) =>
				r.name?.toLowerCase().includes(q) || r.code?.toLowerCase().includes(q),
		)
	}
	if (countFilter.value.category) {
		rows = rows.filter((r) => r.category === countFilter.value.category)
	}
	if (countFilter.value.status) {
		rows = rows.filter((r) => r.status === countFilter.value.status)
	}
	return rows
})

const varianceCount = computed(
	() =>
		(activeSession.value?.items || []).filter((i) => i.status === "variance")
			.length,
)

const countedCount = computed(
	() =>
		(activeSession.value?.items || []).filter((i) => i.counted_qty != null)
			.length,
)

function formatDate(iso) {
	if (!iso) return "-"
	return new Date(iso).toLocaleString("ar-SA")
}

function loadStoredSessions() {
	try {
		recentSessions.value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
	} catch {
		recentSessions.value = []
	}
}

function persistSessions() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(recentSessions.value))
	} catch (error) {
		log.warn("Failed to persist stock takes", error)
	}
}

function saveActiveToStorage() {
	if (!activeSession.value) return
	const idx = recentSessions.value.findIndex(
		(s) => s.id === activeSession.value.id,
	)
	const snapshot = {
		...activeSession.value,
		itemCount: activeSession.value.items?.length || 0,
		updatedAt: new Date().toISOString(),
	}
	if (idx >= 0) recentSessions.value[idx] = snapshot
	else recentSessions.value.unshift(snapshot)
	persistSessions()
}

async function startStockTake() {
	if (!newSession.value.warehouseId) {
		showError("المستودع مطلوب")
		return
	}
	if (!newSession.value.name?.trim()) {
		showError("الاسم مطلوب")
		return
	}

	starting.value = true
	try {
		const warehouse = newSession.value.warehouseId
		const stockData = await apiGet("/stock", { warehouse, limit: 500 })
		const stockRows = stockData?.stock || []

		const productRows = []
		let offset = 0
		while (productRows.length < 2000) {
			const data = await apiGet("/products", {
				limit: 200,
				offset,
				warehouse,
				count: "false",
				...(newSession.value.category
					? { category: newSession.value.category }
					: {}),
			})
			const rows = data?.products || []
			productRows.push(...rows)
			if (!data?.hasMore || rows.length === 0) break
			offset += rows.length
		}

		const stockByProduct = new Map(stockRows.map((s) => [s.product_id, s]))
		const items = productRows.map((p) => {
			const stock = stockByProduct.get(p.id)
			const systemQty = Number(stock?.qty ?? p.stock_qty ?? 0) || 0
			return {
				id: p.id,
				code: p.code,
				name: p.name_ar || p.name || p.code,
				category: p.category || "",
				system_qty: systemQty,
				counted_qty: null,
				variance: 0,
				status: "pending",
			}
		})

		activeSession.value = {
			id: `take_${Date.now()}`,
			name: newSession.value.name.trim(),
			warehouseId: warehouse,
			countType: newSession.value.countType,
			category: newSession.value.category,
			status: "in_progress",
			createdAt: new Date().toISOString(),
			items,
		}
		saveActiveToStorage()
		showSuccess("تم بدء الجرد")
	} catch (error) {
		log.error("Failed to start stock take", error)
		showError(error.message || "فشل بدء الجرد")
	} finally {
		starting.value = false
	}
}

function loadSession(sessionId) {
	const session = recentSessions.value.find((s) => s.id === sessionId)
	if (!session) return
	activeSession.value = JSON.parse(JSON.stringify(session))
	activeSession.value.status = activeSession.value.status || "in_progress"
}

function updateVariance(row) {
	const counted = row.counted_qty
	if (counted == null || counted === "") {
		row.variance = 0
		row.status = "pending"
		return
	}
	row.variance = Number(counted) - Number(row.system_qty)
	row.status = row.variance === 0 ? "counted" : "variance"
	saveActiveToStorage()
}

async function applyVariances() {
	if (!activeSession.value) return
	const withVariance = (activeSession.value.items || []).filter(
		(i) => i.counted_qty != null && i.variance !== 0,
	)
	if (!withVariance.length) {
		showError("لا توجد فروقات لتطبيقها")
		return
	}

	applying.value = true
	let applied = 0
	const failures = []
	for (const item of withVariance) {
		try {
			await apiPost("/stock/adjust", {
				productId: item.id,
				warehouseId: activeSession.value.warehouseId,
				qty: item.variance,
				reason: `جرد: ${activeSession.value.name}`,
			})
			applied++
		} catch (error) {
			failures.push(item.code)
			log.error("Failed to apply variance", error)
		}
	}

	activeSession.value.status = "completed"
	activeSession.value.completedAt = new Date().toISOString()
	saveActiveToStorage()

	if (failures.length) {
		showError(
			`تم تطبيق ${applied} وفشل ${failures.length}: ${failures.slice(0, 5).join(", ")}`,
		)
	} else {
		showSuccess(`تم تطبيق ${applied} فرق بنجاح`)
		emit("saved", activeSession.value)
		activeSession.value = null
	}
	applying.value = false
}

function cancelSession() {
	activeSession.value = null
}

function exportSession() {
	if (!activeSession.value) return
	const headers = [
		"code",
		"name",
		"category",
		"system_qty",
		"counted_qty",
		"variance",
		"status",
	]
	const lines = [headers.join(",")]
	for (const r of activeSession.value.items || []) {
		lines.push(
			[
				r.code,
				`"${String(r.name).replace(/"/g, '""')}"`,
				r.category,
				r.system_qty,
				r.counted_qty ?? "",
				r.variance,
				r.status,
			].join(","),
		)
	}
	const blob = new Blob([`\uFEFF${lines.join("\n")}`], {
		type: "text/csv;charset=utf-8",
	})
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = `stock_take_${activeSession.value.id}.csv`
	a.click()
	URL.revokeObjectURL(url)
	showSuccess("تم تصدير الجرد")
}

function getStatusTheme(status) {
	if (status === "completed") return "green"
	if (status === "cancelled") return "red"
	return "blue"
}

function statusLabel(status) {
	if (status === "completed") return "مكتمل"
	if (status === "cancelled") return "ملغي"
	return "قيد التنفيذ"
}

function getCountStatusTheme(status) {
	if (status === "counted") return "green"
	if (status === "variance") return "amber"
	return "gray"
}

function countStatusLabel(status) {
	if (status === "counted") return "تم الجرد"
	if (status === "variance") return "به فرق"
	return "لم يُجرد"
}

function varianceClass(variance) {
	if (!variance) return "text-gray-600"
	return variance > 0
		? "text-green-600 font-medium"
		: "text-red-600 font-medium"
}

watch(show, (val) => {
	if (val) {
		loadStoredSessions()
		if (!newSession.value.warehouseId) {
			newSession.value.warehouseId = props.warehouses[0]?.id || "W-01"
		}
	}
})
</script>
