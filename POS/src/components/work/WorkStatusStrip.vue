<script setup>
import { computed } from "vue"
import { FeatherIcon } from "dypos-ui"

const props = defineProps({
  state: { type: String, default: "ready", validator: v => ["ready", "loading", "saved", "offline", "warning", "error"].includes(v) },
  message: { type: String, default: "" },
  details: { type: String, default: "" },
  updatedAt: { type: [Date, String, Number], default: null },
  items: { type: Array, default: () => [] },
  sticky: { type: Boolean, default: false },
})
const icons = { ready: "check-circle", loading: "loader", saved: "check", offline: "wifi-off", warning: "alert-triangle", error: "alert-circle" }
const labels = { ready: "جاهز", loading: "جارٍ العمل", saved: "تم الحفظ", offline: "غير متصل", warning: "يتطلب الانتباه", error: "حدث خطأ" }
const stateIcon = computed(() => icons[props.state] || icons.ready)
const stateLabel = computed(() => props.message || labels[props.state] || labels.ready)
const timestamp = computed(() => {
  if (!props.updatedAt) return ""
  const date = props.updatedAt instanceof Date ? props.updatedAt : new Date(props.updatedAt)
  if (Number.isNaN(date.getTime())) return ""
  try { return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date) } catch { return "" }
})
</script>

<template>
  <footer class="work-status-strip" :class="[`work-status-strip--${state}`, { 'work-status-strip--sticky': sticky }"
    :aria-label="'حالة شاشة العمل'" :aria-live="state === 'error' || state === 'warning' ? 'assertive' : 'polite'">
    <div class="work-status-strip__primary">
      <span class="work-status-strip__indicator" aria-hidden="true"><FeatherIcon :name="stateIcon" /></span>
      <strong>{{ stateLabel }}</strong>
      <span v-if="details" class="work-status-strip__details">{{ details }}</span>
      <span v-if="timestamp" class="work-status-strip__time">آخر تحديث {{ timestamp }}</span>
    </div>
    <div v-if="items.length || $slots.default" class="work-status-strip__metrics">
      <span v-for="item in items" :key="item.id" class="work-status-strip__metric">
        <span>{{ item.label }}</span><strong>{{ item.value }}</strong>
      </span>
      <slot />
    </div>
  </footer>
</template>

<style scoped>
.work-status-strip{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;min-height:36px;padding:7px 14px;border-block:1px solid var(--dy-border);background:var(--dy-surface);color:var(--dy-text-secondary);font-size:12px}
.work-status-strip--sticky{position:sticky;inset-block-end:0;z-index:15;box-shadow:0 -4px 14px rgb(15 23 42 / 4%)}
.work-status-strip__primary,.work-status-strip__metrics,.work-status-strip__metric{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.work-status-strip__primary strong{color:var(--dy-text);font-weight:650}.work-status-strip__indicator{display:grid;place-items:center;width:20px;height:20px}
.work-status-strip__details,.work-status-strip__time{color:var(--dy-text-muted)}
.work-status-strip__metric{padding-inline-start:10px;border-inline-start:1px solid var(--dy-border)}.work-status-strip__metric strong{color:var(--dy-text);font-variant-numeric:tabular-nums}
.work-status-strip--ready .work-status-strip__indicator,.work-status-strip--saved .work-status-strip__indicator{color:var(--dy-success)}.work-status-strip--loading .work-status-strip__indicator{color:var(--dy-primary)}.work-status-strip--offline .work-status-strip__indicator,.work-status-strip--warning .work-status-strip__indicator{color:var(--dy-warning)}.work-status-strip--error .work-status-strip__indicator{color:var(--dy-danger)}
@media(max-width:640px){.work-status-strip{align-items:flex-start}.work-status-strip__primary,.work-status-strip__metrics{width:100%}.work-status-strip__metrics{padding-inline-start:28px}}
@media(prefers-reduced-motion:reduce){.work-status-strip *{animation:none!important;transition:none!important}}
</style>
