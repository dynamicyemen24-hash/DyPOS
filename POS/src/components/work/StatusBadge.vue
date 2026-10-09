/**
 * StatusBadge — شارة حالة دلالية (نص + أيقونة، لا لون وحده أبدًا S5).
 *
 * المفاتيح في `STATUS_MAP` هي القيم الخام المُوثَّقة فعليًا في الشجرة
 * (الفواتير: Paid/Unpaid/Partly Paid/Completed/Cancelled، الورديات:
 * open/closed/none، قائمة الانتظار: pending، المرتجع: VOIDED) — أي قيمة
 * غير معروفة تمر نصًّا كما هي بلون محايد، ولا يُخمَّن لها معنى أبدًا (S1).
 *
 * props: status (القيمة الخام)، label//icon/tone لتتجاوز المتصل.
 */
<template>
	<span
		class="work-status-badge"
		:class="`work-status-badge--${meta.tone}`"
		:title="title"
	>
		<FeatherIcon :name="meta.icon" class="work-status-badge__icon" aria-hidden="true" />
		<span class="work-status-badge__label">{{ shownLabel }}</span>
	</span>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "dypos-ui"

const props = defineProps({
	/** القيمة الخام من البيانات (تدعم أي نوع — تُحوَّل إلى نص). */
	status: { type: [String, Number], default: "" },
	/** نص مُلَقَّن صراحةً (يعوض خريطة المتصل). */
	label: { type: String, default: "" },
	/** أيقونة صريحة (تعوض خريطة المتصل). */
	icon: { type: String, default: "" },
	/** tone صريح: success | warning | danger | info | neutral. */
	tone: { type: String, default: "" },
})

/** قاموس دلالي: القيمة الخام (smallcased) ← { tone, icon, label عربي }. */
const STATUS_MAP = {
	paid: { tone: "success", icon: "check-circle", label: "مدفوعة" },
	completed: { tone: "success", icon: "check-circle", label: "مكتملة" },
	unpaid: { tone: "warning", icon: "alert-circle", label: "غير مدفوعة" },
	"partly paid": { tone: "warning", icon: "clock", label: "مدفوعة جزئيًا" },
	draft: { tone: "neutral", icon: "edit-3", label: "مسودة" },
	cancelled: { tone: "danger", icon: "x-circle", label: "ملغاة" },
	voided: { tone: "danger", icon: "x-circle", label: "ملغاة" },
	open: { tone: "info", icon: "unlock", label: "مفتوحة" },
	closed: { tone: "success", icon: "lock", label: "مغلقة" },
	none: { tone: "neutral", icon: "minus-circle", label: "لا وردية" },
	pending: { tone: "warning", icon: "clock", label: "قيد الانتظار" },
}

const TONE_ICONS = {
	success: "check-circle",
	warning: "alert-triangle",
	danger: "alert-circle",
	info: "info",
	neutral: "tag",
}

const raw = computed(() => String(props.status ?? "").trim())

const meta = computed(() => {
	const key = raw.value.toLowerCase()
	const found = STATUS_MAP[key]
	return {
		tone: props.tone || found?.tone || "neutral",
		icon: props.icon || found?.icon || TONE_ICONS[props.tone] || "tag",
	}
})

const shownLabel = computed(
	() =>
		props.label ||
		STATUS_MAP[raw.value.toLowerCase()]?.label ||
		raw.value ||
		"—",
)

/** القيمة الخام الأصلية متاحة دائمًا في title عند الترجمة. */
const title = computed(() => {
	const translated = STATUS_MAP[raw.value.toLowerCase()]?.label
	return translated && translated !== raw.value ? raw.value : ""
})
</script>

<style scoped>
.work-status-badge {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 2px 10px;
	border-radius: 999px;
	font-size: 0.75rem;
	font-weight: 600;
	line-height: 1.5;
	white-space: nowrap;
	vertical-align: middle;
}

.work-status-badge__icon {
	width: 13px;
	height: 13px;
	flex-shrink: 0;
}

.work-status-badge--success {
	background: var(--dy-color-status-success-weak, #ecfdf5);
	color: var(--dy-color-status-success-text, #047857);
}
.work-status-badge--warning {
	background: var(--dy-color-status-warning-weak, #fffbeb);
	color: var(--dy-color-status-warning-text, #b45309);
}
.work-status-badge--danger {
	background: var(--dy-color-status-danger-weak, #fef2f2);
	color: var(--dy-color-status-danger-text, #b91c1c);
}
.work-status-badge--info {
	background: var(--dy-color-status-info-weak, #eff6ff);
	color: var(--dy-color-status-info-text, #1d4ed8);
}
.work-status-badge--neutral {
	background: var(--dy-color-surface-sunken, #f1f5f9);
	color: var(--dy-color-text-secondary, #475569);
}

@media (forced-colors: active) {
	.work-status-badge {
		border: 1px solid CanvasText;
		background: Canvas;
		color: CanvasText;
	}
}
</style>
