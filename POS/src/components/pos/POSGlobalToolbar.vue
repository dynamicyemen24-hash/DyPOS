<template>
  <div class="dypos-global-tools" role="toolbar" aria-label="الأدوات العامة والتنقل">
    <div class="dypos-global-tools__nav">
      <button type="button" @click="$emit('back')" title="العودة"><FeatherIcon name="arrow-right" :size="14" /> العودة</button>
      <button type="button" @click="$emit('home')" title="الرئيسية"><FeatherIcon name="home" :size="14" /> الرئيسية</button>
      <button type="button" @click="$emit('operations')" title="العمليات"><FeatherIcon name="activity" :size="14" /> العمليات</button>
      <button type="button" @click="$emit('stock')" title="المخزون"><FeatherIcon name="package" :size="14" /> المخزون</button>
    </div>
    <div class="dypos-global-tools__actions">
      <button type="button" :class="{ 'is-primary': canCheckout }" :disabled="!canCheckout" @click="$emit('payment')"><FeatherIcon name="credit-card" :size="14" /> دفع <kbd>Ctrl↵</kbd></button>
      <button type="button" @click="$emit('scan')"><FeatherIcon name="maximize" :size="14" /> مسح</button>
      <button type="button" @click="$emit('shortcuts')"><FeatherIcon name="command" :size="14" /> الاختصارات</button>
    </div>
    <div class="dypos-global-tools__status" role="status" aria-live="polite">
      <span><i :class="['dypos-global-tools__dot', 'dypos-global-tools__dot--' + syncState]" />{{ saleStatusLabel }}</span>
      <span><FeatherIcon :name="isOnline ? 'wifi' : 'wifi-off'" :size="12" /> {{ isOnline ? 'متصل' : 'وضع عدم الاتصال' }}</span>
      <span class="dypos-global-tools__spacer" />
      <span>{{ cartLabel }}</span><span>الإجمالي {{ totalLabel }}</span>
      <button type="button" @click="$emit('sync')"><FeatherIcon name="refresh-cw" :size="12" /> مركز المزامنة</button>
    </div>
  </div>
</template>

<script setup>
import { FeatherIcon } from "dypos-ui"
defineProps({
  canCheckout: Boolean,
  isOnline: Boolean,
  syncState: { type: String, default: "ready" },
  saleStatusLabel: { type: String, default: "" },
  cartLabel: { type: String, default: "" },
  totalLabel: { type: String, default: "" },
})
defineEmits(["back", "home", "operations", "stock", "payment", "scan", "shortcuts", "sync"])
</script>

<style scoped>
.dypos-global-tools{display:flex;align-items:center;gap:10px;min-height:42px;padding:5px 20px;border-top:1px solid rgb(241 245 249);background:rgb(248 250 252/.92);overflow:auto;scrollbar-width:thin}
.dypos-global-tools__nav,.dypos-global-tools__actions,.dypos-global-tools__status{display:flex;align-items:center;gap:5px;flex:0 0 auto}
.dypos-global-tools button{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 9px;border:1px solid transparent;border-radius:9px;background:transparent;color:rgb(71 85 105);font-size:11px;font-weight:700;white-space:nowrap;cursor:pointer}
.dypos-global-tools button:hover{border-color:rgb(226 232 240);background:#fff;color:rgb(15 23 42)}
.dypos-global-tools button.is-primary{background:rgb(4 120 87);color:#fff}.dypos-global-tools button:disabled{opacity:.45;cursor:not-allowed}
.dypos-global-tools__status{margin-inline-start:auto;color:rgb(71 85 105);font-size:10px;white-space:nowrap}.dypos-global-tools__spacer{flex:1;min-width:10px}.dypos-global-tools__dot{display:inline-block;width:7px;height:7px;margin-inline-end:5px;border-radius:50%;background:#94a3b8}.dypos-global-tools__dot--ready{background:#10b981}.dypos-global-tools__dot--syncing{background:#f59e0b}.dypos-global-tools__dot--error{background:#ef4444}
@media(max-width:760px){.dypos-global-tools{padding-inline:10px}.dypos-global-tools__status{display:none}.dypos-global-tools button{padding-inline:7px}}
</style>