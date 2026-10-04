<template>
	<div class="dy-open-invoices" :class="`is-${layout}`">
		<div class="dy-open-invoices__strip" role="tablist" aria-label="الفواتير المفتوحة">
			<button
				v-for="inv in summaries"
				:key="inv.id"
				type="button"
				role="tab"
				:aria-selected="String(inv.id) === String(activeId)"
				class="dy-open-invoices__tab"
				:class="{ 'is-active': String(inv.id) === String(activeId) }"
				:title="`${inv.label} — ${inv.lines} صنف، ${inv.total}`"
				@click="$emit('switch', inv.id)"
			>
				<span class="dy-open-invoices__tab-label">{{ inv.label }}</span>
				<span class="dy-open-invoices__tab-meta">
					{{ inv.lines }} صنف · {{ inv.total }}
				</span>
				<span
					v-if="inv.customerName"
					class="dy-open-invoices__tab-customer"
				>
					{{ inv.customerName }}
				</span>
				<span
					role="button"
					tabindex="0"
					class="dy-open-invoices__tab-close"
					aria-label="إغلاق الفاتورة"
					:title="'إغلاق ' + inv.label"
					@click.stop="$emit('close', inv.id)"
					@keydown.enter.stop="$emit('close', inv.id)"
				>
					<FeatherIcon name="x" :size="14" />
				</span>
			</button>
			<button
				type="button"
				class="dy-open-invoices__tab is-new"
				:disabled="isFull"
				:title="
					isFull
						? `الحد الأقصى ${maxCount} فواتير`
						: 'فاتورة جديدة'
				"
				@click="$emit('new')"
			>
				<FeatherIcon name="plus" :size="16" />
				<span>جديدة</span>
			</button>
			<button
				v-if="showPark"
				type="button"
				class="dy-open-invoices__tab is-park"
				@click="$emit('park')"
			>
				<FeatherIcon name="pause-circle" :size="16" />
				<span>تعليق</span>
			</button>
		</div>
		<p v-if="isFull" class="dy-open-invoices__cap" role="status">
			بلغت الحد الأقصى ({{ maxCount }}) — أتمم أو أغلق فاتورة قبل فتح جديدة
		</p>
	</div>
</template>

<script setup>
import { computed } from "vue"

import { FeatherIcon } from "dypos-ui"
import { MAX_OPEN_INVOICES, summarizeInvoice } from "@/utils/openInvoicesPure"

const props = defineProps({
	invoices: {
		type: Array,
		default: () => [],
	},
	activeId: {
		type: [String, Number, null],
		default: null,
	},
	layout: {
		type: String,
		default: "strip",
	},
	showPark: {
		type: Boolean,
		default: false,
	},
	maxCount: {
		type: Number,
		default: MAX_OPEN_INVOICES,
	},
})

defineEmits(["new", "switch", "park", "close"])

const summaries = computed(() =>
	(Array.isArray(props.invoices) ? props.invoices : []).map((inv) => {
		const summary = summarizeInvoice(inv)
		return {
			id: summary.id,
			label: summary.label || "فاتورة",
			lines: summary.lines,
			total: summary.total,
			customerName: summary.customerName,
		}
	}),
)

const isFull = computed(
	() =>
		(Array.isArray(props.invoices) ? props.invoices.length : 0) >=
		(props.maxCount || MAX_OPEN_INVOICES),
)
</script>

<style scoped>
.dy-open-invoices__strip {
	display: flex;
	gap: 6px;
	overflow-x: auto;
	padding: 4px 2px;
}
.dy-open-invoices__tab {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 44px;
	min-height: 44px;
	padding: 6px 10px;
	border-radius: 10px;
	border: 1px solid var(--dy-border, #e5e7eb);
	background: var(--dy-surface, #fff);
	font-size: 13px;
	white-space: nowrap;
}
.dy-open-invoices__tab.is-active {
	border-color: var(--dy-brand, #1e40af);
	box-shadow: 0 0 0 1px var(--dy-brand, #1e40af);
}
.dy-open-invoices__tab-meta {
	opacity: 0.7;
	font-size: 12px;
}
.dy-open-invoices__tab-customer {
	opacity: 0.7;
	font-size: 12px;
	max-width: 120px;
	overflow: hidden;
	text-overflow: ellipsis;
}
.dy-open-invoices__tab-close {
	display: inline-flex;
	opacity: 0.6;
	border-radius: 6px;
	min-width: 24px;
	min-height: 24px;
	align-items: center;
	justify-content: center;
}
.dy-open-invoices__cap {
	font-size: 12px;
	opacity: 0.75;
	margin: 2px 4px 0;
}
</style>
