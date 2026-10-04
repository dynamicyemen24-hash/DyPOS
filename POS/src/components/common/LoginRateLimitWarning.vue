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