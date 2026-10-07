<script setup>
import { computed } from "vue"
import { useRoute, useRouter } from "vue-router"

const route = useRoute()
const router = useRouter()

const documents = {
  Terms: {
    title: "شروط استخدام DyPOS",
    label: "الشروط",
    intro: "تنظم هذه الشروط استخدام نظام DyPOS كنظام نقاط بيع وتشغيل للكاشير لدى المنشأة المشتركة.",
    sections: [
      ["نطاق الخدمة", "يُستخدم DyPOS لإدارة عمليات نقاط البيع والكاشير والعمليات التشغيلية المرتبطة بها مثل الأصناف والمخزون والمشتريات بحسب الصلاحيات والإعدادات المتاحة للمشترك. لا تُعد هذه الخدمة بديلاً عن نظام محاسبي مستقل ما لم ينص إصدار تعاقدي منفصل على ذلك."],
      ["حساب المشترك", "يتحمل المشترك مسؤولية صحة بيانات التسجيل، وحماية بيانات الدخول، وتحديد المستخدمين والصلاحيات والأجهزة والفروع المصرح لها. يجب عدم مشاركة بيانات الاعتماد أو منح صلاحيات تتجاوز الحاجة التشغيلية."],
      ["البيانات والمعاملات", "يجب إدخال بيانات صحيحة ومشروعة. يظل المشترك مسؤولاً عن محتوى بياناته وعن مراجعة العمليات قبل اعتمادها وفق سياساته الداخلية."],
      ["التشغيل دون اتصال", "قد يعمل DyPOS محلياً عند انقطاع الشبكة وفق البيانات والصلاحيات التي تم تجهيزها مسبقاً على الجهاز. تتم مزامنة العمليات عند توفر الاتصال وفق آليات النظام؛ ولا يعني العمل دون اتصال تجاوز صلاحيات المشترك أو سياسات الخدمة."],
      ["الأجهزة والفروع", "يرتبط التشغيل بسياق المشترك والفرع والطرفية والصلاحيات. لا يجوز استخدام جهاز أو فرع خارج النطاق المصرح به."],
      ["التحديثات والمزامنة", "يجوز تحديث مكونات الخدمة وتحسين آليات المزامنة والأمان والتوافق مع الحفاظ على سلامة البيانات قدر الإمكان. العمليات المحلية غير المتزامنة تبقى في طابور المزامنة إلى حين توفر مسار الربط."],
      ["الإيقاف والمخالفة", "يجوز تعليق الوصول عند وجود إساءة استخدام أو خرق أمني أو مخالفة تعاقدية، مع مراعاة إجراءات الاسترداد وحماية البيانات وفق الاتفاقية المطبقة."],
    ],
  },
  Privacy: {
    title: "سياسة الخصوصية وحماية البيانات",
    label: "الخصوصية",
    intro: "توضح هذه السياسة مبادئ التعامل مع بيانات المشترك والمستخدمين وبيانات التشغيل داخل DyPOS.",
    sections: [
      ["البيانات التي تتم معالجتها", "قد تشمل بيانات حساب المشترك، المستخدمين، الفروع، الأجهزة، الأصناف، العملاء، المخزون، المبيعات، المشتريات وبيانات التشغيل اللازمة لتقديم الخدمة."],
      ["الغرض من المعالجة", "تُستخدم البيانات لتسجيل الدخول، فرض الصلاحيات، تشغيل نقاط البيع، حفظ العمليات، المزامنة، الدعم الفني، الحماية، وتحسين موثوقية الخدمة."],
      ["العزل والصلاحيات", "يجب أن تُربط البيانات بسياق المشترك والفرع والصلاحيات المناسبة. الوصول الإداري لا يُمنح لمجرد وجود المستخدم على الجهاز."],
      ["التخزين المحلي", "قد تُخزن بعض بيانات التشغيل الضرورية محلياً لتمكين العمل دون اتصال. يجب حماية الجهاز ومستخدمه لأن البيانات المحلية تكون متاحة وفق صلاحيات الجهاز المحلية."],
      ["المزامنة", "عند عودة الاتصال تُرسل العمليات المحلية إلى مسار المزامنة المعتمد. فشل المزامنة لا يعني حذف العملية المحلية، ويجب إبقاء الحالة واضحة للمستخدم."],
      ["الأمن", "تُطبق ضوابط مثل انتهاء الجلسة، حماية كلمات المرور، تحديد المحاولات، وربط السياق التشغيلي. لا توجد وسيلة تقنية تغني عن حماية الجهاز وبيانات الاعتماد."],
      ["حقوق وإجراءات المشترك", "يمكن للمشترك طلب توضيح نطاق البيانات والإجراءات المتعلقة بها عبر قنوات الدعم المعتمدة وبحسب الاتفاقية والقوانين الواجبة التطبيق."],
    ],
  },
  Agreement: {
    title: "اتفاقية المشترك والتشغيل",
    label: "الاتفاقية",
    intro: "هذه الوثيقة تحدد الإطار التشغيلي بين المشترك وخدمة DyPOS، وتُستكمل بأي عرض أو عقد تجاري منفصل عند وجوده.",
    sections: [
      ["التفعيل", "يبدأ الاشتراك بعد إنشاء الحساب واستكمال متطلبات التحقق أو التفعيل التي يحددها مسار الخدمة. رمز المشترك يحدد نطاق المؤسسة ويجب حفظه واستخدامه عند ربط الأجهزة والمستخدمين."],
      ["الفروع والطرفيات", "يُعرّف كل تشغيل داخل سياق مشترك وفرع وطرفية. إنشاء أو تغيير الفروع والطرفيات يجب أن يتم بواسطة مستخدم مخول."],
      ["المستخدمون والصلاحيات", "المشترك مسؤول عن تعيين الأدوار والصلاحيات ومراجعتها دورياً وسحب صلاحيات المستخدم الذي لم يعد مخولاً."],
      ["الفترات والسياسات التشغيلية", "تخضع عمليات البيع والمخزون والمشتريات والإرجاع وسياسات الوردية والإقفال للإعدادات والصلاحيات المعتمدة في الإصدار المستخدم."],
      ["الاشتراك والدفع", "الرسوم، مدة الاشتراك، حدود الاستخدام، الفترات المسموحة وأي خدمات إضافية تُحدد في العرض أو العقد التجاري المعتمد، ولا تُستنتج من واجهة التطبيق."],
      ["البيانات عند انتهاء الاشتراك", "تخضع إتاحة البيانات، التصدير، الاحتفاظ والحذف لسياسة الخدمة والعقد التجاري والقوانين واجبة التطبيق. لا ينبغي اعتبار انتهاء الوصول حذفاً فورياً للبيانات."],
      ["قبول الاتفاقية", "يُعد تأكيد القبول أثناء التسجيل أو التفعيل إقراراً بقراءة الوثائق المعروضة والموافقة على الإطار التشغيلي المعمول به، مع أولوية العقد التجاري الموقع عند تعارضه مع نص عام."],
    ],
  },
}

const document = computed(() => documents[route.name] || documents.Terms)
function back() {
  router.back()
}
</script>

<template>
  <main class="dy-legal" dir="rtl">
    <section class="dy-legal__card">
      <header class="dy-legal__header">
        <span class="dy-legal__label">DyPOS · {{ document.label }}</span>
        <h1>{{ document.title }}</h1>
        <p>{{ document.intro }}</p>
      </header>

      <article class="dy-legal__body">
        <section v-for="(section, index) in document.sections" :key="section[0]" class="dy-legal__section">
          <div class="dy-legal__index">{{ String(index + 1).padStart(2, "0") }}</div>
          <div>
            <h2>{{ section[0] }}</h2>
            <p>{{ section[1] }}</p>
          </div>
        </section>
      </article>

      <footer class="dy-legal__footer">
        <button type="button" @click="back">العودة</button>
        <RouterLink :to="{ name: 'Login' }">تسجيل الدخول</RouterLink>
        <RouterLink :to="{ name: 'Register' }">إنشاء حساب</RouterLink>
      </footer>
    </section>
  </main>
</template>

<style scoped>
.dy-legal{min-height:100dvh;padding:clamp(20px,4vw,56px);background:var(--dy-bg);color:var(--dy-text);font-family:var(--dy-font-arabic)}
.dy-legal__card{width:min(900px,100%);margin:auto;padding:clamp(22px,4vw,48px);border:1px solid var(--dy-border);border-radius:24px;background:var(--dy-surface);box-shadow:0 18px 60px rgb(0 0 0 / .08)}
.dy-legal__label{display:block;margin-bottom:10px;color:var(--dy-accent);font-size:.8rem;font-weight:800}
.dy-legal h1{margin:0;font-size:clamp(1.8rem,4vw,2.7rem);line-height:1.2;color:var(--dy-text-strong)}
.dy-legal__header>p{margin:14px 0 0;color:var(--dy-text-secondary);line-height:1.9}
.dy-legal__body{display:grid;gap:16px;margin-top:30px}
.dy-legal__section{display:grid;grid-template-columns:auto 1fr;gap:16px;padding:18px;border:1px solid var(--dy-border);border-radius:16px;background:var(--dy-bg-elevated)}
.dy-legal__index{font-variant-numeric:tabular-nums;color:var(--dy-accent);font-weight:900}
.dy-legal h2{margin:0 0 7px;font-size:1rem;color:var(--dy-text-strong)}
.dy-legal__section p{margin:0;color:var(--dy-text-secondary);line-height:1.9}
.dy-legal__footer{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px;padding-top:18px;border-top:1px solid var(--dy-border)}
.dy-legal__footer a,.dy-legal__footer button{border:1px solid var(--dy-border);border-radius:10px;padding:9px 14px;background:transparent;color:var(--dy-text);font:inherit;text-decoration:none;cursor:pointer}
.dy-legal__footer a:hover,.dy-legal__footer button:hover{border-color:var(--dy-accent);color:var(--dy-accent)}
@media(max-width:520px){.dy-legal{padding:12px}.dy-legal__section{grid-template-columns:1fr;gap:8px}}
</style>
