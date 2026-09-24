<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]" @click.self="handleClose">
      <div class="fixed inset-0 flex items-center justify-center p-4">
        <div class="w-full max-w-2xl bg-white shadow-xl rounded-xl overflow-hidden flex flex-col">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <div class="flex items-center gap-2">
              <FeatherIcon name="file-text" class="w-5 h-5 text-indigo-600" />
              <h2 class="text-lg font-semibold text-gray-900">{{ __("استيراد وتصدير المخزون") }}</h2>
            </div>
            <Button variant="ghost" size="sm" @click="handleClose" icon="x" />
          </div>

          <div class="flex-1 overflow-y-auto p-4">
            <div class="mb-6">
              <div class="flex gap-2 mb-4 border-b">
                <button
                  v-for="tab in tabs"
                  :key="tab.value"
                  @click="activeTab = tab.value"
                  :class="[
                    'flex-1 py-2 px-4 text-sm font-medium rounded-t-lg transition-colors',
                    activeTab === tab.value
                      ? 'border-b-2 border-indigo-600 text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  ]"
                >
                  {{ tab.label }}
                </button>
              </div>

              <div v-if="activeTab === 'import'" class="space-y-4">
                <div class="p-4 bg-blue-50 rounded-lg">
                  <h4 class="font-medium text-gray-900 mb-2">{{ __("استيراد بيانات المخزون") }}</h4>
                  <p class="text-sm text-gray-600 mb-3">{{ __("ارفع ملف CSV أو JSON بالأعمدة: product_code، warehouse_id، qty") }}</p>
                  <div class="flex items-center gap-2">
                    <Button variant="outline" @click="downloadImportTemplate">
                      <template #prefix>
                        <FeatherIcon name="download" class="w-4 h-4" />
                      </template>
                      {{ __("تنزيل القالب") }}
                    </Button>
                    <Button variant="solid" @click="fileInput.click()">
                      <template #prefix>
                        <FeatherIcon name="upload" class="w-4 h-4" />
                      </template>
                      {{ __("اختيار ملف") }}
                    </Button>
                    <input ref="fileInput" type="file" accept=".csv,.json" class="hidden" @change="handleFileSelect" />
                  </div>
                </div>

                <div v-if="previewData" class="space-y-3">
                  <div class="flex items-center justify-between">
                    <h5 class="font-medium">{{ __("معاينة") }} ({{ previewData.length }} {{ __("صف") }})</h5>
                    <Button size="sm" variant="danger" @click="clearPreview">{{ __("مسح") }}</Button>
                  </div>
                  <div class="max-h-64 overflow-auto border rounded">
                    <table class="w-full text-sm">
                      <thead class="bg-gray-50 sticky top-0">
                        <tr>
                          <th class="p-2 text-right">{{ __("كود الصنف") }}</th>
                          <th class="p-2 text-right">{{ __("المستودع") }}</th>
                          <th class="p-2 text-right">{{ __("الكمية") }}</th>
                          <th class="p-2 text-center">{{ __("الحالة") }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, i) in previewData.slice(0, 20)" :key="i" :class="row.valid ? '' : 'bg-red-50'">
                          <td class="p-2">{{ row.product_code }}</td>
                          <td class="p-2">{{ row.warehouse_id || "W-01" }}</td>
                          <td class="p-2 text-right">{{ row.qty }}</td>
                          <td class="p-2 text-center">
                            <Badge :theme="row.valid ? 'green' : 'red'" size="xs">
                              {{ row.valid ? __("صالح") : row.error }}
                            </Badge>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p v-if="previewData.length > 20" class="text-xs text-gray-500 text-center py-2">
                      ... و {{ previewData.length - 20 }} {{ __("أخرى") }}
                    </p>
                  </div>
                  <div class="flex justify-end gap-2 pt-2">
                    <Button variant="outline" @click="dryRunImport" :loading="importing">
                      {{ __("معاينة فقط") }}
                    </Button>
                    <Button variant="solid" @click="executeImport" :loading="importing" :disabled="!hasValidRows">
                      {{ __("استيراد") }}
                    </Button>
                  </div>
                </div>
              </div>

              <div v-if="activeTab === 'export'" class="space-y-4">
                <div class="p-4 bg-green-50 rounded-lg">
                  <h4 class="font-medium text-gray-900 mb-2">{{ __("تصدير بيانات المخزون") }}</h4>
                  <p class="text-sm text-gray-600 mb-4">{{ __("تنزيل مستويات المخزون الحالية بصيغة CSV أو JSON") }}</p>

                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("الصيغة") }}</label>
                      <div class="flex gap-2">
                        <label class="flex items-center gap-2 cursor-pointer p-3 border rounded-lg" :class="{ 'border-indigo-500 bg-indigo-50': exportFormat === 'csv' }">
                          <input type="radio" v-model="exportFormat" value="csv" class="text-indigo-600" />
                          <span class="text-sm">CSV</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer p-3 border rounded-lg" :class="{ 'border-indigo-500 bg-indigo-50': exportFormat === 'json' }">
                          <input type="radio" v-model="exportFormat" value="json" class="text-indigo-600" />
                          <span class="text-sm">JSON</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("الأعمدة") }}</label>
                      <div class="flex flex-wrap gap-2">
                        <label v-for="col in availableColumns" :key="col" class="flex items-center gap-1 cursor-pointer text-sm">
                          <input type="checkbox" :value="col" v-model="exportColumns" class="text-indigo-600" />
                          {{ col }}
                        </label>
                      </div>
                    </div>

                    <Button variant="solid" @click="executeExport" :loading="exporting" class="w-full">
                      <template #prefix>
                        <FeatherIcon name="download" class="w-4 h-4" />
                      </template>
                      {{ __("تصدير") }}
                    </Button>
                  </div>
                </div>
              </div>

              <div v-if="activeTab === 'history'" class="space-y-4">
                <h4 class="font-medium text-gray-900">{{ __("سجل التصدير الأخير") }}</h4>
                <div v-if="historyLoading" class="flex justify-center py-8">
                  <LoadingIndicator class="w-6 h-6" />
                </div>
                <div v-else class="overflow-auto max-h-96 border rounded">
                  <table class="w-full text-sm">
                    <thead class="bg-gray-50 sticky top-0">
                      <tr>
                        <th class="p-2 text-right">{{ __("التاريخ") }}</th>
                        <th class="p-2 text-right">{{ __("النوع") }}</th>
                        <th class="p-2 text-right">{{ __("الكيان") }}</th>
                        <th class="p-2 text-right">{{ __("الصفوف") }}</th>
                        <th class="p-2 text-right">{{ __("الحالة") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="h in importExportHistory" :key="h.id">
                        <td class="p-2">{{ formatDateTime(h.created_at) }}</td>
                        <td class="p-2">
                          <Badge :theme="h.kind === 'import' ? 'blue' : 'green'">
                            {{ h.kind === "import" ? __("استيراد") : __("تصدير") }}
                          </Badge>
                        </td>
                        <td class="p-2">{{ h.entity }}</td>
                        <td class="p-2 text-right">{{ h.count }}</td>
                        <td class="p-2">
                          <Badge :theme="h.status === 'DONE' ? 'green' : h.status === 'FAILED' ? 'red' : 'yellow'">
                            {{ h.status }}
                          </Badge>
                        </td>
                      </tr>
                      <tr v-if="!importExportHistory.length">
                        <td colspan="5" class="p-4 text-center text-gray-500">{{ __("لا يوجد سجل") }}</td>
                      </tr>
                    </tbody>
                  </table>
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
import { ref, computed, watch, onMounted } from "vue"
import { Badge, Button, FeatherIcon, LoadingIndicator } from "frappe-ui"
import { useToast } from "@/composables/useToast"
import { apiGet, apiPost, apiPostRaw, apiDownload } from "@/utils/restApi"
import { logger } from "@/utils/logger"

const log = logger.create("StockImportExportDialog")

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

const activeTab = ref("import")
const fileInput = ref(null)

const tabs = [
	{ value: "import", label: "استيراد" },
	{ value: "export", label: "تصدير" },
	{ value: "history", label: "السجل" },
]

const previewData = ref(null)
const selectedFile = ref(null)
const importing = ref(false)

const exportFormat = ref("csv")
const exportColumns = ref([
	"product_id",
	"warehouse_id",
	"qty",
	"reserved_qty",
	"allocated_qty",
	"updated_at",
])
const availableColumns = [
	"product_id",
	"warehouse_id",
	"qty",
	"reserved_qty",
	"allocated_qty",
	"updated_at",
]
const exporting = ref(false)

const hasValidRows = computed(
	() => previewData.value?.some((r) => r.valid) ?? false,
)

const importExportHistory = ref([])
const historyLoading = ref(false)

async function downloadImportTemplate() {
	const headers = ["product_code", "warehouse_id", "qty", "reason"]
	const csv = [
		headers.join(","),
		"PROD-001,W-01,10,Restock",
		"PROD-002,W-01,-5,Damage",
	].join("\n")
	downloadBlob(csv, "text/csv", "stock_import_template.csv")
}

function handleFileSelect(event) {
	const file = event.target.files?.[0]
	if (!file) return

	selectedFile.value = file
	previewData.value = null

	if (file.type === "application/json" || file.name.endsWith(".json")) {
		file.text().then((text) => {
			try {
				const data = JSON.parse(text)
				previewData.value = validateRows(Array.isArray(data) ? data : [data])
			} catch (e) {
				showError("Invalid JSON file")
			}
		})
	} else {
		file
			.text()
			.then((text) => {
				previewData.value = validateRows(parseCsv(text))
			})
			.catch((err) => {
				showError(`فشل تحليل CSV: ${err.message}`)
			})
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
		const reason = String(row.reason || "").trim()

		if (!product_code) errors.push("product_code required")
		if (!Number.isFinite(qty)) errors.push("qty must be a number")

		return {
			index: i,
			product_code,
			warehouse_id: warehouse_id || "W-01",
			qty,
			reason: reason || "Import",
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
		loadHistory()
	} catch (error) {
		log.error("Import failed", error)
		showError(error.message || "فشل الاستيراد")
	} finally {
		importing.value = false
	}
}

async function executeExport() {
	const fields = exportColumns.value.length
		? exportColumns.value.join(",")
		: undefined
	exporting.value = true
	try {
		const res = await apiDownload("/export/stock", {
			format: exportFormat.value,
			limit: 10000,
			...(fields ? { fields } : {}),
		})
		const text = await res.text()
		const ext = exportFormat.value === "json" ? "json" : "csv"
		const mime = exportFormat.value === "json" ? "application/json" : "text/csv"
		downloadBlob(text, mime, `stock_export_${Date.now()}.${ext}`)
		showSuccess("تم تصدير المخزون بنجاح")
		loadHistory()
	} catch (error) {
		log.error("Export failed", error)
		showError(error.message || "فشل التصدير")
	} finally {
		exporting.value = false
	}
}

async function loadHistory() {
	historyLoading.value = true
	try {
		const jobs = await apiGet("/export/jobs", {
			kind: "export",
			entity: "stock",
		})
		importExportHistory.value = (
			Array.isArray(jobs) ? jobs : jobs?.jobs || []
		).map((j) => ({
			id: j.id,
			created_at: j.created_at || j.createdAt,
			kind: "export",
			entity: j.entity || "stock",
			count: j.count ?? j.rows ?? 0,
			status: j.status || "PENDING",
			user: j.user || j.created_by || "-",
		}))
	} catch (error) {
		log.error("Failed to load history", error)
	} finally {
		historyLoading.value = false
	}
}

function formatDateTime(iso) {
	if (!iso) return "-"
	return new Date(iso).toLocaleString("ar-SA")
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

function handleClose() {
	show.value = false
}
</script>