<template>
	<Transition name="fade">
		<div
			v-if="show"
			class="fixed inset-0 bg-black bg-opacity-50 z-[300]"
			@click.self="handleClose"
		>
			<div class="fixed inset-0 flex items-center justify-center p-4">
				<div
					class="w-full max-w-lg bg-white shadow-xl rounded-xl overflow-hidden flex flex-col"
				>
					<div class="flex items-center justify-between border-b px-4 py-3">
						<div class="flex items-center gap-2">
							<FeatherIcon name="move" class="w-5 h-5 text-indigo-600" />
							<h2 class="text-lg font-semibold text-gray-900">
								{{ __("تحويل المخزون") }}
							</h2>
						</div>
						<Button variant="ghost" size="sm" @click="handleClose" icon="x" />
					</div>

					<form
						@submit.prevent="submit"
						class="flex-1 overflow-y-auto p-4 space-y-4"
					>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{
								__("المنتج")
							}}</label>
							<div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
								<div
									v-if="product?.image"
									class="w-10 h-10 rounded overflow-hidden bg-white"
								>
									<img
										:src="product.image"
										alt=""
										class="w-full h-full object-cover"
									/>
								</div>
								<div
									v-else
									class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center"
								>
									<FeatherIcon name="package" class="w-5 h-5 text-gray-400" />
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-gray-900 truncate">
										{{ product?.name || "-" }}
									</p>
									<p class="text-xs text-gray-500">{{ product?.code || "" }}</p>
								</div>
							</div>
						</div>

						<div class="grid grid-cols-2 gap-4">
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">{{
									__("من مستودع")
								}}</label>
								<SelectInput
									v-model="form.fromWarehouseId"
									:options="fromWarehouseOptions"
									:placeholder="__('اختر مستودع المصدر')"
									required
								/>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">{{
									__("إلى مستودع")
								}}</label>
								<SelectInput
									v-model="form.toWarehouseId"
									:options="toWarehouseOptions"
									:placeholder="__('اختر مستودع الوجهة')"
									required
								/>
							</div>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{
								__("الكمية المراد تحويلها")
							}}</label>
							<FormControl
								type="number"
								v-model.number="form.qty"
								:placeholder="__('أدخل الكمية')"
								:min="1"
								:max="availableQty"
								required
							/>
							<p v-if="validationErrors.qty" class="mt-1 text-xs text-red-600">
								{{ validationErrors.qty }}
							</p>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{
								__("المرجع / السبب")
							}}</label>
							<FormControl
								type="text"
								v-model="form.reference"
								:placeholder="__('مثال: PO-1234، تحويل فرع')"
							/>
						</div>

						<div class="p-3 bg-gray-50 rounded-lg text-sm">
							<h4 class="font-medium text-gray-900 mb-2">
								{{ __("معاينة") }}
							</h4>
							<div class="flex items-center gap-2 text-sm">
								<div class="flex-1 p-2 bg-white rounded border">
									<div class="text-gray-500">{{ __("من") }}</div>
									<div class="font-medium">{{ fromWarehouseName }}</div>
									<div class="text-gray-500">
										{{ __("المتاح") }}: {{ availableQty }}
									</div>
								</div>
								<FeatherIcon name="arrow-right" class="text-gray-400" />
								<div class="flex-1 p-2 bg-white rounded border">
									<div class="text-gray-500">{{ __("إلى") }}</div>
									<div class="font-medium">{{ toWarehouseName }}</div>
									<div class="text-gray-500">
										{{ __("سيستلم") }}: {{ form.qty || 0 }}
									</div>
								</div>
							</div>
						</div>
					</form>

					<div class="border-t px-4 py-3 flex justify-end gap-2 bg-gray-50">
						<Button variant="ghost" @click="handleClose">{{
							__("إلغاء")
						}}</Button>
						<Button variant="solid" @click="submit" :loading="saving">{{
							__("تحويل المخزون")
						}}</Button>
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

const log = logger.create("StockTransferDialog")

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
	fromWarehouseId: "",
	toWarehouseId: "",
	qty: 0,
	reference: "",
})

const validationErrors = ref({})
const saving = ref(false)

const fromWarehouseOptions = computed(() =>
	props.warehouses.map((w) => ({ value: w.id, label: w.name || w.id })),
)

const toWarehouseOptions = computed(() => {
	if (!form.fromWarehouseId) return fromWarehouseOptions.value
	return fromWarehouseOptions.value.filter(
		(w) => w.value !== form.fromWarehouseId,
	)
})

const availableQty = computed(() => {
	if (!props.product) return 0
	if (!form.fromWarehouseId) return Number(props.product.qty) || 0
	const stock = props.product.stock_by_warehouse?.find(
		(w) => w.warehouse_id === form.fromWarehouseId,
	)
	if (stock) return (stock.qty || 0) - (stock.reserved_qty || 0)
	return Number(props.product.qty) || 0
})

const fromWarehouseName = computed(
	() => props.warehouses.find((w) => w.id === form.fromWarehouseId)?.name || "",
)

const toWarehouseName = computed(
	() => props.warehouses.find((w) => w.id === form.toWarehouseId)?.name || "",
)

async function submit() {
	validationErrors.value = {}

	if (!props.product) {
		showError("لا يوجد منتج محدد")
		return
	}

	if (!form.fromWarehouseId) {
		validationErrors.value.fromWarehouseId = "مستودع المصدر مطلوب"
		showError("مستودع المصدر مطلوب")
		return
	}

	if (!form.toWarehouseId) {
		validationErrors.value.toWarehouseId = "مستودع الوجهة مطلوب"
		showError("مستودع الوجهة مطلوب")
		return
	}

	if (form.fromWarehouseId === form.toWarehouseId) {
		validationErrors.value.toWarehouseId = "يجب أن تكون المخزنان مختلفين"
		return
	}

	if (!form.qty || form.qty <= 0) {
		validationErrors.value.qty = "يجب أن تكون الكمية أكبر من صفر"
		return
	}

	if (form.qty > availableQty.value) {
		validationErrors.value.qty = `لا يمكن تحويل كمية أكبر من المتاح (${availableQty.value})`
		return
	}

	saving.value = true
	try {
		const result = await apiPost("/stock/transfer", {
			productId: props.product.id,
			fromWarehouse: form.fromWarehouseId,
			toWarehouse: form.toWarehouseId,
			qty: form.qty,
			reference: form.reference,
		})

		showSuccess("تم تحويل المخزون بنجاح")
		emit("saved", result)
		handleClose()
	} catch (error) {
		log.error("Failed to transfer stock", error)
		showError(error.message || "فشل تحويل المخزون")
	} finally {
		saving.value = false
	}
}

function handleClose() {
	show.value = false
}

function resetForm() {
	form.value = { fromWarehouseId: "", toWarehouseId: "", qty: 0, reference: "" }
	validationErrors.value = {}
}

watch(show, (val) => {
	if (val) resetForm()
})

watch(
	() => form.value.fromWarehouseId,
	() => {
		if (form.value.toWarehouseId === form.value.fromWarehouseId) {
			form.value.toWarehouseId = ""
		}
	},
)
</script>
