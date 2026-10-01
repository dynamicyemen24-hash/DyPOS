<template>
  <Transition name="fade">
    <div
      v-if="show"
      class="fixed inset-0 bg-black bg-opacity-50 z-[300]"
      @click.self="handleClose"
    >
      <!-- The import button only ever calls fileInput.click(); without this
           element the whole import flow silently did nothing. -->
      <input
        ref="fileInput"
        type="file"
        accept=".csv,.json,text/csv,application/json"
        class="sr-only"
        data-testid="stock-import-file"
        @change="handleFileSelect"
      />
      <div class="fixed inset-0 flex items-center justify-center p-4">
        <div class="w-full max-w-4xl h-[90vh] max-h-[90vh] bg-white shadow-xl rounded-xl overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between border-b px-4 py-3 bg-gray-50">
            <div class="flex items-center gap-2">
              <FeatherIcon name="clipboard-list" class="w-5 h-5 text-indigo-600" />
              <h2 class="text-lg font-semibold text-gray-900">{{ __("الجرد الفعلي للمخزون") }}</h2>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-500">
                {{ __("العملة") }}: {{ selectedCurrency }}
              </span>
              <span class="text-sm text-gray-500">
                {{ __("وحدة القياس") }}: {{ selectedUom }}
              </span>
              <Button variant="ghost" size="sm" @click="handleClose" icon="x" />
            </div>
          </div>

          <!-- Two-page Navigation -->
          <div class="border-b px-4">
            <nav class="flex gap-1" role="tablist" aria-label="صفحات الجرد">
              <button
                v-for="page in pages"
                :key="page.value"
                @click="activePage = page.value"
                :class="[
                  'flex-1 py-3 px-4 text-sm font-medium rounded-t-lg transition-colors border-b-2',
                  activePage === page.value
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                    : 'text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-300'
                ]"
                role="tab"
                :aria-selected="activePage === page.value"
                :aria-controls="`panel-${page.value}`"
                :tabindex="activePage === page.value ? 0 : -1"
              >
                <FeatherIcon :name="page.icon" class="w-4 h-4 inline-block ml-1" />
                {{ page.label }}
              </button>
            </nav>
          </div>

          <!-- Page Content -->
          <div class="relative flex-1 overflow-hidden">
            <Transition name="fade" mode="out-in">
              <div
                v-if="activePage === 'instructions'"
                id="panel-instructions"
                role="tabpanel"
                aria-labelledby="tab-instructions"
                class="h-full overflow-y-auto p-4"
              >
                <InstructionsPage
                  :warehouses="warehouses"
                  :currencies="currencies"
                  :uoms="uoms"
                  :selected-currency="selectedCurrency"
                  :selected-uom="selectedUom"
                  @currency-change="selectedCurrency = $event"
                  @uom-change="selectedUom = $event"
                />
              </div>

              <div
                v-else
                id="panel-items"
                role="tabpanel"
                aria-labelledby="tab-items"
                class="h-full overflow-hidden"
              >
                <ItemsTablePage
                  :warehouses="warehouses"
                  :categories="categories"
                  :currencies="currencies"
                  :uoms="uoms"
                  :selected-currency="selectedCurrency"
                  :selected-uom="selectedUom"
                  @currency-change="selectedCurrency = $event"
                  @uom-change="selectedUom = $event"
                  @export="executeExport"
                  @import="handleImportClick"
                />
              </div>
            </Transition>

            <!-- Import preview: handleFileSelect fills previewData, but
                 nothing rendered it before — the import button had no UI. -->
            <div
              v-if="previewData"
              class="absolute inset-x-0 bottom-0 max-h-[60%] flex flex-col border-t-2 border-indigo-500 bg-white shadow-2xl"
              data-testid="stock-import-preview"
            >
              <div
                class="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 bg-indigo-50"
              >
                <div class="flex items-center gap-2 text-sm">
                  <FeatherIcon name="file-text" class="w-4 h-4 text-indigo-600" />
                  <span class="font-medium text-gray-900">
                    {{ selectedFile ? selectedFile.name : __("معاينة الاستيراد") }}
                  </span>
                  <Badge theme="green">{{ validCount }} {{ __("صالح") }}</Badge>
                  <Badge v-if="invalidCount" theme="red"
                  >{{ invalidCount }} {{ __("خطأ") }}</Badge>
                </div>
                <div class="flex items-center gap-2">
                  <Button variant="ghost" size="sm" @click="clearPreview">
                    {{ __("إلغاء") }}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    :loading="importing"
                    :disabled="!validCount"
                    @click="dryRunImport"
                  >
                    {{ __("معاينة") }}
                  </Button>
                  <Button
                    variant="solid"
                    size="sm"
                    :loading="importing"
                    :disabled="!validCount"
                    @click="executeImport"
                  >
                    {{ __("تنفيذ الاستيراد") }}
                  </Button>
                </div>
              </div>

              <div class="flex-1 overflow-auto">
                <table class="w-full text-xs">
                  <thead
                    class="sticky top-0 bg-gray-50 text-right text-gray-500"
                  >
                    <tr>
                      <th class="px-3 py-2 font-medium">#</th>
                      <th class="px-3 py-2 font-medium">{{ __("الصنف") }}</th>
                      <th class="px-3 py-2 font-medium">{{ __("المستودع") }}</th>
                      <th class="px-3 py-2 font-medium">{{ __("الكمية") }}</th>
                      <th class="px-3 py-2 font-medium">{{ __("الوحدة") }}</th>
                      <th class="px-3 py-2 font-medium">{{ __("التكلفة") }}</th>
                      <th class="px-3 py-2 font-medium">{{ __("الحالة") }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in previewData"
                      :key="row.index"
                      class="border-t"
                      :class="row.valid ? '' : 'bg-red-50'"
                    >
                      <td class="px-3 py-1.5 text-gray-400">{{ row.index + 1 }}</td>
                      <td class="px-3 py-1.5 font-mono">{{ row.product_code }}</td>
                      <td class="px-3 py-1.5 font-mono">{{ row.warehouse_id }}</td>
                      <td class="px-3 py-1.5">{{ qtyText(row.qty, row.uom) }}</td>
                      <td class="px-3 py-1.5">{{ row.uom }}</td>
                      <td class="px-3 py-1.5">
                        {{ moneyText(row.unit_cost, row.currency) }}
                      </td>
                      <td class="px-3 py-1.5">
                        <Badge v-if="row.valid" theme="green">{{ __("صالح") }}</Badge>
                        <span v-else class="text-red-600">{{ row.error }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed } from "vue"
import { Badge, Button, FeatherIcon } from "dypos-ui"
import { useToast } from "@/composables/useToast"
import { apiPost, apiPostRaw, apiDownload } from "@/utils/restApi"
import { logger } from "@/utils/logger"
import { formatMoney, formatQty, downloadBlob } from "@/utils/uom"

import InstructionsPage from "./StockCountInstructionsPage.vue"
import ItemsTablePage from "./StockCountItemsTablePage.vue"
import { getCurrencySymbol } from "@/utils/currency"
import { usePOSSettingsStore } from "@/stores/posSettings"

const log = logger.create("StockCountDialog")

const props = defineProps({
	modelValue: Boolean,
	warehouses: { type: Array, default: () => [] },
	categories: { type: Array, default: () => [] },
})

const emit = defineEmits(["update:modelValue"])

const { showSuccess, showError } = useToast()

const show = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})

// Active page: 'instructions' | 'items'
const activePage = ref("instructions")

const pages = [
	{
		value: "instructions",
		label: "تعليمات الجرد",
		icon: "book-open",
	},
	{ value: "items", label: "جدول الأصناف", icon: "clipboard-list" },
]

// Multi-currency & UoM support.
// The base currency is the CONFIGURED one (posSettings), not a hardcoded SAR:
// a shop configured for EGP must not import against a SAR base row.
const configuredCurrency = usePOSSettingsStore().currency || "SAR"
const currencies = ref([
	{
		code: configuredCurrency,
		symbol: getCurrencySymbol(),
		name: "عملة المنشأة",
		rate: 1,
		isBase: true,
	},
	{ code: "SAR", symbol: "ر.س", name: "ريال سعودي", rate: 1 },
	{ code: "USD", symbol: "$", name: "دولار أمريكي", rate: 3.75 },
	{ code: "EUR", symbol: "€", name: "يورو", rate: 4.05 },
	{ code: "EGP", symbol: "ج.م", name: "جنيه مصري", rate: 0.077 },
])

const uoms = ref([
	{
		code: "PCS",
		name: "قطعة",
		nameAr: "قطعة",
		factor: 1,
		isBase: true,
		type: "count",
	},
	{
		code: "BOX",
		name: "صندوق",
		nameAr: "صندوق",
		factor: 12,
		type: "count",
	},
	{
		header: "CTN",
		name: "كرتون",
		nameAr: "كرتون",
		factor: 24,
		type: "count",
	},
	{
		code: "KG",
		name: "كيلوغرام",
		nameAr: "كجم",
		factor: 1,
		type: "weight",
	},
	{
		code: "G",
		name: "جرام",
		nameAr: "جم",
		factor: 0.001,
		type: "weight",
	},
	{ code: "M", name: "متر", nameAr: "متر", factor: 1, type: "length" },
	{
		code: "CM",
		name: "سنتيمتر",
		nameAr: "سم",
		factor: 0.01,
		type: "length",
	},
	{ code: "L", name: "لتر", nameAr: "لتر", factor: 1, type: "volume" },
	{
		code: "ML",
		name: "مليلتر",
		nameAr: "مل",
		factor: 0.001,
		type: "volume",
	},
	{
		code: "M2",
		name: "متر مربع",
		nameAr: "م²",
		factor: 1,
		type: "area",
	},
	{
		code: "M3",
		name: "متر مكعب",
		nameAr: "م³",
		factor: 1,
		type: "volume",
	},
])

const selectedCurrency = ref(configuredCurrency)
const selectedUom = ref("PCS")

// Computed for currency/UoM display
const selectedCurrencyObj = computed(
	() =>
		currencies.value.find((c) => c.code === selectedCurrency.value) ||
		currencies.value[0],
)
const selectedUomObj = computed(
	() => uoms.value.find((u) => u.code === selectedUom.value) || uoms.value[0],
)

// Import flow: the dialog owns the hidden <input type="file">, the parsed
// rows (`previewData`) and the commit buttons rendered in the preview panel.
const fileInput = ref(null)
const previewData = ref(null)
const importing = ref(false)
const exporting = ref(false)
const selectedFile = ref(null)
const validCount = computed(
	() => (previewData.value || []).filter((r) => r.valid).length,
)
const invalidCount = computed(
	() => (previewData.value || []).filter((r) => !r.valid).length,
)

/**
 * `formatQty`/`formatMoney` from `@/utils/uom` take the lookup tables as a
 * THIRD argument and throw without them; binding them straight into the
 * template (arity 1/2) is a crash on every previewed row. These wrappers supply
 * the dialog's own UoM/currency lists.
 */
function qtyText(qty, uomCode) {
	return formatQty(qty, uomCode, uoms.value)
}

function moneyText(amount, currencyCode) {
	return formatMoney(amount, currencyCode, currencies.value)
}

// Export options
const exportFormat = ref("csv")

const availableColumns = [
	"product_id",
	"product_code",
	"product_name",
	"product_name_ar",
	"warehouse_id",
	"warehouse_name",
	"qty",
	"reserved_qty",
	"available_qty",
	"allocated_qty",
	"uom",
	"currency",
	"unit_cost",
	"unit_price",
	"stock_value",
	"reorder_point",
	"updated_at",
]

const exportColumnsModel = ref([...availableColumns])

function handleClose() {
	show.value = false
}

// File handling
/**
 * `Blob.text()` is not implemented everywhere (older WebViews, jsdom), and a
 * POS reader may be handed a file from a USB stick by a very old browser.
 * FileReader is the universal fallback rather than an unhandled rejection.
 */
function readFileText(file) {
	if (typeof file.text === "function") return file.text()
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result ?? ""))
		reader.onerror = () => reject(reader.error || new Error("read failed"))
		reader.readAsText(file)
	})
}

async function handleFileSelect(event) {
	const file = event.target.files?.[0]
	if (!file) return

	selectedFile.value = file
	previewData.value = null

	const isJson =
		file.type === "application/json" || /\.json$/i.test(file.name || "")
	try {
		const text = await readFileText(file)
		if (isJson) {
			const data = JSON.parse(text)
			previewData.value = validateRows(Array.isArray(data) ? data : [data])
		} else {
			previewData.value = validateRows(parseCsv(text))
		}
	} catch (err) {
		showError(
			isJson ? "ملف JSON غير صالح" : `فشل تحليل CSV: ${err.message || err}`,
		)
	}
}

function parseCsv(text) {
	const rows = []
	const lines = String(text).replace(/^﻿/, "").split(/\r?\n/)
	if (!lines.length) return rows
	const headers = splitCsvLine(lines[0]).map((h) => h.trim())
	for (let i = 1; i < lines.length; i++) {
		if (!lines[i].trim()) continue
		const cells = splitCsvLine(lines[i])
		const row = {}
		headers.forEach((h, idx) => {
			row[h] = cells[idx] ?? ""
		})
		rows.push(row)
	}
	return rows
}

function splitCsvLine(line) {
	const out = []
	let cur = ""
	let inQuotes = false
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (inQuotes) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					cur += '"'
					i++
				} else {
					inQuotes = false
				}
			} else {
				cur += ch
			}
		} else if (ch === '"') {
			inQuotes = true
		} else if (ch === ",") {
			out.push(cur)
			cur = ""
		} else {
			cur += ch
		}
	}
	out.push(cur)
	return out
}

function validateRows(rows) {
	return rows.map((row, i) => {
		const errors = []
		const product_code = String(
			row.product_code || row.productCode || "",
		).trim()
		const warehouse_id = String(
			row.warehouse_id || row.warehouseId || "",
		).trim()
		const qty = Number(row.qty)
		const uom = String(row.uom || "PCS")
			.trim()
			.toUpperCase()
		const currency = String(row.currency || configuredCurrency)
			.trim()
			.toUpperCase()
		const unit_cost = Number(row.unit_cost || row.unitCost || 0)
		const reason = String(row.reason || "").trim()
		const reference = String(row.reference || "").trim()
		const batch_number = String(
			row.batch_number || row.batchNumber || "",
		).trim()
		const expiry_date = String(row.expiry_date || row.expiryDate || "").trim()

		if (!product_code) errors.push("product_code required")
		if (!warehouse_id) errors.push("warehouse_id required")
		if (!Number.isFinite(qty)) errors.push("qty must be a number")
		if (!uoms.value.find((u) => u.code === uom)) errors.push("invalid uom")
		if (!currencies.value.find((c) => c.code === currency))
			errors.push("invalid currency")

		return {
			index: i,
			product_code,
			warehouse_id: warehouse_id || "W-01",
			qty,
			uom: uom || "PCS",
			currency: currency || configuredCurrency,
			unit_cost: Number.isNaN(unit_cost) ? 0 : unit_cost,
			reason: reason || "Count",
			reference: reference || "Count",
			batch_number: batch_number || "",
			expiry_date: expiry_date || "",
			valid: errors.length === 0,
			error: errors.join(", "),
		}
	})
}

function clearPreview() {
	previewData.value = null
	selectedFile.value = null
	if (fileInput.value) fileInput.value.value = ""
}

// Export
async function executeExport() {
	const fields = exportColumnsModel.value.length
		? exportColumnsModel.value.join(",")
		: undefined
	exporting.value = true
	try {
		const res = await apiDownload("/export/stock", {
			format: exportFormat.value,
			limit: 10000,
			currency: selectedCurrency.value,
			uom: selectedUom.value,
			...(fields ? { fields } : {}),
		})
		const text = await res.text()
		const ext = exportFormat.value === "json" ? "json" : "csv"
		const mime = exportFormat.value === "json" ? "application/json" : "text/csv"
		downloadBlob(
			text,
			mime,
			`stock_count_${selectedCurrency.value}_${selectedUom.value}_${Date.now()}.${ext}`,
		)
		showSuccess("تم تصدير بيانات الجرد بنجاح")
	} catch (error) {
		log.error("Export failed", error)
		showError(error.message || "فشل التصدير")
	} finally {
		exporting.value = false
	}
}

async function handleImportClick() {
	if (fileInput.value) fileInput.value.click()
}

// Import functions (kept from original)
async function dryRunImport() {
	if (!previewData.value) return
	importing.value = true
	try {
		const validRows = previewData.value.filter((r) => r.valid).map(toApiRow)
		await apiPostRaw(
			"/import/stock?dryRun=1",
			JSON.stringify(validRows),
			"application/json",
		)
		showSuccess(`معاينة ناجحة: ${validRows.length} صف صالح`)
	} catch (error) {
		log.error("Dry run failed", error)
		showError(error.message || "فشلت المعاينة")
	} finally {
		importing.value = false
	}
}

function toApiRow(row) {
	return {
		productCode: row.product_code,
		warehouseId: row.warehouse_id || "W-01",
		qty: Number(row.qty),
		uom: row.uom || "PCS",
		currency: row.currency || configuredCurrency,
		unitCost: Number(row.unit_cost || 0),
	}
}

async function executeImport() {
	if (!previewData.value) return
	importing.value = true
	try {
		const validRows = previewData.value.filter((r) => r.valid).map(toApiRow)
		const result = await apiPost("/import/stock", validRows)
		showSuccess(
			`تم الاستيراد: ${result.created ?? 0} جديد، ${result.updated ?? 0} محدث`,
		)
		previewData.value = null
		if (fileInput.value) fileInput.value.value = ""
	} catch (error) {
		log.error("Import failed", error)
		showError(error.message || "فشل الاستيراد")
	} finally {
		importing.value = false
	}
}
</script>

<style scoped>
/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Tab navigation */
button[role="tab"]:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: -2px;
}

/* Print styles */
@media print {
  .no-print {
    display: none !important;
  }
  .fade-enter-active,
  .fade-leave-active {
    transition: none !important;
  }
}

/* RTL support */
:dir(rtl) {
  .text-right {
    text-align: right;
  }
  .text-left {
    text-align: left;
  }
}
</style>