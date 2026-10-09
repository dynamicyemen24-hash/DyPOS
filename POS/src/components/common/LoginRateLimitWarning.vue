<!--
    LoginRateLimitWarning — rate limit warning banner.
    Extracted from `pages/Login.vue` (file-size ratchet).
-->
<template>
    <div
        class="dy-login__rate-limit"
        role="alert"
        aria-live="assertive"
    >
        <span class="dy-login__rate-limit-icon" aria-hidden="true">
            <FeatherIcon
                name="clock"
                :size="18"
            />
        </span>

        <div class="dy-login__rate-limit-content">
            <strong>
                {{ __('تم قفل المؤقت') }}
            </strong>

            <span>
                {{ __('المحاولة بعد') }}
                {{ retryAfterSeconds }}
                {{ __('ثانية') }}
            </span>
        </div>
    </div>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "dypos-ui"
import { useReducedMotion } from "@/composables/useReducedMotion"

const props = defineProps({
	retryAfterMs: {
		type: Number,
		required: true,
	},
})

const { isReducedMotion } = useReducedMotion()

const retryAfterSeconds = computed(() => Math.ceil(props.retryAfterMs / 1000))
</script>

<style scoped>
/*
 * نسخ من `login.css` (المجموعة المشتركة runtime/rate-limit/error): الصفحة
 * محمّلة بـ`<style scoped>` ولا يعبر نطاقها إلى داخل هذا المكوّن — الجذر
 * يصله من login.css، والعناصر الداخلية لا.
 */
.dy-login__rate-limit-content {
	min-width: 0;
	flex: 1 1 auto;
	display: grid;
	gap: 2px;
	line-height: 1.45;
	color: var(--dy-text-secondary);
}

.dy-login__rate-limit-icon {
	flex: 0 0 auto;
	display: grid;
	place-items: center;
	color: var(--dy-brand);
}
</style>