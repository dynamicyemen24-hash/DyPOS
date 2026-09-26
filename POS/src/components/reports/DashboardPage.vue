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
import { t } from "@/utils/translation"
import { DASHBOARD_REGISTRY } from "./dashboards/index"
import { provideDashboardPeriod } from "./dashboards/core/useDashboardSource"
import RecentInvoicesWidget from "./dashboards/core/RecentInvoicesWidget.vue"

import WorkShell from "@/components/work/WorkShell.vue"
import WorkToolbar from "@/components/work/WorkToolbar.vue"
import WorkTabs from "@/components/work/WorkTabs.vue"
import WorkFilters from "@/components/work/WorkFilters.vue"
import { goToPOS } from "@/router"

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
		return route.query?.tab || "executive-dashboard"
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

const breadcrumbs = computed(() => [
	{ label: "الرئيسية", to: { name: "POSSale" } },
	{ label: "التقارير", current: true },
])

const navItems = ref([
	{
		id: "pos",
		label: "نقطة البيع",
		to: { name: "POSSale" },
		icon: "shopping-cart",
	},
	{
		id: "invoices",
		label: "الفواتير",
		to: { name: "WorkScreens", query: { screen: "invoices" } },
		icon: "file-text",
	},
	{
		id: "stock",
		label: "المخزون",
		to: { name: "StockManagement" },
		icon: "package",
	},
	{
		id: "reports",
		label: "التقارير",
		to: { name: "Reports" },
		icon: "bar-chart-2",
	},
])

function broadcastRefresh() {
	period.apply({ from: filterModel.from, to: filterModel.to })
}

function onFiltersReset() {
	period.reset()
	filterModel.from = period.from.value
	filterModel.to = period.to.value
	period.refreshKey.value += 1
}

onMounted(() => {
	if (!route.query?.tab) {
		router.replace({ query: { ...route.query, tab: "executive-dashboard" } })
	}
})
</script>

<style scoped>
/* Ensure proper tab panel visibility */
:host ::deep div[hidden] {
  display: none !important;
}
</style>