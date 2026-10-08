/**
 * WorkShell — القشرة الموحدة لشاشات العمل (WCAG 2.2 AA).
 *
 * Responsibility:
 *  - Layout shell: header, nav, breadcrumb, toolbar, content area
 *  - Keyboard navigation contract (Tab/Shift+Tab, Arrow keys, Escape, Enter/Space)
 *  - Focus management: skip link, focus trap in mobile drawer
 *  - ARIA: landmark roles, live regions, proper labeling
 *  - Reduced motion: respects prefers-reduced-motion
 *  - Direction: RTL-first, LTR supported via dir attribute
 *
 * Props:
 *  - title: عنوان الصفحة (مطلوب)
 *  - subtitle: وصف اختياري
 *  - backRoute: مسار زر "العودة" (router-link object)
 *  - navItems: مصفوفة عناصر التنقل (من workNav.js)
 *  - breadcrumbs: [{ label, to?, current? }]
 *  - toolbar: slot للبحث/الفلاتر/الإجراءات
 *  - loading/error/empty/permission: حالات المحتوى
 *
 * Slots:
 *  - default: محتوى الصفحة
 *  - toolbar: شريط الأدوات (Search, Filters, Actions)
 *  - header-actions: إجراءات إضافية في الهيدر
 *  - nav-footer: أسفل التنقل الجانبي (الموبايل)
 */
<template>
  <div
    id="work-shell"
    class="work-shell"
    :dir="direction"
    :lang="language"
    :class="{
      'work-shell--mobile-open': mobileNavOpen,
      'work-shell--reduced-motion': prefersReducedMotion,
    }"
  >
    <!-- Skip Link (WCAG 2.4.1) -->
    <a
      href="#work-main"
      class="work-shell__skip-link"
      :aria-label="t('skipToMainContent')"
    >
      {{ t('skipToMainContent') }}
    </a>

    <!-- Global Status Announcer (SR Live Region) -->
    <div
      id="work-shell-announcer"
      class="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ shellAnnouncement }}
    </div>

    <!-- Mobile Nav Backdrop -->
    <Transition name="work-shell-fade">
      <div
        v-if="mobileNavOpen"
        class="work-shell__backdrop"
        @click="closeMobileNav"
        aria-hidden="true"
      />
    </Transition>

    <!-- Side Navigation (Persistent on Desktop, Drawer on Mobile) -->
    <aside
      id="work-shell-nav"
      class="work-shell__nav"
      :class="{ 'work-shell__nav--mobile': mobileNavOpen }"
      :aria-label="t('mainNavigation')"
    >
      <div class="work-shell__nav-header">
        <div class="work-shell__brand">
          <FeatherIcon name="shopping-bag" class="work-shell__brand-icon" aria-hidden="true" />
          <span class="work-shell__brand-text">{{ t('dypos') }}</span>
        </div>
        <button
          v-if="isMobile"
          type="button"
          class="work-shell__nav-close"
          @click="closeMobileNav"
          :aria-label="t('closeNavigation')"
          aria-expanded="true"
        >
          <FeatherIcon name="x" class="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <nav class="work-shell__nav-list" role="list">
        <section
          v-for="section in navSections"
          :key="section.id"
          class="work-shell__nav-section"
          :aria-labelledby="`nav-section-${section.id}`"
        >
          <h3 :id="`nav-section-${section.id}`" class="work-shell__nav-section-title">
            {{ t(section.title) }}
          </h3>
          <ul class="work-shell__nav-items" role="list">
            <li
              v-for="item in section.items"
              :key="item.id"
              class="work-shell__nav-item"
            >
              <router-link
                :to="item.to"
                :class="[
                  'work-shell__nav-link',
                  { 'work-shell__nav-link--active': isActive(item) },
                ]"
                :aria-current="isActive(item) ? 'page' : undefined"
                @click="closeMobileNav"
              >
                <FeatherIcon
                  :name="item.icon"
                  class="work-shell__nav-icon"
                  aria-hidden="true"
                />
                <span class="work-shell__nav-label">{{ t(item.label) }}</span>
                <span
                  v-if="item.badge"
                  class="work-shell__nav-badge"
                  aria-hidden="true"
                >
                  {{ item.badge }}
                </span>
              </router-link>
            </li>
          </ul>
        </section>
      </nav>

      <slot name="nav-footer" />
    </aside>

    <!-- Mobile Nav Toggle (Header) -->
    <button
      v-if="isMobile"
      type="button"
      class="work-shell__mobile-toggle"
      ref="mobileToggleRef"
      @click="openMobileNav"
      :aria-label="t('openNavigation')"
      :aria-expanded="mobileNavOpen"
      :aria-controls="work-shell-nav"
    >
      <FeatherIcon name="menu" class="w-6 h-6" aria-hidden="true" />
    </button>

    <!-- Main Content Area -->
    <main
      id="work-main"
      class="work-shell__main"
      ref="mainRef"
      tabindex="-1"
      role="main"
    >
      <!-- Header Bar -->
      <header class="work-shell__header" role="banner">
        <div class="work-shell__header-left">
          <button
            v-if="backRoute"
            type="button"
            class="work-shell__back-btn"
            @click="navigateBack"
            :aria-label="t('goBack')"
          >
            <FeatherIcon
              :name="direction === 'rtl' ? 'chevron-right' : 'chevron-left'"
              class="w-5 h-5"
              aria-hidden="true"
            />
          </button>

          <nav
            v-if="breadcrumbs && breadcrumbs.length"
            class="work-shell__breadcrumbs"
            aria-label="Breadcrumb"
          >
            <ol class="work-shell__breadcrumb-list" role="list">
              <li
                v-for="(crumb, index) in breadcrumbs"
                :key="index"
                class="work-shell__breadcrumb-item"
              >
                <router-link
                  v-if="crumb.to && !crumb.current"
                  :to="crumb.to"
                  class="work-shell__breadcrumb-link"
                >
                  {{ t(crumb.label) }}
                </router-link>
                <span
                  v-else
                  class="work-shell__breadcrumb-current"
                  aria-current="page"
                >
                  {{ t(crumb.label) }}
                </span>
                <FeatherIcon
                  v-if="index < breadcrumbs.length - 1"
                  :name="direction === 'rtl' ? 'chevron-right' : 'chevron-left'"
                  class="work-shell__breadcrumb-separator"
                  aria-hidden="true"
                />
              </li>
            </ol>
          </nav>
        </div>

        <div class="work-shell__header-center">
          <h1 class="work-shell__title">{{ t(title) }}</h1>
          <p v-if="subtitle" class="work-shell__subtitle">{{ t(subtitle) }}</p>
        </div>

        <div class="work-shell__header-right">
          <slot name="header-actions" />
        </div>
      </header>

      <!-- Toolbar (Search, Filters, Actions) -->
      <div
        v-if="$slots.toolbar"
        class="work-shell__toolbar"
        role="toolbar"
        :aria-label="t('toolbar')"
      >
        <slot name="toolbar" />
      </div>

      <!-- Status Bar (Connection, Sync, Alerts) -->
      <div
        v-if="statusMessage"
        class="work-shell__status-bar"
        :class="`work-shell__status-bar--${statusType}`"
        role="status"
        aria-live="polite"
      >
        <div class="work-shell__status-content">
          <FeatherIcon :name="statusIcon" class="w-4 h-4" aria-hidden="true" />
          <span>{{ t(statusMessage) }}</span>
        </div>
        <button
          v-if="dismissibleStatus"
          type="button"
          class="work-shell__status-close"
          @click="$emit('status-dismissed')"
          :aria-label="t('dismissStatus')"
        >
          <FeatherIcon name="x" class="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <!-- Content States -->
      <div
        v-if="loading && !hasData"
        class="work-shell__loading"
        role="status"
        :aria-label="t('loadingContent')"
      >
        <WorkLoadingSkeleton :kpi-count="4" :chart-count="2" />
      </div>

      <div
        v-else-if="error"
        class="work-shell__error"
        role="alert"
        :aria-label="t('errorLoadingContent')"
      >
        <WorkErrorState
          :message="t('errorLoadingContent')"
          :details="error"
          @retry="$emit('refresh')"
        />
      </div>

      <div
        v-else-if="permissionDenied"
        class="work-shell__permission"
        role="alert"
        :aria-label="t('permissionDenied')"
      >
        <WorkPermissionState
          :message="t('permissionDenied')"
          :details="permissionDenied"
          @go-home="$emit('go-home')"
        />
      </div>

      <div
        v-else-if="empty && !loading"
        class="work-shell__empty"
        role="status"
        :aria-label="t('noData')"
      >
        <WorkEmptyState
          :title="emptyTitle || t('noData')"
          :description="emptyDescription || t('noDataDescription')"
          :action-label="emptyActionLabel"
          :action-icon="emptyActionIcon"
          @action="emptyAction && emptyAction()"
        />
      </div>

      <!-- Page Content -->
      <div
        v-else
        id="work-content"
        class="work-shell__content"
        :class="{ 'work-shell__content--no-padding': noContentPadding }"
      >
        <slot />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, nextTick as vueNextTick, onMounted, onUnmounted, watch } from "vue"
import { useRouter, useRoute } from "vue-router"
import { FeatherIcon } from "dypos-ui"
import { useLocale } from "@/composables/useLocale"
import { t } from "@/utils/translation"
import WorkLoadingSkeleton from "./WorkLoadingSkeleton.vue"
import WorkErrorState from "./WorkErrorState.vue"
import WorkPermissionState from "./WorkPermissionState.vue"
import WorkEmptyState from "./WorkEmptyState.vue"
import { WORK_NAV_SECTIONS, flatWorkNav, isNavActive } from "./workNav"

const props = defineProps({
	title: { type: String, required: true },
	subtitle: { type: String, default: "" },
	backRoute: { type: Object, default: null },
	navItems: { type: Array, default: () => [] },
	breadcrumbs: { type: Array, default: () => [] },
	loading: { type: Boolean, default: false },
	error: { type: String, default: "" },
	empty: { type: Boolean, default: false },
	emptyTitle: { type: String, default: "" },
	emptyDescription: { type: String, default: "" },
	emptyActionLabel: { type: String, default: "" },
	emptyActionIcon: { type: String, default: "plus" },
	emptyAction: { type: Function, default: null },
	permissionDenied: { type: [String, Boolean], default: false },
	hasData: { type: Boolean, default: false },
	statusMessage: { type: String, default: "" },
	statusType: {
		type: String,
		default: "info",
		validator: (v) => ["info", "success", "warning", "error"].includes(v),
	},
	dismissibleStatus: { type: Boolean, default: false },
	noContentPadding: { type: Boolean, default: false },
})

const emit = defineEmits(["refresh", "go-home", "status-dismissed"])

const router = useRouter()
const route = useRoute()
const { locale, dir: direction, isRTL } = useLocale()
const language = computed(() => locale.value)

const mainRef = ref(null)
const mobileToggleRef = ref(null)
const mobileNavOpen = ref(false)
let previousBodyOverflow = ""
const prefersReducedMotion = ref(false)

let mediaQuery = null

const navSections = computed(() => {
	if (props.navItems.length) {
		return [{ id: "custom", title: "", items: props.navItems }]
	}
	return WORK_NAV_SECTIONS
})

const isActive = (item) => isNavActive(item, route)

const statusIcon = computed(() => {
	switch (props.statusType) {
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

const viewportWidth = ref(
	typeof window !== "undefined" ? window.innerWidth : 1024,
)

const isMobile = computed(() => viewportWidth.value < 1024)

function handleResize() {
	if (typeof window === "undefined") return
	viewportWidth.value = window.innerWidth
	if (!isMobile.value && mobileNavOpen.value) closeMobileNav()
}

const shellAnnouncement = ref("")

let announcementTimer = null

function announce(message) {
	if (!message) return
	shellAnnouncement.value = message
	if (announcementTimer) clearTimeout(announcementTimer)
	announcementTimer = setTimeout(() => {
		shellAnnouncement.value = ""
		announcementTimer = null
	}, 1000)
}

function openMobileNav() {
	if (typeof document === "undefined") return
	previousBodyOverflow = document.body.style.overflow
	mobileNavOpen.value = true
	document.body.style.overflow = "hidden"
	announce(t("navigationOpened"))
	vueNextTick(() => {
		const firstLink = document.querySelector(".work-shell__nav-link")
		firstLink?.focus()
	})
}

function closeMobileNav({ restoreFocus = false } = {}) {
	mobileNavOpen.value = false
	if (typeof document !== "undefined") document.body.style.overflow = previousBodyOverflow
	announce(t("navigationClosed"))
	if (restoreFocus) vueNextTick(() => mobileToggleRef.value?.focus({ preventScroll: true }))
}

function handleShellKeydown(event) {
	if (!mobileNavOpen.value) return
	if (event.key === "Escape") {
		event.preventDefault()
		closeMobileNav({ restoreFocus: true })
		return
	}
	if (event.key !== "Tab" || typeof document === "undefined") return
	const nav = document.getElementById("work-shell-nav")
	const focusable = nav?.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
	if (!focusable?.length) return
	const first = focusable[0]
	const last = focusable[focusable.length - 1]
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault()
		last.focus()
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault()
		first.focus()
	}
}

function navigateBack() {
	if (props.backRoute) {
		router.push(props.backRoute)
	} else {
		router.back()
	}
}

function updateMotionPreference(e) {
	prefersReducedMotion.value = e?.matches ?? mediaQuery?.matches ?? false
}

onMounted(() => {
	if (typeof document !== "undefined") {
		previousBodyOverflow = document.body.style.overflow
		document.addEventListener("keydown", handleShellKeydown)
	}
	if (typeof window !== "undefined") {
		mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
		updateMotionPreference()
		mediaQuery.addEventListener?.("change", updateMotionPreference)
		window.addEventListener("resize", handleResize, { passive: true })
	}
})

onUnmounted(() => {
	if (typeof document !== "undefined") document.removeEventListener("keydown", handleShellKeydown)
	if (mediaQuery)
		mediaQuery.removeEventListener?.("change", updateMotionPreference)
	if (typeof window !== "undefined")
		window.removeEventListener("resize", handleResize)
	if (announcementTimer) clearTimeout(announcementTimer)
	if (typeof document !== "undefined") document.body.style.overflow = previousBodyOverflow
})

watch(
	() => route.fullPath,
	() => {
		closeMobileNav()
		vueNextTick(() => mainRef.value?.focus({ preventScroll: true }))
	},
)

defineOptions({ inheritAttrs: false })
</script>

<style scoped>
.work-shell {
  display: grid;
  grid-template-columns: var(--dy-sidebar-w, 256px) minmax(0, 1fr);
  min-height: 100dvh;
  background: radial-gradient(ellipse at 92% 0%, color-mix(in srgb, var(--dy-primary-soft) 54%, transparent), transparent 34rem), var(--dy-bg);
  color: var(--dy-text);
  font-family: var(--dy-font-ui);
  font-size: var(--dy-text-base);
  line-height: var(--dy-leading-normal);
}
.work-shell--reduced-motion *,
.work-shell--reduced-motion *::before,
.work-shell--reduced-motion *::after {
  animation-duration: 0.01ms !important;
  transition-duration: 0.01ms !important;
}
.work-shell__skip-link {
  position: absolute;
  inset-block-start: -100%;
  inset-inline-start: var(--dy-space-4);
  z-index: var(--dy-z-skip-link, 9999);
  padding: var(--dy-space-2) var(--dy-space-4);
  border-radius: var(--dy-radius-sm);
  background: var(--dy-primary);
  color: var(--dy-primary-contrast);
  font-weight: var(--dy-weight-semibold);
  text-decoration: none;
}
.work-shell__skip-link:focus-visible {
  inset-block-start: var(--dy-space-4);
  outline: var(--dy-focus-ring-width) solid var(--dy-focus-ring-color);
  outline-offset: var(--dy-focus-ring-offset);
}
.work-shell__nav {
  position: sticky;
  inset-block-start: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: color-mix(in srgb, var(--dy-surface) 96%, var(--dy-primary-soft));
  border-inline-end: 1px solid var(--dy-border);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dy-border) 28%, transparent);
  z-index: 40;
}
.work-shell__nav-header {
  min-height: var(--dy-header-h, 64px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--dy-space-4);
  border-block-end: 1px solid var(--dy-border);
}
.work-shell__brand { display: flex; align-items: center; gap: var(--dy-space-2); }
.work-shell__brand-icon { width: 28px; height: 28px; color: var(--dy-primary); }
.work-shell__brand-text {
  color: var(--dy-text-strong);
  font-size: var(--dy-text-lg);
  font-weight: var(--dy-weight-bold);
  letter-spacing: var(--dy-tracking-tight);
}
.work-shell__nav-section { padding: var(--dy-space-3) var(--dy-space-3) var(--dy-space-2); }
.work-shell__nav-section-title {
  margin: 0 0 var(--dy-space-2);
  padding-inline: var(--dy-space-2);
  color: var(--dy-text-muted);
  font-size: var(--dy-text-xs);
  font-weight: var(--dy-weight-semibold);
  letter-spacing: var(--dy-tracking-wide);
}
.work-shell__nav-items { list-style: none; margin: 0; padding: 0; }
.work-shell__nav-item { margin: 0 0 var(--dy-space-1); }
.work-shell__nav-link {
  min-height: max(44px, var(--dy-nav-item-h, 44px));
  display: flex;
  align-items: center;
  gap: var(--dy-space-3);
  padding-inline: var(--dy-space-3);
  border: 1px solid transparent;
  border-radius: var(--dy-radius-sm);
  color: var(--dy-text-secondary);
  font-size: var(--dy-text-sm);
  font-weight: var(--dy-weight-medium);
  text-decoration: none;
  transition: background-color var(--dy-motion-duration-fast, 100ms) var(--dy-motion-ease-standard, ease),
              color var(--dy-motion-duration-fast, 100ms) var(--dy-motion-ease-standard, ease),
              border-color var(--dy-motion-duration-fast, 100ms) var(--dy-motion-ease-standard, ease);
}
.work-shell__nav-link:hover {
  background: var(--dy-surface-hover);
  color: var(--dy-text-strong);
}
.work-shell__nav-link:focus-visible {
  outline: var(--dy-focus-ring-width) solid var(--dy-focus-ring-color);
  outline-offset: var(--dy-focus-ring-offset);
}
.work-shell__nav-link--active {
  background: var(--dy-primary-soft);
  border-color: var(--dy-accent-border);
  color: var(--dy-primary);
  font-weight: var(--dy-weight-semibold);
}
.work-shell__nav-icon { width: 18px; height: 18px; flex-shrink: 0; color: currentColor; }
.work-shell__nav-badge {
  margin-inline-start: auto;
  min-width: 22px;
  min-height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-inline: var(--dy-space-1);
  border-radius: var(--dy-radius-full);
  background: var(--dy-primary-subtle);
  color: var(--dy-primary);
  font-size: var(--dy-text-xs);
  font-weight: var(--dy-weight-bold);
}
.work-shell__nav-close,
.work-shell__mobile-toggle,
.work-shell__back-btn,
.work-shell__status-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dy-text-secondary);
}
.work-shell__nav-close { width: var(--dy-touch-min); height: var(--dy-touch-min); border-radius: var(--dy-radius-sm); }
.work-shell__mobile-toggle {
  display: none;
  position: fixed;
  inset-inline-start: var(--dy-space-4);
  inset-block-start: var(--dy-space-3);
  width: var(--dy-touch-min);
  height: var(--dy-touch-min);
  z-index: 50;
  border-color: var(--dy-border);
  border-radius: var(--dy-radius-sm);
  background: var(--dy-surface);
  box-shadow: var(--dy-shadow-card);
}
.work-shell__nav-close:hover,
.work-shell__mobile-toggle:hover,
.work-shell__back-btn:hover,
.work-shell__status-close:hover { background: var(--dy-surface-hover); color: var(--dy-text-strong); }
.work-shell__nav-close:focus-visible,
.work-shell__mobile-toggle:focus-visible,
.work-shell__back-btn:focus-visible,
.work-shell__status-close:focus-visible {
  outline: var(--dy-focus-ring-width) solid var(--dy-focus-ring-color);
  outline-offset: var(--dy-focus-ring-offset);
}
.work-shell__backdrop { position: fixed; inset: 0; z-index: 45; background: var(--dy-overlay); }
.work-shell__nav--mobile {
  position: fixed;
  inset-block: 0;
  inset-inline-end: 0;
  width: min(var(--dy-sidebar-w, 280px), 88vw);
  max-width: 88vw;
  z-index: 50;
  transform: translateX(100%);
  transition: transform var(--dy-motion-duration-normal, 150ms) var(--dy-motion-ease-standard, ease);
}
.work-shell[dir="ltr"] .work-shell__nav--mobile { inset-inline-start: 0; inset-inline-end: auto; transform: translateX(-100%); }
.work-shell--mobile-open .work-shell__nav--mobile { transform: translateX(0); }
.work-shell--mobile-open .work-shell__nav-close { display: inline-flex; }
.work-shell__main { min-width: 0; display: flex; flex-direction: column; min-height: 100dvh; overflow: hidden; }
.work-shell__header {
  min-height: var(--dy-header-h, 64px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--dy-space-4);
  padding-inline: var(--dy-space-5);
  background: color-mix(in srgb, var(--dy-surface) 94%, transparent);
  border-block-end: 1px solid var(--dy-border);
  box-shadow: 0 4px 18px rgb(15 23 42 / 0.035);
  backdrop-filter: blur(14px);
  position: sticky;
  inset-block-start: 0;
  z-index: 30;
}
.work-shell__header-left,
.work-shell__header-right { min-width: 0; display: flex; align-items: center; gap: var(--dy-space-2); }
.work-shell__header-right { justify-content: flex-end; }
.work-shell__header-center { min-width: 0; text-align: center; }
.work-shell__back-btn { width: var(--dy-touch-min); height: var(--dy-touch-min); border-radius: var(--dy-radius-sm); }
.work-shell__breadcrumbs { min-width: 0; }
.work-shell__breadcrumb-list { display: flex; align-items: center; flex-wrap: wrap; gap: var(--dy-space-2); list-style: none; margin: 0; padding: 0; }
.work-shell__breadcrumb-link,
.work-shell__breadcrumb-current { font-size: var(--dy-text-sm); }
.work-shell__breadcrumb-link { color: var(--dy-text-secondary); text-decoration: none; }
.work-shell__breadcrumb-link:hover { color: var(--dy-text-link); }
.work-shell__breadcrumb-current { color: var(--dy-text-strong); font-weight: var(--dy-weight-semibold); }
.work-shell__breadcrumb-separator { width: 14px; height: 14px; color: var(--dy-text-muted); }
.work-shell__title {
  margin: 0;
  color: var(--dy-text-strong);
  font-size: var(--dy-text-xl);
  font-weight: var(--dy-weight-bold);
  line-height: var(--dy-leading-tight);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.work-shell__subtitle { margin: var(--dy-space-1) 0 0; color: var(--dy-text-secondary); font-size: var(--dy-text-xs); }
.work-shell__toolbar {
  min-height: var(--dy-toolbar-h, 52px);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--dy-space-2);
  padding: var(--dy-space-2) var(--dy-space-5);
  background: var(--dy-surface);
  border-block-end: 1px solid var(--dy-border);
}
.work-shell__status-bar {
  min-height: var(--dy-statusbar-h, 36px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dy-space-3);
  padding-inline: var(--dy-space-5);
  font-size: var(--dy-text-sm);
  font-weight: var(--dy-weight-medium);
}
.work-shell__status-content { display: flex; align-items: center; gap: var(--dy-space-2); }
.work-shell__status-bar--info { background: var(--dy-info-soft); color: var(--dy-info); }
.work-shell__status-bar--success { background: var(--dy-success-soft); color: var(--dy-success); }
.work-shell__status-bar--warning { background: var(--dy-warning-soft); color: var(--dy-warning); }
.work-shell__status-bar--error { background: var(--dy-danger-soft); color: var(--dy-danger); }
.work-shell__status-close { width: 32px; height: 32px; border-radius: var(--dy-radius-sm); }
.work-shell__content { flex: 1; min-height: 0; overflow: auto; padding: clamp(16px, 2.2vw, 32px); scrollbar-gutter: stable; }
.work-shell__content > * { min-width: 0; }
.work-shell__content--no-padding { padding: 0; }
@media (max-width: 1023px) {
  .work-shell { grid-template-columns: 1fr; }
  .work-shell__nav { position: fixed; inset-block: 0; inset-inline-start: 0; width: min(280px, 88vw); }
  .work-shell[dir="rtl"] .work-shell__nav { inset-inline-start: auto; inset-inline-end: 0; }
  .work-shell__mobile-toggle { display: inline-flex; }
  .work-shell__header { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); padding-inline: var(--dy-space-4); }
}
@media (max-width: 640px) {
  .work-shell__header { min-height: 56px; grid-template-columns: minmax(0, 1fr) auto; gap: var(--dy-space-2); padding: 10px var(--dy-space-3); }
  .work-shell__header-left { grid-column: 1; grid-row: 1; }
  .work-shell__header-center { grid-column: 1 / -1; grid-row: 2; text-align: start; padding-block-end: 4px; }
  .work-shell__header-right { grid-column: 2; grid-row: 1; }
  .work-shell__title { font-size: var(--dy-text-lg); white-space: normal; }
  .work-shell__subtitle { display: none; }
  .work-shell__breadcrumbs { display: none; }
  .work-shell__toolbar { padding-inline: var(--dy-space-3); }
  .work-shell__content { padding: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .work-shell__nav--mobile,
  .work-shell__nav-link,
  .work-shell__back-btn,
  .work-shell__mobile-toggle,
  .work-shell__status-close { transition: none; }
}
</style>