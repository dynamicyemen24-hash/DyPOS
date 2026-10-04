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