<template>
	<Teleport to="body">
		<Transition :name="isRTL ? 'toast-slide-rtl' : 'toast-slide-ltr'">
			<div
				v-if="showToast && toastNotification"
				:role="toastNotification.type === 'error' ? 'alert' : 'status'"
				:aria-live="toastNotification.type === 'error' ? 'assertive' : 'polite'"
				:aria-atomic="true"
				class="fixed top-4 end-4 z-[9999] max-w-md"
				@mouseenter="pauseToast"
				@mouseleave="resumeToast"
				@focusin="pauseToast"
				@focusout="resumeToast"
			>
				<div
					:class="[
						'rounded-lg shadow-xl p-4 flex items-start gap-3',
						toastStyles.container,
					]"
				>
					<div class="flex-shrink-0">
						<FeatherIcon
							:name="toastStyles.icon"
							:class="['w-5 h-5', toastStyles.iconColor]"
						/>
					</div>
					<div class="flex-1 min-w-0">
						<p :class="['text-sm font-semibold', toastStyles.titleColor]">
							{{ toastNotification.title }}
						</p>
						<p :class="['text-sm mt-1', toastStyles.messageColor]">
							{{ toastNotification.message }}
						</p>
					</div>
<ActionButton
					@click="hideToast"
					:aria-label="__('Close')"
					variant="ghost"
					size="sm"
					class="flex-shrink-0"
				>
					<FeatherIcon name="x" :class="['w-4 h-4', toastStyles.closeColor]" aria-hidden="true" />
				</ActionButton>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup>
import { computed } from "vue"
import { useToast } from "@/composables/useToast"
import { useLocale } from "@/composables/useLocale"
import { __ } from "@/utils/translation"
import { ActionButton, FeatherIcon } from "dypos-ui"

const { toastNotification, showToast, hideToast, pauseToast, resumeToast } =
	useToast()
const { isRTL } = useLocale()

// Toast type to style mapping — uses DyPOS design tokens for consistent theming
const TOAST_TYPE_STYLES = {
	success: {
		container:
			"bg-[var(--dy-success-soft)] border-s-4 border-[var(--dy-success)]",
		icon: "check-circle",
		iconColor: "text-[var(--dy-success)]",
		titleColor: "text-[var(--dy-success)]",
		messageColor: "text-[var(--dy-success)]",
		closeColor: "text-[var(--dy-success)] hover:text-[var(--dy-success-hover)]",
	},
	error: {
		container:
			"bg-[var(--dy-danger-soft)] border-s-4 border-[var(--dy-danger)]",
		icon: "x-circle",
		iconColor: "text-[var(--dy-danger)]",
		titleColor: "text-[var(--dy-danger)]",
		messageColor: "text-[var(--dy-danger)]",
		closeColor: "text-[var(--dy-danger)] hover:text-[var(--dy-danger-hover)]",
	},
	warning: {
		container:
			"bg-[var(--dy-warning-soft)] border-s-4 border-[var(--dy-warning)]",
		icon: "alert-circle",
		iconColor: "text-[var(--dy-warning)]",
		titleColor: "text-[var(--dy-warning)]",
		messageColor: "text-[var(--dy-warning)]",
		closeColor: "text-[var(--dy-warning)] hover:text-[var(--dy-warning-hover)]",
	},
	info: {
		container: "bg-[var(--dy-info-soft)] border-s-4 border-[var(--dy-info)]",
		icon: "info",
		iconColor: "text-[var(--dy-info)]",
		titleColor: "text-[var(--dy-info)]",
		messageColor: "text-[var(--dy-info)]",
		closeColor: "text-[var(--dy-info)] hover:text-[var(--dy-info-hover)]",
	},
}

// Default styles fallback
const DEFAULT_STYLES = TOAST_TYPE_STYLES.info

const toastStyles = computed(() => {
	if (!toastNotification.value) return DEFAULT_STYLES
	return TOAST_TYPE_STYLES[toastNotification.value.type] || DEFAULT_STYLES
})
</script>

<style scoped>
/* Common transition timing */
.toast-slide-ltr-enter-active,
.toast-slide-ltr-leave-active,
.toast-slide-rtl-enter-active,
.toast-slide-rtl-leave-active {
	transition: all 0.3s ease;
}

/* LTR: slide from right (end side) */
.toast-slide-ltr-enter-from,
.toast-slide-ltr-leave-to {
	opacity: 0;
	transform: translateX(100%);
}

/* RTL: slide from left (end side in RTL) */
.toast-slide-rtl-enter-from,
.toast-slide-rtl-leave-to {
	opacity: 0;
	transform: translateX(-100%);
}
</style>
