<!--
  =============================================================================
  DyPOS — Desktop Recent Invoices Widget v1.32.0
  Shows the latest invoices on the desktop. Count comes from general
  settings (desktop_recent_invoices_count, 0 hides the widget).
  Mount anywhere: dashboards today, POS workspace tomorrow.
  =============================================================================
-->

<script setup>
import { computed, onMounted } from "vue"
import { useRecentInvoices } from "@/composables/useRecentInvoices"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { FeatherIcon } from "frappe-ui"

const settings = usePOSSettingsStore()
const { invoices, loading, offline, loadRecentInvoices } = useRecentInvoices()

const visibleCount = computed(
	() => settings.desktopRecentInvoicesCount ?? 10,
)

function formatTotal(row) {
	const n = Number(row?.total ?? row?.grand_total ?? 0)
	try {
		return n.toLocaleString("ar-SA", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})
	} catch {
		return n.toFixed(2)
	}
}

function formatTime(row) {
	const raw = row?.created_at || row?.posting_date || row?.creation
	if (!raw) return ""
	try {
		return new Date(raw).toLocaleString("ar-SA", {
			dateStyle: "medium",
			timeStyle: "short",
		})
	} catch {
		return ""
	}
}

onMounted(() => {
	if (visibleCount.value > 0) {
		void loadRecentInvoices()
	}
})
</script>

<template>
	<section
		v-if="visibleCount > 0"
		class="dy-recent-invoices"
		aria-label="آخر الفواتير"
	>
		<header class="dy-recent-invoices__header">
			<FeatherIcon name="file-text" :size="18" aria-hidden="true" />
			<h2>آخر الفواتير</h2>
			<button
				type="button"
				class="dy-recent-invoices__refresh"
				:disabled="loading"
				aria-label="تحديث القائمة"
				@click="loadRecentInvoices"
			>
				<FeatherIcon name="refresh-cw" :size="15" />
			</button>
		</header>

		<p v-if="loading && invoices.length === 0" class="dy-recent-invoices__note">
			جارٍ تحميل آخر الفواتير…
		</p>
		<p v-else-if="offline" class="dy-recent-invoices__note">
			غير متصل — تعذر جلب آخر الفواتير الآن.
		</p>
		<p v-else-if="invoices.length === 0" class="dy-recent-invoices__note">
			لا توجد فواتير بعد.
		</p>

		<ul v-else class="dy-recent-invoices__list">
			<li
				v-for="row in invoices"
				:key="row?.id || row?.name || row?.number"
				class="dy-recent-invoices__row"
			>
				<span class="dy-recent-invoices__number">
					{{ row?.number || row?.name || row?.id }}
				</span>
				<span class="dy-recent-invoices__customer">
					{{ row?.customer_name || row?.customer || "عميل نقدي" }}
				</span>
				<span class="dy-recent-invoices__total">
					{{ formatTotal(row) }}
				</span>
				<span class="dy-recent-invoices__time">
					{{ formatTime(row) }}
				</span>
				<span
					v-if="row?.status"
					class="dy-recent-invoices__status"
				>
					{{ row.status }}
				</span>
			</li>
		</ul>
	</section>
</template>

<style scoped>
.dy-recent-invoices {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 16px 18px;
	border-radius: var(--dy-radius-xl);
	background: var(--dy-surface, #fff);
	box-shadow: 0 2px 12px rgb(0 0 0 / 0.06);
}

.dy-recent-invoices__header {
	display: flex;
	align-items: center;
	gap: 8px;
}

.dy-recent-invoices__header h2 {
	margin: 0;
	font-size: 1rem;
	flex: 1;
}

.dy-recent-invoices__refresh {
	display: inline-flex;
	border: 0;
	background: transparent;
	cursor: pointer;
	opacity: 0.65;
	padding: 4px;
}

.dy-recent-invoices__refresh:hover {
	opacity: 1;
}

.dy-recent-invoices__note {
	margin: 0;
	font-size: 0.85rem;
	opacity: 0.7;
}

.dy-recent-invoices__list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
}

.dy-recent-invoices__row {
	display: flex;
	align-items: baseline;
	gap: 10px;
	padding: 8px 2px;
	border-top: 1px solid rgb(0 0 0 / 0.07);
	font-size: 0.83rem;
}

.dy-recent-invoices__number {
	font-weight: 700;
	white-space: nowrap;
}

.dy-recent-invoices__customer {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0.85;
}

.dy-recent-invoices__total {
	font-weight: 700;
	white-space: nowrap;
}

.dy-recent-invoices__time {
	opacity: 0.6;
	font-size: 0.75rem;
	white-space: nowrap;
}

.dy-recent-invoices__status {
	font-size: 0.72rem;
	opacity: 0.7;
}
</style>
