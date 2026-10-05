<!--
  VersionInfo — build and version information (Odoo-like about dialog).

  Displays:
  - Application version (from package.json)
  - Build timestamp
  - Git commit (if available)
  - Vue/Dexie versions
  - Environment (production/development)
  - PWA status (installable, offline-ready)

  Rendered at the bottom of the login form, always visible but unobtrusive.
-->
<script setup>
import { computed, onMounted, ref } from "vue"

import { FeatherIcon } from "dypos-ui"
import { APP_NAME } from "@/utils/brand"
import { __ } from "@/utils/translation"

const expanded = ref(false)
const buildInfo = ref({})

// Build info is injected at build time via Vite define
// Falls back to runtime detection
onMounted(() => {
	try {
		// These are injected by Vite at build time
		buildInfo.value = {
			version:
				typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
			name: APP_NAME,
			buildTime: __BUILD_TIME__ || new Date().toISOString(),
			commit: __GIT_COMMIT__ || "unknown",
			branch: __GIT_BRANCH__ || "unknown",
			env: __APP_ENV__ || (import.meta.env.PROD ? "production" : "development"),
			vueVersion: __VUE_VERSION__ || "unknown",
			dexieVersion: __DEXIE_VERSION__ || "unknown",
			viteVersion: __VITE_VERSION__ || "unknown",
			pwa: __PWA_ENABLED__ === "true",
		}
	} catch (e) {
		buildInfo.value = {
			version:
				typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "unknown",
			name: APP_NAME,
			buildTime: new Date().toISOString(),
			commit: "unknown",
			branch: "unknown",
			env: import.meta.env.PROD ? "production" : "development",
			vueVersion: "unknown",
			dexieVersion: "unknown",
			viteVersion: "unknown",
			pwa: false,
		}
	}
})

const pwaStatus = computed(() => {
	if (typeof window === "undefined")
		return { supported: false, installed: false }

	// matchMedia may not exist in test environments (jsdom)
	const matchMedia = window.matchMedia || (() => ({ matches: false }))
	const isStandalone = matchMedia("(display-mode: standalone)").matches
	const isIOSStandalone = window.navigator.standalone === true
	const installed = isStandalone || isIOSStandalone

	return {
		supported: "serviceWorker" in navigator,
		installed,
		mode: installed ? (isIOSStandalone ? "iOS PWA" : "Standalone") : "Browser",
	}
})
</script>

<template>
	<div class="dy-login__version-info" :class="{ 'dy-login__version-info--expanded': expanded }">
		<!-- Compact version line (always visible) -->
		<div class="dy-login__version-compact" @click="expanded = !expanded">
			<FeatherIcon
				v-if="!expanded"
				name="info"
				:size="14"
				aria-hidden="true"
				class="dy-login__version-icon"
			/>
			<FeatherIcon
				v-else
				name="chevron-up"
				:size="14"
				aria-hidden="true"
				class="dy-login__version-icon"
			/>

			<span class="dy-login__version-label">{{ buildInfo.name || __('DyPOS') }}</span>

			<span
				v-if="buildInfo.version"
				class="dy-login__version-number"
				:title="__('الإصدار: {0}', { 0: buildInfo.version })"
			>
				v{{ buildInfo.version }}
			</span>

			<span
				v-if="buildInfo.env"
				class="dy-login__version-env"
				:class="buildInfo.env === 'production' ? 'production' : 'development'"
			>
				{{ buildInfo.env === 'production' ? __('إنتاج') : __('تطوير') }}
			</span>

			<span
				v-if="pwaStatus.installed"
				class="dy-login__version-pwa"
				:title="__('مثبت كـ PWA: {0}', { 0: pwaStatus.mode })"
			>
				<FeatherIcon name="monitor" :size="12" aria-hidden="true" />
				{{ __('PWA') }}
			</span>
		</div>

		<!-- Expanded details -->
		<div v-if="expanded" class="dy-login__version-details">
			<div class="dy-login__version-grid">
				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('الإصدار') }}</span>
					<span class="dy-login__version-value">{{ buildInfo.version }}</span>
				</div>

				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('بناء') }}</span>
					<span class="dy-login__version-value dy-login__version-mono">
						{{ buildInfo.buildTime ? new Date(buildInfo.buildTime).toLocaleString('ar-SA') : __('غير معروف') }}
					</span>
				</div>

				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('فرع Git') }}</span>
					<span class="dy-login__version-value dy-login__version-mono">{{ buildInfo.branch }}</span>
				</div>

				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('نسخة الالتزام') }}</span>
					<span class="dy-login__version-value dy-login__version-mono">{{ buildInfo.commit }}</span>
				</div>

				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('Vue') }}</span>
					<span class="dy-login__version-value">{{ buildInfo.vueVersion }}</span>
				</div>

				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('Dexie') }}</span>
					<span class="dy-login__version-value">{{ buildInfo.dexieVersion }}</span>
				</div>

				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('Vite') }}</span>
					<span class="dy-login__version-value">{{ buildInfo.viteVersion }}</span>
				</div>

				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('البيئة') }}</span>
					<span
						class="dy-login__version-value"
						:class="buildInfo.env === 'production' ? 'production' : 'development'"
					>
						{{ buildInfo.env === 'production' ? __('إنتاج') : __('تطوير') }}
					</span>
				</div>

				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('PWA') }}</span>
					<span class="dy-login__version-value">
						{{ pwaStatus.installed ? __('مثبت (' + pwaStatus.mode + ')') : __('متصفح') }}
					</span>
				</div>

				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('Service Worker') }}</span>
					<span class="dy-login__version-value">
						{{ pwaStatus.supported ? __('مدعوم') : __('غير مدعوم') }}
					</span>
				</div>

				<div class="dy-login__version-item">
					<span class="dy-login__version-key">{{ __('وضع عدم الاتصال') }}</span>
					<span class="dy-login__version-value">
						{{ buildInfo.pwa ? __('جاهز') : __('غير متاح') }}
					</span>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.dy-login__version-info {
	margin-top: 16px;
	padding-top: 12px;
	border-top: 1px solid var(--dy-border-soft);
}

.dy-login__version-compact {
	display: inline-flex;
	align-items: center;
	gap: 8px;

	padding: 8px 12px;
	border-radius: var(--dy-radius-lg);

	background: var(--dy-surface-soft);
	color: var(--dy-text-secondary);

	font-size: 0.7rem;
	font-weight: 600;
	line-height: 1;

	cursor: pointer;
	transition: background-color var(--dy-dur-fast) var(--dy-ease-standard);
}

.dy-login__version-compact:hover {
	background: var(--dy-surface);
	color: var(--dy-text);
}

.dy-login__version-compact:focus-visible {
	outline: var(--dy-focus-width) solid var(--dy-focus-color);
	outline-offset: var(--dy-focus-offset);
}

.dy-login__version-icon {
	flex-shrink: 0;
	transition: transform var(--dy-dur-fast) var(--dy-ease-standard);
}

.dy-login__version-info--expanded .dy-login__version-icon {
	transform: rotate(180deg);
}

.dy-login__version-label {
	font-weight: 700;
}

.dy-login__version-number {
	font-family: var(--dy-font-mono);
	color: var(--dy-accent);
}

.dy-login__version-env {
	display: inline-flex;
	align-items: center;
	padding: 2px 6px;
	border-radius: var(--dy-radius-sm);
	font-size: 0.6rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.dy-login__version-env.production {
	background: rgb(var(--dy-mint-c-500) / 0.15);
	color: var(--dy-mint-700);
}

.dy-login__version-env.development {
	background: rgb(var(--dy-amber-c-500) / 0.15);
	color: var(--dy-amber-700);
}

.dy-login__version-pwa {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 6px;
	border-radius: var(--dy-radius-sm);
	background: rgb(var(--dy-brand-c-500) / 0.12);
	color: var(--dy-brand-700);
	font-size: 0.6rem;
	font-weight: 700;
}

.dy-login__version-details {
	margin-top: 12px;
	padding: 12px;
	border: 1px solid var(--dy-border-soft);
	border-radius: var(--dy-radius-lg);
	background: var(--dy-surface);
	animation: dy-slide-down var(--dy-dur-fast) var(--dy-ease-standard);
}

@keyframes dy-slide-down {
	from {
		opacity: 0;
		transform: translateY(-8px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.dy-login__version-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
	gap: 8px 16px;
}

.dy-login__version-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.dy-login__version-key {
	color: var(--dy-text-muted);
	font-size: 0.65rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.dy-login__version-value {
	color: var(--dy-text);
	font-size: 0.75rem;
	font-weight: 500;
	word-break: break-all;
}

.dy-login__version-mono {
	font-family: var(--dy-font-mono);
}

.dy-login__version-value.production {
	color: var(--dy-mint-600);
	font-weight: 700;
}

.dy-login__version-value.development {
	color: var(--dy-amber-600);
	font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
	.dy-login__version-details {
		animation: none;
	}
}

@media (forced-colors: active) {
	.dy-login__version-compact {
		background: Canvas;
		color: CanvasText;
		border: 1px solid CanvasText;
	}

	.dy-login__version-details {
		border-color: CanvasText;
		background: Canvas;
	}

	.dy-login__version-env.production,
	.dy-login__version-env.development,
	.dy-login__version-pwa {
		border: 1px solid CanvasText;
		background: Canvas;
		color: CanvasText;
	}
}
</style>