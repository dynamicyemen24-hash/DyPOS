<template>
  <WorkShell
    class="dy-home-shell"
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
          <div class="home-toolbar">
            <div class="home-toolbar__brand" aria-label="DyPOS">
              <div class="home-toolbar__logo"><img  :src="DyPOSLogo" alt="" /></div>
              <div>
                <strong>DyPOS</strong>
                <span>نظام نقاط البيع الذكي</span>
              </div>
            </div>
            <WorkTabs
              v-model="dashboardId"
              :tabs="dashboardTabs"
              variant="pills"
              aria-label="لوحات التشغيل"
            />
          </div>
        </template>
        <WorkFilters
          :model-value="filterModel"
          :fields="filterFields"
          :auto-apply="false"
          @update:model-value="updateFilterModel"
          @apply="onFiltersApply"
          @reset="onFiltersReset"
        />
      </WorkToolbar>
    </template>

    <main class="home">
      <section class="home-hero" aria-labelledby="home-title">
        <div class="home-hero__glow home-hero__glow--one" aria-hidden="true"></div>
        <div class="home-hero__glow home-hero__glow--two" aria-hidden="true"></div>
        <div class="home-hero__copy">
          <span class="home-kicker"><FeatherIcon name="zap" :size="14" aria-hidden="true" /> {{ todayLabel }}</span>
          <h1 id="home-title">مركز تشغيل المتجر</h1>
          <p>ابدأ البيع، راقب العمليات، وأدر المخزون من مساحة عمل موحّدة — ببيانات الأنظمة المتصلة ومصادرها الفعلية.</p>
          <div class="home-hero__actions">
            <ActionButton type="button" class="home-primary" @click="goToPOS">
              <FeatherIcon name="shopping-cart" :size="17" aria-hidden="true" /> بدء بيع جديد
            </ActionButton>
            <ActionButton type="button" class="home-secondary" @click="goToStockManagement">
              <FeatherIcon name="package" :size="17" aria-hidden="true" /> إدارة المخزون
            </ActionButton>
          </div>
        </div>
        <div class="home-hero__identity">
          <div class="home-hero__mark"><img :src="DyPOSLogo" alt="DyPOS" /></div>
          <strong>تشغيل ذكي. بيع أسرع.</strong>
          <span>واجهة عربية RTL مصممة للعمل اليومي.</span>
        </div>
      </section>

      <section class="home-modules" aria-label="أدوات النظام">
        <router-link
          v-for="module in modules"
          :key="module.id"
          class="home-module"
          :class="{ 'home-module--primary': module.primary }"
          :to="module.to ?? { name: 'WorkScreens', query: { screen: module.screen } }"
        >
          <span class="home-module__icon"><FeatherIcon :name="module.icon" :size="21" aria-hidden="true" /></span>
          <span><strong>{{ module.title }}</strong><small>{{ module.sub }}</small></span>
          <FeatherIcon class="home-module__arrow" name="arrow-left" :size="17" aria-hidden="true" />
        </router-link>
      </section>

      <div
        v-if="contextItems.length"
        class="home-context"
        role="status"
        aria-label="سياق التشغيل"
      >
        <span
          v-for="item in contextItems"
          :key="`${item.icon}-${item.label}`"
          class="home-context__chip"
        >
          <FeatherIcon :name="item.icon" :size="14" aria-hidden="true" />
          {{ item.label }}
        </span>
      </div>

      <section class="home-grid">
        <div class="home-panel home-panel--wide">
          <div class="home-panel__head">
            <div><span class="home-panel__eyebrow">العمليات الأخيرة</span><h2>آخر المبيعات</h2></div>
            <router-link :to="{ name: 'WorkScreens', query: { screen: 'invoices' } }">عرض الكل <FeatherIcon name="arrow-left" :size="14" /></router-link>
          </div>
          <RecentInvoicesWidget />
        </div>

        <aside class="home-panel home-panel--side">
          <div class="home-panel__head">
            <div><span class="home-panel__eyebrow">المتابعة</span><h2>الوصول السريع</h2></div>
          </div>
          <div class="home-quick">
            <ActionButton class="home-quick__item" type="button" @click="dashboardId = 'executive-dashboard'">
              <span><FeatherIcon name="bar-chart-2" :size="18" /></span><b>مؤشرات المتجر</b><small>الأداء اليومي</small>
            </ActionButton>
            <router-link class="home-quick__item" :to="{ name: 'StockManagement' }">
              <span><FeatherIcon name="alert-triangle" :size="18" /></span><b>حالة المخزون</b><small>فحص الأصناف</small>
            </router-link>
            <router-link class="home-quick__item" :to="{ name: 'Settings' }">
              <span><FeatherIcon name="sliders" :size="18" /></span><b>تهيئة النظام</b><small>الإعدادات</small>
            </router-link>
          </div>
        </aside>
      </section>

      <section class="home-analytics" aria-label="لوحة التحليلات">
        <div v-for="tab in dashboardTabs" :key="tab.id" v-show="visitedTabs.includes(tab.id)">
          <Suspense>
            <template #default>
              <component :is="tab.id === dashboardId ? tab.component : null" :key="`${tab.id}-${period.refreshKey}`" />
            </template>
            <template #fallback>
              <div class="home-loading" role="status"><div class="home-spinner" aria-hidden="true"></div><span>{{ t('loadingDashboard') }}</span></div>
            </template>
          </Suspense>
        </div>
      </section>
    </main>
  </WorkShell>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted } from "vue"
import DyPOSLogo from "@/assets/DyPOSLogo.png"
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
import {
	filterDashNav,
	filterHomeModules,
	opsContextItems,
} from "@/utils/accessPolicy"
import { sessionRole, sessionUser } from "@/data/session"
import { posContext } from "@/utils/posContext"
import { shiftState } from "@/composables/useShift"

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

const navItems = computed(() =>
	filterDashNav({ role: sessionRole(), queueEnabled: queueEnabled.value }),
)

/** البلاطات من جدول السياسة — العرض مربوط بالدور والقدرات فعلًا. */
const modules = computed(() =>
	filterHomeModules({ role: sessionRole(), queueEnabled: queueEnabled.value }),
)

/** شريط سياق التشغيل: من يعمل وأين — من الجلسة والسياق الفعليين. */
const contextItems = computed(() =>
	opsContextItems({
		user: sessionUser(),
		role: sessionRole(),
		tenantName: posContext.tenantName,
		branchName: posContext.branchName,
		shiftOpen: shiftState.value?.isOpen,
	}),
)

const broadcastRefresh = () => {
  window.dispatchEvent(new CustomEvent("dypos:dashboard-refresh"))
}

const updateFilterModel = (values = {}) => {
  Object.assign(filterModel, values)
}

const onFiltersApply = (values = filterModel) => {
  const from = String(values?.from ?? filterModel.from ?? "")
  const to = String(values?.to ?? filterModel.to ?? "")
  if (from && to && from > to) {
    // Keep the selected range valid; do not issue misleading dashboard queries.
    filterModel.from = period.from.value
    filterModel.to = period.to.value
    return
  }
  period.apply({ from, to })
  broadcastRefresh()
}

const onFiltersReset = () => {
  period.reset()
  filterModel.from = period.from.value
  filterModel.to = period.to.value
  broadcastRefresh()
}

onMounted(() => {
  broadcastRefresh()
})
</script><style scoped>
.dy-home-shell :deep(.work-shell__content) { padding: 0; }
.home { display: grid; gap: 16px; padding: 4px 0 28px; }
.dy-home-shell :deep(.work-filters) { margin-block: 0 14px; }
.home a:focus-visible,.home button:focus-visible { outline: 3px solid var(--dy-primary); outline-offset: 3px; }
.home-toolbar { width: 100%; display:flex; align-items:center; justify-content:center; gap:24px; }
.home-toolbar__brand { display:flex; align-items:center; gap:9px; margin-inline-end:auto; }
.home-toolbar__logo { width:34px; height:34px; display:grid; place-items:center; border:1px solid var(--dy-border); border-radius:10px; background:var(--dy-surface); overflow:hidden; }
.home-toolbar__logo img { width:26px; height:26px; object-fit:contain; }
.home-toolbar__brand strong,.home-toolbar__brand span { display:block; }
.home-toolbar__brand strong { color:var(--dy-text); font-size:13px; font-weight:850; }
.home-toolbar__brand span { color:var(--dy-text-muted); font-size:10px; margin-top:2px; }
.home-hero { position:relative; min-height:230px; overflow:hidden; display:flex; align-items:center; justify-content:space-between; gap:28px; padding:32px 36px; border:1px solid var(--dy-border); border-radius:20px; background:linear-gradient(125deg,var(--dy-surface) 0%,var(--dy-bg-sunken) 58%,var(--dy-primary-soft) 100%); isolation:isolate; box-shadow:var(--dy-shadow-card); }
.home-hero__copy { position:relative; z-index:2; max-width:700px; }
.home-kicker { display:inline-flex; align-items:center; gap:7px; color:var(--dy-primary); font-size:12px; font-weight:800; }
.home-hero h1 { margin:10px 0 7px; color:var(--dy-text); font-size:clamp(28px,4vw,44px); line-height:1.08; letter-spacing:-.035em; font-weight:900; }
.home-hero p { margin:0; color:var(--dy-text-muted); font-size:14px; line-height:1.7; max-width:610px; }
.home-hero__actions { display:flex; gap:9px; margin-top:22px; }
.home-primary,.home-secondary { min-height:44px; border-radius:11px; padding-inline:17px; font-weight:800; }
.home-primary { background:var(--dy-primary); color:var(--dy-primary-contrast); border:1px solid var(--dy-primary); }
.home-secondary { background:var(--dy-surface); color:var(--dy-text); border:1px solid var(--dy-border-strong); }
.home-hero__identity { position:relative; z-index:2; width:190px; display:grid; gap:7px; text-align:center; color:var(--dy-text-muted); font-size:11px; }
.home-hero__mark { width:92px; height:92px; margin:auto; display:grid; place-items:center; border-radius:24px; background:var(--dy-surface); border:1px solid var(--dy-border); box-shadow:var(--dy-shadow-card); }
.home-hero__mark img { width:68px; height:68px; object-fit:contain; }
.home-hero__identity strong { color:var(--dy-text); font-size:13px; }
.home-hero__glow { position:absolute; border-radius:999px; filter:blur(4px); opacity:.55; pointer-events:none; z-index:-1; }
.home-hero__glow--one { width:300px; height:300px; inset-inline-end:10%; inset-block-start:-180px; background:var(--dy-primary); opacity:.10; }
.home-hero__glow--two { width:220px; height:220px; inset-inline-start:-100px; inset-block-end:-120px; background:var(--dy-info); opacity:.08; }
.home-modules { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
.home-module { min-height:94px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; padding:16px; border:1px solid var(--dy-border); border-radius:14px; background:var(--dy-surface); color:inherit; text-decoration:none; transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease; }
.home-module:hover { transform:translateY(-2px); border-color:var(--dy-accent-border); box-shadow:var(--dy-shadow-card); }
.home-module--primary { background:var(--dy-primary); border-color:var(--dy-primary); color:var(--dy-primary-contrast); }
.home-module__icon { width:40px; height:40px; display:grid; place-items:center; border-radius:12px; background:var(--dy-primary-soft); color:var(--dy-primary); }
.home-module--primary .home-module__icon { background:rgb(255 255 255 / .15); color:inherit; }
.home-module strong,.home-module small { display:block; }
.home-module strong { font-size:12px; font-weight:850; }
.home-module small { margin-top:4px; color:var(--dy-text-muted); font-size:10px; line-height:1.45; }
.home-module--primary small { color:rgb(255 255 255 / .76); }
.home-module__arrow { color:var(--dy-text-muted); }
.home-module--primary .home-module__arrow { color:inherit; }
/* شريط سياق التشغيل: من يعمل وأين — شرائح حالة لا أزرار. */
.home-context { display:flex; flex-wrap:wrap; gap:8px; }
.home-context__chip { display:inline-flex; align-items:center; gap:6px; padding:7px 11px; border:1px solid var(--dy-border); border-radius:999px; background:var(--dy-surface); color:var(--dy-text-muted); font-size:12px; font-weight:700; }
.home-grid { display:grid; grid-template-columns:minmax(0,2fr) minmax(280px,1fr); gap:14px; }
.home-panel { min-width:0; border:1px solid var(--dy-border); border-radius:18px; background:var(--dy-surface); box-shadow:var(--dy-shadow-card); padding:18px; }
.home-panel__head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.home-panel__eyebrow { display:block; color:var(--dy-primary); font-size:10px; font-weight:800; }
.home-panel h2 { margin:3px 0 0; color:var(--dy-text); font-size:17px; font-weight:850; }
.home-panel__head a { display:inline-flex; align-items:center; gap:5px; color:var(--dy-primary); font-size:11px; font-weight:800; text-decoration:none; }
.home-quick { display:grid; gap:8px; }
.home-quick__item { display:grid; grid-template-columns:34px 1fr; column-gap:10px; row-gap:1px; align-items:center; min-height:58px; padding:8px; border:1px solid var(--dy-border); border-radius:12px; background:var(--dy-bg-sunken); color:inherit; text-align:start; text-decoration:none; cursor:pointer; font:inherit; }
.home-quick__item:hover { border-color:var(--dy-accent-border); }
.home-quick__item > span { grid-row:1 / span 2; width:34px; height:34px; display:grid; place-items:center; border-radius:9px; background:var(--dy-primary-soft); color:var(--dy-primary); }
.home-quick__item b { font-size:11px; color:var(--dy-text); }
.home-quick__item small { font-size:10px; color:var(--dy-text-muted); }
.home-analytics { min-width:0; }
.home-loading { min-height:180px; display:grid; place-items:center; align-content:center; gap:10px; color:var(--dy-text-muted); }
.home-spinner { width:28px; height:28px; border:3px solid var(--dy-border); border-top-color:var(--dy-primary); border-radius:50%; animation:home-spin .8s linear infinite; }
@keyframes home-spin { to { transform:rotate(360deg); } }
@media (max-width:1100px) { .home-modules { grid-template-columns:repeat(2,minmax(0,1fr)); } .home-hero__identity { width:150px; } }
@media (max-width:760px) { .home { gap:12px; } .home-hero { min-height:auto; padding:24px 20px; } .home-hero__identity { display:none; } .home-hero__actions { display:grid; grid-template-columns:1fr; } .home-modules { grid-template-columns:repeat(2,minmax(0,1fr)); } .home-module { min-height:92px; padding:12px; } .home-grid { grid-template-columns:1fr; } .home-toolbar__brand { display:none; } }
@media (max-width:480px) { .home-modules { grid-template-columns:1fr; } .home-hero h1 { font-size:28px; } .home-panel { padding:14px; } }
@media (prefers-reduced-motion: reduce) { .home-module { transition:none; } .home-module:hover { transform:none; } .home-spinner { animation:none; } }
</style>