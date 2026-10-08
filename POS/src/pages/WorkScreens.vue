<template>
	<WorkShell
		:title="screen.label"
		:subtitle="subtitle"
		:nav-items="navItems"
		:breadcrumbs="breadcrumbs"
		:loading="loading"
		:has-data="rows.length > 0"
		:error="errorState"
		:permission-denied="deniedReason"
		@refresh="load"
	>
		<template #menu-strip>
			<WorkMenuStrip :items="menuActions" @action="onMenuAction">
				<template #end>
					<span class="work-screens__selection-count" aria-live="polite">{{ visibleRows.length }} / {{ rows.length }} سجل</span>
				</template>
			</WorkMenuStrip>
		</template>

		<template #toolbar>
			<WorkToolbar>
				<template #center>
					<WorkTabs
						:model-value="screenId"
						:tabs="tabs"
						variant="pills"
						:aria-label="screen.label"
						@update:model-value="selectScreen"
					/>
				</template>
			</WorkToolbar>

			<WorkScreenStatus
				:count="rows.length"
				:source="source"
				:loading="loading"
				:updated-at="lastLoaded"
			/>
			<WorkQuickFilters
				v-if="quickFilterField && quickFilterOptions.length"
				:label="`تصفية حسب ${quickFilterField.label}`"
				:options="quickFilterOptions"
				:model-value="quickFilterValue"
				:total="rows.length"
				@update:model-value="quickFilterValue = $event"
			/>
			<InlineAlert
				v-if="sourceNote"
				:variant="source === 'unavailable' ? 'error' : 'warning'"
				:title="source === 'unavailable' ? 'مصدر البيانات غير متاح' : 'عرض من النسخة المحلية'"
				:message="sourceNote"
			/>
		</template>

		<WorkPanel flush class="work-screens__grid-panel">
		<WorkDataGrid
			:columns="screen.columns"
			:rows="visibleRows"
			:row-key="rowKey"
			:total-items="visibleRows.length"
			:loading="loading"
			:aria-label="screen.label"
			:empty-title="emptyTitle"
			:empty-description="emptyDescription"
			striped
			selectable
			@row-click="onRowClick"
		/>
		</WorkPanel>
		<WorkStatusStrip
			:state="loading ? 'loading' : errorState || source === 'unavailable' ? 'error' : source === 'local' ? 'offline' : lastLoaded ? 'ready' : 'warning'"
			:message="loading ? 'جارٍ تحميل البيانات' : errorState ? 'فشل تحميل البيانات' : source === 'unavailable' ? 'مصدر البيانات غير متاح' : source === 'local' ? 'عرض من النسخة المحلية' : lastLoaded ? 'الشاشة جاهزة' : 'لم يتم تحميل البيانات بعد'"
			:details="errorState || sourceNote"
			:updated-at="lastLoaded"
			:items="[{ id: 'total', label: 'السجلات', value: rows.length }, { id: 'visible', label: 'المعروضة', value: visibleRows.length }]"
			sticky
		/>
	</WorkShell>
</template>

<script setup>
/**
 * شاشات العمل — الصفحة المضيفة.
 *
 * تجمع حزمة `@/components/work` (WorkShell + DataGrid + PermissionState …) في
 * سطح واحد يعمل دون اتصال: البيانات من `data/workScreens.js` بمصدر معلن،
 * والصلاحية تُشتق من دور الجلسة (افتراضي: منع) ولا تُعتمد على إخفاء العنصر
 * وحده — السيرفر يبقى fail-closed.
 */
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { getActivePinia } from "pinia"

// The kit's documented entry point (`@/components/work`) — one import keeps the
// barrel, the permission helpers and the design tokens in the graph instead of
// re-importing files piecemeal (which is how half the kit became unreachable).
import {
	providePermissions,
	WorkDataGrid,
	WorkShell,
	WorkTabs,
	WorkToolbar,
	WorkScreenStatus,
	WorkQuickFilters,
	WorkMenuStrip,
	WorkPanel,
	WorkStatusStrip,
} from "@/components/work"
import { flatWorkNav } from "@/components/work/workNav"
import { WORK_SCREENS, workScreenById } from "@/data/workScreens"
import { useIndustryProfileStore } from "@/stores/industryProfile"
import { logger } from "@/utils/logger"
import { sessionRole } from "@/data/session"
import InlineAlert from "@/components/common/InlineAlert.vue"

const log = logger.create("WorkScreens")
const route = useRoute()
const router = useRouter()

const ROW_LIMIT = 200
let loadSequence = 0

const rows = ref([])
const loading = ref(false)
const errorState = ref("")
const source = ref("")
const lastLoaded = ref(null)
const quickFilterValue = ref("")

const screenId = computed(() => String(route.query.screen ?? "invoices"))
const screen = computed(() => workScreenById(screenId.value))

/**
 * WorkShell's `navItems` is the FLAT list (`flatWorkNav`), not the grouped
 * sections: passing sections left every icon undefined, because the shell
 * renders `item.icon` per entry.
 */
const industry = getActivePinia() ? useIndustryProfileStore() : null

/**
 * Role → UI permission map (default deny).
 *
 * The kit's `usePermissions` denies anything absent from the map, so an unknown
 * role sees no work screen at all. Cashiers get read-only; everything else
 * full — except the audit ledger, which cashiers neither see nor load (the
 * loader in data/workScreens.js refuses them too, so a deep link cannot
 * bypass the tab). The server remains the authority (fail-closed) — this
 * only shapes UI.
 */
const isCashier = String(sessionRole() ?? "").toLowerCase() === "cashier"
const readonly = isCashier
providePermissions(
	Object.fromEntries(
		WORK_SCREENS.map((entry) => [
			entry.permission,
			entry.id === "audit" && isCashier ? false : readonly ? "readonly" : true,
		]),
	),
)

const navItems = computed(() =>
	flatWorkNav().filter(
		(item) =>
			!item.capability || !industry || industry.hasCapability(item.capability),
	),
)
const tabs = WORK_SCREENS.filter(
	(entry) => entry.id !== "audit" || !isCashier,
).map((entry) => ({
	id: entry.id,
	label: entry.label,
	icon: entry.icon,
}))

const breadcrumbs = computed(() => [
	{ label: "شاشات العمل", to: { name: "WorkScreens" }, current: true },
	{ label: screen.value.label },
])

/** Row identity: the server names rows; the local cache uses `id`. */
const rowKey = computed(() => {
	if (screen.value.id === "items") return "item_code"
	if (screen.value.id === "stock") return "item_code"
	return "name"
})

/** Non-empty only when the screen is actually hidden from this user. */
const deniedReason = computed(() =>
	readonly ? `صلاحية ${screen.value.permission} للقراءة فقط` : "",
)

const subtitle = computed(() =>
	readonly ? "عرض فقط لصلاحية الكاشير" : "إدارة كاملة",
)

const quickFilterField = computed(() => {
	if (!screen.value.columns.some((column) => column.key === "status")) return null
	return screen.value.columns.find((column) => column.key === "status")
})

const quickFilterOptions = computed(() => {
	if (loading.value || !quickFilterField.value) return []
	const counts = new Map()
	for (const row of rows.value) {
		const value = row?.[quickFilterField.value.key]
		if (value === null || value === undefined || value === "") continue
		const key = String(value)
		counts.set(key, (counts.get(key) ?? 0) + 1)
	}
	return [...counts.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([value, count]) => ({ value, label: value, count }))
})

const visibleRows = computed(() => {
	if (!quickFilterValue.value || !quickFilterField.value) return rows.value
	return rows.value.filter(
		(row) => String(row?.[quickFilterField.value.key] ?? "") === quickFilterValue.value,
	)
})

const menuActions = computed(() => [
	{ id: "refresh", label: "تحديث البيانات", icon: "refresh-cw", shortcut: "Alt+R", disabled: loading.value },
	{ id: "clear-filter", label: "مسح التصفية", icon: "filter", shortcut: "Alt+C", disabled: !quickFilterValue.value },
])

function onMenuAction(action) {
	if (action === "refresh") load()
	if (action === "clear-filter") quickFilterValue.value = ""
}

const sourceNote = computed(() => {
	if (source.value === "local")
		return "معروضة من النسخة المحلية (السيرفر غير متاح)"
	if (source.value === "unavailable")
		return "تعذّر الوصول للسيرفر ولا توجد نسخة محلية — البيانات غير معروفة"
	return ""
})

/**
 * Empty-state title (SAP Fiori): an empty state NAMES what is empty.
 *
 * A fixed «لا توجد بيانات» is the same sentence for invoices, items,
 * customers and stock — so the user cannot tell which screen they are on,
 * and «unavailable» (we could not read) reads identically to «empty» (we
 * read it and there is nothing). Those are different facts and must not
 * share a heading.
 */
const emptyTitle = computed(() => {
	if (source.value === "unavailable") return "تعذّر قراءة البيانات"
	// The phrase is DATA, not a template: Arabic needs a per-screen
	// subject and verb («لا توجد فواتير» vs «لا يوجد عملاء» vs «لا يوجد
	// صنف بحاجة إلى…»), and composing it from the label produces
	// broken grammar the moment a screen is added.
	return screen.value.emptyTitle
})

const emptyDescription = computed(() =>
	source.value === "unavailable"
		? "لا يمكن تأكيد خلو الشاشة من بيانات دون مصدر"
		: "لا توجد سجلات مطابقة",
)

async function load() {
	const requestId = ++loadSequence
	loading.value = true
	errorState.value = ""
	try {
		const result = await screen.value.load(ROW_LIMIT)
		if (requestId !== loadSequence) return
		rows.value = Array.isArray(result?.rows) ? result.rows : []
		source.value = String(result?.source ?? "")
		lastLoaded.value = result?.source === "unavailable" ? null : new Date()
		if (result?.error)
			log.warn("work screen served from fallback", result.error)
	} catch (error) {
		if (requestId !== loadSequence) return
		// An empty grid would read as "no invoices exist" — say it failed instead.
		rows.value = []
		source.value = "unavailable"
		lastLoaded.value = null
		errorState.value =
			error?.message || "تعذّر تحميل البيانات — تحقّق من الاتصال ثم أعد المحاولة"
		log.error("work screen load failed", error)
	} finally {
		if (requestId === loadSequence) loading.value = false
	}
}

function selectScreen(next) {
	if (!next || next === screenId.value) return
	router.replace({ name: "WorkScreens", query: { screen: next } })
}

function onRowClick(row) {
	if (screen.value.id === "items" && row?.item_code) {
		router.push({ name: "POSSale", query: { item: row.item_code } })
	}
}

watch(screenId, (next, previous) => {
	if (next !== previous) quickFilterValue.value = ""
	load()
})
onMounted(load)
</script>

<style scoped>
.work-screens__grid-panel { min-width: 0; margin-block-start: 12px; }
.work-screens__selection-count { flex: 0 0 auto; padding-inline: 10px; color: var(--dy-text-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) { .work-screens__selection-count { display: none; } }
</style>
