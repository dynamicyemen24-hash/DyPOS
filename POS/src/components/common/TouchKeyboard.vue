<template>
	<!--
		On-screen numeric keyboard for PIN/password entry.
		Accessible, RTL-aware, works on touch and mouse.
	-->
	<div
		v-if="isOpen"
		class="dy-touch-keyboard"
		role="dialog"
		aria-modal="true"
		aria-label="لوحة مفاتيح رقمية"
	>
		<div class="dy-touch-keyboard__backdrop" @click="close" />

		<div class="dy-touch-keyboard__panel" ref="panelRef">
			<header class="dy-touch-keyboard__header">
				<h2 class="dy-touch-keyboard__title">{{ title }}</h2>
				<button
					type="button"
					class="dy-touch-keyboard__close"
					@click="close"
					:aria-label="__('إغلاق')"
				>
					<FeatherIcon name="x" :size="20" />
				</button>
			</header>

			<div class="dy-touch-keyboard__display">
				<input
					ref="displayInput"
					:type="mask ? 'password' : 'text'"
					:value="displayValue"
					readonly
					class="dy-touch-keyboard__display-input"
					:aria-label="displayAriaLabel"
				/>
			</div>

			<div class="dy-touch-keyboard__keys">
				<template v-for="row in keyRows" :key="row">
					<div class="dy-touch-keyboard__row">
						<button
							v-for="key in row.split(' ')"
							:key="key"
							type="button"
							class="dy-touch-keyboard__key"
							:class="{
								'dy-touch-keyboard__key--wide': key === '0',
								'dy-touch-keyboard__key--action': key === '⌫' || key === '✓',
							}"
							@click="handleKey(key)"
							:disabled="disabledKeys.includes(key)"
							:aria-label="getKeyAriaLabel(key)"
						>
							<span v-if="key === '⌫'">
								<FeatherIcon name="delete" :size="20" />
							</span>
							<span v-else-if="key === '✓'">
								<FeatherIcon name="check" :size="20" />
							</span>
							<span v-else>{{ key }}</span>
						</button>
					</div>
				</template>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue"
import { FeatherIcon } from "dypos-ui"
import { __ } from "@/utils/translation"

const props = defineProps({
	/** Whether the keyboard is open */
	isOpen: { type: Boolean, default: false },
	/** Current value to display */
	modelValue: { type: String, default: "" },
	/** Maximum length */
	maxLength: { type: Number, default: 8 },
	/** Mask input (for passwords) */
	mask: { type: Boolean, default: false },
	/** Title for the keyboard */
	title: { type: String, default: "لوحة مفاتيح رقمية" },
	/** Placeholder when empty */
	placeholder: { type: String, default: "" },
	/** Whether to show the confirm button */
	showConfirm: { type: Boolean, default: true },
})

const emit = defineEmits(["update:modelValue", "close", "confirm"])

const panelRef = ref(null)

const keyRows = ["1 2 3", "4 5 6", "7 8 9", "⌫ 0 ✓"]

const displayValue = computed(() => props.modelValue || "")

const disabledKeys = computed(() => {
	const d = []
	if (props.modelValue.length >= props.maxLength) {
		d.push("1", "2", "3", "4", "5", "6", "7", "8", "9", "0")
	}
	if (!props.modelValue.length) {
		d.push("⌫")
	}
	if (!props.modelValue.length || !props.showConfirm) {
		d.push("✓")
	}
	return d
})

const displayAriaLabel = computed(() =>
	props.mask
		? `__('كلمة مرور: ${props.modelValue.length} ${props.modelValue.length === 1 ? "رقم" : "أرقام"})`
		: `__('القيمة: ${props.modelValue || "فارغ"}')`,
)

function getKeyAriaLabel(key) {
	if (key === "⌫") return __("حذف آخر رقم")
	if (key === "✓") return __("تأكيد")
	return key
}

function handleKey(key) {
	if (key === "⌫") {
		emit("update:modelValue", props.modelValue.slice(0, -1))
	} else if (key === "✓") {
		emit("confirm")
	} else if (!disabledKeys.value.includes(key)) {
		emit("update:modelValue", props.modelValue + key)
	}
}

function close() {
	emit("close")
}

function onKeydown(e) {
	if (e.key === "Escape") close()
	if (e.key === "Enter" && props.showConfirm) emit("confirm")
	if (e.key === "Backspace")
		emit("update:modelValue", props.modelValue.slice(0, -1))
	if (/^\d$/.test(e.key) && props.modelValue.length < props.maxLength) {
		emit("update:modelValue", props.modelValue + e.key)
	}
}

onMounted(() => {
	window.addEventListener("keydown", onKeydown)
	if (panelRef.value) {
		panelRef.value.focus()
	}
})

onBeforeUnmount(() => {
	window.removeEventListener("keydown", onKeydown)
})

watch(
	() => props.isOpen,
	(val) => {
		if (val) {
			document.body.style.overflow = "hidden"
		} else {
			document.body.style.overflow = ""
		}
	},
)
</script>

<style scoped>
.dy-touch-keyboard {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	padding-bottom: env(safe-area-inset-bottom, 0);
	background: transparent;
}

.dy-touch-keyboard__backdrop {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	animation: dy-touch-keyboard-fade-in 0.2s ease;
}

@keyframes dy-touch-keyboard-fade-in {
	from { opacity: 0; }
	to { opacity: 1; }
}

.dy-touch-keyboard__panel {
	position: relative;
	width: 100%;
	max-width: 480px;
	margin: 0 auto;
	padding: 16px;
	background: var(--dy-surface, #fff);
	border-radius: 20px 20px 0 0;
	box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.15);
	animation: dy-touch-keyboard-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes dy-touch-keyboard-slide-up {
	from {
		opacity: 0;
		transform: translateY(100%);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.dy-touch-keyboard__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 16px;
}

.dy-touch-keyboard__title {
	font-size: 16px;
	font-weight: 600;
	color: var(--dy-text, #0f172a);
}

.dy-touch-keyboard__close {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	border: none;
	background: transparent;
	color: var(--dy-text-muted, #64748b);
	border-radius: 10px;
	cursor: pointer;
	transition: background 0.15s, color 0.15s;
}

.dy-touch-keyboard__close:hover {
	background: var(--dy-surface-hover, #f1f5f9);
	color: var(--dy-text, #0f172a);
}

.dy-touch-keyboard__display {
	margin-bottom: 16px;
}

.dy-touch-keyboard__display-input {
	width: 100%;
	padding: 16px;
	font-size: 28px;
	font-weight: 600;
	text-align: center;
	letter-spacing: 8px;
	border: 2px solid var(--dy-border, #e2e8f0);
	border-radius: 12px;
	background: var(--dy-surface, #fff);
	color: var(--dy-text, #0f172a);
	font-family: "Inter", system-ui, sans-serif;
}

.dy-touch-keyboard__keys {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.dy-touch-keyboard__row {
	display: flex;
	justify-content: center;
	gap: 10px;
}

.dy-touch-keyboard__key {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 72px;
	height: 72px;
	min-width: 72px;
	font-size: 24px;
	font-weight: 600;
	color: var(--dy-text, #0f172a);
	background: var(--dy-surface, #fff);
	border: 2px solid var(--dy-border, #e2e8f0);
	border-radius: 14px;
	cursor: pointer;
	transition: all 0.1s ease;
	user-select: none;
	-webkit-tap-highlight-color: transparent;
}

.dy-touch-keyboard__key:hover:not(:disabled) {
	background: var(--dy-primary-light, #eff6ff);
	border-color: var(--dy-primary, #3b82f6);
	color: var(--dy-primary, #3b82f6);
}

.dy-touch-keyboard__key:active:not(:disabled) {
	transform: scale(0.96);
}

.dy-touch-keyboard__key:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.dy-touch-keyboard__key--wide {
	flex: 1;
	max-width: 160px;
}

.dy-touch-keyboard__key--action {
	color: var(--dy-primary, #3b82f6);
	border-color: var(--dy-primary-light, #bfdbfe);
}

.dy-touch-keyboard__key--action:hover:not(:disabled) {
	background: var(--dy-primary-light, #eff6ff);
}

/* RTL support */
html[dir="rtl"] .dy-touch-keyboard__keys {
	direction: rtl;
}

/* Mobile adjustments */
@media (max-width: 480px) {
	.dy-touch-keyboard__key {
		width: 64px;
		height: 64px;
		min-width: 64px;
		font-size: 22px;
	}
	
	.dy-touch-keyboard__panel {
		border-radius: 16px 16px 0 0;
		padding: 12px;
	}
}
</style>