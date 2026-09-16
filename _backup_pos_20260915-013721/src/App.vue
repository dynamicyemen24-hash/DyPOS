<template>
	<div
		id="dypos-app"
		class="dy-app"
		:dir="direction"
		:lang="language"
		:data-app-ready="appReady ? 'true' : 'false'"
		:aria-busy="!appReady"
	>
		<!--
			Global application shell.

			Keep this component intentionally thin:
			- no POS business logic
			- no API calls
			- no authentication logic
			- no socket lifecycle
			- no route authorization

			Those responsibilities belong to their respective layers.
		-->
		<RouterView v-slot="{ Component, route }">
			<Transition
				name="dy-page"
				mode="out-in"
				:css="motionEnabled"
			>
				<KeepAlive
					:include="keepAliveRoutes"
					:max="keepAliveMax"
				>
					<Component
						:is="Component"
						:key="getRouteKey(route)"
					/>
				</KeepAlive>
			</Transition>
		</RouterView>

		<!--
			Global feedback surface.

			Toast must live outside the routed page tree so notifications
			remain visible while routes transition.
		-->
		<Toast />

		<!--
			PWA update banner — global so stale builds can never trap the user
			on Login, Register, POS, or any dashboard.
		-->
		<ServiceWorkerUpdateBanner />

		<!--
			Screen-reader live region reserved for global application
			status announcements.
		-->
		<div
			class="dy-sr-only"
			role="status"
			aria-live="polite"
			aria-atomic="true"
		>
			{{ appAnnouncement }}
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from "vue"

import Toast from "@/components/common/Toast.vue"
import ServiceWorkerUpdateBanner from "@/components/reports/dashboards/core/ServiceWorkerUpdateBanner.vue"
import { useAppTheme } from "@/composables/useAppTheme"
import { translationVersion } from "@/utils/translation"

/**
 * --------------------------------------------------------------------------
 * Application theme
 * --------------------------------------------------------------------------
 *
 * Mount the singleton once at the application root.
 *
 * This keeps document-level theme attributes and reactive theme state
 * alive for the complete application lifecycle.
 */
useAppTheme()

/**
 * --------------------------------------------------------------------------
 * Application readiness
 * --------------------------------------------------------------------------
 *
 * App.vue itself does not own bootstrap.
 *
 * main.js owns application initialization. We only expose a lightweight
 * readiness state here for the shell/accessibility contract.
 */
const appReady = ref(true)

/**
 * --------------------------------------------------------------------------
 * Localization
 * --------------------------------------------------------------------------
 *
 * Keep this layer deliberately defensive.
 *
 * If the translation module later exposes reactive language/direction
 * state, it can be connected here without changing the template contract.
 */
const language = ref("ar")
const direction = ref("rtl")

/**
 * Translation version is intentionally NOT used as the route component key.
 *
 * Changing translation must not destroy an active POS transaction,
 * cart state, payment state, barcode input state, or local component state.
 */
const translationRevision = computed(() => {
	const value =
		typeof translationVersion?.value === "number" ? translationVersion.value : 0

	return value
})

/**
 * --------------------------------------------------------------------------
 * Route rendering
 * --------------------------------------------------------------------------
 */

/**
 * Routes that are safe to keep alive.
 *
 * IMPORTANT:
 * POSSale should generally NOT be placed here until its state model is
 * explicitly designed for keep-alive semantics.
 *
 * A POS transaction must never survive invisibly because of an accidental
 * cached component instance.
 */
const keepAliveRoutes = Object.freeze([
	// Add explicitly approved read-only / lightweight routes here.
])

const keepAliveMax = 5

/**
 * Generate a stable route key.
 *
 * Do not use translationRevision here.
 *
 * The translation version only exists as a reactive dependency so future
 * localization systems can trigger the necessary shell update without
 * resetting the active route component.
 */
function getRouteKey(route) {
	if (!route) {
		return "dypos-route"
	}

	/**
	 * Use the route identity + meaningful params.
	 *
	 * Query strings are deliberately excluded because changing a query
	 * parameter should not automatically destroy a transactional page.
	 */
	const name = route.name || route.path || "route"

	const params =
		route.params && Object.keys(route.params).length > 0
			? JSON.stringify(route.params)
			: ""

	return `${name}:${params}`
}

/**
 * --------------------------------------------------------------------------
 * Accessibility / announcements
 * --------------------------------------------------------------------------
 */

const appAnnouncement = ref("")

let announcementTimer = null

function announce(message) {
	if (!message) {
		return
	}

	appAnnouncement.value = String(message)

	if (announcementTimer) {
		clearTimeout(announcementTimer)
	}

	announcementTimer = window.setTimeout(() => {
		appAnnouncement.value = ""
		announcementTimer = null
	}, 1_000)
}

/**
 * --------------------------------------------------------------------------
 * Motion preference
 * --------------------------------------------------------------------------
 */

const prefersReducedMotion = ref(false)

let mediaQuery = null

function updateMotionPreference(event) {
	prefersReducedMotion.value = Boolean(event?.matches ?? mediaQuery?.matches)
}

const motionEnabled = computed(() => !prefersReducedMotion.value)

/**
 * --------------------------------------------------------------------------
 * Runtime browser lifecycle
 * --------------------------------------------------------------------------
 */

if (typeof window !== "undefined") {
	mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")

	updateMotionPreference()

	if (typeof mediaQuery.addEventListener === "function") {
		mediaQuery.addEventListener("change", updateMotionPreference)
	} else {
		/**
		 * Safari < 14 compatibility.
		 */
		mediaQuery.addListener(updateMotionPreference)
	}
}

/**
 * Keep the translation revision intentionally referenced.
 *
 * This creates a reactive dependency without using it as a destructive
 * component key.
 */
void translationRevision.value

onBeforeUnmount(() => {
	if (announcementTimer) {
		clearTimeout(announcementTimer)
		announcementTimer = null
	}

	if (!mediaQuery) {
		return
	}

	if (typeof mediaQuery.removeEventListener === "function") {
		mediaQuery.removeEventListener("change", updateMotionPreference)
	} else {
		mediaQuery.removeListener(updateMotionPreference)
	}
})
</script>

<style>
/**
 * ==========================================================================
 * Application shell
 * ==========================================================================
 */

#dypos-app,
.dy-app {
	position: relative;
	display: flex;
	flex-direction: column;

	width: 100%;
	min-width: 0;
	min-height: 100dvh;

	background: var(--dy-bg, #ffffff);
	color: var(--dy-text, #0f172a);

	isolation: isolate;
}

/**
 * Prevent routed content from forcing horizontal overflow.
 */
#dypos-app > *,
.dy-app > * {
	min-width: 0;
}

/**
 * ==========================================================================
 * Route transitions
 * ==========================================================================
 *
 * POS transitions are intentionally short and restrained.
 *
 * Avoid large motion because the user may navigate repeatedly while
 * processing transactions.
 */

.dy-page-enter-active,
.dy-page-leave-active {
	transition:
		opacity var(--dy-motion-fast, 150ms)
			var(--dy-ease-standard, ease),
		transform var(--dy-motion-fast, 150ms)
			var(--dy-ease-standard, ease);
}

.dy-page-enter-from {
	opacity: 0;
	transform: translate3d(0, 4px, 0);
}

.dy-page-leave-to {
	opacity: 0;
	transform: translate3d(0, -4px, 0);
}

/**
 * ==========================================================================
 * Reduced motion
 * ==========================================================================
 */

@media (prefers-reduced-motion: reduce) {
	.dy-page-enter-active,
	.dy-page-leave-active {
		transition: none;
	}

	.dy-page-enter-from,
	.dy-page-leave-to {
		transform: none;
	}
}

/**
 * ==========================================================================
 * Accessibility
 * ==========================================================================
 */

@media (forced-colors: active) {
	#dypos-app,
	.dy-app {
		background: Canvas;
		color: CanvasText;
	}
}

/**
 * ==========================================================================
 * Print
 * ==========================================================================
 */

@media print {
	#dypos-app,
	.dy-app {
		min-height: auto;
		background: #fff;
		color: #000;
	}

	.dy-page-enter-active,
	.dy-page-leave-active {
		transition: none !important;
	}
}
</style>
