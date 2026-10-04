<script setup>
import { computed, useId } from "vue"

/**
 * DyPanel — the one surface a login-screen block may live in.
 *
 * ## Why this component exists
 *
 * The login screen encoded its layout in THREE `grid-template-areas`
 * vocabularies at once — the page root, the masthead (`logo` / `company` /
 * `preferences` / `ops`), and ad-hoc rules per block. Adding a block meant
 * inventing an area name inside a 1380-line stylesheet, which is why the ops
 * panel arrived wedged into a column.
 *
 * ## Props are layout intent, not pixels
 *
 * `span` / `order` / `tone` exist so a caller rearranges the screen by changing
 * two attributes instead of editing a stylesheet. `span` in particular replaces
 * a `grid-template-areas` entry per pairing.
 *
 * ## `aria-labelledby`, not `aria-label`
 *
 * A visible `title` must BE the accessible name, so it is wired by id. Only a
 * panel with no visible title falls back to `ariaLabel` — passing both would
 * produce a name that contradicts the visible text, which is worse than
 * either. `tests/dyPanel.test.js` pins that precedence.
 *
 * ## A missing span keeps its own class
 *
 * The `span` validator warns on a typo and Vue still renders the prop, so
 * `dy-panel--quarter` reaches the DOM. That is deliberate: a silent fallback
 * to `full` would place a panel at the wrong width with nothing logged.
 */
defineProps({
	/** Visible heading. Becomes the accessible name when present. */
	title: { type: String, default: "" },
	subtitle: { type: String, default: "" },
	/** Explicit accessible name for a panel with no visible title. */
	ariaLabel: { type: String, default: "" },
	/** `half` shares a row with a sibling; `full` claims the whole row. */
	span: {
		type: String,
		default: "full",
		validator: (v) => ["half", "full"].includes(v),
	},
	/** Visual weight. `plain` is a card on the page; `glass` sits over a gradient. */
	tone: {
		type: String,
		default: "plain",
		validator: (v) => ["plain", "quiet", "glass"].includes(v),
	},
	/** Removes padding — for a panel whose body is itself a list or grid. */
	flush: { type: Boolean, default: false },
	/** Adds the elevation shadow. Off for panels that supply their own. */
	raised: { type: Boolean, default: true },
	/** Visual order within the grid, independent of DOM order. */
	order: { type: Number, default: 0 },
})

/**
 * A stable, collision-free id for the heading. `useId` (Vue 3.5+) is the right
 * tool — a hand-rolled counter collides the moment two panels mount on
 * different code paths, which is how `aria-labelledby` ends up pointing at
 * another panel's title.
 */
const instanceId = useId()
const headingId = computed(() => `dy-panel-${instanceId}-heading`)
</script>

<template>
	<!--
		لوحة فنية واحدة مرنة: رأسٌ اختياري، جسم، تذييل، وشريط إجراءات.
		المرونة تأتي من `span` و`tone` و`order`، لا من شبكة جديدة لكل حالة.
	-->
	<section
		class="dy-panel"
		:class="[
			`dy-panel--${span}`,
			`dy-panel--${tone}`,
			{ 'dy-panel--flush': flush, 'dy-panel--raised': raised },
		]"
		:aria-label="title ? undefined : ariaLabel || undefined"
		:aria-labelledby="title ? headingId : undefined"
		:style="{ order }"
	>
		<header v-if="title || $slots.header || $slots.actions" class="dy-panel__head">
			<div class="dy-panel__head-text">
				<slot name="header">
					<template v-if="title">
						<h2 :id="headingId" class="dy-panel__title">{{ title }}</h2>
						<p v-if="subtitle" class="dy-panel__subtitle">{{ subtitle }}</p>
					</template>
				</slot>
			</div>

			<div v-if="$slots.actions" class="dy-panel__actions">
				<slot name="actions" />
			</div>
		</header>

		<div class="dy-panel__body">
			<slot />
		</div>

		<footer v-if="$slots.footer" class="dy-panel__foot">
			<slot name="footer" />
		</footer>
	</section>
</template>