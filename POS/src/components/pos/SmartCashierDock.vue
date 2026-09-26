<!--
===============================================================================
DyPOS — SmartCashierDock.vue
شريط الكاشير الذكي: اقتراحات «يُشترى غالبًا مع»، بيع سريع، وتنبيهات لحظية.
RTL-first / تعمل بالكامل دون اتصال / إضافة بنقرة واحدة.
===============================================================================
-->

<script setup>
import { computed, ref } from "vue"

import { FeatherIcon } from "frappe-ui"

const props = defineProps({
	/** [{ product, score, reason }] — اقتراحات البيع المتقاطع. */
	suggestions: {
		type: Array,
		default: () => [],
	},

	/** [{ product, score, reason }] — الأكثر مبيعًا/استخدامًا. */
	quickSell: {
		type: Array,
		default: () => [],
	},

	/** [{ id, severity, title, message }] — تنبيهات تشغيلية. */
	alerts: {
		type: Array,
		default: () => [],
	},

	/**
	 * [{ productA, productB, count }] — فرص الرف: أقوى ارتباطات
	 * «يُشترى معًا» في المتجر (تعلّم كل الطرفيات).
	 */
	opportunities: {
		type: Array,
		default: () => [],
	},

	/** نبض النوبة من المحرك. */
	shiftPulse: {
		type: Object,
		default: null,
	},

	/** صحة السلة 0-100 أو null. */
	cartHealth: {
		type: Number,
		default: null,
	},

	currency: {
		type: String,
		default: "",
	},
})

const emit = defineEmits(["add", "add-all"])

const activeTab = ref("suggestions")

const tabs = computed(() => [
	{
		id: "suggestions",
		label: "اقتراحات ذكية",
		icon: "sparkles",
		count: props.suggestions.length,
	},
	{
		id: "quick",
		label: "الأكثر بيعًا",
		icon: "zap",
		count: props.quickSell.length,
	},
	{
		id: "alerts",
		label: "تنبيهات",
		icon: "bell",
		count: props.alerts.length,
	},
	{
		id: "opportunities",
		label: "فرص الرف",
		icon: "layers",
		count: props.opportunities.length,
	},
])

const activeEntries = computed(() => {
	if (activeTab.value === "quick") {
		return props.quickSell
	}

	return props.suggestions
})

const severityIcon = {
	danger: "alert-octagon",
	warning: "alert-triangle",
	info: "info",
}

/**
 * حالة «صحة السلة» — مؤشر ثقة تشغيلي يعطي الكاشير إشارة استباقية قبل الدفع
 * (سطر واحد، كميات شاذة، خصم مرتفع، مخزون منخفض... إلخ).
 * @returns {{ value: number, tone: "good"|"warn"|"risk", label: string }|null}
 */
const healthState = computed(() => {
	const value = props.cartHealth

	if (typeof value !== "number" || Number.isNaN(value)) {
		return null
	}

	if (value >= 85) {
		return { value, tone: "good", label: "سلة سليمة" }
	}

	if (value >= 60) {
		return { value, tone: "warn", label: "تحقّق من السلة" }
	}

	return { value, tone: "risk", label: "راجع الفاتورة" }
})

function formatMoney(value) {
	return `${new Intl.NumberFormat("ar-SA", {
		maximumFractionDigits: 2,
	}).format(Number(value || 0))} ${props.currency}`
}

function productPrice(entry) {
	return entry?.product?.price ?? entry?.product?.unitPrice ?? 0
}

function handleAdd(entry) {
	if (entry?.product) {
		emit("add", entry.product)
	}
}

function handleAddAll() {
	emit(
		"add-all",
		props.suggestions.map((entry) => entry.product),
	)
}

function handleTabClick(tabId) {
	activeTab.value = tabId
}
</script>

<template>
	<div
		class="smart-dock"
		role="region"
		aria-label="الكاشير الذكي"
	>
		<!-- الرأس: العنوان + نبض النوبة -->
		<header class="smart-dock__head">
			<span class="smart-dock__title">
				<FeatherIcon
					name="sparkles"
					:size="16"
					aria-hidden="true"
				/>

				الكاشير الذكي
			</span>

			<span
				v-if="shiftPulse && shiftPulse.invoicesToday > 0"
				class="smart-dock__pulse"
			>
				<span>
					فواتير اليوم:
					<strong>{{ shiftPulse.invoicesToday }}</strong>
				</span>

				<span
					v-if="shiftPulse.avgBasket !== null"
				>
					متوسط الفاتورة:
					<strong>{{ formatMoney(shiftPulse.avgBasket) }}</strong>
				</span>

				<span
					v-if="shiftPulse.invoicesPerHour"
				>
					الإيقاع:
					<strong>{{ shiftPulse.invoicesPerHour }}</strong>/س
				</span>
			</span>

			<!-- مؤشر صحة السلة — إشارة استباقية قبل الدفع -->
			<span
				v-if="healthState"
				class="smart-dock__health"
				:class="`smart-dock__health--${healthState.tone}`"
				:title="`صحة السلة: ${healthState.value}%`"
			>
				<span class="smart-dock__health-meter">
					<span
						class="smart-dock__health-fill"
						:style="{ width: `${healthState.value}%` }"
					/>
				</span>

				{{ healthState.label }}
			</span>
		</header>

		<!-- التبويبات -->
		<div
			class="smart-dock__tabs"
			role="tablist"
			aria-label="تبويبات الكاشير الذكي"
		>
			<button
				v-for="tab in tabs"
				:key="tab.id"
				type="button"
				class="smart-dock__tab"
				:class="{ 'smart-dock__tab--active': activeTab === tab.id }"
				role="tab"
				:aria-selected="activeTab === tab.id"
				@click="handleTabClick(tab.id)"
			>
				<FeatherIcon
					:name="tab.icon"
					:size="13"
					aria-hidden="true"
				/>

				{{ tab.label }}

				<span
					v-if="tab.count"
					class="smart-dock__badge"
				>
					{{ tab.count }}
				</span>
			</button>

			<button
				v-if="activeTab === 'suggestions' && suggestions.length"
				type="button"
				class="smart-dock__tab smart-dock__tab--addall"
				@click="handleAddAll"
			>
				<FeatherIcon
					name="plus-circle"
					:size="13"
					aria-hidden="true"
				/>

				إضافة الكل
			</button>
		</div>

		<!-- المحتوى -->
		<div
			v-if="activeTab !== 'alerts' && activeTab !== 'opportunities'"
			class="smart-dock__body"
		>
			<div
				v-if="activeEntries.length"
				class="smart-dock__chips"
			>
				<button
					v-for="entry in activeEntries"
					:key="entry.product.id"
					type="button"
					class="smart-dock__chip"
					:title="entry.reason"
					@click="handleAdd(entry)"
				>
					<span>
						<span
							class="smart-dock__chip-name"
						>
							{{ entry.product.name }}
						</span>

						<span
							class="smart-dock__chip-reason"
						>
							<FeatherIcon
								name="trending-up"
								:size="11"
								aria-hidden="true"
							/>

							{{ entry.reason }}
						</span>
					</span>

					<span class="smart-dock__chip-foot">
						<span
							class="smart-dock__chip-price"
						>
							{{
								formatMoney(
									productPrice(
										entry
									)
								)
							}}
						</span>

						<span class="smart-dock__add">
							<FeatherIcon
								name="plus"
								:size="14"
								aria-hidden="true"
							/>
						</span>
					</span>
				</button>
			</div>

			<span
				v-else
				class="smart-dock__empty"
			>
				<FeatherIcon
					name="brain"
					:size="16"
					aria-hidden="true"
				/>

				يتعلم النظام من مبيعاتك — ستظهر الاقتراحات الذكية تلقائيًا.
			</span>
		</div>

		<!-- التنبيهات -->
		<div
			v-else
			class="smart-dock__body"
		>
			<div
				v-if="alerts.length"
				class="smart-dock__alerts"
				role="list"
			>
				<div
					v-for="alert in alerts"
					:key="alert.id"
					class="smart-dock__alert"
					:class="`smart-dock__alert--${alert.severity}`"
					role="listitem"
				>
					<FeatherIcon
						:name="severityIcon[alert.severity] || 'info'"
						:size="15"
						aria-hidden="true"
					/>

					<span class="smart-dock__alert-body">
						<span class="smart-dock__alert-title">
							{{ alert.title }}
						</span>

						<span class="smart-dock__alert-message">
							{{ alert.message }}
						</span>
					</span>
				</div>
			</div>

			<span
				v-else
				class="smart-dock__empty"
			>
				<FeatherIcon
					name="check-circle"
					:size="16"
					aria-hidden="true"
				/>

				لا توجد تنبيهات — السلة سليمة تمامًا.
			</span>
		</div>

		<!-- فرص الرف: أقوى ارتباطات «يُشترى معًا» -->
		<div
			v-if="activeTab === 'opportunities'"
			class="smart-dock__body"
		>
			<div
				v-if="opportunities.length"
				class="smart-dock__alerts"
				role="list"
			>
				<button
					v-for="pair in opportunities"
					:key="`${pair.productA.id}__${pair.productB.id}`"
					type="button"
					class="smart-dock__alert smart-dock__alert--info smart-dock__pair"
					role="listitem"
					:title="`اشترياه معًا ${pair.count} مرة — نقرة تضيف «${pair.productA.name}»`"
					@click="emit('add', { id: pair.productA.id, name: pair.productA.name })"
				>
					<FeatherIcon
						name="layers"
						:size="15"
						aria-hidden="true"
					/>

					<span class="smart-dock__alert-body">
						<span class="smart-dock__alert-title">
							{{ pair.productA.name }} ＋ {{ pair.productB.name }}
						</span>

						<span class="smart-dock__alert-message">
							اشترياه معًا {{ pair.count }} مرة — فرصة عرض تجميعي
						</span>
					</span>

					<span class="smart-dock__pair-count">
						{{ pair.count }}×
					</span>
				</button>
			</div>

			<span
				v-else
				class="smart-dock__empty"
			>
				<FeatherIcon
					name="layers"
					:size="16"
					aria-hidden="true"
				/>

				يتعلم النظام ارتباطات الأصناف من مبيعاتكم — ستظهر فرص الرف تلقائيًا.
			</span>
		</div>
	</div>
</template>

<style scoped>
.smart-dock {
	display: flex;
	flex-direction: column;

	border: 1px solid var(--dy-border);

	border-radius: var(--dy-radius-lg);

	background: var(--dy-surface);
}

.smart-dock__head {
	display: flex;
	align-items: center;

	gap: var(--dy-space-2);

	padding: var(--dy-space-2-5) var(--dy-space-4);

	border-bottom: 1px solid var(--dy-border);
}

.smart-dock__title {
	display: inline-flex;
	align-items: center;

	gap: var(--dy-space-1-5);

	color: var(--dy-text);

	font-family: var(--dy-font-arabic);

	font-size: 0.8rem;

	font-weight: 700;
}

.smart-dock__title svg {
	color: var(--dy-accent);
}

.smart-dock__pulse {
	display: inline-flex;
	align-items: center;

	gap: var(--dy-space-3);

	margin-inline-start: auto;

	color: var(--dy-text-muted);

	font-size: 0.68rem;
}

.smart-dock__pulse strong {
	color: var(--dy-text);

	font-variant-numeric: tabular-nums;
}

.smart-dock__tabs {
	display: flex;
	align-items: center;

	gap: var(--dy-space-1);

	padding: var(--dy-space-2) var(--dy-space-3) 0;
}

.smart-dock__tab {
	display: inline-flex;
	align-items: center;

	gap: 6px;

	padding: 7px 12px;

	border: 1px solid transparent;

	border-radius: var(--dy-radius-sm);

	background: transparent;

	color: var(--dy-text-muted);

	font-family: var(--dy-font-arabic);

	font-size: 0.72rem;

	font-weight: 600;

	cursor: pointer;

	transition:
		background var(--dy-dur-fast) ease,
		color var(--dy-dur-fast) ease;
}

.smart-dock__tab:hover {
	background: var(--dy-surface-soft);

	color: var(--dy-text);
}

.smart-dock__tab--active {
	border-color: var(--dy-border);

	background: var(--dy-surface-strong, var(--dy-surface-soft));

	color: var(--dy-accent);
}

.smart-dock__tab--addall {
	margin-inline-start: auto;

	color: var(--dy-accent);
}

.smart-dock__badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;

	min-width: 18px;

	padding: 0 5px;

	border-radius: var(--dy-radius-full);

	background: var(--dy-accent);

	color: var(--dy-accent-contrast, #fff);

	font-size: 0.62rem;

	font-variant-numeric: tabular-nums;
}

.smart-dock__body {
	display: flex;

	gap: var(--dy-space-2);

	min-height: 58px;

	padding: var(--dy-space-2-5) var(--dy-space-3) var(--dy-space-3);

	overflow-x: auto;

	overscroll-behavior-x: contain;
}

.smart-dock__chips {
	display: flex;

	gap: var(--dy-space-2);

	align-items: stretch;
}

.smart-dock__chip {
	display: flex;
	flex-direction: column;
	justify-content: space-between;

	flex-shrink: 0;

	width: 190px;

	padding: 9px 12px;

	border: 1px solid var(--dy-border);

	border-radius: var(--dy-radius-md);

	background: var(--dy-surface);

	color: inherit;

	text-align: start;

	cursor: pointer;

	transition:
		border-color var(--dy-dur-fast) ease,
		transform var(--dy-dur-fast) ease;
}

.smart-dock__chip:hover {
	border-color: var(--dy-accent);

	transform: translateY(-1px);
}

.smart-dock__chip-name {
	display: block;

	overflow: hidden;

	color: var(--dy-text);

	font-size: 0.78rem;

	font-weight: 700;

	text-overflow: ellipsis;

	white-space: nowrap;
}

.smart-dock__chip-reason {
	display: inline-flex;
	align-items: center;

	gap: 4px;

	overflow: hidden;

	margin-top: 2px;

	color: var(--dy-text-muted);

	font-size: 0.65rem;

	text-overflow: ellipsis;

	white-space: nowrap;
}

.smart-dock__chip-foot {
	display: flex;
	align-items: center;
	justify-content: space-between;

	margin-top: 6px;
}

.smart-dock__chip-price {
	color: var(--dy-accent);

	font-variant-numeric: tabular-nums;

	font-size: 0.75rem;

	font-weight: 700;
}

.smart-dock__add {
	display: inline-flex;
	align-items: center;
	justify-content: center;

	width: 26px;
	height: 26px;

	border: 0;

	border-radius: var(--dy-radius-sm);

	background: var(--dy-surface-soft);

	color: var(--dy-accent);
}

.smart-dock__empty {
	display: flex;
	align-items: center;

	gap: var(--dy-space-2);

	color: var(--dy-text-muted);

	font-size: 0.72rem;
}

.smart-dock__alerts {
	display: flex;
	flex-direction: column;

	gap: var(--dy-space-1-5);

	width: 100%;
}

.smart-dock__alert {
	display: flex;
	align-items: flex-start;

	gap: var(--dy-space-2);

	padding: 8px 12px;

	border: 1px solid var(--dy-border);

	border-radius: var(--dy-radius-md);

	background: var(--dy-surface);
}

.smart-dock__alert--danger {
	border-color: rgb(239 68 68 / 0.35);

	background: rgb(239 68 68 / 0.06);
}

.smart-dock__alert--danger svg {
	color: var(--dy-danger);
}

.smart-dock__alert--warning {
	border-color: rgb(245 158 11 / 0.35);

	background: rgb(245 158 11 / 0.06);
}

.smart-dock__alert--warning svg {
	color: var(--dy-warning);
}

.smart-dock__alert svg {
	flex-shrink: 0;

	margin-top: 1px;

	color: var(--dy-text-muted);
}

.smart-dock__alert-body {
	display: flex;
	flex-direction: column;

	gap: 1px;

	min-width: 0;
}

.smart-dock__alert-title {
	color: var(--dy-text);

	font-size: 0.73rem;

	font-weight: 700;
}

.smart-dock__alert-message {
	overflow: hidden;

	color: var(--dy-text-muted);

	font-size: 0.68rem;

	text-overflow: ellipsis;

	white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
	.smart-dock__chip {
		transition: none;
	}
}

/* فرص الرف */
.smart-dock__pair {
	width: 100%;

	text-align: start;
}

.smart-dock__pair-count {
	flex-shrink: 0;

	margin-inline-start: auto;

	padding: 2px 8px;

	border-radius: 999px;

	background: var(--dy-accent-soft, rgb(var(--dy-accent-c-500, 16 185 129) / 0.14));

	color: var(--dy-accent);

	font-size: 0.66rem;

	font-weight: 800;

	font-variant-numeric: tabular-nums;
}
</style>
