<template>
  <WorkShell
    :title="pageTitle"
    :subtitle="pageSubtitle"
    :nav-items="navItems"
    :breadcrumbs="breadcrumbs"
    :has-data="true"
    @refresh="broadcastRefresh"
  >
    <template #toolbar>
      <WorkToolbar>
        <template #center>
          <WorkTabs
            v-model="dashboardId"
            :tabs="dashboardTabs"
            variant="pills"
            :aria-label="'التقارير'"
          />
        </template>
      </WorkToolbar>

      <WorkFilters
        v-model="filterModel"
        :fields="filterFields"
        :auto-apply="true"
        @apply="broadcastRefresh"
        @reset="onFiltersReset"
      />
    </template>

    <div>
      <section class="dashboard-welcome" aria-labelledby="dashboard-welcome-title">
        <div class="dashboard-welcome__content">
          <span class="dashboard-welcome__eyebrow">
            <FeatherIcon name="sunrise" :size="15" aria-hidden="true" />
            {{ todayLabel }}
          </span>
          <h2 id="dashboard-welcome-title">مرحبًا بك في مركز التشغيل</h2>
          <p>تابع أداء متجرك واتخذ الخطوة التالية من مكان واحد.</p>
        </div>
        <div class="dashboard-welcome__actions">
          <ActionButton type="button" class="dashboard-action dashboard-action--primary" @click="goToPOS">
            <FeatherIcon name="shopping-cart" :size="17" aria-hidden="true" />
            بدء بيع جديد
          </button>
          <ActionButton type="button" class="dashboard-action" @click="goToStockManagement">
            <FeatherIcon name="package" :size="17" aria-hidden="true" />
            فحص المخزون
          </button>
        </div>
      </section>
      <section class="dashboard-shortcuts" aria-label="اختصارات التشغيل والحالة">
        <ActionButton
          type="button"
          class="dashboard-shortcut dashboard-shortcut--action"
          aria-label="فتح لوحة التنفيذيين ومؤشرات المتجر"
          @click="dashboardId = 'executive-dashboard'"
        >
          <span class="dashboard-shortcut__icon dashboard-shortcut__icon--blue">
            <FeatherIcon name="bar-chart-2" :size="17" aria-hidden="true" />
          </span>
          <span><strong>مؤشرات المتجر</strong><small>افتح لوحة التنفيذيين لمراجعة الأداء</small></span>
        </ActionButton>
        <div class="dashboard-shortcut" aria-label="البيع دون اتصال">
          <span class="dashboard-shortcut__icon dashboard-shortcut__icon--green">
            <FeatherIcon name="wifi-off" :size="17" aria-hidden="true" />
          </span>
          <span><strong>البيع دون اتصال</strong><small>تُحفظ المبيعات محليًا؛ وتبدأ المزامنة عند الطلب</small></span>
        </div>
        <router-link
          class="dashboard-shortcut dashboard-shortcut--action"
          :to="{ name: 'WorkScreens', query: { screen: 'invoices' } }"
          aria-label="فتح شاشة الفواتير"
        >
          <span class="dashboard-shortcut__icon dashboard-shortcut__icon--amber">
            <FeatherIcon name="file-text" :size="17" aria-hidden="true" />
          </span>
          <span><strong>الفواتير</strong><small>راجع عمليات البيع وسجل الفواتير</small></span>
        </router-link>
      </section>

      <RecentInvoicesWidget :key="`recent-${period.refreshKey}`" />
      <div
        v-for="tab in dashboardTabs"
        :key="tab.id"
        v-show="visitedTabs.includes(tab.id)"
      >
        <Suspense>
          <template #default>
            <component
              :is="tab.id === dashboardId ? tab.component : null"
              :key="`${tab.id}-${period.refreshKey}`"
            />
          </template>
          <template #fallback>
            <div class="flex items-center justify-center py-20" role="status">
              <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" aria-hidden="true" />
              <span class="sr-only">{{ t('loadingDashboard') }}</span>
            </div>
          </template>
        </Suspense>
      </div>
    </div>
  </WorkShell>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import { ActionButton, FeatherIcon } from "dypos-ui"
import { t } from "@/utils/translation"
import { DASHBOARD_REGISTRY } from "./dashboards/index"
import { provideDashboardPeriod } from "./dashboards/core/useDashboardSource"
import RecentInvoicesWidget from "./dashboards/core/RecentInvoicesWidget.vue"

import WorkShell from "@/components/work/WorkShell.vue"
import WorkToolbar from "@/components/work/WorkToolbar.vue"
import WorkTabs from "@/components/work/WorkTabs.vue"
import WorkFilters from "@/components/work/WorkFilters.vue"
import { goToPOS, goToStockManagement } from "@/router"
import { resolveDashboardId } from "./dashboards/core/dashboardTab"
import { useQueueCapability } from "@/utils/queueCapability"

const ARABIC_TITLES = {
	"executive-dashboard": "لوحة التنفيذيين",
	"sales-summary": "لوحة المبيعات",
	"finance-overview": "لوحة المالية",
	"inventory-intelligence": "لوحة المخزون",
	"customer-intelligence": "لوحة العملاء",
	"operations-overview": "لوحة العمليات",
}

const route = useRoute()
const router = useRouter()

const period = provideDashboardPeriod()
const { enabled: queueEnabled } = useQueueCapability()

const filterModel = reactive({
	from: period.from.value,
	to: period.to.value,
})

const filterFields = [
	{ key: "from", label: "من تاريخ", type: "date" },
	{ key: "to", label: "إلى تاريخ", type: "date" },
]

const dashboardTabs = computed(() =>
	DASHBOARD_REGISTRY.map((d) => ({
		id: d.id,
		label: ARABIC_TITLES[d.id] || d.name,
		icon: d.icon,
		component: d.component,
	})),
)

const dashboardId = computed({
	get() {
		return resolveDashboardId(
			route.query?.tab,
			dashboardTabs.value.map((tab) => tab.id),
			"executive-dashboard",
		)
	},
	set(val) {
		router.replace({ query: { ...route.query, tab: val } })
	},
})

const pageTitle = computed(
	() => ARABIC_TITLES[dashboardId.value] || "لوحة التحكم",
)

// Only dashboards the user actually opened are mounted. Rendering all six
// behind :hidden made every panel run its onMounted fetch AND start its own
// realtime poller, so opening the reports page fired six round-trips (and six
// timers) to show one visible dashboard.
const visitedTabs = ref([dashboardId.value])
watch(
	dashboardId,
	(id) => {
		if (id && !visitedTabs.value.includes(id))
			visitedTabs.value = [...visitedTabs.value, id]
	},
	{ immediate: true },
)
const pageSubtitle = ref("الذكاء التجاري والتحليلات")
const todayLabel = computed(() =>
	new Intl.DateTimeFormat("ar-SA", {
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(new Date()),
)

const breadcrumbs = computed(() => [
	{ label: "الرئيسية", to: { name: "Reports" } },
	{ label: "التقارير", current: true },
])

const navItems = computed(() => {
	const items = [
		{ id: "pos", label: "نقطة البيع", to: { name: "POSSale" }, icon: "shopping-cart" },
		{ id: "invoices", label: "الفواتير", to: { name: "WorkScreens", query: { screen: "invoices" } }, icon: "file-text" },
		{ id: "stock", label: "المخزون", to: { name: "StockManagement" }, icon: "package" },
		{ id: "reports", label: "التقارير", to: { name: "Reports" }, icon: "bar-chart-2" },
		{ id: "work", label: "شاشات العمل", to: { name: "WorkScreens" }, icon: "layers" },
		{ id: "settings", label: "الإعدادات", to: { name: "Settings" }, icon: "settings" },
	]
	if (queueEnabled.value) {
		items.push({ id: "queue", label: "الطوابير", to: { name: "Queue" }, icon: "users" })
	}
	return items
})

const broadcastRefresh = () => {
  window.dispatchEvent(new CustomEvent("dypos:dashboard-refresh"))
}

const onFiltersReset = () => {
  filterModel.from = period.from.value
  filterModel.to = period.to.value
  broadcastRefresh()
}

onMounted(() => {
  broadcastRefresh()
})
</script>

<style scoped>
.dashboard-welcome {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 20px;
	margin-bottom: 16px;
	padding: 20px 24px;
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-xl, 18px);
	background: linear-gradient(115deg, var(--dy-primary-soft) 0%, var(--dy-bg-sunken) 58%, var(--dy-info-soft) 100%);
}

.dashboard-welcome__eyebrow {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	color: var(--dy-primary);
	font-size: 12px;
	font-weight: 700;
}

.dashboard-welcome h2 {
	margin: 8px 0 4px;
	color: var(--dy-text);
	font-size: clamp(20px, 2vw, 24px);
	font-weight: 800;
}

.dashboard-welcome p {
	margin: 0;
	color: var(--dy-text-muted);
	font-size: 13px;
}

.dashboard-welcome__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 9px;
}

.dashboard-action {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	min-height: 42px;
	padding: 0 15px;
	border: 1px solid var(--dy-border-strong);
	border-radius: 10px;
	background: var(--dy-surface);
	color: var(--dy-text);
	font-size: 13px;
	font-weight: 700;
	cursor: pointer;
}

.dashboard-action:hover {
	border-color: var(--dy-accent-border);
	background: var(--dy-bg-sunken);
}

.dashboard-action--primary {
	border-color: var(--dy-primary);
	background: var(--dy-primary);
	color: var(--dy-primary-contrast);
}

.dashboard-action--primary:hover {
	background: var(--dy-primary-hover);
}

.dashboard-shortcuts {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12px;
	margin-bottom: 22px;
}

.dashboard-shortcut {
	display: flex;
	align-items: center;
	gap: 11px;
	min-height: 68px;
	padding: 12px 14px;
	border: 1px solid var(--dy-border);
	border-radius: 13px;
	background: var(--dy-surface);
}

.dashboard-shortcut--action {
	width: 100%;
	color: inherit;
	font: inherit;
	text-align: start;
	text-decoration: none;
	cursor: pointer;
	transition: border-color var(--dy-motion-fast, 140ms) var(--dy-ease-standard, ease), box-shadow var(--dy-motion-fast, 140ms) var(--dy-ease-standard, ease), transform var(--dy-motion-fast, 140ms) var(--dy-ease-standard, ease);
}

.dashboard-shortcut--action:hover {
	border-color: var(--dy-accent-border);
	box-shadow: var(--dy-shadow-card);
	transform: translateY(-1px);
}

.dashboard-shortcut--action:focus-visible {
	outline: 3px solid var(--dy-ring);
	outline-offset: 2px;
}

.dashboard-shortcut > span:last-child {
	display: grid;
	gap: 3px;
}

.dashboard-shortcut strong {
	color: var(--dy-text);
	font-size: 12px;
}

.dashboard-shortcut small {
	color: var(--dy-text-muted);
	font-size: 11px;
	line-height: 1.45;
}

.dashboard-shortcut__icon {
	display: grid;
	flex: 0 0 34px;
	width: 34px;
	height: 34px;
	place-items: center;
	border-radius: 10px;
}

.dashboard-shortcut__icon--blue {
	background: var(--dy-primary-soft);
	color: var(--dy-primary);
}

.dashboard-shortcut__icon--green {
	background: var(--dy-success-soft);
	color: var(--dy-success);
}

.dashboard-shortcut__icon--amber {
	background: var(--dy-warning-soft);
	color: var(--dy-warning);
}

@media (max-width: 760px) {
	.dashboard-welcome {
		align-items: stretch;
		flex-direction: column;
		padding: 20px;
	}

	.dashboard-welcome h2 {
		font-size: 20px;
	}

	.dashboard-welcome__actions,
	.dashboard-action {
		width: 100%;
	}

	.dashboard-action {
		justify-content: center;
	}

	.dashboard-shortcuts {
		grid-template-columns: 1fr;
	}
}

/* Ensure proper tab panel visibility */
:host ::deep div[hidden] {
  display: none !important;
}
</style>