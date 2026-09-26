<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]" @click.self="handleClose">
      <div class="fixed inset-0 flex items-center justify-center p-4">
        <div class="w-full max-w-4xl bg-white shadow-xl rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <div class="flex items-center gap-2">
              <FeatherIcon name="clock" class="w-5 h-5 text-indigo-600" />
              <h2 class="text-lg font-semibold text-gray-900">{{ __("Stock Movement History") }}</h2>
            </div>
            <Button variant="ghost" size="sm" @click="handleClose" icon="x" />
          </div>

          <div class="flex-1 overflow-y-auto p-4">
            <div v-if="selectedProduct" class="mb-4 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div v-if="selectedProduct.image" class="w-10 h-10 rounded overflow-hidden bg-white">
                  <img :src="selectedProduct.image" alt="" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                  <FeatherIcon name="package" class="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-900">{{ selectedProduct.name }}</p>
                  <p class="text-xs text-gray-500">{{ selectedProduct.code }}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" @click="clearProduct">{{ __("تغيير المنتج") }}</Button>
            </div>

            <div v-if="!selectedProduct" class="text-center py-12">
              <FeatherIcon name="search" class="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 class="text-lg font-medium text-gray-900 mb-2">{{ __("اختر منتجاً") }}</h3>
              <p class="text-gray-500 mb-6">{{ __("ابحث عن منتج لعرض سجل حركات المخزون") }}</p>
              <div class="max-w-md mx-auto">
                <FormControl
                  type="text"
                  v-model="productSearch"
                  :placeholder="__('ابحث بالاسم أو الرمز أو الباركود...')"
                  @keydown.enter="searchProducts"
                  @input="searchProducts"
                >
                  <template #prefix>
                    <FeatherIcon name="search" class="w-4 h-4 text-gray-500" />
                  </template>
                </FormControl>
              </div>

              <div v-if="productSearchResults.length" class="max-w-md mx-auto mt-4 text-left max-h-64 overflow-auto border rounded bg-white">
                <div v-for="p in productSearchResults" :key="p.id"
                  @click="selectProduct(p)"
                  class="p-3 border-b hover:bg-gray-50 cursor-pointer flex items-center gap-3">
                  <div v-if="p.image" class="w-10 h-10 rounded overflow-hidden bg-white">
                    <img :src="p.image" alt="" class="w-full h-full object-cover" />
                  </div>
                  <div v-else class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                    <FeatherIcon name="package" class="w-5 h-5 text-gray-400" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 truncate">{{ p.name_ar || p.name }}</p>
                    <p class="text-xs text-gray-500">{{ p.code }}</p>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="selectedProduct" class="space-y-4">
              <div class="flex flex-wrap gap-4 mb-4">
                <div class="flex-1 min-w-[200px]">
                  <FormControl
                    type="text"
                    v-model="movementFilter.search"
                    :placeholder="__('تصفية الحركات...')"
                  >
                    <template #prefix>
                      <FeatherIcon name="filter" class="w-4 h-4 text-gray-500" />
                    </template>
                  </FormControl>
                </div>
                <SelectInput
                  v-model="movementFilter.type"
                  :options="movementTypeOptions"
                  :placeholder="__('كل الأنواع')"
                  class="w-40"
                />
                <SelectInput
                  v-model="movementFilter.warehouse"
                  :options="warehouseOptions"
                  :placeholder="__('كل المستودعات')"
                  class="w-40"
                />
              </div>

              <div v-if="loading" class="flex justify-center py-8">
                <LoadingIndicator class="w-8 h-8" />
              </div>

              <div v-else-if="!movements.length" class="text-center py-12">
                <FeatherIcon name="inbox" class="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p class="text-gray-500">{{ __("لا توجد حركات مخزون لهذا المنتج") }}</p>
              </div>

              <template v-else>
                <div class="overflow-x-auto">
                  <ReportTable
                    :columns="movementColumns"
                    :rows="movements"
                    :sortable="true"
                    @page-change="currentPage = $event"
                  >
                    <template #col-qty="{ row }">
                      <span :class="row.qty > 0 ? 'text-green-600' : 'text-red-600'">
                        {{ row.qty > 0 ? "+" : "" }}{{ row.qty }}
                      </span>
                    </template>
                    <template #col-balance_qty="{ row }">
                      <span class="font-medium">{{ row.balance_qty }}</span>
                    </template>
                    <template #col-value="{ row }">
                      <span>{{ formatCurrency(row.value) }}</span>
                    </template>
                    <template #col-reference="{ row }">
                      <span class="text-sm text-gray-600 truncate block max-w-[150px]">
                        {{ row.reference_type }}: {{ row.reference_id }}
                      </span>
                    </template>
                    <template #col-user="{ row }">
                      <span class="text-sm text-gray-600">{{ row.user_name || "-" }}</span>
                    </template>
                  </ReportTable>
                </div>

                <Pagination
                  v-if="totalPages > 1"
                  :current-page="currentPage"
                  :total-pages="totalPages"
                  @page-change="currentPage = $event"
                />
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import {
	Badge,
	Button,
	FormControl,
	FeatherIcon,
	LoadingIndicator,
} from "frappe-ui"
import SelectInput from "@/components/common/SelectInput.vue"
import ReportTable from "@/components/reports/ui/tables/ReportTable.vue"
import Pagination from "@/components/ui/Pagination.vue"
import { useToast } from "@/composables/useToast"
import { apiGet } from "@/utils/restApi"
import { logger } from "@/utils/logger"
import { formatCurrency as formatCurrencyUtil } from "@/utils/currency"

const log = logger.create("StockHistoryDialog")

const props = defineProps({
	modelValue: Boolean,
	product: { type: Object, default: null },
	warehouses: { type: Array, default: () => [] },
})

const emit = defineEmits(["update:modelValue", "product-selected"])

const { showSuccess, showError } = useToast()

const show = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})

const selectedProduct = ref(props.product)
const productSearch = ref("")
const productSearchResults = ref([])

const loading = ref(false)
const movements = ref([])
const currentPage = ref(1)
const pageSize = 50
const totalItems = ref(0)
const totalPages = ref(0)

const movementFilter = ref({
	search: "",
	type: "",
	warehouse: "",
	from: "",
	to: "",
})

const movementTypeOptions = [
	{ value: "", label: "كل الأنواع" },
	{ value: "ADJUST", label: "تسوية" },
	{ value: "TRANSFER", label: "تحويل" },
	{ value: "RESERVE", label: "حجز" },
	{ value: "RELEASE", label: "إفراج" },
	{ value: "SALE", label: "بيع" },
	{ value: "PURCHASE", label: "شراء" },
]

const movementColumns = [
	{ key: "date", label: "التاريخ", sortable: true, format: "datetime" },
	{ key: "type", label: "النوع", sortable: true },
	{ key: "warehouse", label: "المستودع", sortable: true },
	{ key: "qty", label: "الكمية", sortable: true, format: "number" },
	{ key: "balance_qty", label: "الرصيد", sortable: true, format: "number" },
	{ key: "value", label: "القيمة", sortable: true, format: "currency" },
	{ key: "reference", label: "المرجع", sortable: true },
	{ key: "user", label: "المستخدم", sortable: true },
]

const productSearchDebounce = ref(null)

function formatCurrency(amount) {
	return formatCurrencyUtil(Number.parseFloat(amount || 0))
}

function formatDateTime(iso) {
	if (!iso) return "-"
	return new Date(iso).toLocaleString("ar-SA")
}

function clearProduct() {
	selectedProduct.value = null
	movements.value = []
	productSearch.value = ""
}

function selectProduct(product) {
	selectedProduct.value = product
	productSearch.value = ""
	productSearchResults.value = []
	currentPage.value = 1
	loadMovements()
}

async function searchProducts() {
	if (!productSearch.value.trim()) {
		productSearchResults.value = []
		return
	}

	clearTimeout(productSearchDebounce.value)
	productSearchDebounce.value = setTimeout(async () => {
		try {
			const data = await apiGet("/products", {
				q: productSearch.value,
				limit: 20,
				warehouse: "W-01",
			})
			productSearchResults.value = data?.products || []
		} catch (error) {
			log.error("Product search failed", error)
		}
	}, 300)
}

async function loadMovements() {
	if (!selectedProduct.value) return

	loading.value = true
	try {
		const productId = String(selectedProduct.value.id)
		const data = await apiGet("/admin/trail", {
			entity: "STOCK",
			limit: 200,
			offset: 0,
		})
		const all = data?.trail || []
		const mapped = all
			.filter((row) => {
				const eid = String(row.entity_id || "")
				return eid === productId || eid.startsWith(`${productId}@`)
			})
			.map((row) => {
				let after = row.after_json ?? row.after
				if (typeof after === "string") {
					try {
						after = JSON.parse(after)
					} catch {
						after = {}
					}
				}
				after = after || {}
				return {
					id: row.id,
					date: row.created_at || row.createdAt || row.timestamp,
					type: row.action || row.type || "-",
					warehouse: String(row.entity_id || "").split("@")[1] || "W-01",
					qty: Number(after.adjustment ?? after.qty ?? 0),
					balance_qty: Number(after.newQty ?? after.toQty ?? 0),
					value: 0,
					reference: row.action || "-",
					reference_type: "STOCK",
					reference_id: row.entity_id || productId,
					user: row.username || row.user || "-",
					user_name: row.username || row.user || "-",
				}
			})
			.filter(
				(row) =>
					!movementFilter.value.type || row.type === movementFilter.value.type,
			)

		totalItems.value = mapped.length
		totalPages.value = Math.max(1, Math.ceil(totalItems.value / pageSize))
		const start = (currentPage.value - 1) * pageSize
		movements.value = mapped.slice(start, start + pageSize)
	} catch (error) {
		log.error("Failed to load movements", error)
		movements.value = []
		totalItems.value = 0
		totalPages.value = 1
		if (!String(error.message || "").includes("غير مصرح")) {
			showError(error.message || "فشل تحميل سجل الحركات")
		}
	} finally {
		loading.value = false
	}
}

watch(
	() => props.product,
	(newProduct) => {
		if (newProduct) {
			selectedProduct.value = newProduct
			currentPage.value = 1
			loadMovements()
		}
	},
)

watch(movementFilter, () => {
	currentPage.value = 1
	loadMovements()
})
</script>