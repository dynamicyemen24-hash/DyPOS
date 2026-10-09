<script setup>
/**
 * البيانات المرجعية — شاشة إدارة القوائم العالمية (v53).
 *
 * مصدرها الخادم دائمًا مع ذاكرة محفوظة محليًا (S2) وبيان provenance صريح (S1):
 * «من الخادم» / «نسخة محفوظة» / «غير متاح» — لا قائمة فارغة تُعرض كقياس.
 * الكتابة (إضافة/تعديل/تعطيل/حذف) عبر dypos.client.insert / set_value /
 * delete_doc، والصلاحية تُفرض على الخادم (ADMIN/MANAGER) وتُخفى هنا للآخرين.
 */
import { computed, onMounted, ref, watch } from "vue"
import router from "@/router"
import { Badge, Button, FeatherIcon } from "dypos-ui"
import { methodCall } from "@/utils/methodClient"
import { sessionRole } from "@/data/session"
import {
	REFERENCE_DOCTYPES,
	useReferenceData,
} from "@/composables/useReferenceData"

const DOCTYPE_LABELS = Object.freeze({
	Country: "الدول",
	Region: "المناطق",
	City: "المدن",
	Language: "اللغات",
	Timezone: "المناطق الزمنية",
	BusinessSector: "قطاعات الأعمال",
	Category: "التصنيفات",
	TaxType: "أنواع الضرائب",
	Tax: "الضرائب",
	UomCategory: "فئات وحدات القياس",
	UnitOfMeasure: "وحدات القياس",
	UomConversion: "تحويلات الوحدات",
	PaymentTerm: "شروط الدفع",
	ReturnReason: "أسباب المرتجع",
	PurchaseReturnReason: "أسباب مرتجع المشتريات",
	SaleType: "أنواع البيع",
	SalesChannel: "قنوات البيع",
	LoyaltyTier: "شرائح الولاء",
	CustomerType: "أنواع العملاء",
	CustomerGroup: "مجموعات العملاء",
	SupplierType: "أنواع الموردين",
	SupplierGroup: "مجموعات الموردين",
	AccountTemplate: "قوالب الحسابات",
	AccountTemplateSet: "أطقم قوالب الحسابات",
	RoundingRule: "قواعد التقريب",
	ProductAttribute: "خصائص المنتجات",
})

const doctype = ref("Country")
const canManage = computed(() =>
	["ADMIN", "MANAGER"].includes(String(sessionRole() || "").toUpperCase()),
)

const { rows, source, error, loading, refresh } = useReferenceData(doctype)

watch(doctype, () => {
	showCreate.value = false
	message.value = ""
	refresh()
})

onMounted(() => {
	refresh()
})

const message = ref("")
const messageTone = ref("")
const showCreate = ref(false)
const form = ref({ name: "", name_ar: "", name_en: "" })
const saving = ref(false)
const editingName = ref(null)
const editForm = ref({ name_ar: "", name_en: "" })

const sourceLabel = computed(() => {
	if (source.value === "server") return "من الخادم"
	if (source.value === "local") return "نسخة محفوظة محليًا"
	return "غير متاح"
})

function notice(text, tone = "info") {
	message.value = text
	messageTone.value = tone
}

function fail(e) {
	notice(
		e?.message || "تعذر تنفيذ العملية. أعد المحاولة بعد التحقق من الاتصال.",
		"error",
	)
}

async function createRow() {
	const name = form.value.name.trim()
	if (!name) {
		notice("أدخل المعرف (name) للسجل الجديد.", "error")
		return
	}
	saving.value = true
	try {
		await methodCall("dypos.client.insert", {
			doctype: doctype.value,
			values: {
				name,
				name_ar: form.value.name_ar.trim(),
				name_en: form.value.name_en.trim(),
				is_active: 1,
			},
		})
		showCreate.value = false
		form.value = { name: "", name_ar: "", name_en: "" }
		notice("تمت إضافة السجل.", "success")
		await refresh()
	} catch (e) {
		fail(e)
	} finally {
		saving.value = false
	}
}

function startEdit(row) {
	editingName.value = row.name
	editForm.value = { name_ar: row.name_ar || "", name_en: row.name_en || "" }
}

async function saveEdit(name) {
	saving.value = true
	try {
		await methodCall("dypos.client.set_value", {
			doctype: doctype.value,
			name,
			fieldname: {
				name_ar: editForm.value.name_ar.trim(),
				name_en: editForm.value.name_en.trim(),
			},
		})
		editingName.value = null
		notice("تم حفظ التعديل.", "success")
		await refresh()
	} catch (e) {
		fail(e)
	} finally {
		saving.value = false
	}
}

async function toggleActive(row) {
	saving.value = true
	try {
		await methodCall("dypos.client.set_value", {
			doctype: doctype.value,
			name: row.name,
			fieldname: { is_active: row.is_active === 1 ? 0 : 1 },
		})
		notice(
			row.is_active === 1 ? "تم تعطيل السجل." : "تم تفعيل السجل.",
			"success",
		)
		await refresh()
	} catch (e) {
		fail(e)
	} finally {
		saving.value = false
	}
}

async function retireRow(row) {
	if (
		!window.confirm(
			`تقاعد «${row.name_ar || row.name}»؟ يبقى السجل موجودًا معطّلًا (لا حذف فعلي).`,
		)
	)
		return
	saving.value = true
	try {
		await methodCall("dypos.delete_doc", {
			doctype: doctype.value,
			name: row.name,
		})
		notice("تم تقاعد السجل (is_active=0).", "success")
		await refresh()
	} catch (e) {
		fail(e)
	} finally {
		saving.value = false
	}
}
</script>

<template>
	<main class="refdata" dir="rtl">
		<header class="head">
			<div>
				<span class="eyebrow">DyPOS · البيانات الأساسية</span>
				<h1>البيانات المرجعية</h1>
				<p>
					قوائم عالمية يقرأها النظام كله (ضرائب، وحدات، أسباب مرتجع، شروط
					دفع…) — تُدار هنا مرة واحدة.
				</p>
			</div>
			<div class="head-actions">
				<span
					class="source"
					:class="{
						server: source === 'server',
						local: source === 'local',
						down: source === 'unavailable',
					}"
					data-testid="refdata-source"
				>
					<i></i>{{ sourceLabel }}
				</span>
				<Button variant="ghost" size="sm" icon="arrow-right" @click="router.back()" />
			</div>
		</header>

		<div class="toolbar">
			<label class="pick">
				القائمة
				<select v-model="doctype" data-testid="refdata-doctype">
					<option
						v-for="d in REFERENCE_DOCTYPES"
						:key="d"
						:value="d"
					>
						{{ DOCTYPE_LABELS[d] }} ({{ d }})
					</option>
				</select>
			</label>
			<Button
				variant="secondary"
				size="sm"
				icon="refresh-cw"
				:disabled="loading"
				@click="refresh"
			>
				{{ loading ? "جاري التحميل…" : "تحديث" }}
			</Button>
			<Button
				v-if="canManage"
				variant="primary"
				size="sm"
				icon="plus"
				@click="showCreate = !showCreate"
			>
				إضافة سجل
			</Button>
		</div>

		<p
			v-if="!canManage"
			class="hint"
		>
			العرض متاح لصلاحيتك، والكتابة تحتاج مدير أو مسؤول.
		</p>

		<p
			v-if="message"
			class="notice"
			:class="messageTone"
			role="status"
			data-testid="refdata-notice"
		>
			{{ message }}
		</p>

		<section
			v-if="source === 'local'"
			class="banner local"
		>
			<FeatherIcon name="clock" :size="16" />
			نسخة محفوظة على هذا الجهاز — قد لا تعكس آخر تعديل من الخادم. أعد المحاولة
			عند عودة الاتصال.
		</section>

		<section
			v-if="source === 'unavailable'"
			class="banner down"
			data-testid="refdata-unavailable"
		>
			<FeatherIcon name="wifi-off" :size="16" />
			<div>
				<strong>تعذر تحميل القائمة.</strong>
				<span>
					{{ error?.message || "الخادم غير متاح ولا توجد نسخة محفوظة." }}
					تحقق من الاتصال ثم أعد المحاولة.
				</span>
			</div>
			<Button
				variant="secondary"
				size="sm"
				icon="refresh-cw"
				:disabled="loading"
				@click="refresh"
			>
				إعادة المحاولة
			</Button>
		</section>

		<section
			v-if="showCreate"
			class="card create"
			data-testid="refdata-create"
		>
			<strong>إضافة سجل جديد — {{ DOCTYPE_LABELS[doctype] }}</strong>
			<div class="grid">
				<label>
					المعرف (name)
					<input
						v-model="form.name"
						dir="ltr"
						maxlength="64"
						placeholder="YE"
						:disabled="saving"
						data-testid="refdata-new-name"
					/>
				</label>
				<label>
					الاسم بالعربية
					<input
						v-model="form.name_ar"
						maxlength="128"
						:disabled="saving"
						data-testid="refdata-new-ar"
					/>
				</label>
				<label>
					الاسم بالإنجليزية
					<input
						v-model="form.name_en"
						dir="ltr"
						maxlength="128"
						:disabled="saving"
					/>
				</label>
			</div>
			<div class="actions">
				<Button
					variant="primary"
					size="sm"
					:disabled="saving || !form.name.trim()"
					@click="createRow"
				>
					{{ saving ? "جاري الحفظ…" : "حفظ" }}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					:disabled="saving"
					@click="showCreate = false"
				>
					إلغاء
				</Button>
			</div>
		</section>

		<section class="card">
			<div
				v-if="!loading && source === 'server' && !rows.length"
				class="empty"
				data-testid="refdata-empty"
			>
				لا توجد سجلات في هذه القائمة بعد.
				<span v-if="canManage">استخدم «إضافة سجل» لإنشاء الأول.</span>
			</div>

			<table
				v-else-if="rows.length"
				data-testid="refdata-table"
			>
				<thead>
					<tr>
						<th>المعرف</th>
						<th>الاسم بالعربية</th>
						<th>الاسم بالإنجليزية</th>
						<th>الحالة</th>
						<th v-if="canManage">إجراءات</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="row in rows"
						:key="String(row.name)"
						:class="{ inactive: row.is_active !== 1 }"
					>
						<td dir="ltr">{{ row.name }}</td>
						<td>
							<template v-if="editingName === row.name">
								<input
									v-model="editForm.name_ar"
									maxlength="128"
									:disabled="saving"
									data-testid="refdata-edit-ar"
								/>
							</template>
							<template v-else>{{ row.name_ar || "—" }}</template>
						</td>
						<td>
							<template v-if="editingName === row.name">
								<input
									v-model="editForm.name_en"
									dir="ltr"
									maxlength="128"
									:disabled="saving"
								/>
							</template>
							<template v-else>{{ row.name_en || "—" }}</template>
						</td>
						<td>
							<Badge :theme="row.is_active === 1 ? 'green' : 'gray'">
								{{ row.is_active === 1 ? "فعّال" : "معطّل" }}
							</Badge>
						</td>
						<td
							v-if="canManage"
							class="row-actions"
						>
							<template v-if="editingName === row.name">
								<Button
									variant="primary"
									size="sm"
									:disabled="saving"
									@click="saveEdit(row.name)"
								>
									حفظ
								</Button>
								<Button
									variant="ghost"
									size="sm"
									:disabled="saving"
									@click="editingName = null"
								>
									إلغاء
								</Button>
							</template>
							<template v-else>
								<Button
									variant="ghost"
									size="sm"
									icon="edit-2"
									:disabled="saving"
									@click="startEdit(row)"
								/>
								<Button
									variant="ghost"
									size="sm"
									:disabled="saving"
									@click="toggleActive(row)"
								>
									{{ row.is_active === 1 ? "تعطيل" : "تفعيل" }}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									icon="trash-2"
									:disabled="saving"
									@click="retireRow(row)"
								/>
							</template>
						</td>
					</tr>
				</tbody>
			</table>
		</section>
	</main>
</template>

<style scoped>
.refdata {
	min-height: 100dvh;
	padding: 32px;
	display: grid;
	gap: 18px;
	background: var(--dy-bg);
	color: var(--dy-text);
	max-width: 1280px;
	margin: auto;
	align-content: start;
}
.head {
	display: flex;
	justify-content: space-between;
	gap: 20px;
	align-items: center;
}
.eyebrow {
	font-size: 12px;
	color: var(--dy-accent);
	font-weight: 700;
}
.head h1 {
	margin: 4px 0;
	font-size: 26px;
	color: var(--dy-text-strong);
}
.head p {
	margin: 0;
	color: var(--dy-text-muted);
	font-size: 13px;
}
.head-actions {
	display: flex;
	align-items: center;
	gap: 10px;
}
.source {
	font-size: 12px;
	padding: 7px 10px;
	border: 1px solid var(--dy-border);
	border-radius: 999px;
}
.source i {
	display: inline-block;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: currentColor;
	margin-inline-end: 6px;
}
.source.server {
	color: var(--dy-success-contrast, #15803d);
}
.source.local {
	color: var(--dy-warning-contrast);
}
.source.down {
	color: var(--dy-danger-contrast);
}
.toolbar {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
	align-items: end;
}
.pick {
	display: grid;
	gap: 6px;
	font-size: 12px;
	color: var(--dy-text-muted);
	min-width: 280px;
}
select,
input {
	font: inherit;
	color: var(--dy-text);
	background: var(--dy-bg);
	border: 1px solid var(--dy-border);
	border-radius: 10px;
	padding: 10px;
}
.hint {
	margin: 0;
	font-size: 12px;
	color: var(--dy-text-muted);
}
.notice {
	margin: 0;
	padding: 10px 12px;
	border-radius: 9px;
	font-size: 13px;
	border: 1px solid var(--dy-border);
	background: var(--dy-surface);
}
.notice.error {
	color: var(--dy-danger-contrast);
	border-color: var(--dy-danger-contrast);
}
.notice.success {
	color: var(--dy-success-contrast, #15803d);
}
.banner {
	display: flex;
	gap: 10px;
	align-items: center;
	padding: 12px;
	border-radius: 10px;
	font-size: 13px;
	border: 1px solid var(--dy-border);
}
.banner div {
	display: grid;
	gap: 2px;
	flex: 1;
}
.banner span {
	color: var(--dy-text-muted);
	font-size: 12px;
}
.banner.local {
	background: color-mix(in srgb, var(--dy-warning-contrast) 8%, transparent);
}
.banner.down {
	background: color-mix(in srgb, var(--dy-danger-contrast) 8%, transparent);
}
.card {
	background: var(--dy-surface);
	border: 1px solid var(--dy-border);
	border-radius: 16px;
	padding: 18px;
	display: grid;
	gap: 14px;
	overflow-x: auto;
}
.create .grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12px;
}
.create label {
	display: grid;
	gap: 6px;
	font-size: 12px;
	color: var(--dy-text-muted);
}
.actions {
	display: flex;
	gap: 8px;
}
.empty {
	padding: 28px;
	text-align: center;
	color: var(--dy-text-muted);
	border: 1px dashed var(--dy-border);
	border-radius: 10px;
	display: grid;
	gap: 6px;
}
table {
	width: 100%;
	border-collapse: collapse;
	font-size: 13px;
}
th,
td {
	text-align: start;
	padding: 10px;
	border-bottom: 1px solid var(--dy-border);
}
th {
	color: var(--dy-text-muted);
	font-size: 12px;
}
tr.inactive td:not(:nth-child(4)) {
	opacity: 0.55;
}
.row-actions {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
}
@media (max-width: 700px) {
	.refdata {
		padding: 18px;
	}
	.head {
		align-items: flex-start;
		flex-direction: column;
	}
	.create .grid {
		grid-template-columns: 1fr;
	}
}
</style>
