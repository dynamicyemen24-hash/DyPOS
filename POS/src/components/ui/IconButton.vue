<script setup>
import { ActionButton } from "dypos-ui"

/**
 * IconButton — RETIRED shim. One icon-button implementation lives in the
 * kit's `ActionButton` (icon-only mode).
 *
 * This file carried the fourth token vocabulary (nine variants, three sizes,
 * its own spinner keyframes) for three call sites. The mapping below is the
 * whole of it — no palette table, no click handling, no loading state live
 * here, exactly like the retired `Button` shim (`tests/buttonUnification`
 * pins that shape). prop-for-prop compatibility is kept so the call sites
 * do not change:
 *
 *   gray/secondary → default outline (surface + border, as before)
 *   soft           → brand subtle
 *   ghost          → default ghost (transparent, secondary ink — as before)
 *   primary/hero   → brand solid
 *   success        → green solid · danger/red → red solid · warning → yellow
 *
 * Two honest notes:
 * - `variant="red"` never existed here (no rule, no validator entry): the
 *   empty-cart button rendered unstyled. It now paints red solid — that is a
 *   fix, and `"red"` joins the validator for it.
 * - `touch` is accepted and ignored: every kit button is touch-ready now
 *   (`touch-manipulation`, no tap highlight, coarse-pointer floor), so there
 *   is nothing left for the flag to switch on.
 */
const props = defineProps({
	icon: { type: String, required: true },
	variant: {
		type: String,
		default: "ghost",
		validator: (v) =>
			[
				"primary",
				"secondary",
				"soft",
				"ghost",
				"gray",
				"success",
				"danger",
				"red",
				"warning",
				"hero",
			].includes(v),
	},
	size: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg"].includes(v),
	},
	title: { type: String, default: "" },
	ariaLabel: { type: String, default: "" },
	loading: { type: Boolean, default: false },
	disabled: { type: Boolean, default: false },
	touch: { type: Boolean, default: false },
	type: { type: String, default: "button" },
})

const emit = defineEmits(["click"])

/** Historical variant name → survivor theme. */
const THEME = {
	primary: "brand",
	secondary: "default",
	soft: "brand",
	ghost: "default",
	gray: "default",
	success: "green",
	danger: "red",
	red: "red",
	warning: "yellow",
	hero: "brand",
}

/** Historical variant name → survivor variant. */
const VARIANTS = {
	primary: "solid",
	secondary: "outline",
	soft: "subtle",
	ghost: "ghost",
	gray: "outline",
	success: "solid",
	danger: "solid",
	red: "solid",
	warning: "solid",
	hero: "solid",
}
</script>

<template>
	<!--
		No default-slot content: the survivor reads that (with no `label`) as
		icon-only and keeps the square. `title` has no prop on the survivor, so
		it rides `$attrs` onto the native button — the tooltip survives.
	-->
	<ActionButton
		:icon="props.icon"
		:theme="THEME[props.variant] || 'default'"
		:variant="VARIANTS[props.variant] || 'subtle'"
		:size="props.size"
		:type="props.type"
		:loading="props.loading"
		:disabled="props.disabled"
		:aria-label="props.ariaLabel || props.title || undefined"
		:title="props.title || props.ariaLabel || undefined"
		@click="emit('click', $event)"
	/>
</template>
