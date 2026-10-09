<script setup>
import { computed, onMounted, ref } from "vue";
import router from "@/router";

const types = [
  { value: "products", label: "الأصناف" },
  { value: "customers", label: "العملاء" },
  { value: "warehouses", label: "المخازن" },
];

const type = ref("products");
const csv = ref("");
const report = ref(null);
const busy = ref(false);
const profile = ref(null);
const countries = ref([]);
const establishmentTypes = ref([]);
const templates = ref([]);
const templateName = ref("");
const selectedTemplateId = ref("");
const fileInput = ref(null);
const profileSaving = ref(false);
const profileMessage = ref("");
const readiness = ref({ products: 0, customers: 0, warehouses: 0, defaultWarehouse: "", currency: "" });

const setup = ref({
  countryCode: "YE",
  timezone: "Asia/Aden",
  currency: "YER",
  establishmentType: "retail",
});

const activeTab = ref("profile");
const currentStep = ref(1);
const loading = ref(true);
const online = ref(typeof navigator === "undefined" ? true : navigator.onLine);
const lastValidatedCsv = ref("");
const lastValidatedType = ref("");
const canApply = computed(() => Boolean(csv.value.trim()) && Boolean(report.value?.dryRun) && report.value?.invalid === 0 && lastValidatedCsv.value === csv.value && lastValidatedType.value === type.value);
const progress = computed(() => activeTab.value === "profile" ? 25 : currentStep.value === 1 ? 50 : currentStep.value === 2 ? 75 : 100);

async function call(path, body = {}) {
  const response = await fetch(`/api/method/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message?._error_message || payload?._error_message || payload?.message || "تعذر تنفيذ العملية");
  }
  return payload?.message ?? payload;
}

async function loadProfile() {
  const r = await call("DyPOS.api.onboarding.profile");
  profile.value = r.organization;
  countries.value = r.countries || [];
  establishmentTypes.value = r.establishmentTypes || [];
  readiness.value = r.readiness || readiness.value;
  setup.value = {
    countryCode: r.organization?.country_code || "YE",
    timezone: r.organization?.timezone || "Asia/Aden",
    currency: "YER",
    establishmentType: r.organization?.establishment_type || "retail",
  };
  const country = countries.value.find((x) => x.code === setup.value.countryCode);
  if (country && !setup.value.currency) setup.value.currency = country.currency;
}

async function saveProfile() {
  profileSaving.value = true;
  profileMessage.value = "";
  try {
    await call("DyPOS.api.onboarding.save_profile", setup.value);
    profileMessage.value = "تم حفظ ملف التشغيل الفعلي للمؤسسة.";
    await loadProfile();
    activeTab.value = "import";
    currentStep.value = 1;
  } catch (e) {
    profileMessage.value = e.message;
  } finally {
    profileSaving.value = false;
  }
}

function onCountryChange() {
  const c = countries.value.find((x) => x.code === setup.value.countryCode);
  if (c) {
    setup.value.timezone = c.timezone;
    setup.value.currency = c.currency;
  }
}

async function loadTemplates() {
  const r = await call("DyPOS.api.onboarding.templates");
  templates.value = r.templates || [];
}

async function template() {
  busy.value = true;
  try {
    const r = await call("DyPOS.api.onboarding.master_data_template", { type: type.value });
    download(r.csv, r.filename);
  } catch (e) {
    report.value = { error: e.message };
  } finally {
    busy.value = false;
  }
}

function onFile(e) {
  const file = e?.target?.files?.[0];
  if (!file) return;
  if (!/\.(csv|txt)$/i.test(file.name)) {
    report.value = { error: "استخدم قالب Excel متوافقًا عبر CSV. الملف الناتج يفتح ويُحرر مباشرة في Excel." };
    e.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    csv.value = String(reader.result || "");
    report.value = null;
  };
  reader.readAsText(file);
}

function download(text, filename) {
  const blob = new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function preview() {
  busy.value = true;
  currentStep.value = 2;
  try {
    const r = await call("DyPOS.api.onboarding.import_master_data", { type: type.value, csv: csv.value, dryRun: 1 });
    report.value = r;
    lastValidatedCsv.value = csv.value;
    lastValidatedType.value = type.value;
  } catch (e) {
    report.value = { error: e.message };
  } finally {
    busy.value = false;
  }
}

async function apply() {
  if (!canApply.value) return;
  busy.value = true;
  currentStep.value = 3;
  try {
    const r = await call("DyPOS.api.onboarding.import_master_data", { type: type.value, csv: csv.value });
    report.value = r;
    lastValidatedCsv.value = "";
    lastValidatedType.value = "";
    await loadTemplates();
  } catch (e) {
    report.value = { error: e.message };
  } finally {
    busy.value = false;
  }
}

async function saveTemplate() {
  if (!templateName.value.trim() || !csv.value.trim()) return;
  busy.value = true;
  try {
    await call("DyPOS.api.onboarding.save_template", {
      name: templateName.value.trim(),
      dataType: type.value,
      content: csv.value,
    });
    templateName.value = "";
    await loadTemplates();
    report.value = { success: "تم حفظ القالب ويمكن إعادة استخدامه وتعديله لاحقًا." };
  } catch (e) {
    report.value = { error: e.message };
  } finally {
    busy.value = false;
  }
}

function useTemplate(item) {
  type.value = item.data_type;
  csv.value = item.content;
  selectedTemplateId.value = item.id;
  report.value = null;
  lastValidatedCsv.value = "";
  lastValidatedType.value = "";
  currentStep.value = 1;
  activeTab.value = "import";
}

async function deleteTemplate(id) {
  if (!id) return;
  busy.value = true;
  try {
    await call("DyPOS.api.onboarding.delete_template", { id });
    await loadTemplates();
    if (selectedTemplateId.value === id) selectedTemplateId.value = "";
  } catch (e) {
    report.value = { error: e.message };
  } finally {
    busy.value = false;
  }
}

const currentCountry = computed(() => countries.value.find((x) => x.code === setup.value.countryCode));
const currentType = computed(() => establishmentTypes.value.find((x) => x.value === setup.value.establishmentType));

onMounted(async () => {
  loading.value = true;
  const results = await Promise.allSettled([loadProfile(), loadTemplates()]);
  const failed = results.find((x) => x.status === "rejected");
  if (failed) report.value = { error: failed.reason?.message || "تعذر تحميل بيانات مركز الإعداد" };
  loading.value = false;
  window.addEventListener("online", () => { online.value = true; });
  window.addEventListener("offline", () => { online.value = false; });
});
</script>

<template>
  <main class="onboarding" dir="rtl">
    <div v-if="loading" class="loading-shell" role="status" aria-live="polite"><div class="spinner"></div><strong>جاري تحميل مركز الإعداد…</strong><span>بيانات حقيقية مرتبطة بالمشترك الحالي.</span></div>
    <template v-else>
    <header class="head">
      <div>
        <span class="eyebrow">DyPOS · تهيئة المشترك</span>
        <h1>مركز إعداد وتشغيل المنشأة</h1>
        <p>تهيئة تشغيلية حقيقية للكاشير ونقاط البيع، مستقلة عن النظام المحاسبي.</p>
      </div>
      <div class="head-actions"><span class="connection" :class="{offline: !online}"><i></i>{{ online ? "متصل" : "اتصال غير متاح" }}</span><button class="back" @click="router.back()">رجوع</button></div>
    </header>

    <div class="progressbar"><span :style="{width: progress + '%'}"></span></div>
    <nav class="tabs" aria-label="مراحل التهيئة">
      <button :class="{active: activeTab === 'profile'}" @click="activeTab='profile'"><b>1</b> المؤسسة والتشغيل</button>
      <button :class="{active: activeTab === 'import'}" @click="activeTab='import'"><b>2</b> استيراد البيانات</button>
      <button :class="{active: activeTab === 'templates'}" @click="activeTab='templates'"><b>3</b> القوالب المحفوظة</button>
    </nav>

    <section v-if="activeTab === 'profile'" class="card">
      <div class="section-title">
        <div><strong>الهوية التشغيلية</strong><p>الدولة ونوع المنشأة يحددان سياق تشغيل DyPOS، وليس النظام المحاسبي.</p></div>
        <span v-if="currentType" class="badge">{{ currentType.label }}</span>
      </div>

      <div class="grid">
        <label>الدولة
          <select v-model="setup.countryCode" @change="onCountryChange">
            <option v-for="item in countries" :key="item.code" :value="item.code">{{ item.name }} ({{ item.code }})</option>
          </select>
        </label>
        <label>نوع المنشأة
          <select v-model="setup.establishmentType">
            <option v-for="item in establishmentTypes" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label>المنطقة الزمنية
          <input v-model="setup.timezone" dir="ltr" maxlength="64">
        </label>
        <label>العملة التشغيلية
          <input v-model="setup.currency" dir="ltr" maxlength="3">
        </label>
      </div>

      <div class="readiness" aria-label="جاهزية التشغيل"><div><b>{{ readiness.products }}</b><span>أصناف</span></div><div><b>{{ readiness.customers }}</b><span>عملاء</span></div><div><b>{{ readiness.warehouses }}</b><span>مخازن</span></div><div><b>{{ readiness.defaultWarehouse ? "جاهز" : "يحتاج تعيين" }}</b><span>المخزن الافتراضي</span></div></div>

      <div class="facts">
        <span>الدولة: <b>{{ currentCountry?.name || "—" }}</b></span>
        <span>المنطقة الزمنية: <b>{{ setup.timezone }}</b></span>
        <span>العملة: <b>{{ setup.currency }}</b></span>
      </div>

      <div class="actions">
        <button class="primary" :disabled="profileSaving" @click="saveProfile">{{ profileSaving ? "جاري الحفظ..." : "حفظ ثم الانتقال للبيانات" }}</button>
        <button @click="router.push({name:'Settings'})">فتح إعدادات نقطة البيع</button>
      </div>
      <p v-if="profileMessage" class="message">{{ profileMessage }}</p>

      <div class="notice">
        <strong>ملاحظة محاسبية:</strong>
        لا توجد سنة مالية أو قيود أو دليل حسابات هنا؛ هذه المسؤوليات تبقى في الإصدار المحاسبي المنفصل.
      </div>
    </section>

    <section v-if="activeTab === 'import'" class="card">
      <div class="section-title">
        <div><strong>استيراد البيانات الأساسية</strong><p>ابدأ بالأصناف، ثم العملاء والمخازن. كل خطوة قابلة للمراجعة ولا تُكتب البيانات قبل الاعتماد.</p></div>
        <span class="badge">{{ readiness.products ? "الكتالوج متاح" : "ابدأ بالكتالوج" }}</span>
      </div>

      <div class="grid">
        <label>نوع البيانات
          <select v-model="type">
            <option v-for="item in types" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <div class="file-box">
          <span>قالب Excel</span>
          <button :disabled="busy" @click="template">تنزيل قالب Excel متوافق</button>
          <label class="file">رفع CSV محرر في Excel<input ref="fileInput" type="file" accept=".csv,.txt,text/csv" @change="onFile"></label>
        </div>
      </div>

      <textarea v-model="csv" rows="12" placeholder="الصق محتوى القالب هنا أو حرره في Excel ثم ارفعه بصيغة CSV."></textarea>

      <div class="template-save">
        <input v-model="templateName" placeholder="اسم القالب المحفوظ، مثال: أصناف الفرع الرئيسي">
        <button :disabled="busy || !templateName.trim() || !csv.trim()" @click="saveTemplate">حفظ القالب لاستخدامه لاحقًا</button>
      </div>

      <div class="actions">
        <button :disabled="busy || !csv.trim()" @click="preview">① تحقق ومعاينة بلا كتابة</button>
        <button class="primary" :disabled="busy || !canApply" @click="apply">② اعتماد الاستيراد الذري</button>
      </div>

      <section v-if="report" class="report">
        <p v-if="report.error" class="error">{{ report.error }}</p>
        <p v-else-if="report.success" class="success">{{ report.success }}</p>
        <template v-else>
          <strong v-if="report.dryRun">المعاينة: {{ report.valid }} صالح، {{ report.invalid }} مرفوض — لم تُكتب أي بيانات.</strong>
          <div v-if="report.dryRun" class="summary-strip"><span>جاهز للاعتماد: <b>{{ report.invalid === 0 ? "نعم" : "لا" }}</b></span><span>السجلات: <b>{{ report.valid + report.invalid }}</b></span><span>المرحلة: <b>{{ report.invalid === 0 ? "اعتماد" : "تصحيح" }}</b></span></div>
          <strong v-else>تم الاستيراد الفعلي: {{ report.applied }} سجل.</strong>
          <ul v-if="report.errors?.length">
            <li v-for="(e,i) in report.errors" :key="i">سطر {{ e.row ?? "—" }}: {{ e.message }}</li>
          </ul>
        </template>
      </section>
    </section>

    <section v-if="activeTab === 'templates'" class="card">
      <div class="section-title">
        <div><strong>القوالب المحفوظة</strong><p>القالب محفوظ داخل بيانات المشترك، ويمكن تحميله وتعديله وإعادة استخدامه.</p></div>
      </div>
      <div class="smart-note">القوالب محفوظة داخل بيانات المشترك ويمكن إعادة استخدامها وتعديلها دون إعادة تعريف الأعمدة.</div>
      <div v-if="!templates.length" class="empty">لا توجد قوالب محفوظة بعد.</div>
      <article v-for="item in templates" :key="item.id" class="template-row">
        <div>
          <strong>{{ item.name }}</strong>
          <span>{{ types.find(t => t.value === item.data_type)?.label || item.data_type }} · الإصدار {{ item.version }}</span>
        </div>
        <div class="actions">
          <button @click="useTemplate(item)">استخدام وتعديل</button>
          <button class="danger" :disabled="busy" @click="deleteTemplate(item.id)">حذف</button>
        </div>
      </article>
    </section>
    </template>
  </main>
</template>

<style scoped>
.onboarding{min-height:100dvh;padding:32px;display:grid;gap:18px;background:var(--dy-bg);color:var(--dy-text);max-width:1280px;margin:auto}.loading-shell{min-height:60dvh;display:grid;place-content:center;justify-items:center;gap:10px;color:var(--dy-text-muted)}.loading-shell span{font-size:12px}.spinner{width:30px;height:30px;border:3px solid var(--dy-border);border-top-color:var(--dy-accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.head{display:flex;justify-content:space-between;gap:20px;align-items:center}.head-actions{display:flex;align-items:center;gap:10px}.connection{font-size:12px;padding:7px 10px;border:1px solid var(--dy-border);border-radius:999px}.connection i{display:inline-block;width:7px;height:7px;border-radius:50%;background:currentColor;margin-inline-end:6px}.connection.offline{color:var(--dy-warning-contrast)}.eyebrow{font-size:12px;color:var(--dy-accent);font-weight:700}.head h1{margin:4px 0;font-size:28px;color:var(--dy-text-strong)}.head p{margin:0;color:var(--dy-text-muted)}
.progressbar{height:4px;background:var(--dy-border);border-radius:99px;overflow:hidden}.progressbar span{display:block;height:100%;background:var(--dy-accent);transition:width .2s ease}.tabs{display:flex;gap:6px;flex-wrap:wrap}.tabs button,.actions button,.back,.file{min-height:42px;padding:0 15px;border:1px solid var(--dy-border);border-radius:10px;background:var(--dy-surface);color:var(--dy-text);cursor:pointer}.tabs .active{background:var(--dy-accent);color:var(--dy-on-accent);border-color:var(--dy-accent)}.tabs b{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--dy-bg);color:var(--dy-text);margin-inline-end:5px}.tabs .active b{background:color-mix(in srgb,var(--dy-on-accent) 18%,transparent);color:inherit}
.card{display:grid;gap:18px;background:var(--dy-surface);border:1px solid var(--dy-border);border-radius:16px;padding:22px;max-width:1100px}.section-title{display:flex;justify-content:space-between;gap:16px}.section-title strong{font-size:18px}.section-title p{margin:4px 0 0;color:var(--dy-text-muted);font-size:13px}.badge{align-self:start;padding:5px 10px;border-radius:999px;background:var(--dy-bg);border:1px solid var(--dy-border);font-size:12px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.grid label{display:grid;gap:6px;font-size:12px;color:var(--dy-text-muted)}select,input,textarea{font:inherit;color:var(--dy-text);background:var(--dy-bg);border:1px solid var(--dy-border);border-radius:10px;padding:10px}textarea{direction:ltr;text-align:left;resize:vertical}
.readiness{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.readiness div{padding:12px;border:1px solid var(--dy-border);border-radius:10px;background:var(--dy-bg);display:grid;gap:2px}.readiness b{font-size:18px;color:var(--dy-text-strong)}.readiness span{font-size:11px;color:var(--dy-text-muted)}.facts{display:flex;gap:10px;flex-wrap:wrap}.facts span{padding:8px 10px;border-radius:9px;background:var(--dy-bg);font-size:12px}.actions{display:flex;gap:8px;flex-wrap:wrap}.primary{background:var(--dy-accent)!important;color:var(--dy-on-accent)!important;border-color:var(--dy-accent)!important}.message,.success{margin:0;padding:10px;border-radius:9px;background:var(--dy-bg)}.notice{padding:12px;border-radius:10px;background:var(--dy-bg);font-size:12px;color:var(--dy-text-muted)}
.file-box{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.file-box span{width:100%;font-size:12px;color:var(--dy-text-muted)}.file input{display:none}.template-save{display:flex;gap:8px}.template-save input{flex:1}.report{padding:12px;border:1px solid var(--dy-border);border-radius:10px;display:grid;gap:10px}.summary-strip{display:flex;gap:8px;flex-wrap:wrap}.summary-strip span,.smart-note{padding:9px 11px;border-radius:9px;background:var(--dy-bg);font-size:12px}.smart-note{color:var(--dy-text-muted)}.error{color:var(--dy-danger-contrast)}.report ul{margin:8px 0 0;padding-inline-start:22px}.template-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px;border:1px solid var(--dy-border);border-radius:10px}.template-row span{display:block;color:var(--dy-text-muted);font-size:12px;margin-top:4px}.danger{color:var(--dy-danger-contrast)!important}
.empty{padding:24px;text-align:center;color:var(--dy-text-muted);border:1px dashed var(--dy-border);border-radius:10px}
@media(max-width:700px){.onboarding{padding:18px}.readiness{grid-template-columns:repeat(2,minmax(0,1fr))}.head-actions{width:100%;justify-content:space-between}.grid{grid-template-columns:1fr}.template-row{align-items:stretch;flex-direction:column}.template-save{flex-direction:column}.head{align-items:flex-start;flex-direction:column}}

/* Focused enterprise workbench polish; preserves the existing import workflow. */
.onboarding{width:100%;box-sizing:border-box;padding:clamp(16px,3vw,36px);gap:20px}
.head{align-items:flex-start;padding:clamp(18px,2.4vw,28px);border:1px solid var(--dy-border);border-radius:18px;background:linear-gradient(135deg,var(--dy-surface),var(--dy-bg));box-shadow:0 8px 24px rgb(15 23 42 / 4%)}
.head h1{font-size:clamp(23px,2.2vw,32px);line-height:1.25;letter-spacing:-.02em}.head p{max-width:64ch;line-height:1.7}.head-actions{flex-wrap:wrap}
.progressbar{height:5px}.tabs{gap:8px;padding:5px;border:1px solid var(--dy-border);border-radius:14px;background:var(--dy-bg)}
.tabs button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px;padding:8px 14px;border-radius:10px;font-weight:650;transition:background-color .16s ease,border-color .16s ease}.tabs b{flex:0 0 24px;width:24px;height:24px;margin:0;border:1px solid var(--dy-border)}.tabs .active{box-shadow:0 2px 8px rgb(15 23 42 / 12%)}
.card{width:100%;max-width:none;box-sizing:border-box;padding:clamp(18px,2.4vw,28px);gap:22px;border-radius:16px;box-shadow:0 8px 24px rgb(15 23 42 / 3%)}
.section-title{align-items:flex-start;padding-block-end:14px;border-bottom:1px solid var(--dy-border)}.section-title strong{font-size:19px;letter-spacing:-.01em}.grid{gap:16px}.grid label{font-size:13px;font-weight:600;color:var(--dy-text)}
.grid select,.grid input,.template-save input,textarea{width:100%;min-height:44px;box-sizing:border-box;border-radius:10px;border-color:var(--dy-border);background:var(--dy-bg);transition:border-color .15s ease,box-shadow .15s ease}textarea{min-height:220px;line-height:1.65}
.actions{align-items:center;gap:10px}.actions button,.back,.file,.file-box button,.template-save button{min-height:44px;font-weight:600;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease}button:disabled{cursor:not-allowed;opacity:.55;box-shadow:none}
.readiness{gap:10px}.readiness div{min-height:82px;align-content:center;padding:14px;border-radius:12px}.readiness b{font-size:clamp(18px,2vw,24px);font-variant-numeric:tabular-nums}.facts span{border:1px solid var(--dy-border);line-height:1.6}.notice,.message,.success{line-height:1.7;border:1px solid var(--dy-border)}
.report{gap:12px;padding:clamp(14px,2vw,20px);border-radius:12px;background:var(--dy-surface)}.summary-strip span{border:1px solid var(--dy-border);line-height:1.6}.template-row{border-radius:12px;transition:border-color .15s ease,background-color .15s ease}
.onboarding :is(button,input,select,textarea,.file):focus-visible{outline:3px solid color-mix(in srgb,var(--dy-accent) 38%,transparent);outline-offset:2px}.onboarding button:not(:disabled):hover,.onboarding .file:hover{border-color:var(--dy-accent)}.onboarding .primary:not(:disabled):hover{filter:brightness(.96);box-shadow:0 4px 12px rgb(15 23 42 / 12%)}
@media(max-width:700px){.onboarding{gap:14px;padding:14px}.head{padding:18px}.tabs{display:grid;grid-template-columns:1fr}.tabs button{justify-content:flex-start}.card{gap:18px;padding:16px}.section-title{flex-direction:column}.readiness div{min-height:72px}.actions button,.template-save button{width:100%}.file-box{align-items:stretch}.file-box button,.file{display:flex;align-items:center;justify-content:center;flex:1}}
@media(prefers-reduced-motion:reduce){.onboarding *, .onboarding *::before,.onboarding *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
</style>
