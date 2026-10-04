<template>
	<!--
		`Button` — RETIRED shim. One implementation lives in `ActionButton`.

		The tree carried FOUR button families with three different vocabularies
		for the same intent (measured, POS/src, 323 files):

		  raw <button>   169   no ring, no tokens, no loading state
		  `Button`        66   theme × variant (gray/blue/green/red)
		  `DyButton`      61   variant (primary/secondary/…/warning)
		  `ActionButton`   9   theme × variant, Carbon + Fluent palettes

		`ActionButton` survived because it is the only one carrying the full
		Carbon AND Fluent palettes, six sizes (xs…2xl), icon-only mode,
		`route`/`link` navigation, `prefix`/`suffix` slots and a focus-visible
		ring. Unifying onto the others would have deleted capability while
		calling it cleanup.

		This shim forwards attributes, listeners and BOTH slots. An earlier
		version used a render function with `$createElement`, which Vue 3 no
		longer defines — it warned on every render and dropped the default
		slot, so `Button` rendered as an empty box. The template below is the
		fix, and `tests/buttonUnification.test.js` pins the slots forward.
	-->
	<ActionButton v-bind="$attrs" :theme="resolvedTheme">
		<template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
		<template v-if="$slots.suffix" #suffix><slot name="suffix" /></template>
		<slot />
	</ActionButton>
</template>

<script setup>
import ActionButton from "./ActionButton.vue"

/** `gray` was this file's neutral family; `blue` its accent one. */
const THEME_ALIAS = { gray: "default", blue: "brand" }

defineOptions({ inheritAttrs: false })

const props = defineProps({
	/** Historical theme family name; resolved onto the survivor's palettes. */
	theme: { type: String, default: null },
})

const resolvedTheme = THEME_ALIAS[props.theme] || props.theme || "brand"
</script>