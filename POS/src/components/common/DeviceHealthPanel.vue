<template>
	<section class="device-panel" :aria-label="__('فحص الأجهزة')">
		<header class="device-panel__head">
			<h2 class="device-panel__title">
				{{ __('حالة الأجهزة') }}
			</h2>

			<!--
				الفحص لا يعمل تلقائيًا. زرٌّ صريح، لأن AGENTS.md يمنع أي
				استطلاع عند الإقلاع، ولأن الفحص يفتح منفذًا فعليًا على الجهاز.
			-->
			<ActionButton
				variant="subtle"
				size="sm"
				:disabled="running"
				@click="refresh"
			>
				{{ running ? __('جارٍ الفحص…') : __('فحص الآن') }}
			</ActionButton>
		</header>

		<p v-if="rows.length" class="device-panel__banner" :class="`device-panel__banner--${overall}`">
			{{ banner }}
		</p>

		<ul class="device-panel__list">
			<li
				v-for="row in rows"
				:key="row.kind"
				class="device-panel__row"
				:class="`device-panel__row--${row.state}`"
				:data-state="row.state"
			>
				<div class="device-panel__row-main">
					<!--
						نقطة الحالة ليست اللون وحده: لكل حالة أيقونة وعنوان
						ونص، فمن لا يميّز الألوان يقرأ نفس المعلومة.
					-->
					<span
						class="device-panel__dot"
						:title="stateLabel(row.state)"
						aria-hidden="true"
					>
						{{ stateIcon(row.state) }}
					</span>

					<div class="device-panel__text">
						<strong class="device-panel__name">
							{{ labelFor(row.kind) }}
						</strong>
						<span class="device-panel__detail">{{ row.detail }}</span>
						<span v-if="row.actionable" class="device-panel__action">
							{{ row.actionable }}
						</span>
					</div>
				</div>

				<span class="device-panel__checked">
					{{ checkedLabel(row.checkedAt) }}
				</span>
			</li>
		</ul>
	</section>
</template>

<script setup>
/**
 * DeviceHealthPanel — the operational device check a manager runs at open.
 *
 * The component renders what `useDeviceProbes` decides and decides nothing
 * itself. That split is deliberate: the rules about what may be called "ok"
 * are the ones that must be testable without a DOM, and putting them here
 * would make them testable only by mounting a component.
 */
import { computed, onMounted, ref } from "vue"
import { ActionButton } from "dypos-ui"
import {
	DEVICE_KINDS,
	overallDeviceState,
	runDeviceProbes,
} from "@/composables/useDeviceProbes"
import { __ } from "@/utils/translation"

const props = defineProps({
	/** An existing scale service, so the panel does not open a second one. */
	scaleService: { type: Object, default: null },
	/** `{ configured, submitted, lastError }` for the tax row. */
	taxState: { type: Object, default: () => ({}) },
	/** Probe once on mount — opt-in, never the default (invariant 8). */
	autoCheck: { type: Boolean, default: false },
})

const rows = ref([])
const running = ref(false)
const overall = ref("warn")

const ICONS = { ok: "✓", warn: "!", error: "✕", unknown: "?" }
const LABELS = {
	ok: "سليم",
	warn: "يحتاج انتباهًا",
	error: "معطّل",
	unknown: "غير مفحوص",
}

const labelFor = (kind) =>
	DEVICE_KINDS.find((k) => k.id === kind)?.label ?? kind
const stateIcon = (state) => ICONS[state] ?? "?"
const stateLabel = (state) => LABELS[state] ?? LABELS.unknown

const banner = computed(() => {
	if (overall.value === "ok") return "كل الأجهزة سليمة"
	if (overall.value === "error") return "يوجد جهاز معطّل — راجع الصف أدناه"
	return "بعض الأجهزة تحتاج انتباهًا أو لم تُفحص بعد"
})

/**
 * Probe time in Arabic, never a raw ISO string.
 *
 * A row stamped "2026-10-02T18:42:07.123Z" is unreadable at the counter; the
 * clock is what a manager compares against the moment they pressed the
 * button.
 */
const checkedLabel = (checkedAt) => {
	if (!checkedAt) return "لم يُفحص"
	const date = new Date(checkedAt)
	if (Number.isNaN(date.getTime())) return "لم يُفحص"
	return date.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })
}

/**
 * Run the probes. Never called on mount unless `autoCheck` was passed
 * explicitly by a screen that owns a user gesture.
 */
async function refresh() {
	if (running.value) return
	running.value = true
	try {
		rows.value = await runDeviceProbes({
			scaleService: props.scaleService,
			taxState: props.taxState,
		})
		overall.value = overallDeviceState(rows.value)
	} finally {
		running.value = false
	}
}

if (props.autoCheck) {
	onMounted(refresh)
}

defineExpose({ refresh, rows, overall })
</script>

<style scoped>
.device-panel {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	padding: 1rem;
	border: 1px solid var(--dy-color-surface-border, #e5e7eb);
	border-radius: 10px;
	background: var(--dy-color-surface-base, #fff);
}

.device-panel__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
}

.device-panel__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 650;
}

.device-panel__banner {
	margin: 0;
	padding: 0.45rem 0.6rem;
	border-radius: 6px;
	font-size: 0.85rem;
}

.device-panel__banner--ok {
	background: var(--dy-color-status-success-weak, #dcfce7);
}

.device-panel__banner--warn {
	background: var(--dy-color-status-warning-weak, #fef3c7);
}

.device-panel__banner--error {
	background: var(--dy-color-status-danger-weak, #fee2e2);
}

.device-panel__list {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.device-panel__row {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.55rem 0.6rem;
	border-radius: 8px;
	background: var(--dy-color-surface-sunken, #f9fafb);
}

.device-panel__row-main {
	display: flex;
	align-items: flex-start;
	gap: 0.55rem;
	min-width: 0;
}

/* `unknown` is styled distinctly from BOTH `ok` and `error` on purpose:
   "not checked" is not a quiet kind of fine. */
.device-panel__row--unknown {
	border: 1px dashed var(--dy-color-surface-border, #d1d5db);
	background: transparent;
}

.device-panel__dot {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 22px;
	height: 22px;
	border-radius: 999px;
	font-size: 0.8rem;
	font-weight: 700;
}

.device-panel__row--ok .device-panel__dot {
	background: var(--dy-color-status-success-weak, #dcfce7);
	color: var(--dy-color-status-success-text, #047857);
}

.device-panel__row--warn .device-panel__dot {
	background: var(--dy-color-status-warning-weak, #fef3c7);
	color: var(--dy-color-status-warning-text, #b45309);
}

.device-panel__row--error .device-panel__dot {
	background: var(--dy-color-status-danger-weak, #fee2e2);
	color: var(--dy-color-status-danger-text, #b91c1c);
}

.device-panel__row--unknown .device-panel__dot {
	background: var(--dy-color-surface-sunken, #f3f4f6);
	color: var(--dy-color-text-muted, #6b7280);
}

.device-panel__text {
	display: flex;
	flex-direction: column;
	gap: 0.1rem;
	min-width: 0;
}

.device-panel__name {
	font-size: 0.9rem;
}

.device-panel__detail,
.device-panel__action {
	font-size: 0.8rem;
	color: var(--dy-color-text-secondary, #4b5563);
}

.device-panel__action {
	color: var(--dy-color-text-primary, #111827);
}

.device-panel__checked {
	flex-shrink: 0;
	font-size: 0.75rem;
	font-variant-numeric: tabular-nums;
	color: var(--dy-color-text-muted, #6b7280);
}
</style>
