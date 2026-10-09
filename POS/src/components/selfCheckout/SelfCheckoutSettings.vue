<template>
  <section class="sc-settings" dir="rtl" aria-labelledby="sc-settings-title">
    <header class="sc-settings__hero">
      <div class="sc-settings__mark" aria-hidden="true">⚙</div>
      <div>
        <p class="sc-settings__eyebrow">DY POS · SELF CHECKOUT</p>
        <h3 id="sc-settings-title">إعدادات الكاشير الذاتي</h3>
        <p>تحكّم في تجربة العميل على شاشة الخدمة الذاتية لهذا الجهاز.</p>
      </div>
      <span class="sc-settings__status" :class="{ 'is-on': settings.enabled }">{{ settings.enabled ? 'مفعّل' : 'متوقف' }}</span>
    </header>

    <div class="sc-settings__notice" role="status">
      <strong>إعدادات هذا الجهاز</strong>
      <span>تُحفظ محليًا في المتصفح ولا تغيّر إعدادات أجهزة الكاشير الأخرى.</span>
    </div>

    <div class="sc-settings__grid">
      <article class="sc-settings__card">
        <div class="sc-settings__card-title"><span>01</span><div><h4>تجربة العميل</h4><p>هوية الشاشة وطريقة عرض الأصناف</p></div></div>
        <label class="sc-settings__field"><span>عنوان الشاشة</span><input v-model.trim="settings.title" maxlength="60" placeholder="الكاشير الذاتي" /></label>
        <label class="sc-settings__field"><span>رسالة الترحيب</span><input v-model.trim="settings.subtitle" maxlength="120" placeholder="اختر أصنافك وادفع بسهولة" /></label>
        <label class="sc-settings__toggle"><span><b>تفعيل الكاشير الذاتي</b><small>السماح ببدء جلسات جديدة من هذه الواجهة</small></span><input v-model="settings.enabled" type="checkbox" /></label>
        <label class="sc-settings__toggle"><span><b>إظهار أسعار الأصناف</b><small>عرض السعر على بطاقة كل صنف قبل إضافته</small></span><input v-model="settings.showPrices" type="checkbox" /></label>
      </article>

      <article class="sc-settings__card">
        <div class="sc-settings__card-title"><span>02</span><div><h4>البحث والإرشاد</h4><p>مساعدة العميل على الوصول بسرعة</p></div></div>
        <label class="sc-settings__toggle"><span><b>البحث الفوري</b><small>البحث بالاسم أو الرمز أو الباركود محليًا</small></span><input v-model="settings.searchEnabled" type="checkbox" /></label>
        <label class="sc-settings__toggle"><span><b>الإرشاد السياقي</b><small>رسائل مساعدة تتغير بحسب السلة وخطوة الشراء</small></span><input v-model="settings.smartGuidance" type="checkbox" /></label>
        <label class="sc-settings__field"><span>مهلة الخمول قبل إعادة الضبط</span><select v-model.number="settings.idleTimeoutSeconds"><option :value="0">معطّلة</option><option :value="60">دقيقة واحدة</option><option :value="120">دقيقتان</option><option :value="180">3 دقائق</option><option :value="300">5 دقائق</option></select></label>
        <p class="sc-settings__hint">مهلة الخمول تحفظ كتفضيل فقط؛ لن تُنهي جلسة نشطة تلقائيًا قبل تفعيل منطق المهلة واختباره.</p>
      </article>

      <article class="sc-settings__card">
        <div class="sc-settings__card-title"><span>03</span><div><h4>الدفع</h4><p>لا نعرض وسيلة دفع غير مهيأة فعليًا</p></div></div>
        <label class="sc-settings__toggle"><span><b>السماح بالدفع النقدي</b><small>تأكيد النقد وحساب الباقي وفق منطق الدفع الحالي</small></span><input v-model="settings.cashEnabled" type="checkbox" /></label>
        <div class="sc-settings__integration"><span class="sc-settings__integration-dot"></span><div><b>البطاقة والمحفظة والتحويل</b><p>تظل غير متاحة حتى ربط موفّر دفع والتحقق من نجاح العملية من الخادم أو جهاز الدفع.</p></div><span class="sc-settings__locked">تحتاج تكاملًا</span></div>
        <label class="sc-settings__toggle"><span><b>إظهار ملخص الإيصال</b><small>عرض تفاصيل العملية بعد اعتماد الدفع</small></span><input v-model="settings.showReceiptSummary" type="checkbox" /></label>
      </article>

      <article class="sc-settings__card">
        <div class="sc-settings__card-title"><span>04</span><div><h4>إمكانية الوصول</h4><p>واجهة واضحة لأجهزة اللمس</p></div></div>
        <label class="sc-settings__field"><span>حجم عناصر اللمس</span><select v-model="settings.touchDensity"><option value="comfortable">مريح — موصى به</option><option value="large">كبير</option></select></label>
        <label class="sc-settings__toggle"><span><b>تقليل الحركة</b><small>تقليل الانتقالات البصرية عند التنقل</small></span><input v-model="settings.reduceMotion" type="checkbox" /></label>
      </article>
    </div>

    <footer class="sc-settings__footer">
      <p v-if="savedAt" role="status">آخر حفظ: {{ savedAt }}</p>
      <div class="sc-settings__actions"><button class="sc-settings__reset" type="button" @click="resetSettings">استعادة الافتراضي</button><button class="sc-settings__save" type="button" @click="saveSettings">حفظ الإعدادات <span aria-hidden="true">←</span></button></div>
    </footer>
    <p v-if="message" class="sc-settings__message" role="status">{{ message }}</p>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue"

const STORAGE_KEY = "dypos:self-checkout:settings:v1"
const defaults = Object.freeze({
  enabled: true,
  title: "الكاشير الذاتي",
  subtitle: "امسح الأصناف أو المسها، ثم ادفع بنفسك",
  showPrices: true,
  searchEnabled: true,
  smartGuidance: true,
  idleTimeoutSeconds: 120,
  cashEnabled: true,
  showReceiptSummary: true,
  touchDensity: "comfortable",
  reduceMotion: false,
})
const settings = reactive({ ...defaults })
const savedAt = ref("")
const message = ref("")

function readSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) Object.assign(settings, defaults, JSON.parse(raw))
    savedAt.value = raw ? "تم تحميل الإعدادات المحفوظة" : ""
  } catch {
    message.value = "تعذر قراءة الإعدادات المحفوظة؛ يمكنك ضبطها ثم الحفظ مجددًا."
  }
}
function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings }))
    savedAt.value = new Date().toLocaleString()
    message.value = "تم حفظ الإعدادات على هذا الجهاز."
  } catch {
    message.value = "تعذر الحفظ في المتصفح. تحقق من مساحة التخزين أو إعدادات الخصوصية."
  }
}
function resetSettings() {
  Object.assign(settings, defaults)
  saveSettings()
}
onMounted(readSettings)
</script>

<style scoped>
.sc-settings{--ink:#172b4d;--muted:#64748b;--line:#e3eaf3;--accent:#2563eb;color:var(--ink);display:flex;flex-direction:column;gap:18px}
.sc-settings__hero{display:flex;align-items:center;gap:16px;padding:22px;border:1px solid #dce7f6;border-radius:18px;background:linear-gradient(120deg,#f5f9ff,#fff 70%);flex-wrap:wrap}
.sc-settings__mark{display:grid;place-items:center;width:52px;height:52px;border-radius:15px;background:#dbeafe;color:#1d4ed8;font-size:25px}
.sc-settings__eyebrow{margin:0 0 5px;font-size:10px;font-weight:800;letter-spacing:.13em;color:#2563eb}
.sc-settings__hero h3{margin:0;font-size:21px;font-weight:800}.sc-settings__hero p:last-child{margin:5px 0 0;color:var(--muted);font-size:13px}
.sc-settings__status{margin-inline-start:auto;padding:7px 12px;border-radius:999px;background:#f1f5f9;color:#64748b;font-size:12px;font-weight:800}.sc-settings__status.is-on{background:#dcfce7;color:#166534}
.sc-settings__notice{display:flex;gap:10px;align-items:center;padding:12px 15px;border:1px solid #bfdbfe;border-radius:12px;background:#eff6ff;font-size:12px}.sc-settings__notice strong{white-space:nowrap;color:#1d4ed8}.sc-settings__notice span{color:#475569}
.sc-settings__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.sc-settings__card{padding:19px;border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:0 3px 12px #0f172a05;display:flex;flex-direction:column;gap:15px;min-width:0}
.sc-settings__card-title{display:flex;align-items:center;gap:11px;padding-bottom:13px;border-bottom:1px solid #edf1f7}.sc-settings__card-title>span{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#eff6ff;color:#2563eb;font-size:11px;font-weight:900}.sc-settings__card-title h4{margin:0;font-size:15px;font-weight:800}.sc-settings__card-title p{margin:3px 0 0;font-size:11px;color:var(--muted)}
.sc-settings__field{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:700}.sc-settings__field input,.sc-settings__field select{width:100%;min-height:42px;padding:9px 12px;border:1px solid #dbe3ee;border-radius:10px;background:#fff;color:var(--ink);font:inherit;font-weight:500;outline:none}.sc-settings__field input:focus,.sc-settings__field select:focus{border-color:#60a5fa;box-shadow:0 0 0 3px #dbeafe}
.sc-settings__toggle{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:11px 0;border-bottom:1px solid #f0f3f8;cursor:pointer}.sc-settings__toggle span{display:flex;flex-direction:column;gap:4px}.sc-settings__toggle b{font-size:12px}.sc-settings__toggle small{font-size:11px;line-height:1.5;color:var(--muted);font-weight:400}.sc-settings__toggle input{width:40px;height:22px;flex:0 0 auto;accent-color:#2563eb;cursor:pointer}
.sc-settings__integration{display:flex;align-items:flex-start;gap:9px;padding:12px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa}.sc-settings__integration-dot{width:8px;height:8px;margin-top:5px;flex:0 0 auto;border-radius:50%;background:#f97316}.sc-settings__integration div{flex:1}.sc-settings__integration b{font-size:12px}.sc-settings__integration p{margin:4px 0 0;font-size:11px;line-height:1.6;color:#9a3412}.sc-settings__locked{font-size:10px;white-space:nowrap;font-weight:800;color:#9a3412}
.sc-settings__hint{margin:0;padding:10px;border-radius:9px;background:#f8fafc;color:var(--muted);font-size:11px;line-height:1.6}
.sc-settings__footer{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding-top:4px}.sc-settings__footer p{font-size:11px;color:var(--muted)}.sc-settings__actions{display:flex;gap:9px;flex-wrap:wrap}.sc-settings__actions button{min-height:42px;padding:0 16px;border-radius:10px;font-size:12px;font-weight:800;cursor:pointer}.sc-settings__reset{border:1px solid var(--line);background:#fff;color:#475569}.sc-settings__save{display:flex;align-items:center;gap:12px;border:1px solid #1d4ed8;background:#2563eb;color:#fff;box-shadow:0 5px 12px #2563eb22}.sc-settings__save:hover{background:#1d4ed8}.sc-settings__message{margin:0;padding:10px 12px;border-radius:10px;background:#f0fdf4;color:#166534;font-size:12px}
@media(max-width:700px){.sc-settings__grid{grid-template-columns:1fr}.sc-settings__hero{align-items:flex-start}.sc-settings__status{margin-inline-start:0}.sc-settings__notice{align-items:flex-start;flex-direction:column;gap:4px}}
@media(prefers-reduced-motion:reduce){.sc-settings *{scroll-behavior:auto!important;transition:none!important}}
</style>
