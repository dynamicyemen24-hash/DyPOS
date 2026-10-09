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
		no-content-padding
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

		<div class="work-screens">
			<!-- شريط الإجراءات: تحديث/تصدير/طباعة — اختصارات حقيقية، لا زر زينة -->
			<WorkMenuStrip :items="menuItems" @select="onMenuSelect">
				<template #end>
					<SyncStatusIndicator passive />
				</template>
			</WorkMenuStrip>

			<WorkPanel flush class="work-screens__panel">
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
			</WorkPanel>

			<!-- شريط الحالة: مرقّم من الحالة الحقيقية للتحميل/المصدر، لا من المزاج -->
			<WorkStatusStrip
				pinned
				:status="stripStatus"
				:metrics="stripMetrics"
				:last-update="lastUpdate"
			/>
		</div>

		<!-- تفاصيل الصف: سحب جانبي يُظهر حقول الشاشة الحالية بأسمائها -->
		<Drawer v-model="detailOpen" :title="detailTitle" side="end">
			<dl v-if="detailRow" class="work-screens__detail">
				<div
					v-for="col in screen.columns"
					:key="col.key"
					class="work-screens__detail-row"
				>
					<dt class="work-screens__detail-label">{{ t(col.label) }}</dt>
					<dd class="work-screens__detail-value">
						<StatusBadge
							v-if="col.key === 'status'"
							:status="detailRow[col.key]"
						/>
						<template v-else>{{ detailValue(col, detailRow) }}</template>
					</dd>
				</div>
			</dl>
		</Drawer>
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
	StatusBadge,
	WorkDataGrid,
	WorkMenuStrip,
	WorkPanel,
	WorkShell,
	WorkStatusStrip,
	WorkTabs,
	WorkToolbar,
} from "@/components/work"
import { Drawer } from "dypos-ui"
import { flatWorkNav } from "@/components/work/workNav"
import { WORK_SCREENS, workScreenById } from "@/data/workScreens"
import SyncStatusIndicator from "@/components/pos/SyncStatusIndicator.vue"
import { useIndustryProfileStore } from "@/stores/industryProfile"
import { logger } from "@/utils/logger"
import { t } from "@/utils/translation"
import { sessionRole } from "@/data/session"

const log = logger.create("WorkScreens")
const route = useRoute()
const router = useRouter()

const ROW_LIMIT = 200

const rows = ref([])
const loading = ref(false)
const errorState = ref("")
const source = ref("")
/** آخر تحديث ناجح فقط — الفشل لا يمحو آخر معلومة صحيحة. */
const lastUpdate = ref(/** @type {Date|null} */ (null))
const detailOpen = ref(false)
const detailRow = ref(/** @type {object|null} */ (null))

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

/* ── شريط القائمة: إجراءات حقيقية على هذه الشاشة فقط ────────────────── */

const menuItems = computed(() => [
	{
		id: "refresh",
		label: "تحديث",
		icon: "refresh-cw",
		disabled: loading.value,
	},
	{
		id: "export",
		label: "تصدير CSV",
		icon: "download",
		shortcut: "ctrl+s",
		// لا تصدير لما لا قُرئ: صف 0 ليس ملفًا (S1).
		disabled: rows.value.length === 0,
	},
	{
		id: "print",
		label: "طباعة",
		icon: "printer",
		disabled: rows.value.length === 0,
	},
])

function onMenuSelect(item) {
	if (item.id === "refresh") load()
	else if (item.id === "export") exportCsv()
	else if (item.id === "print") window.print()
}

function csvCell(value) {
	return `"${String(value ?? "").replace(/"/g, '""')}"`
}

/**
 * تصدير CSV حقيقي من أعمدة الشاشة الحالية: BOM عربي لكسب إكسل،
 * ودوال `format` نفسها المعروضة (لا تنسيق ثانٍ ينحرف عن الشبكة).
 */
function exportCsv() {
	const columns = screen.value.columns
	const lines = [
		columns.map((column) => csvCell(column.label)).join(","),
		...rows.value.map((row) =>
			columns
				.map((column) =>
					csvCell(
						typeof column.format === "function"
							? column.format(row)
							: row[column.key],
					),
				)
				.join(","),
		),
	]
	const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
		type: "text/csv;charset=utf-8",
	})
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = `${screen.value.id}-${new Date().toISOString().slice(0, 10)}.csv`
	link.click()
	setTimeout(() => URL.revokeObjectURL(url), 0)
}

/* ── شريط الحالة: مشتق من قياس حقيقي، لا من المزاج ──────────────────── */

const stripStatus = computed(() => {
	if (errorState.value || source.value === "unavailable") return "error"
	if (loading.value) return "working"
	if (source.value === "local") return "offline"
	return "ready"
})

/**
 * العدّاد يظهر فقط بعد قراءة معلَنة: 0 قبل أول تحميل أو بعد فشل القراءة
 * كان "قياسًا" باليونان (S1) — والغائب ليس صفِّرًا.
 */
const stripMetrics = computed(() => {
	if (
		loading.value ||
		!source.value ||
		source.value === "unavailable" ||
		errorState.value
	)
		return []
	return [{ label: "سجل", value: rows.value.length }]
})

/* ── تفاصيل الصف (Drawer) ────────────────────────────────────────────── */

const detailTitle = computed(() => {
	if (!detailRow.value) return screen.value.label
	const key = detailRow.value[rowKey.value] ?? ""
	return key ? `${screen.value.label} — ${key}` : screen.value.label
})

function detailValue(column, row) {
	if (typeof column.format === "function")
		return String(column.format(row) ?? "—")
	return String(row[column.key] ?? "—")
}

async function load() {
	loading.value = true
	errorState.value = ""
	try {
		const result = await screen.value.load(ROW_LIMIT)
		rows.value = Array.isArray(result?.rows) ? result.rows : []
		source.value = String(result?.source ?? "")
		lastUpdate.value = new Date()
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
		return
	}
	// باقي الشاشات: تفاصيل الصف في لوحة جانبية (لا نقر ميت S5).
	detailRow.value = row
	detailOpen.value = true
}

watch(screenId, load)
onMounted(load)
</script>

<style scoped>
.work-screens {
	display: flex;
	flex-direction: column;
	min-height: 100%;
}

.work-screens__panel {
	margin: var(--dy-space-4, 16px);
	flex: 1 1 auto;
	min-height: 0;
}

/* اللوحة هي البطاقة؛ الشبكة الداخلية بلا إطار مزدوج. */
.work-screens__panel :deep(.work-data-grid) {
	border: 0;
	border-radius: 0;
}

.work-screens__source {
	padding: 0.5rem 0.75rem;

	font-size: 0.8rem;

	color: var(--dy-text-muted);
	background: var(--dy-bg-sunken);

	border-radius: 0.5rem;
}

.work-screens__source[data-source="unavailable"] {
	color: var(--dy-warning);
	background: var(--dy-warning-soft);
}

/* تفاصيل الصف */
.work-screens__detail {
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 0;
}

.work-screens__detail-row {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--dy-space-4, 16px);
	padding: 10px 0;
	border-block-end: 1px solid var(--dy-border, #e2e8f0);
}

.work-screens__detail-row:last-child {
	border-block-end: 0;
}

.work-screens__detail-label {
	margin: 0;
	color: var(--dy-text-muted, #64748b);
	font-size: 0.8125rem;
	flex-shrink: 0;
}

.work-screens__detail-value {
	margin: 0;
	color: var(--dy-text-strong, #0f172a);
	font-size: 0.875rem;
	font-weight: 500;
	text-align: end;
	min-width: 0;
	overflow-wrap: anywhere;
}
</style>
