<template>
	<div class="dy-customer-account-fields">
		<SelectField
			:model-value="mode"
			:label="__('Customer account mode')"
			:description="
				__(
					'Variable: the cashier picks a customer per sale. Pinned: every sale is booked on the fixed account below.',
				)
			"
			:options="modeOptions"
			@update:model-value="$emit('update:mode', $event)"
		/>
		<div v-if="mode === 'pinned'">
			<label
				for="dypos-pinned-customer"
				class="block text-sm font-medium text-gray-900 mb-1 px-2"
			>
				{{ __("Pinned customer account") }}
			</label>
			<input
				id="dypos-pinned-customer"
				:value="pinned"
				type="text"
				:placeholder="__('Walk-in Customer')"
				class="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-transparent bg-white mx-2"
				style="width: calc(100% - 1rem)"
				maxlength="200"
				@input="$emit('update:pinned', $event.target.value)"
			/>
			<p class="text-xs text-gray-500 mt-0.5 leading-tight px-2">
				{{
					__(
						"Customer name or code used for every sale while pinned (empty falls back to walk-in)",
					)
				}}
			</p>
		</div>
		<CheckboxField
			:model-value="requireCustomer"
			:label="__('Require customer on sale')"
			:description="
				__(
					'Block submitting a sale without a customer (turn off to allow quick walk-in sales)',
				)
			"
			@update:model-value="$emit('update:require-customer', $event)"
		/>
	</div>
</template>

<script setup>
import CheckboxField from "@/components/settings/CheckboxField.vue"
import SelectField from "@/components/settings/SelectField.vue"
import { __ } from "@/utils/translation"

defineProps({
	mode: {
		type: String,
		default: "variable",
	},
	pinned: {
		type: String,
		default: "",
	},
	requireCustomer: {
		type: [Number, Boolean],
		default: 1,
	},
})

defineEmits(["update:mode", "update:pinned", "update:require-customer"])

const modeOptions = [
	{ value: "variable", label: __("Variable — pick per sale") },
	{ value: "pinned", label: __("Pinned — fixed account") },
]
</script>
