<script setup>
import { ref } from "vue"
import router from "@/router"

const types = [
  { value: "products", label: "الأصناف" },
  { value: "customers", label: "العملاء" },
  { value: "warehouses", label: "المخازن" },
  { value: "opening_balances", label: "الأرصدة الافتتاحية" },
]
const type = ref("products")
const csv = ref("")
const report = ref(null)
const busy = ref(false)
const fileInput = ref(null)

async function call(path, body) {
  const response = await fetch("/api/method/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.message?._error_message || payload?._error_message || payload?.message || "تعذر تنفيذ العملية")
  return payload
}
function onFile(e) {
  const file=e?.target?.files?.[0]
  if(!file) return
  const reader=new FileReader()
  reader.onload=()=>{csv.value=String(reader.result||"");report.value=null}
  reader.readAsText(file)
}
function download(text, filename) {
  const blob=new Blob(["\uFEFF"+text],{type:"text/csv;charset=utf-8"})
  const url=URL.createObjectURL(blob)
  const a=document.createElement("a");a.href=url;a.download=filename;a.click()
  setTimeout(()=>URL.revokeObjectURL(url),0)
}
async function template() {
  busy.value=true
  try {
    const path = type.value === "opening_balances"
      ? "DyPOS.api.opening_balances.opening_balance_template"
      : "DyPOS.api.onboarding.master_data_template"
    const r=await call(path,{type:type.value})
    download(r.message.csv,r.message.filename)
  }
  catch(e){report.value={error:e.message}}
  finally{busy.value=false}
}
async function preview() {
  busy.value=true
  try {
    const path = type.value === "opening_balances"
      ? "DyPOS.api.opening_balances.import_opening_balances"
      : "DyPOS.api.onboarding.import_master_data"
    const r=await call(path,{type:type.value,csv:csv.value,dryRun:1})
    report.value=r.message
  }
  catch(e){report.value={error:e.message}}
  finally{busy.value=false}
}
async function apply() {
  busy.value=true
  try {
    const path = type.value === "opening_balances"
      ? "DyPOS.api.opening_balances.import_opening_balances"
      : "DyPOS.api.onboarding.import_master_data"
    const r=await call(path,{type:type.value,csv:csv.value})
    report.value=r.message
  }
  catch(e){report.value={error:e.message}}
  finally{busy.value=false}
}
</script>

<template>
  <main class="md-page" dir="rtl">
    <header class="md-head">
      <div>
        <span>تهيئة المشترك</span>
        <h1>استيراد البيانات الأساسية</h1>
        <p>قوالب موحّدة للبيانات الحقيقية قبل بدء التشغيل. التحقق يسبق الكتابة، والأرصدة الافتتاحية تُعتمد كسجل مالي لا كبيانات تجريبية.</p>
      </div>
      <button class="md-back" @click="router.back()">رجوع</button>
    </header>

    <section class="md-card">
      <label>نوع البيانات
        <select v-model="type">
          <option v-for="item in types" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </label>
      <div class="md-actions">
        <button :disabled="busy" @click="template">تنزيل القالب</button>
        <label class="md-file">اختيار ملف CSV<input ref="fileInput" type="file" accept=".csv,text/csv" @change="onFile"></label>
      </div>
      <textarea v-model="csv" rows="10" placeholder="أو الصق محتوى CSV هنا"></textarea>
      <div class="md-actions">
        <button :disabled="busy || !csv.trim()" @click="preview">تحقق بلا كتابة</button>
        <button class="md-primary" :disabled="busy || !csv.trim() || report?.invalid" @click="apply">تطبيق الاستيراد الذري</button>
      </div>
    </section>

    <section v-if="report" class="md-card" aria-live="polite">
      <p v-if="report.error" class="md-error">{{ report.error }}</p>
      <template v-else>
        <strong v-if="report.dryRun">المعاينة: {{ report.valid }} صالح، {{ report.invalid }} مرفوض — لم تُكتب أي بيانات.</strong>
        <strong v-else>تم الاستيراد: {{ report.applied }} سجل.</strong>
        <ul v-if="report.errors?.length">
          <li v-for="(e,i) in report.errors" :key="i">سطر {{ e.row ?? "—" }}: {{ e.message }}</li>
        </ul>
      </template>
    </section>

    <section class="md-card md-note">
      <strong>الترتيب المعياري</strong>
      <p>القالب → المطابقة → التحقق → المعاينة → الاستيراد الذري → سجل التدقيق → اعتماد الأرصدة الافتتاحية ضمن سنة مالية محددة.</p>
      <p>لا تُعتبر البيانات مكتملة إلا بعد نجاح العملية على قاعدة البيانات الفعلية. للاستيراد المالي: أدخل الأصناف والعملاء أولًا، ثم الأرصدة الافتتاحية، وراجع المعاينة قبل التطبيق.</p>
    </section>
  </main>
</template>

<style scoped>
.md-page{min-height:100dvh;padding:var(--dy-page-padding);display:grid;gap:var(--dy-space-4);color:var(--dy-text);background:var(--dy-bg)}
.md-head{display:flex;justify-content:space-between;gap:var(--dy-space-4);align-items:center}
.md-head span{color:var(--dy-accent);font-size:var(--dy-text-xs);font-weight:var(--dy-weight-semibold)}
.md-head h1{margin:var(--dy-space-1) 0;color:var(--dy-text-strong);font-size:var(--dy-text-xl)}
.md-head p,.md-note p{margin:var(--dy-space-1) 0;color:var(--dy-text-muted);font-size:var(--dy-text-xs)}
.md-back,.md-actions button,.md-file{min-height:var(--dy-control-h-lg);padding:0 var(--dy-space-3);border:var(--dy-border-width-thin) solid var(--dy-border);border-radius:var(--dy-radius-md);background:var(--dy-surface);color:var(--dy-text);cursor:pointer}
.md-card{display:grid;gap:var(--dy-space-3);max-width:900px;background:var(--dy-surface);border:var(--dy-border-width-thin) solid var(--dy-border);border-radius:var(--dy-radius-lg);padding:var(--dy-space-4)}
.md-card label{display:grid;gap:var(--dy-space-1);font-size:var(--dy-text-xs);color:var(--dy-text-muted)}
select,textarea{font:inherit;color:var(--dy-text);background:var(--dy-bg);border:var(--dy-border-width-thin) solid var(--dy-border);border-radius:var(--dy-radius-md);padding:var(--dy-space-2)}
textarea{resize:vertical;direction:ltr;text-align:left}
.md-actions{display:flex;gap:var(--dy-space-2);flex-wrap:wrap}
.md-primary{background:var(--dy-accent)!important;color:var(--dy-on-accent)!important}
.md-file{display:inline-flex;align-items:center}
.md-file input{display:none}
.md-error{color:var(--dy-danger-contrast);font-weight:var(--dy-weight-semibold)}
.md-card ul{margin:0;padding-inline-start:var(--dy-space-5);color:var(--dy-danger-contrast);font-size:var(--dy-text-xs)}
</style>
