<!--
  =============================================================================
  LoginErrorBanner.vue — شريط رسائل الخطأ الذكي في شاشة الدخول مع إجراءات التعافي
  =============================================================================
  المسؤوليات:
  - عرض رسالة الخطأ للمستخدم مع التوضيح
  - توفير أزرار تعافي فورية سياقية:
    * إذا كان المشترك/المستخدم غير موجود -> زر انتقال لتسجيل مشترك جديد / إنشاء حساب
    * إذا كانت كلمة المرور غير صحيحة -> زر انتقال لاستعادة / تغيير كلمة المرور
    * إذا كانت الخدمة الخلفية غير متاحة (503) -> توضيح وإمكانية المتابعة أوفلاين
-->

<template>
  <div
    v-if="error"
    id="dypos-login-error"
    class="dy-login__error"
    role="alert"
    aria-live="assertive"
  >
    <span class="dy-login__error-icon" aria-hidden="true">
      <FeatherIcon name="alert-circle" :size="18" />
    </span>

    <div class="dy-login__error-content">
      <strong>{{ __('تعذر تسجيل الدخول') }}</strong>
      <span>{{ error }}</span>

      <!-- إجراءات التعافي الفورية حسب نوع الخطأ -->
      <div v-if="hasRecoveryAction" class="dy-login__error-recovery">
        <ActionButton
          v-if="isMissingUserOrSubscriber"
          type="button"
          variant="ghost"
          size="xs"
          class="dy-login__error-btn"
          @click="$emit('register')"
        >
          <FeatherIcon name="user-plus" :size="14" aria-hidden="true" />
          <span>{{ __('تسجيل مشترك جديد / إنشاء حساب') }}</span>
        </ActionButton>

        <ActionButton
          v-if="isWrongPassword"
          type="button"
          variant="ghost"
          size="xs"
          class="dy-login__error-btn"
          @click="$emit('forgot-password')"
        >
          <FeatherIcon name="key" :size="14" aria-hidden="true" />
          <span>{{ __('استعادة / تغيير كلمة المرور') }}</span>
        </ActionButton>
      </div>
    </div>

    <ActionButton
      type="button"
      variant="ghost"
      size="xs"
      class="dy-login__error-close"
      :aria-label="__('إغلاق رسالة الخطأ')"
      @click="$emit('clear')"
    >
      <FeatherIcon name="x" :size="16" />
    </ActionButton>
  </div>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon, ActionButton } from "dypos-ui"
import { __ } from "@/utils/translation"

const props = defineProps({
	error: {
		type: String,
		default: "",
	},
})

defineEmits(["clear", "register", "forgot-password"])

const isWrongPassword = computed(() => {
	if (!props.error) return false
	return /كلمة المرور|غير صحيحة|401|password/i.test(props.error)
})

const isMissingUserOrSubscriber = computed(() => {
	if (!props.error) return false
	return /المستخدم غير موجود|المشترك غير موجود|المستأجر غير موجود|الحساب غير مسجل|غير مسجل|لا يوجد حساب/i.test(
		props.error,
	)
})

const hasRecoveryAction = computed(() => {
	return isWrongPassword.value || isMissingUserOrSubscriber.value
})
</script>

<style scoped>
.dy-login__error-recovery {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dy-space-2, 8px);
  margin-top: var(--dy-space-2, 6px);
}

.dy-login__error-btn {
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
