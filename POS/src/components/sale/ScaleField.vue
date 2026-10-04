<template>
	<!--
		لوحة الميزان — نقطة ربط جهاز الوزن في التطبيق.

		لماذا component مشترك لا شيفرة في كل صفحة: قاعدة «الوزن يُكتب فقط
		عندما يستقر» لو تكرّرت في صفحتين لاستطاعت أن تختلفا، وأي اختلاف بينهما
		هو باب مفتوح لتحصيل وزنٍ خاطئ. القاعدة تعيش في HAL، وهذه اللوحة
		مجرد نافذة عليها.

		ما تعرضه اللوحة:
		  - حالة الاتصال بنص عربي لا برموز غامضة؛
		  - الوزن الحيّ **قبل** أن يهبط في الحقل، حتى يرى الكاشير الرقم
		    ويعرف أن الميزان هو الذي ملأ الصندوق؛
		  - ما إذا كان الاستقرار **مُبلَّغًا** عن الميزان أم **مستنتجًا**
		    بتكرار القراءات — فرق يهم عند نزاع على وزن.
	-->
	<div class="scale-field" :data-status="state.status">
		<div class="scale-field__row">
			<button
				type="button"
				class="scale-field__toggle"
				:aria-expanded="showPanel"
				@click="toggle"
			>
				<FeatherIcon
					name="sliders"
					class="scale-field__icon"
					aria-hidden="true"
				/>
				<span>{{ label }}</span>
			</button>

			<!--
				الوزن الحيّ: aria-live="polite" لقارئ الشاشة، ووصف يذكر مصدر
				الرقم. شخص المكبر الصوتي لا يرى تغير الرقم، فيحتاج أن يُقال
				له ما الذي تغيّر.
			-->
			<span
				v-if="liveWeightKg !== null"
				class="scale-field__live"
				role="status"
				aria-live="polite"
			>
				{{ formatWeight(liveWeightKg) }} {{ unitLabel }}
				<span class="scale-field__badge">{{ stabilityLabel }}</span>
			</span>
		</div>

		<div v-if="showPanel" class="scale-field__panel">
			<p class="scale-field__status">{{ state.statusText }}</p>

			<ul class="scale-field__transports">
				<li
					v-for="option in transportOptions"
					:key="option.id"
					class="scale-field__transport"
					:class="{ 'scale-field__transport--off': !option.supported }"
				>
					<span>{{ option.label }}</span>
					<span class="scale-field__hint">
						{{ option.supported ? 'متاح' : 'غير مدعوم في هذا المتصفح' }}
					</span>
				</li>
			</ul>

			<p v-if="!anyTransportSupported" class="scale-field__status">
				{{ UNSUPPORTED_HINT }}
			</p>

			<div class="scale-field__actions">
				<ActionButton
					v-if="!isConnected"
					variant="solid"
					size="sm"
					:disabled="!anyTransportSupported"
					@click="onConnect"
				>
					{{ connectLabel }}
				</ActionButton>
				<ActionButton
					v-else
					variant="subtle"
					size="sm"
					@click="disconnect"
				>
					فصل الميزان
				</ActionButton>
			</div>
		</div>
	</div>
</template>

<script setup>
/**
 * ScaleField — the one place a weighing scale touches the UI.
 *
 * Every prop is a plain value or a ref, so a page can bind it without
 * knowing anything about transports, protocols or frame grammars. The
 * component decides nothing about the business meaning of a weight: it shows
 * the number and hands settled ones to `emit("weight")`.
 */
import { computed, ref } from "vue"
import { FeatherIcon } from "dypos-ui"
import { ActionButton } from "dypos-ui"
import { useScaleField } from "@/composables/useScaleField"
import { formatQuantitySafe } from "@/utils/currency"

/** Arabic copy. Invariant 7 — the cashier reads this, not a developer. */
const UNSUPPORTED_HINT =
	"هذا المتصفح لا يقرأ الميزان مباشرة. استخدم جسرًا محليًا من الإعدادات، أو جرّب متصفح Chrome على جهاز الكاشير."
const CONNECT_LABEL = "ربط الميزان"
const FIELD_LABEL = "ميزان"

/**
 * @param {object} props
 * @param {import("vue").Ref<number|string>} props.target the bound field
 * @param {import("vue").Ref<string>} [props.uom] the field's unit
 * @param {string} [props.unit] fallback unit label when `uom` is absent
 * @param {object} [props.settings] scale settings from the store
 * @param {string} [props.label]
 * @param {string} [props.connectLabel]
 */
const props = defineProps({
	target: { type: Object, required: true },
	uom: { type: Object, default: null },
	unit: { type: String, default: "كجم" },
	settings: { type: Object, default: () => ({}) },
	label: { type: String, default: FIELD_LABEL },
	connectLabel: { type: String, default: CONNECT_LABEL },
})

const emit = defineEmits(["weight", "status"])

const showPanel = ref(false)

const {
	status,
	state,
	isConnected,
	liveWeightKg,
	lastWrite,
	service,
	connectNow,
	disconnect,
} = useScaleField({
	target: props.target,
	uom: props.uom,
	settings: props.settings,
})

const transportOptions = computed(() => service.available())
const anyTransportSupported = computed(() =>
	transportOptions.value.some((option) => option.supported),
)

const unitLabel = computed(() => props.uom?.value || props.unit)

/**
 * The live number, formatted by the app's single quantity formatter.
 *
 * A second weight formatter here would be the duplicated
 * `formatCurrency` bug the debt log already paid for once: the two copies
 * drift, and the drift shows up as a weight that reads differently on the
 * scale panel than in the field it filled.
 */
const formatWeight = (value) => formatQuantitySafe(value)

/**
 * `مستقر` vs `مستقر (باستنتاج)` — a cashier disputing a weight needs to know
 * whether the SCALE said so or the app inferred it from repeated readings.
 */
const stabilityLabel = computed(() => {
	const source = lastWrite.value?.stability
	if (source === "reported") return "مستقر"
	if (source === "inferred") return "مستقر (باستنتاج)"
	return "قيد القراءة"
})

function toggle() {
	showPanel.value = !showPanel.value
}

/**
 * browser's gesture requirement — and AGENTS.md invariant 8 — satisfied.
 */
async function onConnect() {
	try {
		await connectNow()
	} catch {
		// The service already holds an Arabic reason in `state.statusText`;
		// inventing a second message here would let the two disagree.
	}
	emit("status", status.value)
}

async function onDisconnect() {
	await disconnect()
	emit("status", status.value)
}

defineExpose({ disconnect: onDisconnect, isConnected, liveWeightKg })
</script>

<style scoped>
/*
 * The panel is deliberately compact and inline with the field it fills: a
 * weighing cashier reads the number and the box in one glance, so a modal or
 * a side drawer would put them in two places at once.
 *
 * Colour never carries meaning on its own — the status line always has text,
 * and `data-status` exists so a test (and a future theme) can read the state
 * without parsing Arabic.
 */
.scale-field {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
	min-width: 0;
}

.scale-field__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.scale-field__toggle {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	min-height: 32px;
	padding: 0 0.5rem;
	border: 1px solid var(--dy-color-surface-border, #d1d5db);
	border-radius: 6px;
	background: transparent;
	color: inherit;
	font-size: 0.85rem;
	cursor: pointer;
}

.scale-field__toggle:focus-visible {
	outline: 2px solid var(--dy-focus-ring-color, #2563eb);
	outline-offset: 2px;
}

.scale-field__icon {
	width: 15px;
	height: 15px;
}

.scale-field__live {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	font-variant-numeric: tabular-nums;
	font-weight: 650;
	font-size: 0.95rem;
}

/* Only a connected scale gets the "ready" treatment; the badge beside it
   always spells out whether the value is stable, so colour is decoration. */
.scale-field[data-status="connected"] .scale-field__live {
	color: var(--dy-color-status-success-text, #047857);
}

.scale-field__badge {
	padding: 0.1rem 0.35rem;
	border-radius: 999px;
	background: var(--dy-color-surface-sunken, #f3f4f6);
	font-size: 0.72rem;
	font-weight: 500;
	color: var(--dy-color-text-secondary, #4b5563);
}

.scale-field__panel {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	padding: 0.6rem;
	border: 1px solid var(--dy-color-surface-border, #e5e7eb);
	border-radius: 8px;
	background: var(--dy-color-surface-sunken, #f9fafb);
}

.scale-field__status {
	margin: 0;
	font-size: 0.82rem;
	color: var(--dy-color-text-secondary, #4b5563);
}

.scale-field__transports {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	margin: 0;
	padding: 0;
	list-style: none;
	font-size: 0.8rem;
}

.scale-field__transport {
	display: flex;
	justify-content: space-between;
	gap: 0.5rem;
}

.scale-field__transport--off .scale-field__hint {
	color: var(--dy-color-text-muted, #9ca3af);
}

.scale-field__hint {
	color: var(--dy-color-text-secondary, #4b5563);
}

.scale-field__actions {
	display: flex;
	gap: 0.5rem;
}
</style>
