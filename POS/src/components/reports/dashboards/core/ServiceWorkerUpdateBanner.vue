<!--
  =============================================================================
  DyPOS — Smart Self-Update Dialog v1.32.0
  Tells the merchant a new release exists, WHAT changed and WHY it helps
  them, then downloads it on their tap. Never blocks POS, never auto-reloads.
  =============================================================================
-->

<script setup>
import { useAppUpdate } from "@/composables/useAppUpdate"
import { FeatherIcon } from "frappe-ui"
import DyButton from "@/components/ui/DyButton.vue"

const {
	updateAvailable,
	downloading,
	release,
	currentVersion,
	applyUpdate,
	dismissUpdate,
} = useAppUpdate()

const isCritical = () => String(release?.value?.severity || "") === "critical"
</script>

<template>
	<transition name="dy-slide-up">
		<div
			v-if="updateAvailable && !downloading"
			class="dy-sw-update-banner"
			role="alert"
			aria-live="assertive"
		>
			<div class="dy-sw-update-banner__content">
				<FeatherIcon
					name="refresh-cw"
					:size="22"
					class="dy-sw-update-banner__icon"
					aria-hidden="true"
				/>

				<div class="dy-sw-update-banner__text">
					<strong>
						{{ release?.title || "نسخة جديدة متاحة" }}
						<span v-if="release?.version" class="dy-sw-update-banner__version">
							v{{ release.version }}
						</span>
						<span v-if="isCritical()" class="dy-sw-update-banner__critical">
							تحديث أمني مهم
						</span>
					</strong>

					<ul
						v-if="release?.highlights?.length"
						class="dy-sw-update-banner__list"
					>
						<li
							v-for="(item, index) in release.highlights.slice(0, 4)"
							:key="index"
						>
							<span class="dy-sw-update-banner__item-title">
								{{ item.title }}
							</span>
							<span class="dy-sw-update-banner__item-benefit">
								— {{ item.benefit }}
							</span>
						</li>
					</ul>
					<span v-else>
						هناك تحديث جديد لـ DyPOS يحسن الأداء والاستقرار.
					</span>

					<small
						v-if="currentVersion && release?.version"
						class="dy-sw-update-banner__meta"
					>
						نسختك الحالية: v{{ currentVersion }} — يُفضل التحديث بعد إغلاق الوردية
					</small>
				</div>

				<div class="dy-sw-update-banner__actions">
					<DyButton
						variant="primary"
						size="sm"
						@click="applyUpdate"
					>
						تنزيل التحديث
					</DyButton>

					<button
						v-if="!isCritical()"
						type="button"
						class="dy-sw-update-banner__dismiss"
						aria-label="تذكيري لاحقاً"
						@click="dismissUpdate"
					>
						<FeatherIcon name="x" :size="16" />
					</button>
				</div>
			</div>
		</div>

		<div
			v-else-if="updateAvailable && downloading"
			class="dy-sw-update-banner"
			role="status"
			aria-live="polite"
		>
			<div class="dy-sw-update-banner__content">
				<FeatherIcon
					name="loader"
					:size="20"
					class="dy-sw-update-banner__icon"
					aria-hidden="true"
				/>
				<div class="dy-sw-update-banner__text">
					<strong>جارٍ تنزيل التحديث…</strong>
					<span>سيُعاد فتح النظام تلقائياً خلال لحظات.</span>
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
	max-width: min(560px, calc(100vw - 32px));
}

.dy-sw-update-banner__content {
	display: flex;
	align-items: flex-start;
	gap: 12px;

	padding: 14px 20px;

	background: var(--dy-brand-c-900);
	color: white;
	border-radius: var(--dy-radius-xl);
	box-shadow: 0 8px 32px rgb(0 0 0 / 0.2);
}

.dy-sw-update-banner__icon {
	flex: 0 0 auto;
	margin-top: 2px;
	color: var(--dy-mint-400);
	animation: dy-spin 2s linear infinite;
}

.dy-sw-update-banner__text {
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 0.85rem;
}

.dy-sw-update-banner__version {
	opacity: 0.75;
	font-weight: normal;
}

.dy-sw-update-banner__critical {
	display: inline-block;
	margin-inline-start: 6px;
	padding: 1px 8px;
	font-size: 0.7rem;
	font-weight: 700;
	background: #fbbf24;
	color: #451a03;
	border-radius: 999px;
}

.dy-sw-update-banner__list {
	margin: 0;
	padding-inline-start: 18px;
	display: flex;
	flex-direction: column;
	gap: 3px;
	font-size: 0.8rem;
}

.dy-sw-update-banner__item-title {
	font-weight: 600;
}

.dy-sw-update-banner__item-benefit {
	opacity: 0.85;
}

.dy-sw-update-banner__meta {
	opacity: 0.65;
	font-size: 0.72rem;
}

.dy-sw-update-banner__actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: 0 0 auto;
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
