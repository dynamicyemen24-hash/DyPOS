<template>
  <Transition name="fade">
    <div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]" @click.self="handleClose">
      <div class="fixed inset-0 flex items-center justify-center p-4">
        <div class="w-full max-w-md bg-white shadow-xl rounded-xl overflow-hidden flex flex-col">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <div class="flex items-center gap-2">
              <FeatherIcon name="edit-2" class="w-5 h-5 text-indigo-600" />
              <h2 class="text-lg font-semibold text-gray-900">{{ title }}</h2>
            </div>
            <Button variant="ghost" size="sm" @click="handleClose" icon="x" />
          </div>

          <form @submit.prevent="submit" class="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("المنتج") }}</label>
              <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div v-if="product?.image" class="w-10 h-10 rounded overflow-hidden bg-white">
                  <img :src="product.image" alt="" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                  <FeatherIcon name="package" class="w-5 h-5 text-gray-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 truncate">{{ product?.name || "-" }}</p>
                  <p class="text-xs text-gray-500">{{ product?.code || "" }}</p>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("المستودع") }}</label>
                <SelectInput
                  v-model="form.warehouseId"
                  :options="warehouseOptions"
                  :placeholder="__('اختر مستودعًا')"
                  :searchable="true"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("الكمية الحالية") }}</label>
                <FormControl type="number" :model-value="currentQty" disabled />
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("نوع التسوية") }}</label>
              <div class="flex gap-2">
                <label v-for="type in adjustmentTypes" :key="type.value" class="flex-1 flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50" :class="{ 'border-indigo-500 bg-indigo-50': form.type === type.value }">
                  <input type="radio" :value="type.value" v-model="form.type" class="text-indigo-600" />
                  <span class="text-sm font-medium text-gray-700">{{ type.label }}</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("الكمية") }}</label>
              <FormControl
                type="number"
                v-model.number="form.qty"
                :placeholder="__('أدخل الكمية')"
                :min="typeMin"
                :step="1"
                required
              />
              <p v-if="validationErrors.qty" class="mt-1 text-xs text-red-600">{{ validationErrors.qty }}</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ __("السبب") }}</label>
              <FormControl
                type="text"
                v-model="form.reason"
                :placeholder="__('أدخل سبب التسوية')"
                required
              />
              <p v-if="validationErrors.reason" class="mt-1 text-xs text-red-600">{{ validationErrors.reason }}</p>
            </div>

            <div class="p-3 bg-gray-50 rounded-lg text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600">{{ __("الكمية الحالية") }}</span>
                <span class="font-medium">{{ currentQty }}</span>
              </div>
              <div class="flex justify-between mt-1">
                <span class="text-gray-600">{{ __("بعد التسوية") }}</span>
                <span :class="predictedQty < 0 ? 'text-red-600' : 'font-medium text-green-600'">{{ predictedQty }}</span>
              </div>
            </div>
          </form>

          <div class="border-t px-4 py-3 flex justify-end gap-2 bg-gray-50">
            <Button variant="ghost" @click="handleClose">{{ __("إلغاء") }}</Button>
            <Button variant="solid" @click="submit" :loading="saving">{{ __("حفظ التسوية") }}</Button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from "vue"
import { Button, FormControl, FeatherIcon } from "frappe-ui"
import SelectInput from "@/components/common/SelectInput.vue"
import { useToast } from "@/composables/useToast"
import { apiPost } from "@/utils/restApi"
import { logger } from "@/utils/logger"

const log = logger.create("StockAdjustmentDialog")

const props = defineProps({
	modelValue: Boolean,
	product: { type: Object, default: null },
	warehouses: { type: Array, default: () => [] },
})

const emit = defineEmits(["update:modelValue", "saved"])

const { showSuccess, showError } = useToast()

const show = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})

const form = ref({
	warehouseId: "",
	type: "add",
	qty: 0,
	reason: "",
})

const adjustmentTypes = [
	{ value: "add", label: "إضافة (+)" },
	{ value: "remove", label: "خصم (-)" },
	{ value: "set", label: "ضبط قيمة" },
]

const validationErrors = ref({})
const saving = ref(false)

const currentQty = computed(() => {
	if (!props.product) return 0
	if (!form.warehouseId) return Number(props.product.qty) || 0
	const stock = props.product.stock_by_warehouse?.find(
		(w) => w.warehouse_id === form.warehouseId,
	)
	if (stock) return Number(stock.qty) || 0
	return Number(props.product.qty) || 0
})

const predictedQty = computed(() => {
	const current = currentQty.value
	const qty = form.qty || 0
	switch (form.type) {
		case "add":
			return current + qty
		case "remove":
			return Math.max(0, current - qty)
		case "set":
			return qty
		default:
			return current
	}
})

const typeMin = computed(() => (form.type === "remove" ? 1 : 0))

const title = computed(() => {
	switch (form.type) {
		case "add":
			return "إضافة مخزون"
		case "remove":
			return "خصم مخزون"
		case "set":
			return "ضبط كمية المخزون"
		default:
			return "تسوية المخزون"
	}
})

const warehouseOptions = computed(() =>
	props.warehouses.map((w) => ({ value: w.id, label: w.name || w.id })),
)

async function submit() {
	validationErrors.value = {}

	if (!props.product) {
		showError("لا يوجد منتج محدد")
		return
	}

	if (!form.warehouseId) {
		validationErrors.value.warehouseId = "المستودع مطلوب"
		showError("المستودع مطلوب")
		return
	}

	if (!form.qty || form.qty <= 0) {
		validationErrors.value.qty = "يجب أن تكون الكمية أكبر من صفر"
		return
	}

	if (!form.reason?.trim()) {
		validationErrors.value.reason = "السبب مطلوب"
		return
	}

	if (form.type === "remove" && predictedQty.value < 0) {
		validationErrors.value.qty = "لا يمكن خصم أكثر من المخزون المتاح"
		return
	}

	saving.value = true
	try {
		const adjustment =
			form.type === "remove"
				? -form.qty
				: form.type === "add"
					? form.qty
					: form.qty - currentQty.value

		const result = await apiPost("/stock/adjust", {
			productId: props.product.id,
			warehouseId: form.warehouseId,
			qty: adjustment,
			reason: form.reason,
		})

		showSuccess("تمت تسوية المخزون بنجاح")
		emit("saved", result)
		handleClose()
	} catch (error) {
		log.error("Failed to adjust stock", error)
		showError(error.message || "فشل تسوية المخزون")
	} finally {
		saving.value = false
	}
}

function handleClose() {
	show.value = false
}

function resetForm() {
	form.value = {
		warehouseId: props.warehouses[0]?.id || "W-01",
		type: "add",
		qty: 0,
		reason: "",
	}
	validationErrors.value = {}
}

watch(show, (val) => {
	if (val) resetForm()
})
</script>
