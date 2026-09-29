<script setup>
/**
 * الأرصدة الافتتاحية — شاشة الإدارة.
 *
 * ## لماذا هذه الشاشة موجودة
 *
 * رصيد افتتاحي هو ما يحمله المحل INTO سنة مالية: ما على العملاء، النقد في
 * الصندوق، المخزون القائم. محلٌ مستورد أو جديد بلا فواتير سابقة لا يملك تاريخًا،
 * فبدون هذه الشاشة تقرأ تقارير الذمم والأعمار وقيمة المخزون صفرًا واثقًا
 * (`0.00`) عن فترة قبل أول فاتورة — وصفرٌ يعني "غير معروف" لا "لا يوجد".
 *
 * ## مصدر البيانات — لا يوجد مصدر مُلفَّف
 *
 * هذه الشاشة تقرأ عبر `methodCall` إلى verbo مخصص، ولا يوجد لها مرآة محلية
 * (قاعدة IndexedDB لا تحوي جدول الأرصدة). لذلك المصدر إما `server` أو
 * `unavailable`، ولا نعرض أبدًا قائمة فارغة بوصفها قياسًا: إن تعذّر الوصول
 * للسيرفر نعلن ذلك صراحةً. هذا هو نفس عقد المصدر (provenance) الذي تفرضه
 * `methodGetListWithSource`، والاختصار هنا ليس ترفًا.
 *
 * ## الأرقام
 *
 * السيرفر يعيد `amount_minor` (وحدات صغرى صحيحة) ومعه `amount` بالوحدات
 * الكبرى. نعرض `amount` مباشرة عبر `formatCurrencySafe` ولا نقسم على 100 مرة
 * أخرى — التحويل مرتين هو الخطأ الذي يضخّم دفتر الأستاذ بمئة ضعف.
 * شريط الملخص يعيد `amountMinor`، فنحوّله مرّة واحدة عند العرض عبر `toMajor`.
 *
 * ## الاستيراد
 *
 * الاستيراد يمرّ بجولة تحقّق (`dryRun`) أولًا ويُعرض للمستخدم عدد الصفوف
 * الصالحة وأرقام أسطر الفاشلة قبل أي كتابة. الرصيد الافتتاحي لمسة واحدة في
 * دفتر لا رجعة فيها، وملف فيه خطأان يجب أن يطبّق الباقي ويُبلّغ عن الخطين.
 */
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import {
	Button,
	Dialog,
	Input,
	SelectInput,
	FeatherIcon,
	Badge,
} from "dypos-ui"

import { methodCall } from "@/utils/methodClient"
import { formatCurrencySafe } from "@/utils/currency"
import { toMajor } from "@/utils/money"
import { sessionRole } from "@/data/session"

/** Verbos مُسجَّلة في server/routes/opening-balance-methods.js. */ const V = {
	list: "DyPOS.api.opening_balances.get_opening_balances",
	save: "DyPOS.api.opening_balances.save_opening_balance",
	remove: "DyPOS.api.opening_balances.delete_opening_balance",
	importCsv: "DyPOS.api.opening_balances.import_opening_balances",
	exportCsv: "DyPOS.api.opening_balances.export_opening_balances",
	template: "DyPOS.api.opening_balances.opening_balance_template",
}

/** تسميات عربية لأنواع الحساب — مطابقة لـ ACCOUNT_TYPE_LABELS في السيرفر. */
const TYPE_LABELS = {
	customer: "عميل",
	cash: "نقدية",
	stock: "مخزون",
	supplier: "مورّد",
}
const TYPE_ORDER = ["customer", "cash", "stock", "supplier"]

/** السنة المالية الافتراضية: الحالية. */
const currentYear = () => new Date().getFullYear()
const yearOptions = () => {
	const now = currentYear()
	// الحالية + السابقة + التالية: ما يمكن فتحه واقعيًا دون غيّر السنة.
	return [now + 1, now, now - 1, now - 2].map((y) => ({
		label: String(y),
		value: String(y),
	}))
}

const router = useRouter()
const fiscalYear = ref(String(currentYear()))
const accountType = ref("")
const rows = ref([])
const summary = ref(null)
const loading = ref(false)
const source = ref("server")
const errorState = ref("")

/** الكتابة مسموحة للمدير والمشرف فقط — نفس قاعدة السيرفر (وهي الحَكَم الحقيقي). */
const canWrite = computed(() =>
	["ADMIN", "MANAGER"].includes(String(sessionRole() || "").toUpperCase()),
)

const typeFilterOptions = computed(() => [
	{ label: "كل الأنواع", value: "" },
	...TYPE_ORDER.map((t) => ({ label: TYPE_LABELS[t], value: t })),
])

const summaryCards = computed(() =>
	TYPE_ORDER.map((type) => {
		const bucket = summary.value?.[type] || { amountMinor: 0, count: 0 }
		return {
			type,
			label: TYPE_LABELS[type],
			// amountMinor → major مرة واحدة فقط، عند العرض.
			amount: formatCurrencySafe(toMajor(bucket.amountMinor)),
			count: bucket.count,
		}
	}),
)

const totalCount = computed(() => rows.value.length)

/**
 * سجلات مخزون بلا ربط بصنف — تُقاس وتُعلن، ولا تُترك "للاحقًا".
 *
 * رصيد مخزون بلا `product_id` هو حركة لا يمكن اعتمادها ولا وصلُها بجدول الأصناف:
 * رقمٌ بلا صنف. إخفاؤه في الشاشة لا يجعله صحيحًا، بل يجعل المدير يظن أن الأرشيف
 * سليم. لذلك يُعدّ هنا ويُعرض بنداء صريح (`unlinkedStockBanner`).
 */
const unlinkedStock = computed(
	() => rows.value.filter((r) => r.account_type === "stock" && !r.product_id).length,
)

const unlinkedStockBanner = computed(() => {
	if (source.value !== "server" || !unlinkedStock.value) return ""
	return `${unlinkedStock.value} سجل مخزون بلا ربط بصنف في جدول الأصناف — حركته لا يمكن اعتمادها حتى يُربط.`
})

/** شريط المصدر: لا نسمح بقائمة فارغة بلا تفسير. */
const sourceNote = computed(() => {
	if (source.value === "unavailable")
		return "تعذّر الوصول للسيرفر — الأرصدة غير معروفة الآن، ولم تُعرض أصفارًا تقديرية."
	return ""
})

const emptyDescription = computed(() =>
	source.value === "unavailable"
		? "لا يمكن تأكيد خلو السنة من أرصدة افتتاحية دون مصدر."
		: "لا توجد أرصدة افتتاحية مسجّلة لهذه السنة.",
)

/** يقرأ الأرصدة ويعترف بمصدرها. */
async function load() {
	loading.value = true
	errorState.value = ""
	try {
		const res = await methodCall(V.list, {
			fiscalYear: fiscalYear.value,
			accountType: accountType.value,
		})
		const data = res?.message || {}
		rows.value = Array.isArray(data.rows) ? data.rows : []
		summary.value = data.summary || null
		source.value = "server"
	} catch (error) {
		// لا نحوّل الفشل إلى "لا توجد بيانات".
		source.value = "unavailable"
		rows.value = []
		summary.value = null
		errorState.value = String(error?.message || "تعذّر تحميل الأرصدة الافتتاحية")
	} finally {
		loading.value = false
	}
}

/* ── إضافة / تعديل ────────────────────────────────────────────────────── */

const showEditor = ref(false)
const saving = ref(false)
const editorError = ref("")
const form = ref({
	accountType: "customer",
	accountId: "",
	accountCode: "",
	accountName: "",
	amount: "",
	quantity: "",
	notes: "",
	productId: "",
})

/**
 * مرجع الصنف في الجدول: UUID طويل. نعرض منه ما يميّز السطر ونُبقي الكامل في
 * `title`، فلا يضيع مرجع ولا يتضخم عمود.
 */
function shortId(id) {
	const s = String(id || "")
	return s.length > 12 ? `${s.slice(0, 8)}…` : s
}

function openCreate() {
	editorError.value = ""
	form.value = {
		accountType: accountType.value || "customer",
		accountId: "",
		accountCode: "",
		accountName: "",
		amount: "",
		quantity: "",
		notes: "",
		productId: "",
	}
	showEditor.value = true
}

function openEdit(row) {
	editorError.value = ""
	form.value = {
		accountType: row.account_type,
		accountId: row.account_id || "",
		accountCode: row.account_code || "",
		accountName: row.account_name || "",
		// نعرض الوحدات الكبرى كما هي؛ لا نحوّل ولا نضرب.
		amount: String(row.amount ?? toMajor(row.amount_minor) ?? ""),
		quantity: String(row.quantity ?? ""),
		notes: row.notes || "",
		productId: row.product_id || "",
	}
	showEditor.value = true
}

async function save() {
	editorError.value = ""
	// نترك التحقق للسيرفر ليذكر رقم السطر والحقل بدل تكرار القواعد هنا.
	if (!String(form.value.amount).trim()) {
		editorError.value =
			"المبلغ مطلوب — لا يمكن تركه فارغًا (صفر صريح إن كان الرصيد صفرًا فعلًا)"
		return
	}
	saving.value = true
	try {
		await methodCall(V.save, {
			fiscalYear: fiscalYear.value,
			accountType: form.value.accountType,
			accountId: form.value.accountId,
			accountCode: form.value.accountCode,
			accountName: form.value.accountName,
			amount: form.value.amount,
			quantity: form.value.quantity,
			notes: form.value.notes,
			// مرجع الصنف يُرسل لأرصدة المخزون فقط؛ السيرفر يرفضه على غيرها
			// (وهو الحَكَم)، فلا نرسل قيمة لا معنى لها لحساب عميل أو نقدية.
			productId: form.value.accountType === "stock" ? form.value.productId : "",
		})
		showEditor.value = false
		await load()
	} catch (error) {
		editorError.value = String(error?.message || "تعذّر الحفظ")
	} finally {
		saving.value = false
	}
}

async function removeRow(row) {
	errorState.value = ""
	try {
		await methodCall(V.remove, { id: row.id })
		await load()
	} catch (error) {
		errorState.value = String(error?.message || "تعذّر الحذف")
	}
}

/* ── استيراد / تصدير ──────────────────────────────────────────────────── */

const csvText = ref("")
const importReport = ref(null)
const importing = ref(false)
const fileInput = ref(null)

function onFile(event) {
	const file = event?.target?.files?.[0]
	if (!file) return
	const reader = new FileReader()
	reader.onload = () => {
		csvText.value = String(reader.result || "")
		importReport.value = null
	}
	reader.readAsText(file)
}

/** جولة تحقّق بلا كتابة: تعرض ما سيتغير قبل أن يلمس الدفتر. */
async function previewImport() {
	if (!csvText.value.trim()) {
		importReport.value = {
			invalid: 0,
			errors: [{ row: null, message: "اختر ملف CSV أولًا" }],
		}
		return
	}
	importing.value = true
	try {
		const res = await methodCall(V.importCsv, { csv: csvText.value, dryRun: 1 })
		importReport.value = { dryRun: true, ...(res?.message || {}) }
	} catch (error) {
		importReport.value = {
			invalid: 1,
			errors: [
				{ row: null, message: String(error?.message || "تعذّر قراءة الملف") },
			],
		}
	} finally {
		importing.value = false
	}
}

async function applyImport() {
	importing.value = true
	try {
		const res = await methodCall(V.importCsv, { csv: csvText.value })
		importReport.value = { applied: true, ...(res?.message || {}) }
		await load()
	} catch (error) {
		importReport.value = {
			invalid: 1,
			errors: [
				{ row: null, message: String(error?.message || "فشل الاستيراد") },
			],
		}
	} finally {
		importing.value = false
	}
}

/**
 * UTF-8 BOM (U+FEFF) في رأس الملف.
 *
 * Excel يعرض CSV بترميز العربية ترميزًا خاطئًا ما لم يكن there BOM. السيرفر
 * يضيفه عند التصدير أيضًا، لكن التنزيل من المتصفح يمرّ من Blob — فنضيفه هنا
 * مرّة واحدة عبر escape، لا كحرفٍ خفيّ داخل literal يجعل قراءته ووسومه
 * معطوبة، ولا مكرّرًا في كل موضع.
 */
const UTF8_BOM = "\uFEFF"

/** تنزيل ملف: ننشئ Blob و<a download> من نص CSV الذي يعيده السيرفر. */
function downloadCsv(text, filename) {
	const blob = new Blob([UTF8_BOM + String(text || "")], {
		type: "text/csv;charset=utf-8",
	})
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

async function exportCsv() {
	errorState.value = ""
	try {
		const res = await methodCall(V.exportCsv, {
			fiscalYear: fiscalYear.value,
			accountType: accountType.value,
		})
		downloadCsv(
			res?.message?.csv || "",
			res?.message?.filename || "dypos-opening-balances.csv",
		)
	} catch (error) {
		errorState.value = String(error?.message || "تعذّر التصدير")
	}
}

async function downloadTemplate() {
	errorState.value = ""
	try {
		const res = await methodCall(V.template, {})
		downloadCsv(
			res?.message?.csv || "",
			res?.message?.filename || "dypos-opening-balances-template.csv",
		)
	} catch (error) {
		errorState.value = String(error?.message || "تعذّر تحميل القالب")
	}
}

onMounted(load)
</script>

<template>
  <div class="ob-page" dir="rtl">
    <header class="ob-header">
      <div>
        <h1>الأرصدة الافتتاحية</h1>
        <p class="ob-sub">المركز المالي الذي تنطلق منه السنة — قبل أول فاتورة.</p>
      </div>
      <div class="ob-actions">
        <Button variant="ghost" @click="router.back()">رجوع</Button>
        <Button variant="subtle" :disabled="!canWrite" @click="downloadTemplate">تنزيل قالب</Button>
        <Button variant="subtle" @click="exportCsv">تصدير CSV</Button>
        <Button v-if="canWrite" variant="solid" @click="openCreate">رصيد جديد</Button>
      </div>
    </header>

    <div v-if="sourceNote" class="ob-banner ob-banner-warn">
      <FeatherIcon name="alert-triangle" class="ob-ico" />
      <span>{{ sourceNote }}</span>
    </div>
    <div v-if="unlinkedStockBanner" class="ob-banner ob-banner-warn" data-testid="ob-unlinked-warn">
      <FeatherIcon name="alert-triangle" class="ob-ico" />
      <span>{{ unlinkedStockBanner }}</span>
    </div>
    <div v-if="errorState" class="ob-banner ob-banner-error">
      <FeatherIcon name="alert-circle" class="ob-ico" />
      <span>{{ errorState }}</span>
    </div>
    <div v-else-if="importReport" class="ob-banner" :class="importReport.invalid ? 'ob-banner-warn' : 'ob-banner-ok'">
      <FeatherIcon :name="importReport.invalid ? 'alert-triangle' : 'check-circle'" class="ob-ico" />
      <span v-if="importReport.dryRun">
        تحقّق فقط: <b>{{ importReport.valid ?? 0 }}</b> صف صالح، <b>{{ importReport.invalid ?? 0 }}</b> صف مرفوض — لم يُكتب شيء بعد.
      </span>
      <span v-else-if="importReport.applied">
        تم استيراد <b>{{ importReport.applied ?? 0 }}</b> صف.
        <template v-if="importReport.invalid">
          رُفض <b>{{ importReport.invalid }}</b> صف.
        </template>
      </span>
      <span v-else>—</span>
    </div>

    <ul v-if="importReport?.errors?.length" class="ob-errors">
      <li v-for="(e, i) in importReport.errors" :key="i">
        <template v-if="e.row">سطر {{ e.row }}:</template>
        {{ e.message }}
      </li>
    </ul>

    <section class="ob-filters">
      <label>السنة المالية
        <SelectInput v-model="fiscalYear" :options="yearOptions()" @change="load" />
      </label>
      <label>نوع الحساب
        <SelectInput v-model="accountType" :options="typeFilterOptions" @change="load" />
      </label>
    </section>

    <section class="ob-summary">
      <article v-for="c in summaryCards" :key="c.type" class="ob-card" :data-testid="`sum-${c.type}`">
        <h3>{{ c.label }}</h3>
        <strong>{{ c.amount }}</strong>
        <span class="ob-count">{{ c.count }} رصيد</span>
      </article>
    </section>

    <section v-if="canWrite" class="ob-import">
      <h2>استيراد من ملف</h2>
      <p class="ob-hint">يقرأ CSV بنفس محلل السيرفر: تحقّق أولًا، ثم تطبيق. الصفوف الصحيحة تُطبَّق والخطأ ترد بأرقام أسطرها.</p>
      <input ref="fileInput" type="file" accept=".csv,text/csv" @change="onFile" />
      <div class="ob-actions">
        <Button variant="subtle" :loading="importing" @click="previewImport">تحقّق (بلا كتابة)</Button>
        <Button variant="solid" :disabled="!csvText || importing" @click="applyImport">تطبيق الاستيراد</Button>
      </div>
    </section>

    <section class="ob-table-wrap">
      <p v-if="loading" class="ob-hint">جارٍ التحميل…</p>
      <p v-else-if="totalCount === 0" class="ob-empty">{{ emptyDescription }}</p>
      <table v-else class="ob-table" data-testid="ob-table">
        <thead>
          <tr>
            <th>النوع</th><th>الاسم</th><th>الرمز</th><th>المعرّف</th><th>الصنف</th><th>المبلغ</th><th>الكمية</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" :data-testid="`row-${row.id}`">
            <td><Badge :label="TYPE_LABELS[row.account_type] || row.account_type" size="sm" /></td>
            <td>{{ row.account_name || "—" }}</td>
            <td>{{ row.account_code || "—" }}</td>
            <td class="ob-mono">{{ row.account_id || "—" }}</td>
            <!--
              مرجع الصنف كما هو (UUID). لا نترجمه إلى كود الصنف بقائمة أخرى:
              ذلك نداء إضافي يعمل على الشبكة فقط، ويعني أن الشاشة تعرض شيئًا
              مختلفًا بينما هي غير متصلة. بدلًا من ذلك: نعرض المرجع، ونعلن
              عدد السجلات غير المرتبطة أعلاه.
            -->
            <td class="ob-mono" :title="row.product_id || ''">
              <template v-if="row.product_id">{{ shortId(row.product_id) }}</template>
              <span v-else class="ob-unlinked">غير مرتبط</span>
            </td>
            <td class="ob-num">{{ formatCurrencySafe(row.amount) }}</td>
            <td class="ob-num">{{ row.quantity || 0 }}</td>
            <td class="ob-row-actions">
              <Button v-if="canWrite" variant="ghost" size="xs" @click="openEdit(row)">تعديل</Button>
              <Button v-if="canWrite" variant="ghost" size="xs" theme="red" @click="removeRow(row)">حذف</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <Dialog v-model="showEditor" :options="{ title: 'رصيد افتتاحي', size: 'md' }">
      <template #body-content>
        <div class="ob-form">
          <label>النوع
            <SelectInput
              v-model="form.accountType"
              :options="TYPE_ORDER.map((t) => ({ label: TYPE_LABELS[t], value: t }))"
            />
          </label>
          <label v-if="form.accountType === 'customer'">معرّف العميل
            <Input v-model="form.accountId" placeholder="معرّف العميل (مطلوب لعميل)" />
          </label>
          <label>الاسم
            <Input v-model="form.accountName" />
          </label>
          <label>الرمز
            <Input v-model="form.accountCode" />
          </label>
          <label v-if="form.accountType === 'stock'">كود الصنف أو مرجعه (مطلوب للمخزون)
            <Input v-model="form.productId" placeholder="كود الصنف كما في جدول الأصناف، أو UUID" />
          </label>
          <label>المبلغ
            <Input v-model="form.amount" type="number" step="0.01" placeholder="0.00" />
          </label>
          <label>الكمية (للمخزون)
            <Input v-model="form.quantity" type="number" step="0.0001" placeholder="0" />
          </label>
          <label>ملاحظات
            <Input v-model="form.notes" type="textarea" :rows="2" />
          </label>
          <p v-if="editorError" class="ob-form-error">{{ editorError }}</p>
        </div>
      </template>
      <template #footer-content>
        <div class="ob-actions">
          <Button variant="ghost" @click="showEditor = false">إلغاء</Button>
          <Button variant="solid" :loading="saving" @click="save">حفظ</Button>
        </div>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
/*
 * التوكنات كلها من نظام التصميم (`--dy-*` المعرَّف في src/styles/dypos).
 * لا قيم احتياطية: `var(--x, #hex)` يعني أن النظام غير مُعرَّف، و
 * tests/designTokens.test.js يرفض ذلك صراحةً ("الاحتياطي ليس نظام تصميم").
 */
.ob-page {
  padding: var(--dy-page-padding);
  display: flex;
  flex-direction: column;
  gap: var(--dy-space-4);
}
.ob-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dy-space-4);
  flex-wrap: wrap;
}
.ob-header h1 {
  margin: 0;
  font-size: var(--dy-text-xl);
  color: var(--dy-text-strong);
}
.ob-sub,
.ob-hint {
  margin: var(--dy-space-1) 0 0;
  color: var(--dy-text-muted);
  font-size: var(--dy-text-xs);
}
.ob-actions {
  display: flex;
  gap: var(--dy-space-2);
  flex-wrap: wrap;
}
.ob-ico {
  width: var(--dy-space-4);
  height: var(--dy-space-4);
  flex: 0 0 auto;
}
.ob-banner {
  display: flex;
  align-items: center;
  gap: var(--dy-space-2);
  padding: var(--dy-space-2) var(--dy-space-3);
  border-radius: var(--dy-radius-md);
  font-size: var(--dy-text-xs);
  border: var(--dy-border-width-thin) solid var(--dy-border);
  background: var(--dy-surface-soft);
  color: var(--dy-text);
}
.ob-banner-warn {
  background: var(--dy-warning-soft);
  border-color: var(--dy-warning-border);
  color: var(--dy-warning-contrast);
}
.ob-banner-error {
  background: var(--dy-danger-soft);
  border-color: var(--dy-danger-border);
  color: var(--dy-danger-contrast);
}
.ob-banner-ok {
  background: var(--dy-success-soft);
  border-color: var(--dy-success-border);
  color: var(--dy-success-contrast);
}
.ob-errors {
  margin: 0;
  padding-inline-start: var(--dy-space-5);
  color: var(--dy-danger-contrast);
  font-size: var(--dy-text-xs);
}
.ob-filters {
  display: flex;
  gap: var(--dy-space-4);
  flex-wrap: wrap;
}
.ob-filters label,
.ob-form label {
  display: flex;
  flex-direction: column;
  gap: var(--dy-space-1);
  font-size: var(--dy-text-2xs);
  color: var(--dy-text-muted);
}
.ob-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--dy-space-3);
}
.ob-card {
  background: var(--dy-surface);
  border: var(--dy-border-width-thin) solid var(--dy-border);
  border-radius: var(--dy-radius-lg);
  padding: var(--dy-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--dy-space-1);
}
.ob-card h3 {
  margin: 0;
  font-size: var(--dy-text-xs);
  font-weight: var(--dy-weight-semibold);
  color: var(--dy-text-muted);
}
.ob-card strong {
  font-size: var(--dy-text-lg);
  font-family: var(--dy-font-family-money);
  color: var(--dy-text-strong);
}
.ob-count {
  font-size: var(--dy-text-2xs);
  color: var(--dy-text-muted);
}
.ob-import {
  background: var(--dy-surface);
  border: var(--dy-border-width-thin) solid var(--dy-border);
  border-radius: var(--dy-radius-lg);
  padding: var(--dy-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--dy-space-2);
}
.ob-import h2 {
  margin: 0;
  font-size: var(--dy-text-sm);
}
.ob-table-wrap {
  overflow-x: auto;
}
.ob-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dy-text-xs);
}
.ob-table th,
.ob-table td {
  text-align: start;
  padding: var(--dy-table-cell-py) var(--dy-table-cell-px);
  border-bottom: var(--dy-border-width-thin) solid var(--dy-border-soft);
}
.ob-table th {
  font-weight: var(--dy-weight-semibold);
  color: var(--dy-text-muted);
}
.ob-num {
  font-variant-numeric: tabular-nums;
  font-family: var(--dy-font-family-money);
  text-align: end;
}
.ob-mono {
  font-family: var(--dy-font-mono);
  font-size: var(--dy-text-2xs);
  color: var(--dy-text-muted);
}
/*
 * "غير مرتبط" ليست قيمة نائبة محايدة: هي حالة يجب أن تُرى. لذلك تُلوَّن
 * كلون تحذير من نظام التصميم، لا كلون نص باهت يمّر عليه الناظر.
 */
.ob-unlinked {
  color: var(--dy-warning-contrast);
  font-weight: var(--dy-weight-semibold);
}
.ob-row-actions {
  display: flex;
  gap: var(--dy-space-1);
}
.ob-empty {
  color: var(--dy-text-muted);
  font-size: var(--dy-text-xs);
}
.ob-form {
  display: flex;
  flex-direction: column;
  gap: var(--dy-space-3);
}
.ob-form-error {
  margin: 0;
  color: var(--dy-danger-contrast);
  font-size: var(--dy-text-xs);
}
</style>
