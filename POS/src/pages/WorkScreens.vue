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

			<!-- مصدر البيانات: قائمة فارغة ليست قياسًا (AGENTS.md invariant 9) -->
			<p
				v-if="sourceNote"
				class="work-screens__source"
				role="status"
				:data-source="source"
			>
				{{ sourceNote }}
			</p>
		</template>

		<WorkDataGrid
			:columns="screen.columns"
			:rows="rows"
			:row-key="rowKey"
			:total-items="rows.length"
			:loading="loading"
			:aria-label="screen.label"
			:empty-title="emptyTitle"
			:empty-description="emptyDescription"
			striped
			selectable
			@row-click="onRowClick"
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
} from "@/components/work"
import { flatWorkNav } from "@/components/work/workNav"
import { WORK_SCREENS, workScreenById } from "@/data/workScreens"
import { useIndustryProfileStore } from "@/stores/industryProfile"
import { logger } from "@/utils/logger"
import { sessionRole } from "@/data/session"

const log = logger.create("WorkScreens")
const route = useRoute()
const router = useRouter()

const ROW_LIMIT = 200

const rows = ref([])
const loading = ref(false)
const errorState = ref("")
const source = ref("")

const screenId = computed(() => String(route.query.screen ?? "invoices"))
const screen = computed(() => workScreenById(screenId.value))

/**
 * WorkShell's `navItems` is the FLAT list (`flatWorkNav`), not the grouped
 * sections: passing sections left every icon undefined, because the shell
 * renders `item.icon` per entry.
 */
const industry = getActivePinia() ? useIndustryProfileStore() : null
const navItems = computed(() =>
	flatWorkNav().filter(
		(item) =>
			!item.capability || !industry || industry.hasCapability(item.capability),
	),
)
const tabs = WORK_SCREENS.map((entry) => ({
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

/**
 * Role → UI permission map (default deny).
 *
 * The kit's `usePermissions` denies anything absent from the map, so an unknown
 * role sees no work screen at all. Cashiers get read-only; everything else
 * full. The server remains the authority (fail-closed) — this only shapes UI.
 */
const readonly = String(sessionRole() ?? "").toLowerCase() === "cashier"
providePermissions(
	Object.fromEntries(
		WORK_SCREENS.map((entry) => [
			entry.permission,
			readonly ? "readonly" : true,
		]),
	),
)

/** Non-empty only when the screen is actually hidden from this user. */
const deniedReason = computed(() =>
	readonly ? `صلاحية ${screen.value.permission} للقراءة فقط` : "",
)

const subtitle = computed(() =>
	readonly ? "عرض فقط لصلاحية الكاشير" : "إدارة كاملة",
)

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
	loading.value = true
	errorState.value = ""
	try {
		const result = await screen.value.load(ROW_LIMIT)
		rows.value = Array.isArray(result?.rows) ? result.rows : []
		source.value = String(result?.source ?? "")
		if (result?.error)
			log.warn("work screen served from fallback", result.error)
	} catch (error) {
		// An empty grid would read as "no invoices exist" — say it failed instead.
		rows.value = []
		source.value = "unavailable"
		errorState.value =
			error?.message || "تعذّر تحميل البيانات — تحقّق من الاتصال ثم أعد المحاولة"
		log.error("work screen load failed", error)
	} finally {
		loading.value = false
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

watch(screenId, load)
onMounted(load)
</script>

<style scoped>
.work-screens__source {
	padding: 0.5rem 0.75rem;

	font-size: 0.8rem;

	color: var(--dy-text-muted, #64748b);
	background: rgb(15 23 42 / 4%);

	border-radius: 0.5rem;
}

.work-screens__source[data-source="unavailable"] {
	color: #b45309;
	background: rgb(217 119 6 / 10%);
}
</style>
