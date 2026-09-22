<template>
	<SaaSBranding lang="ar" dir="rtl">
		<!-- Accessibility Skip Links -->
		<SkipLinks v-if="showSkipLinks" />

		<!-- Network Quality Indicator -->
		<div class="dy-dashboard__network">
			<NetworkIndicator />
		</div>

		<DashboardShell
			:title="pageTitle"
			:subtitle="pageSubtitle"
			:loading="isLoading"
			:error="errorMsg"
			:has-data="hasData"
			:show-back="true"
			@back="goToPOS"
			@refresh="broadcastRefresh"
		>
			<template #filters>
				<DateRangeFilter
					v-model:from="filterFrom"
					v-model:to="filterTo"
					:loading="isLoading"
					@refresh="broadcastRefresh"
				/>
			</template>

			<!-- Loading State -->
			<div v-if="isLoading && !hasData" aria-busy="true">
				<LoadingSkeleton />
			</div>

			<!-- Error State -->
			<DashboardErrorBoundary
				v-else-if="errorMsg"
				:dashboard-id="dashboardId"
				:on-retry="handleRetry"
				@report="handleReport"
			/>

			<!-- Dashboard Content -->
			<DashboardErrorBoundary
				v-else
				:dashboard-id="dashboardId"
				:on-retry="handleRetry"
			>
				<!-- Desktop: latest invoices per general settings. -->
				<RecentInvoicesWidget :key="`recent-${refreshKey}`" />
				<ReportsRouter
					:key="refreshKey"
					:initial-tab="dashboardId"
					@tab-changed="onTabChanged"
				/>
			</DashboardErrorBoundary>
		</DashboardShell>
	</SaaSBranding>
</template>

<script setup>
import { ref, computed, onMounted, provide } from "vue"
import { useRoute, useRouter } from "vue-router"
import DashboardShell from "./dashboards/core/DashboardShell.vue"
import ReportsRouter from "./dashboards/core/ReportsRouter.vue"
import DateRangeFilter from "./ui/filters/DateRangeFilter.vue"
import SaaSBranding from "./dashboards/core/SaaSBranding.vue"
import DashboardErrorBoundary from "./dashboards/core/DashboardErrorBoundary.vue"
import SkipLinks from "./dashboards/core/SkipLinks.vue"
import NetworkIndicator from "./dashboards/core/NetworkIndicator.vue"
import LoadingSkeleton from "./dashboards/core/LoadingSkeleton.vue"
import RecentInvoicesWidget from "./dashboards/core/RecentInvoicesWidget.vue"
import { goToPOS } from "@/router"
import { logger } from "@/utils/logger"

const ARABIC_TITLES = {
	"sales-dashboard": "لوحة المبيعات",
	"finance-dashboard": "لوحة المالية",
	"inventory-dashboard": "لوحة المخزون",
	"customers-dashboard": "لوحة العملاء",
	"executive-dashboard": "لوحة التنفيذيين",
	"operations-dashboard": "لوحة العمليات",
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
const dashboardId = computed(() => route.query?.tab || "")
const pageTitle = computed(() => {
	const tab = route.query?.tab || "executive-dashboard"
	return ARABIC_TITLES[tab] || "لوحة التحكم"
})
const pageSubtitle = ref("الذكاء التجاري والتحليلات")

const refreshKey = ref(0)
const showSkipLinks = ref(true)

provide("dashboardFilters", { filterFrom, filterTo, refreshKey })

function onTabChanged(id) {
	router.replace({ query: { ...route.query, tab: id } })
}

function broadcastRefresh() {
	refreshKey.value += 1
}

function handleRetry(dashboardId) {
	isLoading.value = false
	errorMsg.value = ""
	hasData.value = true
	broadcastRefresh()
}

function handleReport(dashboardId) {
	logger?.warn?.(`Dashboard ${dashboardId} error reported`)
}

onMounted(() => {
	if (!route.query?.tab) {
		router.replace({ query: { ...route.query, tab: "executive-dashboard" } })
	}
})
</script>

<style scoped>
.dy-dashboard__network {
	position: fixed;
	top: 8px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 100;
	pointer-events: none;
}
</style>
