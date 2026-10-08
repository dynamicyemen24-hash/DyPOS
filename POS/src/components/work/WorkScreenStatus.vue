<script setup>
import { computed } from "vue"
import { FeatherIcon } from "dypos-ui"
import { __ } from "@/utils/translation"

const props = defineProps({
	count: { type: Number, default: 0 },
	source: { type: String, default: "" },
	loading: { type: Boolean, default: false },
	updatedAt: { type: Date, default: null },
})

const sourceLabel = computed(() => {
	if (props.source === "local") return __("نسخة محلية")
	if (props.source === "unavailable") return __("المصدر غير متاح")
	if (!props.source) return __("لم يتم التحميل")
	return __("مصدر مباشر")
})

const sourceVariant = computed(() => {
	if (props.source === "unavailable") return "unavailable"
	if (props.source === "local") return "local"
	return props.source ? "live" : "idle"
})

const updatedLabel = computed(() => {
	if (!props.updatedAt) return ""
	try {
		return new Intl.DateTimeFormat(undefined, {
			hour: "2-digit",
			minute: "2-digit",
		}).format(props.updatedAt)
	} catch {
		return ""
	}
})
</script>

<template>
	<section
		class="work-screen-status"
		:class="{ 'work-screen-status--loading': loading }"
		:aria-label="__('ملخص حالة الشاشة')"
	>
		<div class="work-screen-status__metric">
			<span class="work-screen-status__icon" aria-hidden="true">
				<FeatherIcon name="layers" class="h-4 w-4" />
			</span>
			<span class="work-screen-status__metric-copy">
				<strong class="work-screen-status__count" aria-live="polite">{{ count.toLocaleString() }}</strong>
				<span class="work-screen-status__label">{{ __("سجل معروض") }}</span>
			</span>
		</div>

		<div class="work-screen-status__meta">
			<span class="work-screen-status__source" :data-state="sourceVariant">
				<span class="work-screen-status__dot" aria-hidden="true" />
				{{ sourceLabel }}
			</span>
			<span v-if="updatedLabel" class="work-screen-status__updated">
				<FeatherIcon name="clock" class="h-3.5 w-3.5" aria-hidden="true" />
				{{ __("آخر تحميل") }} {{ updatedLabel }}
			</span>
			<span v-if="loading" class="work-screen-status__loading" role="status">
				{{ __("جارٍ التحديث") }}
			</span>
		</div>
	</section>
</template>

<style scoped>
.work-screen-status {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	flex-wrap: wrap;
	padding: 0.65rem 0.85rem;
	border: 1px solid var(--dy-border, #e2e8f0);
	border-radius: 0.75rem;
	background: var(--dy-surface, #fff);
	color: var(--dy-text, #0f172a);
}
.work-screen-status__metric,
.work-screen-status__meta,
.work-screen-status__source,
.work-screen-status__updated {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	min-width: 0;
}
.work-screen-status__icon {
	display: grid;
	place-items: center;
	width: 2.25rem;
	height: 2.25rem;
	flex: 0 0 auto;
	border-radius: 0.6rem;
	background: var(--dy-bg-sunken, #f1f5f9);
	color: var(--dy-primary, #047857);
}
.work-screen-status__metric-copy {
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
}
.work-screen-status__count { font-size: 1rem; line-height: 1.25; font-variant-numeric: tabular-nums; }
.work-screen-status__label,
.work-screen-status__updated { font-size: 0.75rem; color: var(--dy-text-muted, #64748b); }
.work-screen-status__meta { flex-wrap: wrap; font-size: 0.75rem; }
.work-screen-status__source { border-radius: 999px; padding: 0.3rem 0.55rem; background: var(--dy-bg-sunken, #f1f5f9); }
.work-screen-status__dot { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: currentColor; }
.work-screen-status__source[data-state="live"] { color: var(--dy-success, #047857); }
.work-screen-status__source[data-state="local"] { color: var(--dy-warning, #92400e); }
.work-screen-status__source[data-state="unavailable"] { color: var(--dy-danger, #b91c1c); }
.work-screen-status__loading { color: var(--dy-primary, #047857); }
@media (max-width: 480px) {
	.work-screen-status { align-items: flex-start; }
	.work-screen-status__meta { width: 100%; justify-content: space-between; }
}
@media (prefers-reduced-motion: reduce) {
	.work-screen-status * { animation: none !important; transition: none !important; }
}
</style>
