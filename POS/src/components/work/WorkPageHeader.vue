/**
 * WorkPageHeader — رأس الصفحة الموحد لشاشات العمل (WCAG 2.2 AA).
 *
 * Features:
 *  - Title + subtitle + badge/status
 *  - Primary actions (slot)
 *  - Secondary actions (slot)
 *  - Breadcrumb integration (optional inline)
 *  - RTL-first, responsive
 *  - Accessible heading hierarchy (h1)
 */
<template>
  <header class="work-page-header" :class="headerClasses" role="banner">
    <div class="work-page-header__main">
      <!-- Leading: Back/Breadcrumb -->
      <div class="work-page-header__leading">
        <slot name="leading">
          <button
            v-if="backRoute"
            type="button"
            class="work-page-header__back"
            @click="navigateBack"
            :aria-label="t('goBack')"
          >
            <FeatherIcon
              :name="direction === 'rtl' ? 'chevron-right' : 'chevron-left'"
              class="w-5 h-5"
              aria-hidden="true"
            />
          </button>
        </slot>
      </div>

      <!-- Center: Title Area -->
      <div class="work-page-header__title-area">
        <div class="work-page-header__title-row">
          <h1 class="work-page-header__title">{{ t(title) }}</h1>
          <slot name="title-suffix" />
        </div>

        <div v-if="subtitle || badges.length || status" class="work-page-header__meta">
          <p v-if="subtitle" class="work-page-header__subtitle">{{ t(subtitle) }}</p>
          <div class="work-page-header__badges" role="list" aria-label="Badges">
            <span
              v-for="badge in badges"
              :key="badge.id"
              class="work-page-header__badge"
              :class="`work-page-header__badge--${badge.variant || 'neutral'}`"
              role="listitem"
            >
              {{ t(badge.label) }}
            </span>
          </div>
          <span
            v-if="status"
            class="work-page-header__status"
            :class="`work-page-header__status--${status.variant || 'info'}`"
          >
            <FeatherIcon :name="statusIcon" class="w-3.5 h-3.5" aria-hidden="true" />
            {{ t(status.label) }}
          </span>
        </div>
      </div>

      <!-- Trailing: Primary Actions -->
      <div class="work-page-header__actions" role="group" :aria-label="t('primaryActions')">
        <slot name="actions-primary">
          <slot name="actions" />
        </slot>
      </div>
    </div>

    <!-- Secondary Actions Bar (optional) -->
    <div
      v-if="$slots.actionsSecondary || secondaryActions.length"
      class="work-page-header__secondary"
      role="toolbar"
      :aria-label="t('secondaryActions')"
    >
      <div class="work-page-header__secondary-content">
        <slot name="actions-secondary">
          <button
            v-for="action in secondaryActions"
            :key="action.id"
            type="button"
            :class="['work-page-header__action', `work-page-header__action--${action.variant || 'subtle'}`]"
            :disabled="action.disabled"
            :aria-label="t(action.label)"
            :aria-disabled="action.disabled"
            @click="action.handler"
          >
            <FeatherIcon
              v-if="action.icon"
              :name="action.icon"
              class="w-4 h-4"
              aria-hidden="true"
            />
            <span v-if="action.showLabel">{{ t(action.label) }}</span>
          </button>
        </slot>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from "vue"
import { useRouter } from "vue-router"
import { FeatherIcon } from "frappe-ui"
import { useLocale } from "@/composables/useLocale"
import { t } from "@/utils/translation"

const props = defineProps({
	title: { type: String, required: true },
	subtitle: { type: String, default: "" },
	backRoute: { type: [String, Object], default: null },
	badges: {
		type: Array,
		default: () => [],
		// [{ id, label, variant: 'primary'|'success'|'warning'|'danger'|'neutral' }]
	},
	status: {
		type: Object,
		default: null,
		// { label, variant: 'info'|'success'|'warning'|'error' }
	},
	secondaryActions: {
		type: Array,
		default: () => [],
		// [{ id, label, icon, variant, disabled, handler, showLabel }]
	},
})

const router = useRouter()
const { direction } = useLocale()

const headerClasses = computed(() => ({
	"work-page-header--has-secondary":
		props.secondaryActions.length > 0 || !!this.$slots.actionsSecondary,
	"work-page-header--has-status": !!props.status,
}))

const statusIcon = computed(() => {
	if (!props.status) return "info"
	switch (props.status.variant) {
		case "success":
			return "check-circle"
		case "warning":
			return "alert-triangle"
		case "error":
			return "alert-circle"
		default:
			return "info"
	}
})

function navigateBack() {
	if (props.backRoute) {
		router.push(props.backRoute)
	} else {
		router.back()
	}
}
</script>

<style scoped>
.work-page-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--dy-border, #e2e8f0);
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 20;
}
.work-page-header__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.work-page-header__leading { flex-shrink: 0; }
.work-page-header__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--dy-text-muted, #64748b);
}
.work-page-header__back:hover { background: var(--dy-bg-hover, #f1f5f9); color: var(--dy-text, #0f172a); }
.work-page-header__back:focus-visible { outline: 2px solid var(--dy-primary, #059669); outline-offset: 2px; }
.work-page-header__title-area { flex: 1; min-width: 0; }
.work-page-header__title-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.work-page-header__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--dy-text, #0f172a);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.work-page-header__meta { display: flex; align-items: center; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
.work-page-header__subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--dy-text-muted, #64748b);
}
.work-page-header__badges { display: flex; flex-wrap: wrap; gap: 6px; }
.work-page-header__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}
.work-page-header__badge--primary { background: #eff6ff; color: #1e40af; }
.work-page-header__badge--success { background: #f0fdf4; color: #166534; }
.work-page-header__badge--warning { background: #fffbeb; color: #92400e; }
.work-page-header__badge--danger { background: #fef2f2; color: #991b1b; }
.work-page-header__badge--neutral { background: #f1f5f9; color: #475569; }
.work-page-header__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}
.work-page-header__status--info { background: #eff6ff; color: #1e40af; }
.work-page-header__status--success { background: #f0fdf4; color: #166534; }
.work-page-header__status--warning { background: #fffbeb; color: #92400e; }
.work-page-header__status--error { background: #fef2f2; color: #991b1b; }
.work-page-header__actions { display: flex; flex-wrap: wrap; gap: 8px; flex-shrink: 0; }
.work-page-header__secondary {
  padding-inline: 24px;
  padding-bottom: 16px;
  border-top: 1px solid var(--dy-border, #e2e8f0);
  margin-top: -12px;
}
.work-page-header__secondary-content { display: flex; flex-wrap: wrap; gap: 8px; }
.work-page-header__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dy-text, #334155);
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}
.work-page-header__action:hover:not(:disabled) { background: var(--dy-bg-hover, #f1f5f9); }
.work-page-header__action:focus-visible { outline: 2px solid var(--dy-primary, #059669); outline-offset: 2px; }
.work-page-header__action:disabled { opacity: 0.5; cursor: not-allowed; }
.work-page-header__action--subtle { border-color: var(--dy-border, #e2e8f0); }
.work-page-header__action--subtle:hover:not(:disabled) { border-color: var(--dy-primary, #059669); color: var(--dy-primary, #059669); }
.work-page-header__action--primary { background: var(--dy-primary, #059669); color: #fff; border-color: var(--dy-primary, #059669); }
.work-page-header__action--primary:hover:not(:disabled) { background: var(--dy-primary-hover, #047857); border-color: var(--dy-primary-hover, #047857); }
.work-page-header__action--danger { color: #dc2626; border-color: #fecaca; }
.work-page-header__action--danger:hover:not(:disabled) { background: #fef2f2; border-color: #fca5a5; }

@media (max-width: 640px) {
  .work-page-header { padding: 12px 16px; }
  .work-page-header__title { font-size: 18px; }
  .work-page-header__secondary { padding-inline: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .work-page-header__back,
  .work-page-header__action { transition: none; }
}
</style>