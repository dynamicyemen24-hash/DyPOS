<script setup>
defineProps({
  as: { type: String, default: "section" },
  label: { type: String, default: "" },
  scrollable: { type: Boolean, default: false },
  dense: { type: Boolean, default: false },
  flush: { type: Boolean, default: false },
})
</script>

<template>
  <component :is="as" class="work-panel" :class="{ 'work-panel--scrollable': scrollable, 'work-panel--dense': dense, 'work-panel--flush': flush }"
    :aria-label="label || undefined">
    <header v-if="$slots.header" class="work-panel__header"><slot name="header" /></header>
    <div class="work-panel__body"><slot /></div>
    <footer v-if="$slots.footer" class="work-panel__footer"><slot name="footer" /></footer>
  </component>
</template>

<style scoped>
.work-panel{display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--dy-border);border-radius:14px;background:var(--dy-surface);color:var(--dy-text);box-shadow:0 4px 16px rgb(15 23 42 / 3%);overflow:hidden}
.work-panel__header,.work-panel__footer{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px;background:color-mix(in srgb,var(--dy-surface) 92%,var(--dy-bg));}
.work-panel__header{border-block-end:1px solid var(--dy-border)}.work-panel__footer{border-block-start:1px solid var(--dy-border)}
.work-panel__body{min-width:0;min-height:0;padding:18px}
.work-panel--scrollable .work-panel__body{overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:var(--dy-border-strong,var(--dy-border)) transparent}
.work-panel--scrollable .work-panel__body::-webkit-scrollbar{width:8px;height:8px}.work-panel--scrollable .work-panel__body::-webkit-scrollbar-track{background:transparent}.work-panel--scrollable .work-panel__body::-webkit-scrollbar-thumb{border:2px solid transparent;border-radius:99px;background:var(--dy-border-strong,var(--dy-border));background-clip:padding-box}
.work-panel--dense .work-panel__body{padding:12px}.work-panel--flush .work-panel__body{padding:0}
.work-panel :deep(:focus-visible){outline:3px solid color-mix(in srgb,var(--dy-primary) 42%,transparent);outline-offset:2px}
@media(max-width:640px){.work-panel{border-radius:11px}.work-panel__header,.work-panel__footer{padding:12px}.work-panel__body{padding:14px}.work-panel--dense .work-panel__body{padding:9px}}
@media(prefers-reduced-motion:reduce){.work-panel *{scroll-behavior:auto!important;transition:none!important}}
</style>
