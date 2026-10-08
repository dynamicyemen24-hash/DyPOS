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
import { FeatherIcon } from "dypos-ui"

const settings = usePOSSettingsStore()
const { invoices, loading, offline, loadRecentInvoices } = useRecentInvoices()

const visibleCount = computed(() => settings.desktopRecentInvoicesCount ?? 10)

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
	<section v-if="visibleCount > 0" class="dy-recent-invoices" aria-label="آخر العمليات">
		<header class="dy-recent-invoices__header">
			<div class="dy-recent-invoices__title">
				<span class="dy-recent-invoices__icon"><FeatherIcon name="activity" :size="17" aria-hidden="true" /></span>
				<div><h2>مركز العمليات</h2><p>آخر ما يحدث في المتجر، لحظة بلحظة</p></div>
			</div>
			<div class="dy-recent-invoices__actions">
				<span class="dy-recent-invoices__live"><i /> حي</span>
				<button type="button" :disabled="loading" aria-label="تحديث العمليات" @click="loadRecentInvoices"><FeatherIcon name="refresh-cw" :size="15" /></button>
			</div>
		</header>

		<div v-if="loading && invoices.length === 0" class="dy-recent-invoices__loading" role="status">
			<span class="dy-recent-invoices__spinner" /> جارٍ بناء لوحة العمليات…
		</div>
		<div v-else-if="offline" class="dy-recent-invoices__state">
			<FeatherIcon name="wifi-off" :size="18" /><strong>وضع عدم الاتصال</strong><span>نعرض فقط ما تم حفظه محليًا.</span>
		</div>
		<div v-else-if="invoices.length === 0" class="dy-recent-invoices__state">
			<FeatherIcon name="inbox" :size="18" /><strong>لا توجد عمليات بعد</strong><span>ستظهر المبيعات الجديدة هنا تلقائيًا.</span>
		</div>

		<div v-else class="dy-recent-invoices__timeline">
			<article v-for="row in invoices" :key="row?.id || row?.name || row?.number" class="dy-operation-card">
				<div class="dy-operation-card__rail"><span /></div>
				<div class="dy-operation-card__body">
					<div class="dy-operation-card__top">
						<span class="dy-operation-card__type"><FeatherIcon name="shopping-cart" :size="13" /> بيع</span>
						<span class="dy-operation-card__time">{{ formatTime(row) }}</span>
					</div>
					<div class="dy-operation-card__main">
						<div><strong>{{ row?.number || row?.name || row?.id }}</strong><small>{{ row?.customer_name || row?.customer || "عميل نقدي" }}</small></div>
						<div class="dy-operation-card__amount">{{ formatTotal(row) }} <small>ر.س</small></div>
					</div>
					<div class="dy-operation-card__meta">
						<span :class="['dy-operation-card__status', row?.status ? 'is-known' : '']">{{ row?.status || 'مكتملة' }}</span>
						<span>معالجة آمنة</span>
					</div>
				</div>
			</article>
		</div>
	</section>
</template>

<style scoped>
.dy-recent-invoices{display:flex;flex-direction:column;gap:14px;padding:18px;border:1px solid var(--dy-border);border-radius:18px;background:var(--dy-surface);box-shadow:var(--dy-shadow-card,0 8px 28px rgb(15 23 42 / 6%));}
.dy-recent-invoices__header{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.dy-recent-invoices__title{display:flex;align-items:center;gap:10px;}.dy-recent-invoices__title h2{margin:0;font-size:16px;font-weight:800;color:var(--dy-text);}.dy-recent-invoices__title p{margin:3px 0 0;color:var(--dy-text-muted);font-size:11px;}
.dy-recent-invoices__icon{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:var(--dy-primary-soft);color:var(--dy-primary);}
.dy-recent-invoices__actions{display:flex;align-items:center;gap:8px;}.dy-recent-invoices__actions button{display:grid;place-items:center;width:32px;height:32px;border:1px solid var(--dy-border);border-radius:9px;background:var(--dy-surface);cursor:pointer;}.dy-recent-invoices__live{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;background:var(--dy-success-soft);color:var(--dy-success);font-size:10px;font-weight:800;}.dy-recent-invoices__live i{width:6px;height:6px;border-radius:50%;background:currentColor;}
.dy-recent-invoices__timeline{display:grid;gap:8px;max-height:420px;overflow:auto;padding-inline-end:4px;scrollbar-width:thin;}
.dy-operation-card{display:grid;grid-template-columns:16px 1fr;min-height:76px;border:1px solid var(--dy-border);border-radius:13px;background:var(--dy-bg-sunken);transition:transform 140ms ease,border-color 140ms ease,background 140ms ease;}.dy-operation-card:hover{transform:translateY(-1px);border-color:var(--dy-accent-border);background:var(--dy-surface);}
.dy-operation-card__rail{position:relative;display:flex;justify-content:center;padding-top:18px;}.dy-operation-card__rail:before{content:"";position:absolute;top:0;bottom:0;width:1px;background:var(--dy-border);}.dy-operation-card__rail span{position:relative;z-index:1;width:7px;height:7px;border-radius:50%;background:var(--dy-success);box-shadow:0 0 0 3px var(--dy-success-soft);}
.dy-operation-card__body{padding:11px 13px;min-width:0;}.dy-operation-card__top,.dy-operation-card__main,.dy-operation-card__meta{display:flex;align-items:center;justify-content:space-between;gap:10px;}.dy-operation-card__type{display:inline-flex;align-items:center;gap:5px;color:var(--dy-primary);font-size:10px;font-weight:800;}.dy-operation-card__time{color:var(--dy-text-muted);font-size:10px;white-space:nowrap;}.dy-operation-card__main{margin-top:7px;}.dy-operation-card__main strong{display:block;color:var(--dy-text);font-size:13px;}.dy-operation-card__main small{display:block;margin-top:2px;color:var(--dy-text-muted);font-size:10px;}.dy-operation-card__amount{color:var(--dy-text);font-size:14px;font-weight:900;white-space:nowrap;}.dy-operation-card__amount small{display:inline;font-size:9px;}.dy-operation-card__meta{margin-top:8px;font-size:9px;color:var(--dy-text-muted);}.dy-operation-card__status{padding:3px 7px;border-radius:999px;background:var(--dy-info-soft);color:var(--dy-info);font-weight:700;}.dy-operation-card__status.is-known{background:var(--dy-success-soft);color:var(--dy-success);}
.dy-recent-invoices__state,.dy-recent-invoices__loading{display:flex;align-items:center;justify-content:center;gap:8px;min-height:110px;color:var(--dy-text-muted);font-size:12px;}.dy-recent-invoices__state{flex-wrap:wrap;}.dy-recent-invoices__state strong{color:var(--dy-text);}.dy-recent-invoices__state span{flex-basis:100%;text-align:center;font-size:10px;}.dy-recent-invoices__spinner{width:18px;height:18px;border:2px solid var(--dy-border);border-top-color:var(--dy-primary);border-radius:50%;animation:dy-spin .8s linear infinite;}@keyframes dy-spin{to{transform:rotate(360deg)}}
@media(max-width:640px){.dy-recent-invoices{padding:14px;}.dy-operation-card__amount{font-size:12px;}}
@media(prefers-reduced-motion:reduce){.dy-operation-card,.dy-recent-invoices__spinner{animation:none;transition:none;}}
</style>
