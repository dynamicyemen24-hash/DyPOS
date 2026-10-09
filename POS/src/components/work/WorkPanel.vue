/**
 * WorkPanel — حاوية محتوى أساسية لسطح العمل (رأس/جسد/تذييل).
 *
 *  - `flush`: بلا حشوة داخلية — لوضع الجدول حافةً بحافة.
 *  - `scrollable`: جسد قابل للتمرير بشريط رفيع (`scrollbar-width: thin`)،
 *    وسلسلة `min-height: 0` كي يمرر الأبناء لا الصفحة.
 *  - `density: default | compact`.
 *  - الأحجام كلها منطقيّة (inset/padding) فتنعكس مع RTL دون قواعد مزدوجة.
 *
 * Slots: default (الجسد)، header (يتجاوز العنوان)، actions (يسار رأس الشريط
 * المنطقي)، footer (يظهر فقط إن وُجد — لا مساحة ميتة).
 */
<template>
	<section
		class="work-panel"
		:class="[
			`work-panel--${density}`,
			{ 'work-panel--flush': flush, 'work-panel--scrollable': scrollable },
		]"
		:aria-label="ariaLabel || undefined"
	>
		<header
			v-if="title || subtitle || $slots.header || $slots.actions"
			class="work-panel__header"
		>
			<slot name="header">
				<div class="work-panel__heading">
					<h2 v-if="title" class="work-panel__title">{{ t(title) }}</h2>
					<p v-if="subtitle" class="work-panel__subtitle">{{ t(subtitle) }}</p>
				</div>
			</slot>
			<div v-if="$slots.actions" class="work-panel__actions">
				<slot name="actions" />
			</div>
		</header>

		<div class="work-panel__body" :class="{ 'work-panel__body--flush': flush }">
			<slot />
		</div>

		<footer v-if="$slots.footer" class="work-panel__footer">
			<slot name="footer" />
		</footer>
	</section>
</template>

<script setup>
import { t } from "@/utils/translation"

defineProps({
	/** عنوان الرأس (يمر عبر t() — النص العربي الحر يمر كما هو). */
	title: { type: String, default: "" },
	/** سطر وصف تحت العنوان. */
	subtitle: { type: String, default: "" },
	/** aria-label على القسم حين لا يوجد عنوان مرئي. */
	ariaLabel: { type: String, default: "" },
	/** default | compact */
	density: {
		type: String,
		default: "default",
		validator: (v) => ["default", "compact"].includes(v),
	},
	/** بلا حشوة داخلية (جداول حافةً بحافة). */
	flush: { type: Boolean, default: false },
	/** جسد قابل للتمرير بشريط رفيع. */
	scrollable: { type: Boolean, default: false },
})
</script>

<style scoped>
.work-panel {
	display: flex;
	flex-direction: column;
	min-height: 0;
	min-width: 0;
	background: var(--dy-color-surface-base, #fff);
	border: 1px solid var(--dy-border, #e2e8f0);
	border-radius: var(--dy-radius-lg, 12px);
	overflow: hidden;
}

.work-panel__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--dy-spacing-3, 12px);
	flex-wrap: wrap;
	padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
	border-bottom: 1px solid var(--dy-border, #e2e8f0);
}

.work-panel--compact .work-panel__header {
	padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
}

.work-panel__heading {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.work-panel__title {
	margin: 0;
	font-size: 0.9375rem;
	font-weight: 600;
	color: var(--dy-text, #0f172a);
	line-height: 1.4;
}

.work-panel__subtitle {
	margin: 0;
	font-size: 0.8125rem;
	color: var(--dy-text-muted, #64748b);
	line-height: 1.5;
}

.work-panel__actions {
	display: flex;
	align-items: center;
	gap: var(--dy-spacing-2, 8px);
	flex-shrink: 0;
}

.work-panel__body {
	flex: 1;
	min-height: 0;
	min-width: 0;
	padding: var(--dy-spacing-4, 16px);
}

.work-panel--compact .work-panel__body {
	padding: var(--dy-spacing-3, 12px);
}

.work-panel__body--flush {
	padding: 0;
}

.work-panel--scrollable > .work-panel__body {
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--dy-border-strong, #cbd5e1) transparent;
	-webkit-overflow-scrolling: touch;
	touch-action: pan-y;
}

.work-panel--scrollable > .work-panel__body::-webkit-scrollbar {
	width: 6px;
}
.work-panel--scrollable > .work-panel__body::-webkit-scrollbar-thumb {
	background: var(--dy-border-strong, #cbd5e1);
	border-radius: 3px;
}
.work-panel--scrollable > .work-panel__body::-webkit-scrollbar-track {
	background: transparent;
}

.work-panel__footer {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: var(--dy-spacing-2, 8px);
	flex-wrap: wrap;
	padding: var(--dy-spacing-3, 12px) var(--dy-spacing-4, 16px);
	border-top: 1px solid var(--dy-border, #e2e8f0);
	background: var(--dy-bg-sunken, #f8fafc);
}

@media (max-width: 640px) {
	.work-panel {
		border-radius: var(--dy-radius-md, 8px);
	}
	.work-panel__header,
	.work-panel__footer {
		padding: var(--dy-spacing-2, 8px) var(--dy-spacing-3, 12px);
	}
	.work-panel__body {
		padding: var(--dy-spacing-3, 12px);
	}
	.work-panel--flush > .work-panel__body {
		padding: 0;
	}
}

@media (forced-colors: active) {
	.work-panel {
		border-color: CanvasText;
	}
}
</style>
