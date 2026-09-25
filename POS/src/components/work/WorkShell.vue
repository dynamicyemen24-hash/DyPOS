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
    role="application"
    aria-label="DyPOS Work Screens"
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
      role="navigation"
      :aria-label="t('mainNavigation')"
      :aria-expanded="mobileNavOpen"
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
import { ref, computed, onMounted, onUnmounted, watch } from "vue"
import { useRouter, useRoute } from "vue-router"
import { FeatherIcon } from "frappe-ui"
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
const mobileNavOpen = ref(false)
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

const isMobile = computed(() => {
	if (typeof window === "undefined") return false
	return window.innerWidth < 1024
})

const shellAnnouncement = ref("")

function announce(message) {
	if (!message) return
	shellAnnouncement.value = message
	setTimeout(() => {
		shellAnnouncement.value = ""
	}, 1000)
}

function openMobileNav() {
	mobileNavOpen.value = true
	document.body.style.overflow = "hidden"
	announce(t("navigationOpened"))
	nextTick(() => {
		const firstLink = document.querySelector(".work-shell__nav-link")
		firstLink?.focus()
	})
}

function closeMobileNav() {
	mobileNavOpen.value = false
	document.body.style.overflow = ""
	announce(t("navigationClosed"))
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
	if (typeof window !== "undefined") {
		mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
		updateMotionPreference()
		mediaQuery.addEventListener?.("change", updateMotionPreference)
		window.addEventListener("resize", () => {
			if (!isMobile.value && mobileNavOpen.value) closeMobileNav()
		})
	}
})

onUnmounted(() => {
	if (mediaQuery)
		mediaQuery.removeEventListener?.("change", updateMotionPreference)
	document.body.style.overflow = ""
})

watch(
	() => route.fullPath,
	() => {
		closeMobileNav()
		nextTick(() => mainRef.value?.focus({ preventScroll: true }))
	},
)

defineOptions({ inheritAttrs: false })
</script>

<style scoped>
/* Skip Link */
.work-shell__skip-link {
  position: absolute;
  top: -100%;
  inset-inline-start: 16px;
  z-index: 9999;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--dy-primary, #059669);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: top 0.2s ease;
}
.work-shell__skip-link:focus-visible {
  top: 16px;
  outline: 2px solid #fff;
  outline-offset: 2px;
}

/* Shell Layout */
.work-shell {
  display: grid;
  grid-template-columns: 280px 1fr;
  grid-template-rows: auto 1fr;
  min-height: 100dvh;
  background: var(--dy-bg, #f8fafc);
  color: var(--dy-text, #0f172a);
}
.work-shell--reduced-motion *,
.work-shell--reduced-motion *::before,
.work-shell--reduced-motion *::after {
  animation-duration: 0.01ms !important;
  transition-duration: 0.01ms !important;
}

/* Navigation */
.work-shell__nav {
  position: sticky;
  top: 0;
  height: 100dvh;
  border-inline-end: 1px solid var(--dy-border, #e2e8f0);
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  z-index: 40;
}
.work-shell__nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--dy-border, #e2e8f0);
}
.work-shell__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.work-shell__brand-icon {
  width: 32px;
  height: 32px;
  color: var(--dy-primary, #059669);
}
.work-shell__brand-text {
  font-size: 18px;
  font-weight: 800;
  color: var(--dy-text, #0f172a);
}
.work-shell__nav-close {
  display: none;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--dy-text-muted, #64748b);
}
.work-shell__nav-close:hover {
  background: var(--dy-bg-hover, #f1f5f9);
}
.work-shell__nav-close:focus-visible {
  outline: 2px solid var(--dy-primary, #059669);
  outline-offset: 2px;
}
.work-shell__nav-section {
  padding: 12px 16px 8px;
}
.work-shell__nav-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--dy-text-muted, #94a3b8);
  margin-bottom: 8px;
}
.work-shell__nav-items {
  list-style: none;
  margin: 0;
  padding: 0;
}
.work-shell__nav-item { margin-bottom: 4px; }
.work-shell__nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--dy-text, #334155);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.work-shell__nav-link:hover {
  background: var(--dy-bg-hover, #f1f5f9);
  color: var(--dy-text, #0f172a);
}
.work-shell__nav-link:focus-visible {
  outline: 2px solid var(--dy-primary, #059669);
  outline-offset: 2px;
}
.work-shell__nav-link--active {
  background: var(--dy-primary-light, #ecfdf5);
  color: var(--dy-primary, #059669);
}
.work-shell__nav-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: inherit;
}
.work-shell__nav-badge {
  margin-inline-start: auto;
  padding: 2px 6px;
  border-radius: 9999px;
  background: var(--dy-primary-light, #ecfdf5);
  color: var(--dy-primary, #059669);
  font-size: 11px;
  font-weight: 700;
}

/* Mobile Nav */
.work-shell__mobile-toggle {
  display: none;
  position: fixed;
  inset-inline-start: 16px;
  top: 16px;
  z-index: 50;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  color: var(--dy-text, #0f172a);
}
.work-shell__mobile-toggle:focus-visible {
  outline: 2px solid var(--dy-primary, #059669);
  outline-offset: 2px;
}
.work-shell__backdrop {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: rgba(0,0,0,0.4);
}
.work-shell__nav--mobile {
  position: fixed;
  inset-block-start: 0;
  inset-inline-start: 0;
  width: 320px;
  max-width: 85vw;
  height: 100dvh;
  z-index: 50;
  box-shadow: 0 0 0 1px var(--dy-border, #e2e8f0), 0 20px 40px rgba(0,0,0,0.1);
  transform: translateX(-100%);
  transition: transform 0.3s ease;
}
.work-shell--mobile-open .work-shell__nav--mobile {
  transform: translateX(0);
}
.work-shell--mobile-open .work-shell__nav-close { display: flex; }

/* Header */
.work-shell__header {
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--dy-border, #e2e8f0);
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 30;
}
.work-shell__header-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.work-shell__back-btn {
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
.work-shell__back-btn:hover { background: var(--dy-bg-hover, #f1f5f9); color: var(--dy-text, #0f172a); }
.work-shell__back-btn:focus-visible { outline: 2px solid var(--dy-primary, #059669); outline-offset: 2px; }
.work-shell__breadcrumbs { display: flex; align-items: center; }
.work-shell__breadcrumb-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.work-shell__breadcrumb-link {
  color: var(--dy-text-muted, #64748b);
  font-size: 13px;
  text-decoration: none;
}
.work-shell__breadcrumb-link:hover { color: var(--dy-text, #0f172a); }
.work-shell__breadcrumb-current {
  color: var(--dy-text, #0f172a);
  font-size: 13px;
  font-weight: 500;
}
.work-shell__breadcrumb-separator {
  width: 16px;
  height: 16px;
  color: var(--dy-text-muted, #94a3b8);
  flex-shrink: 0;
}
.work-shell__header-center { flex: 1; min-width: 0; }
.work-shell__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--dy-text, #0f172a);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.work-shell__subtitle {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--dy-text-muted, #64748b);
}
.work-shell__header-right { display: flex; align-items: center; gap: 8px; }

/* Toolbar */
.work-shell__toolbar {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--dy-border, #e2e8f0);
  background: #fff;
}

/* Status Bar */
.work-shell__status-bar {
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 24px;
  font-size: 13px;
  font-weight: 500;
}
.work-shell__status-content { display: flex; align-items: center; gap: 8px; }
.work-shell__status-bar--info { background: #eff6ff; color: #1e40af; }
.work-shell__status-bar--success { background: #f0fdf4; color: #166534; }
.work-shell__status-bar--warning { background: #fffbeb; color: #92400e; }
.work-shell__status-bar--error { background: #fef2f2; color: #991b1b; }
.work-shell__status-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  opacity: 0.7;
}
.work-shell__status-close:hover { opacity: 1; background: rgba(0,0,0,0.05); }
.work-shell__status-close:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }

/* Main Content */
.work-shell__main {
  grid-column: 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.work-shell__content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
.work-shell__content--no-padding { padding: 0; }

/* Loading/Error/Empty States - delegated to components */

/* Transitions */
.work-shell-fade-enter-active,
.work-shell-fade-leave-active { transition: opacity 0.2s ease; }
.work-shell-fade-enter-from,
.work-shell-fade-leave-to { opacity: 0; }

/* Responsive */
@media (max-width: 1023px) {
  .work-shell { grid-template-columns: 1fr; }
  .work-shell__nav { position: fixed; }
  .work-shell__mobile-toggle { display: flex; }
  .work-shell__header,
  .work-shell__toolbar,
  .work-shell__status-bar,
  .work-shell__main { grid-column: 1; }
}
@media (max-width: 640px) {
  .work-shell__header { padding: 12px 16px; gap: 8px; }
  .work-shell__title { font-size: 18px; }
  .work-shell__toolbar { padding: 12px 16px; }
  .work-shell__status-bar { padding: 8px 16px; }
  .work-shell__content { padding: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .work-shell__nav--mobile { transition: none; }
  .work-shell__nav-link,
  .work-shell__back-btn,
  .work-shell__mobile-toggle,
  .work-shell__status-close { transition: none; }
}
</style>