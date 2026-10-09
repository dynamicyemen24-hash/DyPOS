<script setup>
import { computed, useId } from "vue"
import { ActionButton, FeatherIcon } from "dypos-ui"

const props = defineProps({
  items: { type: Array, default: () => [] },
  busyIds: { type: Array, default: () => [] },
  actionErrors: { type: Object, default: () => ({}) },
  title: { type: String, default: "عمليات تحتاج إلى معالجة" },
  emptyMessage: { type: String, default: "لا توجد عمليات معلّقة للمعالجة" },
})
const emit = defineEmits(["retry", "repair", "review", "open-resource", "dismiss"])
const headingId = `sync-recovery-title-${useId()}`
const busy = id => props.busyIds.includes(String(id))
const failures = computed(() => props.items.filter(item => item?.status === "FAILED" || item?.recovery))
const actionLabel = recovery => ({
  EDIT_PAYLOAD_AND_RETRY: "استكمال البيانات",
  FIX_PAYLOAD_AND_RETRY: "تصحيح البيانات",
  CREATE_OR_SYNC_PRODUCT_FIRST: "فتح الأصناف",
  OPEN_ONLINE_INVOICE_FLOW: "متابعة البيع",
  RETRY: "إعادة المحاولة",
  REVIEW_AND_RETRY: "مراجعة العملية",
}[recovery?.nextAction] || "مراجعة الخطأ")
const actionPayload = item => ({ id: item.id, item, recovery: item.recovery || {} })
</script>

<template>
  <section class="sync-recovery" :aria-labelledby="headingId">
    <header class="sync-recovery__header">
      <div>
        <h2 :id="headingId">{{ title }}</h2>
        <p>{{ failures.length }} عملية تحتاج إلى معالجة</p>
      </div>
      <span class="sync-recovery__count" :aria-label="`${failures.length} أخطاء`">{{ failures.length }}</span>
    </header>

    <p v-if="!failures.length" class="sync-recovery__empty" role="status">{{ emptyMessage }}</p>

    <ol v-else class="sync-recovery__list">
      <li v-for="item in failures" :key="String(item.id)" class="sync-recovery__item" :aria-busy="busy(item.id)">
        <div class="sync-recovery__icon" aria-hidden="true"><FeatherIcon name="alert-triangle" /></div>
        <div class="sync-recovery__body">
          <h3>{{ item.recovery?.title || "تعذّرت معالجة العملية" }}</h3>
          <p>{{ item.recovery?.message || item.error || "راجع بيانات العملية ثم أعد المحاولة." }}</p>
          <p v-if="item.recovery?.missingFields?.length" class="sync-recovery__hint">
            الحقول الناقصة: {{ item.recovery.missingFields.map(field => field.label || field.field).join("، ") }}
          </p>
          <p v-if="item.recovery?.missingReferences?.length" class="sync-recovery__hint">
            المرجع المطلوب: {{ item.recovery.missingReferences.map(ref => `${ref.entity} — ${ref.value || ref.field}`).join("، ") }}
          </p>
          <p v-if="actionErrors[String(item.id)]" class="sync-recovery__action-error" role="alert">{{ actionErrors[String(item.id)] }}</p>
          <p class="sync-recovery__meta">معرّف العملية: <bdi>{{ item.id }}</bdi></p>
        </div>
        <div class="sync-recovery__actions">
          <ActionButton
            v-if="item.recovery?.endpoint || item.recovery?.resource"
            variant="secondary"
            size="sm"
            :disabled="busy(item.id)"
            @click="emit('open-resource', actionPayload(item))"
          >{{ actionLabel(item.recovery) }}</ActionButton>
          <ActionButton
            v-else-if="item.recovery?.nextAction === 'EDIT_PAYLOAD_AND_RETRY' || item.recovery?.nextAction === 'FIX_PAYLOAD_AND_RETRY'"
            variant="secondary"
            size="sm"
            :disabled="busy(item.id)"
            @click="emit('repair', actionPayload(item))"
          >استكمال ثم إعادة الإرسال</ActionButton>
          <ActionButton
            v-else-if="item.recovery?.retryable"
            variant="secondary"
            size="sm"
            :disabled="busy(item.id)"
            @click="emit('retry', actionPayload(item))"
          >{{ busy(item.id) ? "جارٍ التنفيذ…" : "إعادة المحاولة" }}</ActionButton>
          <ActionButton
            v-else
            variant="secondary"
            size="sm"
            :disabled="busy(item.id)"
            @click="emit('review', actionPayload(item))"
          >مراجعة العملية</ActionButton>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.sync-recovery{display:grid;gap:12px;min-width:0;color:var(--dy-text);border:1px solid var(--dy-border);border-radius:14px;background:var(--dy-surface);padding:16px}
.sync-recovery__header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.sync-recovery__header h2,.sync-recovery__body h3{margin:0;font-size:14px;font-weight:700}
.sync-recovery__header p,.sync-recovery__body p{margin:4px 0 0;font-size:13px;line-height:1.6;color:var(--dy-text-secondary)}
.sync-recovery__count{display:grid;place-items:center;min-width:30px;height:30px;padding-inline:8px;border-radius:999px;background:var(--dy-danger-soft,#fef2f2);color:var(--dy-danger-contrast,#991b1b);font-weight:700;font-variant-numeric:tabular-nums}
.sync-recovery__list{display:grid;gap:10px;list-style:none;margin:0;padding:0}
.sync-recovery__item{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:start;gap:12px;padding:12px;border:1px solid var(--dy-border);border-radius:10px}
.sync-recovery__icon{color:var(--dy-warning);padding-top:2px}
.sync-recovery__hint{font-weight:600}
.sync-recovery__meta{font-size:11px!important;color:var(--dy-text-muted)!important}
.sync-recovery__action-error{padding:8px 10px;border-radius:8px;background:var(--dy-danger-soft,#fef2f2);color:var(--dy-danger-contrast,#991b1b)!important;font-weight:600}
.sync-recovery__actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.sync-recovery__empty{margin:0;padding:16px;color:var(--dy-text-secondary);font-size:13px}
@media(max-width:640px){.sync-recovery__item{grid-template-columns:24px minmax(0,1fr)}.sync-recovery__actions{grid-column:2;justify-content:stretch}.sync-recovery__actions>*{flex:1;min-height:44px}}
@media(prefers-reduced-motion:reduce){.sync-recovery *{animation:none!important;transition:none!important}}
</style>
