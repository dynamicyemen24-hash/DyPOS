<!-- POS/src/components/NotificationBar.vue -->
<template>
  <div
    v-if="showBar"
    class="notification-bar"
    :class="{ 'bar-error': type === 'error', 'bar-success': type === 'success' }"
    role="alert"
    aria-live="polite"
  >
    <div class="bar-content">
      <span class="bar-icon">
        <FeatherIcon :name="icon" :size="16" aria-hidden="true" />
      </span>
      <span class="bar-message">{{ message }}</span>
    </div>
    <div class="bar-actions">
      <ActionButton
        v-if="canEmail"
        variant="subtle"
        size="sm"
        @click="sendEmail"
        :aria-label="__('إرسال بالبريد')"
      >
        <FeatherIcon name="mail" :size="14" aria-hidden="true" />
        {{ __('البريد') }}
      </ActionButton>
      <ActionButton
        v-if="canWhatsApp"
        variant="subtle"
        size="sm"
        @click="sendWhatsApp"
        :aria-label="__('إرسال عبر واتساب')"
      >
        <FeatherIcon name="message-circle" :size="14" aria-hidden="true" />
        {{ __('واتساب') }}
      </ActionButton>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue"
import { ActionButton, FeatherIcon } from "dypos-ui"
import { usePOSSettingsStore } from "@/stores/posSettings"

const store = usePOSSettingsStore()

// ---- حالة الشريط -
const showBar = ref(false)
const message = ref("")
const type = ref("info") // 'success' | 'error' | 'info'
const icon = ref("")

// ---- إمكانية الإرسال -
const canEmail = computed(
	() => store.enableEmailNotification && store.emailRecipient,
)
const canWhatsApp = computed(
	() => store.enableWhatsAppNotification && store.whatsappNumber,
)

// ---- أيقونة according to type -
watch(type, (t) => {
	if (t === "error") icon.value = "alert-circle"
	else if (t === "success") icon.value = "check-circle"
	else icon.value = "info"
})

// ---- عرض الشريط (يتم استدعاؤه من useSaleNotification) -
function showProfessionalNotification(msg, t = "info") {
	message.value = msg
	type.value = t
	showBar.value = true
	// الاختفاء التلقائي بعد 5 ث
	const timer = setTimeout(() => {
		showBar.value = false
	}, 5000)
}

// ---- إرسال إيميل – يفتح mailto: -
function sendEmail() {
	const recipient = store.emailRecipient || ""
	if (!recipient) return
	const subject = encodeURIComponent("DyPOS Notification")
	const body = encodeURIComponent(message.value)
	window.open(`mailto:${recipient}?subject=${subject}&body=${body}`, "_blank")
}

// ---- إرسال واتساب – يفتح wa.me -
function sendWhatsApp() {
	const number = store.whatsappNumber
	if (!number) return
	const text = encodeURIComponent(message.value)
	window.open(`https://wa.me/${number}?text=${text}`, "_blank")
}

// ---- Expo لل使用在 Template –
defineOptions({
	/* none */
})
</script>

<style scoped>
.notification-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  z-index: 1000;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #1f2937;
}
.bar-content { display: flex; align-items: center; gap: 8px; }
.bar-actions { display: flex; gap: 8px; }
</style>