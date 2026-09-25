/**
 * WorkBreadcrumb — مسار التنقل الموحد (WCAG 2.2 AA).
 *
 * Features:
 *  - Automatic route-based breadcrumbs
 *  - Manual items override
 *  - RTL-aware separators
 *  - ARIA: nav, aria-label, aria-current
 *  - Collapsible on mobile
 */
<template>
  <nav
    class="work-breadcrumb"
    :class="{ 'work-breadcrumb--compact': compact }"
    aria-label="Breadcrumb"
  >
    <ol class="work-breadcrumb__list" role="list">
      <li
        v-for="(item, index) in breadcrumbs"
        :key="item.id || index"
        class="work-breadcrumb__item"
      >
        <router-link
          v-if="item.to && !item.current"
          :to="item.to"
          class="work-breadcrumb__link"
          :aria-label="t(item.label)"
        >
          {{ t(item.label) }}
        </router-link>
        <span
          v-else
          class="work-breadcrumb__current"
          :aria-current="item.current ? 'page' : undefined"
        >
          {{ t(item.label) }}
        </span>

        <span
          v-if="index < breadcrumbs.length - 1"
          class="work-breadcrumb__separator"
          aria-hidden="true"
        >
          <FeatherIcon :name="separatorIcon" class="w-3.5 h-3.5" />
        </span>
      </li>
    </ol>
  </nav>
</template>

<script setup>
import { computed, watch, onMounted } from "vue"
import { useRouter, useRoute } from "vue-router"
import { FeatherIcon } from "frappe-ui"
import { t } from "@/utils/translation"
import { useLocale } from "@/composables/useLocale"

const props = defineProps({
	/** Manual breadcrumb items */
	items: {
		type: Array,
		default: () => [],
		// [{ label, to?, current? }]
	},
	/** Auto-generate from route */
	auto: { type: Boolean, default: true },
	/** Hide on mobile */
	hideOnMobile: { type: Boolean, default: false },
	/** Compact mode */
	compact: { type: Boolean, default: false },
	/** Home route */
	homeRoute: { type: [String, Object], default: { name: "POSSale" } },
	/** Home label */
	homeLabel: { type: String, default: "home" },
})

const router = useRouter()
const route = useRoute()
const { direction } = useLocale()

const separatorIcon = computed(() =>
	direction === "rtl" ? "chevron-left" : "chevron-right",
)

const breadcrumbs = computed(() => {
	if (props.items.length) return props.items

	if (!props.auto) return []

	const crumbs = []
	const matched = route.matched.filter((m) => m.meta?.breadcrumb !== false)

	if (props.homeLabel && route.name !== "POSSale") {
		crumbs.push({ label: props.homeLabel, to: props.homeRoute })
	}

	for (const match of matched) {
		const meta = match.meta
		if (meta.breadcrumb === false) continue
		const label = meta.breadcrumb || meta.title || match.name
		if (!label) continue
		crumbs.push({
			label,
			to: match.path === "/" ? undefined : { path: match.path },
			current: match === matched[matched.length - 1],
		})
	}

	return crumbs
})
</script>

<style scoped>
/* ============================================================================
   WorkBreadcrumb — Design Tokens, WCAG 2.2 AA, RTL, Responsive
   ============================================================================ */

.work-breadcrumb {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-block: var(--dy-spacing-1, 4px);
}

.work-breadcrumb__list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--dy-spacing-2, 8px);
  list-style: none;
  margin: 0;
  padding: 0;
  min-width: max-content;
}

.work-breadcrumb__item {
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.work-breadcrumb__link {
  display: inline-flex;
  align-items: center;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  color: var(--dy-color-text-muted, #64748b);
  text-decoration: none;
  transition: color var(--dy-motion-duration-fast, 100ms);
}
.work-breadcrumb__link:hover { color: var(--dy-color-text-primary, #0f172a); }
.work-breadcrumb__link:focus-visible {
  outline: none;
  border-radius: var(--dy-radius-sm, 4px);
  box-shadow:
    0 0 0 var(--dy-a11y-focus-ring-width, 2px) var(--dy-a11y-focus-ring-color, #059669),
    0 0 0 calc(var(--dy-a11y-focus-ring-width, 2px) + var(--dy-a11y-focus-ring-offset, 2px)) var(--dy-a11y-focus-ring-offset-color, #ffffff);
}

.work-breadcrumb__current {
  display: inline-flex;
  align-items: center;
  font-size: var(--dy-typography-font-size-sm-min, 0.81rem);
  font-weight: var(--dy-font-weight-medium, 500);
  color: var(--dy-color-text-primary, #0f172a);
}

.work-breadcrumb__separator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dy-color-text-muted, #94a3b8);
  flex-shrink: 0;
}

.work-breadcrumb--compact .work-breadcrumb__link,
.work-breadcrumb--compact .work-breadcrumb__current {
  font-size: var(--dy-typography-font-size-xs-min, 0.7rem);
}

/* Responsive */
@media (max-width: 640px) {
  .work-breadcrumb { padding-block: 0; }
  .work-breadcrumb--compact { display: none; }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  .work-breadcrumb__link { transition: none; }
}

/* High Contrast */
@media (forced-colors: active) {
  .work-breadcrumb__link { color: CanvasText; }
  .work-breadcrumb__link:hover { color: Highlight; }
  .work-breadcrumb__current { color: CanvasText; }
  .work-breadcrumb__separator { color: CanvasText; }
}

/* Print */
@media print {
  .work-breadcrumb { display: none; }
}
</style>