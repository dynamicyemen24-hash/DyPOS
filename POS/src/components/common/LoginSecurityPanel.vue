<template>
	<!--
		لوحة أمان الجلسة. كانت كتلة <aside> داخل صفحة تتجاوز 1800 سطرًا،
		ولنفسها لا تختبر شيئًا: كان"No test could mount it" يعني أن زر
		«التفاصيل» — وهو ما يخفي بيانات الاتصال الحقيقية — لم يُختبر قط.
	-->
	<aside class="dy-login__security" :aria-label="__('معلومات الأمان والتشغيل')">
		<div class="dy-login__security-main">
			<span class="dy-login__security-icon" aria-hidden="true">
				<FeatherIcon name="shield-check" :size="18" />
			</span>

			<div>
				<strong>
					{{ __('جلسة تشغيل آمنة') }}
				</strong>

				<span>
					{{ __('تتم حماية الاتصال وتهيئة الجلسة قبل بدء التشغيل.') }}
				</span>
			</div>
		</div>

		<button
			type="button"
			class="dy-login__details-toggle"
			:aria-expanded="open"
			:aria-label="
				open ? __('إخفاء تفاصيل الاتصال') : __('عرض تفاصيل الاتصال')
			"
			@click="$emit('toggle')"
		>
			{{ __('التفاصيل') }}
		</button>

		<div v-if="open" class="dy-login__details">
			<div v-for="detail in details" :key="detail.label">
				<span>{{ __(detail.label) }}</span>

				<strong>
					{{ __(detail.value) }}
				</strong>
			</div>
		</div>
	</aside>
</template>

<script setup>
import { FeatherIcon } from "dypos-ui"
import { __ } from "@/utils/translation"

/**
 * The details toggle is a disclosure for CONNECTION FACTS — CSRF state,
 * backend reachability — so it owns an explicit `aria-expanded` and the
 * details are `v-if`, not CSS-hidden. A screen reader therefore never
 * announces a connection state the operator did not ask to see.
 */
defineProps({
	/** Whether the connection details are currently shown. */
	open: { type: Boolean, default: false },
	/** `[{ label, value }]` — the rows from `runtimeDetails`. */
	details: { type: Array, default: () => [] },
})

defineEmits(["toggle"])
</script>