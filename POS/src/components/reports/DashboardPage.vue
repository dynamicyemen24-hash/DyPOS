<template>
  <WorkShell
    :title="pageTitle"
    :subtitle="pageSubtitle"
    :nav-items="navItems"
    :breadcrumbs="breadcrumbs"
    :loading="isLoading"
    :error="errorMsg"
    :has-data="hasData"
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
        <template #end>
          <WorkActions
            :overflow-actions="overflowActions"
          />
        </template>
      </WorkToolbar>

      <WorkFilters
        v-model="filterModel"
        :fields="filterFields"
        :auto-apply="true"
        @apply="onFiltersApply"
        @reset="onFiltersReset"
      />
    </template>

    <WorkErrorState
      v-if="errorMsg"
      :title="'errorLoadingDashboard'"
      :message="errorMsg"
      @retry="handleRetry"
    />

    <WorkLoadingSkeleton
      v-else-if="isLoading && !hasData"
      :kpi-count="4"
      :chart-count="3"
      :show-table="true"
      :table-columns="6"
      :table-rows="5"
    />

    <div v-else>
      <RecentInvoicesWidget :key="`recent-${refreshKey}`" />
      <div
        v-for="tab in dashboardTabs"
        :key="tab.id"
        :hidden="dashboardId !== tab.id"
      >
        <Suspense>
          <template #default>
            <component :is="tab.component" :key="tab.id" />
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
import { ref, computed, onMounted, provide, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { t } from "@/utils/translation"
import { DASHBOARD_REGISTRY } from "./dashboards/index"
import RecentInvoicesWidget from "./dashboards/core/RecentInvoicesWidget.vue"

import WorkShell from "@/components/work/WorkShell.vue"
import WorkToolbar from "@/components/work/WorkToolbar.vue"
import WorkTabs from "@/components/work/WorkTabs.vue"
import WorkFilters from "@/components/work/WorkFilters.vue"
import WorkErrorState from "@/components/work/WorkErrorState.vue"
import WorkLoadingSkeleton from "@/components/work/WorkLoadingSkeleton.vue"
import WorkActions from "@/components/work/WorkActions.vue"
import { goToPOS } from "@/router"
import { logger } from "@/utils/logger"

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

const today = new Date()
const filterFrom = ref(
	new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
)
const filterTo = ref(today.toISOString().slice(0, 10))

const isLoading = ref(false)
const errorMsg = ref("")
const hasData = ref(true)
const refreshKey = ref(0)

const filterModel = reactive({ from: filterFrom.value, to: filterTo.value })

const filterFields = computed(() => [
	{ key: "from", label: "من تاريخ", type: "date", model: filterFrom },
	{ key: "to", label: "إلى تاريخ", type: "date", model: filterTo },
])

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

const overflowActions = ref([
	{
		id: "export",
		label: "تصدير التقرير",
		icon: "download",
		handler: () => notifyInfo("تصدير", "قيد التطوير"),
	},
	{
		id: "print",
		label: "طباعة",
		icon: "printer",
		handler: () => notifyInfo("طباعة", "قيد التطوير"),
	},
	{
		id: "schedule",
		label: "جدولة التقرير",
		icon: "calendar",
		handler: () => notifyInfo("جدولة", "قيد التطوير"),
	},
])

function broadcastRefresh() {
	refreshKey.value += 1
}

function handleRetry() {
	isLoading.value = false
	errorMsg.value = ""
	hasData.value = true
	broadcastRefresh()
}

function onFiltersApply(f) {
	filterFrom.value = f.from || filterFrom.value
	filterTo.value = f.to || filterTo.value
	broadcastRefresh()
}

function onFiltersReset() {
	filterFrom.value = new Date(today.getFullYear(), today.getMonth(), 1)
		.toISOString()
		.slice(0, 10)
	filterTo.value = today.toISOString().slice(0, 10)
	broadcastRefresh()
}

onMounted(() => {
	if (!route.query?.tab) {
		router.replace({ query: { ...route.query, tab: "executive-dashboard" } })
	}
})

provide("dashboardFilters", { filterFrom, filterTo, refreshKey })
</script>

<style scoped>
/* Ensure proper tab panel visibility */
:host ::deep div[hidden] {
  display: none !important;
}
</style>