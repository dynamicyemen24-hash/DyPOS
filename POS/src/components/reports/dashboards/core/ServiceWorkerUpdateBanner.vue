<!--
  =============================================================================
  DyPOS — Service Worker Update Banner
  Shows when a new version of the PWA is available.
  =============================================================================
-->

<script setup>
import { ref, onMounted, onUnmounted } from "vue"
import { FeatherIcon } from "frappe-ui"
import { logger } from "@/utils/logger"
import DyButton from "@/components/ui/DyButton.vue"

const showBanner = ref(false)
const isUpdating = ref(false)

function handleUpdateAvailable() {
	showBanner.value = true
	logger?.info?.("New PWA version available")
}

function handleUpdateReady() {
	isUpdating.value = true
}

function reloadPage() {
	if (navigator.serviceWorker?.controller) {
		navigator.serviceWorker.controller.postMessage(
			{ type: "SKIP_WAITING" },
			window.location.origin,
		)
	}
	window.location.reload()
}

function dismiss() {
	showBanner.value = false
}

onMounted(() => {
	window.addEventListener("sw-update-available", handleUpdateAvailable)
	window.addEventListener("sw-update-ready", handleUpdateReady)
})

onUnmounted(() => {
	window.removeEventListener("sw-update-available", handleUpdateAvailable)
	window.removeEventListener("sw-update-ready", handleUpdateReady)
})
</script>

<template>
	<transition name="dy-slide-up">
		<div
			v-if="showBanner && !isUpdating"
			class="dy-sw-update-banner"
			role="alert"
			aria-live="assertive"
		>
			<div class="dy-sw-update-banner__content">
				<FeatherIcon
					name="refresh-cw"
					:size="20"
					class="dy-sw-update-banner__icon"
					aria-hidden="true"
				/>

				<div class="dy-sw-update-banner__text">
					<strong>نسخة جديدة متاحة</strong>

					<span>
						هناك تحديث جديد لـ DyPOS. هل تريد التحديث الآن؟
					</span>
				</div>

				<div class="dy-sw-update-banner__actions">
					<DyButton
						variant="primary"
						size="sm"
						@click="reloadPage"
					>
						تحديث الآن
					</DyButton>

					<button
						type="button"
						class="dy-sw-update-banner__dismiss"
						aria-label="إغلاق الإشعار"
						@click="dismiss"
					>
						<FeatherIcon name="x" :size="16" />
					</button>
				</div>
			</div>
		</div>
	</transition>
</template>

<style scoped>
.dy-sw-update-banner {
	position: fixed;
	bottom: 24px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 10000;
}

.dy-sw-update-banner__content {
	display: flex;
	align-items: center;
	gap: 12px;

	padding: 14px 20px;

	background: var(--dy-brand-c-900);
	color: white;
	border-radius: var(--dy-radius-xl);
	box-shadow: 0 8px 32px rgb(0 0 0 / 0.2);
}

.dy-sw-update-banner__icon {
	flex: 0 0 auto;
	color: var(--dy-mint-400);
	animation: dy-spin 2s linear infinite;
}

.dy-sw-update-banner__text {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.85rem;
}

.dy-sw-update-banner__actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.dy-sw-update-banner__dismiss {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border: 0;
	border-radius: var(--dy-radius-md);
	background: transparent;
	color: white;
	cursor: pointer;
	opacity: 0.7;
	transition: opacity 0.2s;
}

.dy-sw-update-banner__dismiss:hover {
	opacity: 1;
}

@keyframes dy-spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}
</style>