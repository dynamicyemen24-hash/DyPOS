<template>
  <section class="dy-login-guide" dir="rtl" aria-label="دليل بدء استخدام DyPOS">
    <details>
      <summary>
        <span class="dy-login-guide__title">ابدأ بالطريقة الصحيحة</span>
        <span class="dy-login-guide__hint">دليل سريع للمشترك والجهاز الجديد</span>
      </summary>
      <div class="dy-login-guide__body">
        <ol>
          <li><strong>مشترك جديد:</strong> اختر «سجّل الآن» وأنشئ حساب المشترك، ثم أكمل إعداد المؤسسة والفرع والمستخدمين.</li>
          <li><strong>مشترك حالي:</strong> أدخل البريد/اسم المستخدم وكلمة المرور، ويمكنك إضافة رمز المشترك لتثبيت نطاق المؤسسة الصحيح.</li>
          <li><strong>جهاز جديد:</strong> أول دخول يحتاج الربط المصرح به؛ بعده تُحفظ جلسة محلية آمنة ويستمر POS عند انقطاع الشبكة وفق صلاحيات الجهاز.</li>
          <li><strong>بعد الدخول:</strong> أكمل الفرع والوردية والطابعة وطرق الدفع قبل أول عملية بيع.</li>
        </ol>
        <div class="dy-login-guide__links">
          <a href="/account/register">إنشاء اشتراك جديد</a>
          <a href="/forgot-password">استعادة كلمة المرور</a>
          <a :href="companyWebsite" target="_blank" rel="noopener noreferrer">الموقع والوثائق المؤسسية</a>
        </div>
        <p class="dy-login-guide__governance">
          الحوكمة: هوية المشترك ← المؤسسة ← الفرع ← الجهاز ← المستخدم ← الدور والصلاحيات ← الاشتراك والفترة المسموحة.
          لا يمنح رمز المشترك صلاحية بمفرده؛ التحقق النهائي يتم من الخادم.
        </p>
      </div>
    </details>
  </section>
</template>

<script setup>
import { COMPANY_WEBSITE } from "@/utils/brand"
const companyWebsite = COMPANY_WEBSITE
</script>

<style scoped>
.dy-login-guide { margin-top: 12px; border: 1px solid var(--dy-border); border-radius: 12px; background: var(--dy-bg-elevated); }
.dy-login-guide summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; }
.dy-login-guide summary::-webkit-details-marker { display: none; }
.dy-login-guide__title { font-weight: 700; }
.dy-login-guide__hint { color: var(--dy-text-muted); font-size: .82rem; }
.dy-login-guide__body { padding: 0 14px 14px; }
.dy-login-guide ol { margin: 0; padding-inline-start: 22px; display: grid; gap: 7px; }
.dy-login-guide__links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.dy-login-guide__links a { color: var(--dy-brand); font-weight: 700; text-decoration: none; }
.dy-login-guide__links a:hover { text-decoration: underline; }
.dy-login-guide__governance { margin: 12px 0 0; color: var(--dy-text-muted); font-size: .78rem; line-height: 1.6; }
@media (max-width: 640px) { .dy-login-guide summary { align-items: flex-start; flex-direction: column; } }
</style>