<template>
  <div class="stock-count-instructions max-w-4xl mx-auto">
    <!-- Header -->
    <div class="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
      <div class="flex items-start gap-3">
        <div class="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <FeatherIcon name="book-open" class="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h3 class="text-lg font-bold text-gray-900">{{ __("تعليمات الجرد الفعلي للمخزون") }}</h3>
          <p class="text-sm text-gray-600 mt-1">{{ __("دليل عملي لفريق العدادية لإجراء الجرد الفعلي بدقة وكفاءة") }}</p>
        </div>
      </div>
    </div>

    <!-- Currency & UoM Selection -->
    <div class="mb-6 p-4 bg-gray-50 rounded-xl border">
      <h4 class="font-medium text-gray-900 mb-4 flex items-center gap-2">
        <FeatherIcon name="settings" class="w-5 h-5 text-gray-500" />
        {{ __("إعدادات العرض والتحويل") }}
      </h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Currency Selector -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">{{ __("عملة العرض") }}</label>
          <select
            :value="props.selectedCurrency"
            @change="$emit('currency-change', $event.target.value)"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          >
            <option v-for="c in currencies" :key="c.code" :value="c.code">
              {{ c.symbol }} {{ c.code }} - {{ c.name }} ({{ c.rate }})
            </option>
          </select>
          <p class="text-xs text-gray-500 mt-1">{{ __("تحويل جميع القيم للعملة المختارة تلقائياً") }}</p>
        </div>

        <!-- UoM Selector -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">{{ __("وحدة القياس القياسية") }}</label>
          <select
            :value="props.selectedUom"
            @change="$emit('uom-change', $event.target.value)"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
          >
            <option v-for="u in uoms" :key="u.code" :value="u.code">
              {{ u.code }} - {{ u.nameAr }} ({{ u.factor }} {{ u.type }})
            </option>
          </select>
          <p class="text-xs text-gray-500 mt-1">{{ __("تحويل الكميات لوحدة القياس المختارة تلقائياً") }}</p>
        </div>
      </div>

      <!-- Currency/UoM Info -->
      <div class="mt-4 p-3 bg-white rounded-lg border border-gray-200">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div class="p-2 bg-green-50 rounded-lg">
            <span class="text-gray-500">{{ __("العملة الأساسية") }}</span>
            <div class="font-medium text-green-700">{{ baseCurrency.symbol }} {{ baseCurrency.code }}</div>
          </div>
          <div class="p-2 bg-blue-50 rounded-lg">
            <span class="text-gray-500">{{ __("عملة العرض") }}</span>
            <div class="font-medium text-blue-700">{{ selectedCurrencyObj.symbol }} {{ selectedCurrencyObj.code }}</div>
          </div>
          <div class="p-2 bg-purple-50 rounded-lg">
            <span class="text-gray-500">{{ __("وحدة القياس الأساسية") }}</span>
            <div class="font-medium text-purple-700">{{ baseUom.code }} - {{ baseUom.nameAr }}</div>
          </div>
          <div class="p-2 bg-orange-50 rounded-lg">
            <span class="text-gray-500">{{ __("وحدة القياس المعروضة") }}</span>
            <div class="font-medium text-orange-700">{{ selectedUomObj.code }} - {{ selectedUomObj.nameAr }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Steps -->
    <div class="space-y-6">
      <!-- Step 1: Preparation -->
      <StepCard
        :number="1"
        title="التحضير قبل الجرد"
        icon="clipboard"
        color="blue"
      >
        <ul class="space-y-3">
          <li v-for="(item, i) in step1Items" :key="i" class="flex items-start gap-3">
            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">{{ i + 1 }}</span>
            <div class="text-gray-700">{{ item }}</div>
          </li>
        </ul>
      </StepCard>

      <!-- Step 2: Counting Process -->
      <StepCard
        :number="2"
        title="عملية العد الفعلي"
        icon="mouse-pointer"
        color="green"
      >
        <ul class="space-y-3">
          <li v-for="(item, i) in step2Items" :key="i" class="flex items-start gap-3">
            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-bold">{{ i + 1 }}</span>
            <div class="text-gray-700">{{ item }}</div>
          </li>
        </ul>
      </StepCard>

      <!-- Step 3: Recording & Verification -->
      <StepCard
        :number="3"
        title="التسجيل والتحقق"
        icon="check-square"
        color="purple"
      >
        <ul class="space-y-3">
          <li v-for="(item, i) in step3Items" :key="i" class="flex items-start gap-3">
            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold">{{ i + 1 }}</span>
            <div class="text-gray-700">{{ item }}</div>
          </li>
        </ul>
      </StepCard>

      <!-- Step 4: Reconciliation -->
      <StepCard
        :number="4"
        title="المطابقة والتسوية"
        icon="refresh-cw"
        color="orange"
      >
        <ul class="space-y-3">
          <li v-for="(item, i) in step4Items" :key="i" class="flex items-start gap-3">
            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-sm font-bold">{{ i + 1 }}</span>
            <div class="text-gray-700">{{ item }}</div>
          </li>
        </ul>
      </StepCard>
    </div>

    <!-- Important Rules -->
    <div class="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
      <h4 class="font-medium text-red-800 flex items-center gap-2 mb-3">
        <FeatherIcon name="alert-triangle" class="w-5 h-5" />
        {{ __("قواعد هامة - يجب الالتزام بها") }}
      </h4>
      <ul class="space-y-2 text-sm text-red-700">
        <li v-for="(rule, i) in criticalRules" :key="i" class="flex items-start gap-2">
          <FeatherIcon name="x-circle" class="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
          <span>{{ rule }}</span>
        </li>
      </ul>
    </div>

    <!-- Quick Reference Card -->
    <div class="mt-6 p-4 bg-gray-50 rounded-xl border">
      <h4 class="font-medium text-gray-900 mb-3 flex items-center gap-2">
        <FeatherIcon name="zap" class="w-5 h-5 text-indigo-600" />
        {{ __("مرجع سريع للوحدات والعملات") }}
      </h4>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-100">
              <th class="p-2 text-right">{{ __("النوع") }}</th>
              <th class="p-2 text-right">{{ __("الكود") }}</th>
              <th class="p-2 text-right">{{ __("الاسم") }}</th>
              <th class="p-2 text-right">{{ __("المعامل") }}</th>
              <th class="p-2 text-right">{{ __("النوع") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in uoms" :key="u.code" class="border-t border-gray-100 hover:bg-white">
              <td class="p-2">
                <span class="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600">{{ u.type }}</span>
              </td>
              <td class="p-2 font-mono font-medium">{{ u.code }}</td>
              <td class="p-2">{{ u.nameAr }}</td>
              <td class="p-2 font-mono">{{ u.factor }}</td>
              <td class="p-2">
                <span class="px-2 py-0.5 text-xs rounded-full"
                  :class="u.type === 'count' ? 'bg-blue-100 text-blue-700' : u.type === 'weight' ? 'bg-green-100 text-green-700' : u.type === 'length' ? 'bg-purple-100 text-purple-700' : u.type === 'volume' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'">
                  {{ u.type }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Keyboard Shortcuts -->
    <div class="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
      <h4 class="font-medium text-indigo-800 flex items-center gap-2 mb-3">
        <FeatherIcon name="keyboard" class="w-5 h-5" />
        {{ __("اختصارات لوحة المفاتيح") }}
      </h4>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <ShortcutKey key="Ctrl+N" desc="صفحة جديدة" />
        <ShortcutKey key="Ctrl+S" desc="حفظ" />
        <ShortcutKey key="Ctrl+F" desc="بحث" />
        <ShortcutKey key="Esc" desc="إلغاء" />
        <ShortcutKey key="Enter" desc="تأكيد" />
        <ShortcutKey key="Tab" desc="الحقل التالي" />
        <ShortcutKey key="Shift+Tab" desc="الحقل السابق" />
        <ShortcutKey key="Ctrl+P" desc="طباعة" />
      </div>
    </div>

    <!-- Offline checklist -->
    <div class="mt-6 p-4 bg-gray-50 rounded-xl border text-center no-print">
      <p class="text-gray-600 mb-2">{{ __("خطوات الجرد متاحة أعلاه للرجوع إليها أثناء التنفيذ") }}</p>
      <Button variant="outline" size="sm" @click="printGuide">
        <FeatherIcon name="printer" class="w-4 h-4" />
        {{ __("طباعة قائمة التحقق") }}
      </Button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue"
import { DEFAULT_CURRENCY } from "@/utils/currency"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	warehouses: { type: Array, default: () => [] },
	currencies: { type: Array, default: () => [] },
	uoms: { type: Array, default: () => [] },
	selectedCurrency: { type: String, default: () => DEFAULT_CURRENCY },
	selectedUom: { type: String, default: "PCS" },
})

const emit = defineEmits(["currency-change", "uom-change"])

// Base currency/UoM
const baseCurrency = computed(
	() => props.currencies.find((c) => c.isBase) || props.currencies[0],
)
const baseUom = computed(
	() => props.uoms.find((u) => u.isBase) || props.uoms[0],
)

const selectedCurrencyObj = computed(
	() =>
		props.currencies.find((c) => c.code === props.selectedCurrency) ||
		props.currencies[0],
)
const selectedUomObj = computed(
	() => props.uoms.find((u) => u.code === props.selectedUom) || props.uoms[0],
)

const step1Items = [
	"مراجعة قائمة الأصناف والتأكد من وجود جميع الأصناف في النظام",
	"توزيع فرق العد على المستودعات والأقسام مع تعيين قائد لكل فريق",
	"تجهيز أجهزة العد (أجهزة باركود، أوراق عد، أقلام، ملصقات)",
	"مراجعة وحد القياس والعملات لكل صنف والتأكد من التكوين الصحيح",
	"إجراء اجتماع تحضيري مع الفرق لشرح الإجراءات والرد على الاستفسارات",
	"تجهيز نماذج العد (ورقية أو إلكترونية) مع كود الصنف والموقع",
]

const step2Items = [
	"بدء العد من نقطة بداية محددة والتحرك بنظام (من اليمين لليسار، من الأعلى للأسفل)",
	"عد كل صنف على حدة وتسجيل الكمية بدقة مع وحدة القياس الصحيحة",
	"استخدام الماسح الضوئي (باركود) عند توفر الباركود لتقليل الأخطاء",
	"تسجيل الوحدات بشكل منفصل إذا كان الصنف بأكثر من وحدة قياس",
	"تدوين الملاحظات لأي اختلافات أو تلف أو منتهية الصلاحية",
	"التوقيع على نموذج العد من قبل العادّ والمراجع",
]

const step3Items = [
	"إدخال بيانات العد في النظام فور الانتهاء من كل قسم",
	"مراجعة البيانات المدخلة مقابل النماذج الورقية",
	"التحقق من وحدات القياس والعملات لكل سطر",
	"مقارنة الكميات المدخلة مع الرصيد النظامي الحالي",
	"وضع علامة على الأصناف التي بها فروقات للمراجعة",
]

const step4Items = [
	"تحضير تقرير الفروقات بين الجرد الفعلي والنظامي",
	"تحقيق أسباب الفروقات (تلف، سرقة، خطأ تسجيل، وحدة قياس خاطئة)",
	"إعداد قيود التسوية المحاسبية للموافقة عليها",
	"تنفيذ قيود التسوية وتحديث الأرصدة في النظام",
	"إعداد تقرير الجرد النهائي وتوقيعه من المدير المسؤول",
	"أرشفة جميع مستندات الجرد (ورقية وإلكترونية) للرجوع إليها",
]

const criticalRules = [
	"لا يتم تغيير وحدة القياس أو العملة أثناء عملية الجرد",
	"لا يتم حذف أو تعديل بيانات الأصناف الأساسية أثناء الجرد",
	"كل فرق يجب أن يكون له سبب موثق وموقع من العاد والمراجع",
	"لا يتم قبول أي كمية سالبة إلا للتلفيات والمرتجعات الموثقة",
	"يجب مراجعة الأصناف ذات الوحدات المركبة (صندوق = 12 قطعة) بدقة",
	"العملة الأساسية للتقارير هي عملة المنشأة — التحويل تلقائي",
]

function printGuide() {
	window.print()
}
</script>

<style scoped>
/* Step Card Component Styles */
.step-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.step-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid #e5e7eb;
}

.step-number {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
  color: white;
}

.step-icon {
  width: 24px;
  height: 24px;
  color: white;
}

.step-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
}

.step-content {
  padding: 16px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  transition: background 0.2s;
}

.step-item:hover {
  background: #f3f4f6;
}

.step-number {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.875rem;
  color: white;
  flex-shrink: 0;
}

.step-text {
  flex: 1;
  line-height: 1.6;
}

.shortcut-key {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: white;
  border: 1px solid #e0e7ff;
  border-radius: 8px;
  color: #4f46e5;
  font-family: monospace;
  font-size: 0.75rem;
}

.shortcut-key kbd {
  background: #eef2ff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
}

/* Color variants */
.step-card-blue .step-number { background: #3b82f6; }
.step-card-blue .step-icon { color: #3b82f6; }
.step-card-blue .step-number-bg { background: #dbeafe; }

.step-card-green .step-number { background: #10b981; }
.step-card-green .step-icon { color: #10b981; }

.step-card-purple .step-number { background: #8b5cf6; }
.step-card-purple .step-icon { color: #8b5cf6; }

.step-card-orange .step-number { background: #f59e0b; }
.step-card-orange .step-icon { color: #f59e0b; }

@media (max-width: 640px) {
  .step-card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>