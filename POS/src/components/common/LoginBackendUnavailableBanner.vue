<!--
    LoginBackendUnavailableBanner — banner shown when the edge worker
    returns 503 (UPSTREAM_MISCONFIGURED) but the app is otherwise online.
    Extracted from `pages/Login.vue` (file-size ratchet).
-->
<template>
    <div
        class="dy-login__backend-unavailable"
        role="status"
        aria-live="polite"
    >
        <span class="dy-login__backend-unavailable-icon" aria-hidden="true">
            <FeatherIcon name="server" :size="18" />
        </span>

        <div class="dy-login__backend-unavailable-content">
            <strong>
                {{ __('خدمة المزامنة غير متاحة') }}
            </strong>

            <span>
                {{ __('يعمل البيع المحلي دون اتصال. ستتم المزامنة عند استعادة الاتصال.') }}
            </span>
        </div>

        <button
            type="button"
            class="dy-login__backend-unavailable-action"
            @click="$emit('retry')"
            :aria-label="__('إعادة محاولة الاتصال بالخادم')"
        >
            {{ __('إعادة المحاولة') }}
        </button>
    </div>
</template>

<script setup>
import { FeatherIcon } from "dypos-ui"

defineEmits(["retry"])
</script>

<style scoped>
/*
 * نسخ من `login.css` (المجموعة المشتركة runtime/rate-limit/error): الصفحة
 * محمّلة بـ`<style scoped>` ولا يعبر نطاقها إلى داخل هذا المكوّن — الجذر
 * يصله من login.css، والعناصر الداخلية لا.
 */
.dy-login__backend-unavailable-content {
	min-width: 0;
	flex: 1 1 auto;
	display: grid;
	gap: 2px;
	line-height: 1.45;
	color: var(--dy-text-secondary);
}

.dy-login__backend-unavailable-icon {
	flex: 0 0 auto;
	display: grid;
	place-items: center;
	color: var(--dy-brand);
}

.dy-login__backend-unavailable-action {
	flex: 0 0 auto;
	align-self: center;
}
</style>