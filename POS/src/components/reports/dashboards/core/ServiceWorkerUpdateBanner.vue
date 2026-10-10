<!-- DyPOS Smart Self-Update Dialog v2.0.1 -->
<script setup>
import { onBeforeUnmount, ref } from "vue"
import { useAppUpdate } from "@/composables/useAppUpdate"
import { FeatherIcon, ActionButton } from "dypos-ui"

const {
	updateAvailable,
	downloading,
	updateError,
	release,
	currentVersion,
	autoUpdate,
	setAutoUpdate,
	checking,
	checkForUpdate,
	cacheClearing,
	clearAppCaches,
	applyUpdate,
	dismissUpdate,
} = useAppUpdate()

const isCritical = () => String(release?.value?.severity || "") === "critical"

/** Two-step cache clear: the first press arms, the second (within 6s) fires. */
const clearArmed = ref(false)
let clearTimer = null
function onClearCaches() {
	if (cacheClearing.value) return
	if (!clearArmed.value) {
		clearArmed.value = true
		if (clearTimer) window.clearTimeout(clearTimer)
		clearTimer = window.setTimeout(() => {
			clearArmed.value = false
			clearTimer = null
		}, 6000)
		return
	}
	if (clearTimer) {
		window.clearTimeout(clearTimer)
		clearTimer = null
	}
	clearArmed.value = false
	void clearAppCaches()
}
onBeforeUnmount(() => {
	if (clearTimer) window.clearTimeout(clearTimer)
})
</script>

<template>
	<transition name="dy-slide-up">
		<div
			v-if="updateAvailable"
			class="dy-sw-update-banner"
			:class="{ 'dy-sw-update-banner--error': updateError }"
			role="alert"
			aria-live="assertive"
		>
			<div class="dy-sw-update-banner__content">
				<FeatherIcon
					:name="updateError ? 'alert-triangle' : downloading ? 'loader' : 'refresh-cw'"
					:size="22"
					class="dy-sw-update-banner__icon"
					:aria-hidden="true"
				/>

				<div class="dy-sw-update-banner__text">
					<strong v-if="updateError">تعذر تطبيق التحديث</strong>
					<strong v-else-if="downloading">جارٍ تجهيز التحديث…</strong>
					<strong v-else>
						{{ release?.title || "نسخة جديدة متاحة" }}
						<span v-if="release?.version" class="dy-sw-update-banner__version">
							v{{ release.version }}
						</span>
						<span v-if="isCritical()" class="dy-sw-update-banner__critical">
							تحديث أمني مهم
						</span>
					</strong>

					<span v-if="updateError">{{ updateError }}</span>
					<span v-else-if="downloading">
						جاري تنزيل النسخة الجديدة. لن يتغير العمل الجاري حتى تضغط على التحديث.
					</span>
					<span v-else-if="release?.highlights?.length">
						<ul class="dy-sw-update-banner__list">
							<li v-for="(item, index) in release.highlights.slice(0, 4)" :key="index">
								<strong>{{ item.title }}</strong>
								<span v-if="item.benefit"> — {{ item.benefit }}</span>
							</li>
						</ul>
					</span>
					<span v-else>تحديث جديد يحسن الأداء والاستقرار ويعالج مشاكل معروفة.</span>

					<small
						v-if="currentVersion && release?.version"
						class="dy-sw-update-banner__meta"
					>
						نسختك الحالية: v{{ currentVersion }} — يمكنك تأجيله أثناء الوردية.
					</small>
				</div>

				<div class="dy-sw-update-banner__actions">
					<ActionButton
						v-if="!downloading"
						variant="solid"
						size="sm"
						@click="applyUpdate"
					>
						{{ updateError ? "إعادة المحاولة" : "تحديث الآن" }}
					</ActionButton>

					<button
						v-if="!downloading && !isCritical()"
						type="button"
						class="dy-sw-update-banner__dismiss"
						aria-label="تذكيري لاحقاً"
						@click="dismissUpdate"
					>
						<FeatherIcon name="x" :size="16" />
					</button>
				</div>
			</div>

			<details class="dy-sw-update-banner__more">
				<summary class="dy-sw-update-banner__more-summary">
					خيارات التحديث والكاش
				</summary>
				<div class="dy-sw-update-banner__more-body">
					<button
						type="button"
						class="dy-sw-update-banner__option"
						:disabled="checking"
						@click="checkForUpdate"
					>
						<FeatherIcon name="search" :size="15" />
						{{ checking ? "جارٍ الفحص…" : "فحص التحديث الآن" }}
					</button>
					<label class="dy-sw-update-banner__option dy-sw-update-banner__toggle">
						<input
							type="checkbox"
							:checked="autoUpdate"
							@change="setAutoUpdate($event.target.checked)"
						/>
						<span>تحديث تلقائي عند الاتصال</span>
					</label>
					<button
						type="button"
						class="dy-sw-update-banner__option dy-sw-update-banner__option--danger"
						:class="{ 'dy-sw-update-banner__option--armed': clearArmed }"
						:disabled="cacheClearing"
						@click="onClearCaches"
					>
						<FeatherIcon name="trash-2" :size="15" />
						{{
							cacheClearing
								? "جارٍ المسح…"
								: clearArmed
									? "تأكيد مسح الكاش؟ (المبيعات بأمان)"
									: "مسح الكاش وإعادة التحميل"
						}}
					</button>
				</div>
			</details>
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
	width: min(720px, calc(100vw - 32px));
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
.dy-sw-update-banner--error .dy-sw-update-banner__content { background: #7f1d1d; }
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
	min-width: 0;
}
.dy-sw-update-banner__version { opacity: 0.75; font-weight: normal; }
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
.dy-sw-update-banner__meta { opacity: 0.65; font-size: 0.72rem; }
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
}
.dy-sw-update-banner__dismiss:hover { opacity: 1; }
.dy-sw-update-banner__more {
	margin-top: 8px;
	border-top: 1px solid rgb(255 255 255 / 0.2);
	padding-top: 8px;
}
.dy-sw-update-banner__more-summary {
	cursor: pointer;
	font-size: 0.75rem;
	opacity: 0.85;
}
.dy-sw-update-banner__more-body {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 8px;
}
.dy-sw-update-banner__option {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 36px;
	padding: 6px 12px;
	border: 1px solid rgb(255 255 255 / 0.35);
	border-radius: 8px;
	background: transparent;
	color: white;
	font: inherit;
	font-size: 0.78rem;
	cursor: pointer;
}
.dy-sw-update-banner__option:disabled { opacity: 0.55; cursor: wait; }
.dy-sw-update-banner__option--armed {
	border-color: #fbbf24;
	background: rgb(251 191 36 / 0.15);
}
.dy-sw-update-banner__toggle { cursor: pointer; }
.dy-sw-update-banner__toggle input {
	width: 18px;
	height: 18px;
	accent-color: var(--dy-mint-400);
}
@keyframes dy-spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}
</style>
