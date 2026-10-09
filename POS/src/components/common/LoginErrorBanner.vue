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
  - السماح بتصحيح البيانات مباشرة من الشريط (إعادة تركيز الحقل، مسح الخطأ)
  - عرض تلميحات سياقية حسب نوع الخطأ
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

      <!-- تلميحات سياقية حسب نوع الخطأ -->
      <div v-if="errorHint" class="dy-login__error-hint">
        <FeatherIcon name="info" :size="14" aria-hidden="true" />
        <span>{{ errorHint }}</span>
      </div>

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
          @click="handleForgotPassword"
        >
          <FeatherIcon name="key" :size="14" aria-hidden="true" />
          <span>{{ __('استعادة / تغيير كلمة المرور') }}</span>
        </ActionButton>

        <ActionButton
          v-if="isOfflineMode"
          type="button"
          variant="ghost"
          size="xs"
          class="dy-login__error-btn"
          @click="handleOfflineLogin"
        >
          <FeatherIcon name="wifi-off" :size="14" aria-hidden="true" />
          <span>{{ __('متابعة دون اتصال') }}</span>
        </ActionButton>

        <ActionButton
          v-if="isBackendUnavailable"
          type="button"
          variant="ghost"
          size="xs"
          class="dy-login__error-btn"
          @click="handleRetryBackend"
        >
          <FeatherIcon name="refresh-cw" :size="14" aria-hidden="true" />
          <span>{{ __('إعادة محاولة الاتصال') }}</span>
        </ActionButton>
      </div>

      <!-- إجراءات تصحيح سريعة -->
      <div v-if="showQuickFix" class="dy-login__error-quickfix">
        <ActionButton
          type="button"
          variant="ghost"
          size="xs"
          class="dy-login__error-btn"
          @click="focusEmailField"
        >
          <FeatherIcon name="mail" :size="14" aria-hidden="true" />
          <span>{{ __('تصحيح البريد الإلكتروني') }}</span>
        </ActionButton>
        <ActionButton
          type="button"
          variant="ghost"
          size="xs"
          class="dy-login__error-btn"
          @click="focusPasswordField"
        >
          <FeatherIcon name="lock" :size="14" aria-hidden="true" />
          <span>{{ __('تصحيح كلمة المرور') }}</span>
        </ActionButton>
        <ActionButton
          type="button"
          variant="ghost"
          size="xs"
          class="dy-login__error-btn"
          @click="clearErrorAndFocus"
        >
          <FeatherIcon name="rotate-ccw" :size="14" aria-hidden="true" />
          <span>{{ __('مسح والمحاولة مرة أخرى') }}</span>
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
	isOfflineMode: {
		type: Boolean,
		default: false,
	},
	isBackendUnavailable: {
		type: Boolean,
		default: false,
	},
})

const emit = defineEmits([
	"clear",
	"register",
	"forgot-password",
	"retry-backend",
	"offline-login",
	"focus-email",
	"focus-password",
])

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

const isOfflineMode = computed(() => props.isOfflineMode)
const isBackendUnavailable = computed(() => props.isBackendUnavailable)

const hasRecoveryAction = computed(() => {
	return (
		isWrongPassword.value ||
		isMissingUserOrSubscriber.value ||
		isOfflineMode.value ||
		isBackendUnavailable.value
	)
})

const showQuickFix = computed(() => {
	if (!props.error) return false
	// Show quick fix for credential errors
	return isWrongPassword.value || isMissingUserOrSubscriber.value
})

const errorHint = computed(() => {
	if (!props.error) return ""

	if (isWrongPassword.value) {
		return __(
			"تأكد من كتابة كلمة المرور بشكل صحيح، مع مراعاة حالة الأحرف (Caps Lock)",
		)
	}

	if (isMissingUserOrSubscriber.value) {
		return __("تحقق من كتابة البريد الإلكتروني بشكل صحيح، أو سجل ك مشترك جديد")
	}

	if (isOfflineMode.value) {
		return __(
			"الوضع غير متصل: سيتم تسجيل الدخول محلياً ومزامنة البيانات عند عودة الاتصال",
		)
	}

	if (isBackendUnavailable.value) {
		return __(
			"خدمة المزامنة غير متاحة مؤقتاً، يمكنك المتابعة في وضع عدم الاتصال",
		)
	}

	return ""
})

function handleForgotPassword() {
	emit("forgot-password")
}

function handleOfflineLogin() {
	emit("offline-login")
}

function handleRetryBackend() {
	emit("retry-backend")
}

function focusEmailField() {
	emit("focus-email")
}

function focusPasswordField() {
	emit("focus-password")
}

function clearErrorAndFocus() {
	emit("clear")
	// Focus email field after a brief delay to allow error to clear
	setTimeout(() => {
		emit("focus-email")
	}, 100)
}
</script>

<style scoped>
.dy-login__error-recovery {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dy-space-2, 8px);
  margin-top: var(--dy-space-2, 6px);
}

.dy-login__error-hint {
  display: flex;
  align-items: center;
  gap: var(--dy-space-1, 4px);
  margin-top: var(--dy-space-2, 6px);
  padding: var(--dy-space-2, 6px) var(--dy-space-3, 8px);
  background: var(--dy-color-status-info-bg, #eff6ff);
  border-radius: var(--dy-radius-sm, 4px);
  color: var(--dy-color-status-info-text, #1e40af);
  font-size: var(--dy-text-sm, 0.875rem);
  line-height: 1.4;
  border: 1px solid var(--dy-color-status-info-border, #bfdbfe);
}

.dy-login__error-quickfix {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dy-space-2, 8px);
  margin-top: var(--dy-space-2, 6px);
  padding-top: var(--dy-space-2, 6px);
  border-top: 1px solid var(--dy-color-border, #e0e0e0);
}

.dy-login__error-btn {
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/*
 * القواعد الشريكة في `login.css` لا تصل إلى داخل هذا المكوّن: الصفحة
 * تحمّله بـ`<style scoped src>` ونطاق Vue scoped يبقى عند الجذر (البطاقة
 * `.dy-login__error` تعمل) ولا يعبر إلى الأبناء. النسخ من login.css —
 * نفس منطق "البحث في الملفين معًا" في designTokens.
 */
.dy-login__error-content {
  min-width: 0;
  flex: 1 1 auto;
  display: grid;
  gap: 2px;
  line-height: 1.45;
  color: var(--dy-text-secondary);
}

.dy-login__error-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  color: var(--dy-brand);
}

.dy-login__error-close {
  flex: 0 0 auto;
}
</style>
