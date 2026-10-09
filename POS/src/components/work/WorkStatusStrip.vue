/**
 * WorkStatusStrip — شريط الحالة السفلي الموحد لسطح العمل.
 *
 *  - الحالات الست: ready | working | saved | offline | warning | error
 *    مع نص عربي + أيقونة — لا لون وحده أبدًا (S5).
 *  - `role="status"` و`aria-live="polite"`، وعند `error` يرتقي إلى
 *    `role="alert"` + `aria-live="assertive"` لينبّه فورًا.
 *  - `pinned` يجعله لاصقًا أسفل الشاشة (sticky) دون إخفاء المحتوى آخرها.
 *  - `metrics`: مؤشرات عددية حقيقية؛ `lastUpdate`: نص أو Date/رقم زمني.
 *
 * Slots: default (منتصف)، end (نهاية).
 */
<template>
	<div
		class="work-status-strip"
		:class="{ 'work-status-strip--pinned': pinned }"
		:role="role"
		:aria-live="ariaLive"
	>
		<span
			class="work-status-strip__status"
			:class="`work-status-strip__status--${status}`"
		>
			<FeatherIcon
				:name="statusMeta.icon"
				class="work-status-strip__icon"
				:class="{ 'work-status-strip__icon--spin': status === 'working' }"
				aria-hidden="true"
			/>
			<span class="work-status-strip__label">{{ shownMessage }}</span>
		</span>

		<span v-if="metrics.length" class="work-status-strip__metrics">
			<span
				v-for="metric in metrics"
				:key="metric.label"
				class="work-status-strip__metric"
			>
				<bdi class="work-status-strip__metric-value">{{ metric.value }}</bdi>
				{{ t(metric.label) }}
			</span>
		</span>

		<span v-if="$slots.default" class="work-status-strip__middle">
			<slot />
		</span>

		<span v-if="lastUpdateText" class="work-status-strip__updated">
			{{ t("آخر تحديث") }}: {{ lastUpdateText }}
		</span>

		<span v-if="$slots.end" class="work-status-strip__end">
			<slot name="end" />
		</span>
	</div>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "dypos-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	/** ready | working | saved | offline | warning | error */
	status: {
		type: String,
		default: "ready",
		validator: (v) =>
			["ready", "working", "saved", "offline", "warning", "error"].includes(v),
	},
	/** رسالة مخصصة (تعوض النص المنسوب للحالة). */
	message: { type: String, default: "" },
	/** [{ label, value }] مؤشرات عددية حقيقية. */
	metrics: { type: Array, default: () => [] },
	/** آخر تحديث: نص جاهز أو Date أو timestamp. */
	lastUpdate: { type: [String, Number, Date], default: null },
	/** لاصق أسفل الشاشة. */
	pinned: { type: Boolean, default: false },
})

const STATUS_META = {
	ready: { label: "جاهز", icon: "check-circle" },
	working: { label: "جارٍ العمل", icon: "loader" },
	saved: { label: "تم الحفظ", icon: "check" },
	offline: { label: "غير متصل", icon: "wifi-off" },
	warning: { label: "تحذير", icon: "alert-triangle" },
	error: { label: "خطأ", icon: "alert-circle" },
}

const statusMeta = computed(
	() => STATUS_META[props.status] || STATUS_META.ready,
)
const shownMessage = computed(() => props.message || t(statusMeta.value.label))

const role = computed(() => (props.status === "error" ? "alert" : "status"))
const ariaLive = computed(() =>
	props.status === "error" ? "assertive" : "polite",
)

const lastUpdateText = computed(() => {
	const value = props.lastUpdate
	if (value == null || value === "") return ""
	let date = null
	if (value instanceof Date) date = value
	else if (typeof value === "number") date = new Date(value)
	else {
		const parsed = new Date(String(value))
		date = Number.isNaN(parsed.getTime()) ? null : parsed
	}
	if (!date) return String(value)
	return date.toLocaleTimeString("ar-SA", {
		hour: "2-digit",
		minute: "2-digit",
	})
})
</script>

<style scoped>
.work-status-strip {
	display: flex;
	align-items: center;
	gap: var(--dy-spacing-4, 16px);
	flex-wrap: wrap;
	min-height: 34px;
	padding: 4px var(--dy-spacing-4, 16px);
	border-top: 1px solid var(--dy-border, #e2e8f0);
	background: var(--dy-color-surface-base, #fff);
	color: var(--dy-text-muted, #64748b);
	font-size: 0.8125rem;
}

.work-status-strip--pinned {
	position: sticky;
	bottom: 0;
	z-index: var(--dy-zIndex-dropdown, 40);
}

.work-status-strip__status {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-weight: 500;
}

.work-status-strip__icon {
	width: 16px;
	height: 16px;
}

.work-status-strip__icon--spin {
	animation: work-status-spin 1s linear infinite;
}
@keyframes work-status-spin {
	to {
		transform: rotate(360deg);
	}
}

.work-status-strip__status--ready { color: var(--dy-color-status-success-text, #047857); }
.work-status-strip__status--working { color: var(--dy-text-muted, #64748b); }
.work-status-strip__status--saved { color: var(--dy-color-status-success-text, #047857); }
.work-status-strip__status--offline { color: var(--dy-text-muted, #64748b); }
.work-status-strip__status--warning { color: var(--dy-color-status-warning-text, #b45309); }
.work-status-strip__status--error { color: var(--dy-color-status-danger-text, #b91c1c); }

.work-status-strip__metrics {
	display: inline-flex;
	align-items: center;
	gap: var(--dy-spacing-3, 12px);
}

.work-status-strip__metric {
	display: inline-flex;
	align-items: baseline;
	gap: 4px;
	color: var(--dy-text-muted, #64748b);
}

.work-status-strip__metric-value {
	color: var(--dy-text, #0f172a);
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.work-status-strip__middle {
	display: inline-flex;
	align-items: center;
	gap: var(--dy-spacing-2, 8px);
}

.work-status-strip__updated {
	margin-inline-start: auto;
	color: var(--dy-text-muted, #94a3b8);
	font-variant-numeric: tabular-nums;
}

.work-status-strip__end {
	display: inline-flex;
	align-items: center;
	gap: var(--dy-spacing-2, 8px);
}

@media (max-width: 640px) {
	.work-status-strip {
		gap: var(--dy-spacing-2, 8px);
		padding: 4px var(--dy-spacing-3, 12px);
	}
	.work-status-strip__updated {
		width: 100%;
		margin-inline-start: 0;
		order: 99;
	}
}

@media (prefers-reduced-motion: reduce) {
	.work-status-strip__icon--spin {
		animation: none;
	}
}
</style>
