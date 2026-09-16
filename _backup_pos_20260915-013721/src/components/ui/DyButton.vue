<script setup>
import { FeatherIcon } from "frappe-ui"

const props = defineProps({
	variant: {
		type: String,
		default: "primary",
		validator: (v) =>
			[
				"primary",
				"secondary",
				"soft",
				"ghost",
				"success",
				"danger",
				"warning",
				"hero",
			].includes(v),
	},
	size: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg", "xl"].includes(v),
	},
	icon: { type: String, default: null },
	iconPosition: {
		type: String,
		default: "start",
		validator: (v) => ["start", "end"].includes(v),
	},
	loading: { type: Boolean, default: false },
	disabled: { type: Boolean, default: false },
	touch: { type: Boolean, default: false },
	type: { type: String, default: "button" },
	href: { type: String, default: null },
	label: { type: String, default: "" },
})
</script>

<template>
	<component
		:is="href ? 'a' : 'button'"
		v-bind="
			href
				? { href, target: '_blank', rel: 'noopener noreferrer' }
				: { type: props.type, disabled: disabled || loading }
		"
		:class="['dy-btn', 'dy-btn-' + variant, 'dy-btn-' + size, { 'dy-touch dy-press': touch }]"
		:aria-busy="loading"
	>
		<span v-if="loading" class="dy-btn-spinner" aria-hidden="true"></span>
		<FeatherIcon
			v-else-if="icon && iconPosition === 'start'"
			:name="icon"
			class="dy-btn-icon"
			:stroke-width="2"
		/>
		<span v-if="$slots.default || label" class="dy-btn-label">
			<slot>{{ label }}</slot>
		</span>
		<FeatherIcon
			v-if="icon && iconPosition === 'end'"
			:name="icon"
			class="dy-btn-icon"
			:stroke-width="2"
		/>
	</component>
</template>