<script setup>
import { computed, ref, onMounted, onUnmounted, useId } from "vue"
import { FeatherIcon } from "dypos-ui"

const props = defineProps({
  items: { type: Array, default: () => [] },
  label: { type: String, default: "إجراءات الشاشة" },
  density: { type: String, default: "comfortable", validator: v => ["comfortable", "compact"].includes(v) },
  overflowLabel: { type: String, default: "المزيد" },
})
const emit = defineEmits(["action"])
const root = ref(null)
const activeIndex = ref(0)
const idBase = `work-menu-${useId()}`
const visibleItems = computed(() => props.items.filter(item => !item.hidden))
const enabledItems = computed(() => visibleItems.value.filter(item => !item.separator && !item.disabled))
function run(item) {
  if (!item || item.disabled || item.separator) return
  if (typeof item.handler === "function") item.handler()
  emit("action", item.id)
}
function focusItem(index) {
  const buttons = root.value?.querySelectorAll('[data-menu-item="true"]:not(:disabled)')
  if (!buttons?.length) return
  const next = (index + buttons.length) % buttons.length
  activeIndex.value = next
  buttons[next]?.focus()
}
function onKeydown(event) {
  const buttons = [...(root.value?.querySelectorAll('[data-menu-item="true"]:not(:disabled)') || [])]
  const index = buttons.indexOf(event.target)
  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    event.preventDefault()
    const direction = root.value?.closest('[dir="rtl"]') ? -1 : 1
    focusItem(index + (event.key === "ArrowRight" ? direction : -direction))
  } else if (event.key === "Home") {
    event.preventDefault(); focusItem(0)
  } else if (event.key === "End") {
    event.preventDefault(); focusItem(buttons.length - 1)
  } else if (event.key === "Escape") {
    const details = root.value?.querySelector("details[open]")
    if (details) {
      details.open = false
      details.querySelector("summary")?.focus()
      event.preventDefault()
    }
  }
}
function onGlobalShortcut(event) {
  if (event.defaultPrevented || event.isComposing) return
  const target = event.target
  if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
  const item = enabledItems.value.find(entry => {
    if (!entry.shortcut) return false
    const parts = entry.shortcut.toLowerCase().split("+").map(part => part.trim())
    const key = parts.pop()
    const wantsCtrl = parts.includes("ctrl") || parts.includes("control")
    const wantsMeta = parts.includes("meta") || parts.includes("cmd") || parts.includes("command")
    const wantsAlt = parts.includes("alt") || parts.includes("option")
    const wantsShift = parts.includes("shift")
    if (!(wantsCtrl || wantsMeta || wantsAlt || wantsShift)) return false
    return event.key.toLowerCase() === key &&
      event.ctrlKey === wantsCtrl && event.metaKey === wantsMeta &&
      event.altKey === wantsAlt && event.shiftKey === wantsShift
  })
  if (item) { event.preventDefault(); run(item) }
}
onMounted(() => window.addEventListener("keydown", onGlobalShortcut))
onUnmounted(() => window.removeEventListener("keydown", onGlobalShortcut))
</script>

<template>
  <nav ref="root" class="work-menu-strip" :class="`work-menu-strip--${density}`" :aria-label="label" @keydown="onKeydown">
    <div class="work-menu-strip__items" role="toolbar" :aria-label="label">
      <template v-for="item in visibleItems" :key="item.id">
        <span v-if="item.separator" class="work-menu-strip__separator" aria-hidden="true"></span>
        <button v-else :id="`${idBase}-${item.id}`" data-menu-item="true" type="button"
          class="work-menu-strip__item" :class="{ 'is-active': item.active }"
          :disabled="item.disabled" :aria-pressed="item.toggle ? !!item.active : undefined"
          :title="item.shortcut ? `${item.label} (${item.shortcut})` : item.label"
          @click="run(item)">
          <FeatherIcon v-if="item.icon" :name="item.icon" class="work-menu-strip__icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
          <kbd v-if="item.shortcut" class="work-menu-strip__shortcut">{{ item.shortcut }}</kbd>
        </button>
      </template>
      <slot name="end" />
    </div>
    <details v-if="$slots.overflow" class="work-menu-strip__overflow-wrap">
      <summary class="work-menu-strip__overflow">{{ overflowLabel }} <FeatherIcon name="chevron-down" aria-hidden="true" /></summary>
      <div class="work-menu-strip__overflow-content"><slot name="overflow" /></div>
    </details>
  </nav>
</template>

<style scoped>
.work-menu-strip{position:relative;display:flex;align-items:center;gap:8px;min-width:0;padding:8px 12px;border-block:1px solid var(--dy-border);background:var(--dy-surface);color:var(--dy-text);z-index:20}
.work-menu-strip__items{display:flex;align-items:center;gap:5px;min-width:0;max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin;scrollbar-color:var(--dy-border-strong,var(--dy-border)) transparent;scrollbar-gutter:stable;white-space:nowrap}
.work-menu-strip__overflow-wrap{position:relative;flex:0 0 auto}.work-menu-strip__overflow{list-style:none}.work-menu-strip__overflow::-webkit-details-marker{display:none}.work-menu-strip__items::-webkit-scrollbar{height:6px}.work-menu-strip__items::-webkit-scrollbar-track{background:transparent}.work-menu-strip__items::-webkit-scrollbar-thumb{background:var(--dy-border-strong,var(--dy-border));border-radius:99px}
.work-menu-strip__item,.work-menu-strip__overflow{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:8px 12px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--dy-text-secondary);font:inherit;font-size:13px;font-weight:600;cursor:pointer;flex:0 0 auto}
.work-menu-strip__item:hover:not(:disabled),.work-menu-strip__overflow:hover{background:var(--dy-bg-hover,var(--dy-bg));color:var(--dy-text)}
.work-menu-strip__item.is-active{background:var(--dy-primary-soft);border-color:color-mix(in srgb,var(--dy-primary) 24%,transparent);color:var(--dy-primary)}
.work-menu-strip__item:disabled{opacity:.45;cursor:not-allowed}
.work-menu-strip__item:focus-visible,.work-menu-strip__overflow:focus-visible{outline:3px solid color-mix(in srgb,var(--dy-primary) 45%,transparent);outline-offset:2px}
.work-menu-strip__icon{width:16px;height:16px;flex:0 0 auto}.work-menu-strip__separator{height:24px;width:1px;background:var(--dy-border);margin-inline:4px;flex:0 0 auto}
.work-menu-strip__shortcut{padding:2px 5px;border:1px solid var(--dy-border);border-radius:4px;color:var(--dy-text-muted);font-size:10px;font-weight:500}
.work-menu-strip--compact{padding-block:4px}.work-menu-strip--compact .work-menu-strip__item{min-height:36px;padding:5px 9px}
.work-menu-strip__overflow-content{position:absolute;inset-inline-end:8px;inset-block-start:calc(100% + 4px);z-index:60;min-width:180px;padding:8px;border:1px solid var(--dy-border);border-radius:12px;background:var(--dy-surface);box-shadow:0 12px 32px rgb(15 23 42 / 14%)}
@media(max-width:640px){.work-menu-strip{align-items:stretch;padding-inline:8px}.work-menu-strip__items{overflow-x:auto}.work-menu-strip__shortcut{display:none}.work-menu-strip__item{padding-inline:10px}}
@media(prefers-reduced-motion:reduce){.work-menu-strip *{scroll-behavior:auto!important;transition:none!important}}
</style>
