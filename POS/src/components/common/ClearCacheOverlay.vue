<template>
	<Teleport to="body">
		<Transition name="dialog">
			<div
				v-if="show"
				ref="dialogRoot"
				class="cache-dialog-root"
				dir="rtl"
				@mousedown.self="handleBackdrop"
			>
				<!-- Backdrop -->
				<div class="dialog-backdrop" aria-hidden="true"></div>

				<!-- Dialog -->
				<div
					ref="dialogRef"
					class="dialog-panel"
					role="dialog"
					aria-modal="true"
					aria-labelledby="cache-dialog-title"
					aria-describedby="cache-dialog-description"
					tabindex="-1"
					:aria-busy="isBusy || undefined"
					@keydown="handleKeydown"
				>
					<Transition name="content" mode="out-in">
						<!-- Confirmation -->
						<div
							v-if="!isBusy && !completed"
							key="confirm"
							class="dialog-content"
						>
							<div class="danger-icon">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									aria-hidden="true"
								>
									<path
										d="M12 9v4m0 4h.01M10.3 3.8L2.7 17a2 2 0 001.73 3h15.14a2 2 0 001.73-3L13.7 3.8a2 2 0 00-3.4 0z"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</div>

							<div class="dialog-heading">
								<h2 id="cache-dialog-title">
									{{ title }}
								</h2>

								<p id="cache-dialog-description">
									{{ description }}
								</p>
							</div>

							<div class="impact-notice">
								<div class="impact-icon">
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											d="M12 8v4m0 4h.01M10.3 3.8L2.7 17a2 2 0 001.73 3h15.14a2 2 0 001.73-3L13.7 3.8a2 2 0 00-3.4 0z"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</div>

								<p>
									{{ warningText }}
								</p>
							</div>

							<div class="dialog-actions">
								<button
									ref="cancelButtonRef"
									type="button"
									class="secondary-button"
									@click="handleCancel"
								>
									{{ cancelLabel }}
								</button>

								<button
									ref="confirmButtonRef"
									type="button"
									class="danger-button"
									:disabled="disabled"
									@click="handleConfirm"
								>
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										aria-hidden="true"
									>
										<path
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>

									{{ confirmLabel }}
								</button>
							</div>
						</div>

						<!-- Processing -->
						<div
							v-else-if="isBusy"
							key="processing"
							class="dialog-content processing-content"
							role="status"
							aria-live="polite"
						>
							<div class="processing-icon">
								<svg
									class="spinner"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<circle
										cx="12"
										cy="12"
										r="9"
										class="spinner-track"
										stroke="currentColor"
										stroke-width="2.5"
									/>
									<path
										d="M21 12a9 9 0 0 0-9-9"
										stroke="currentColor"
										stroke-width="2.5"
										stroke-linecap="round"
									/>
								</svg>

								<div class="database-icon">
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										aria-hidden="true"
									>
										<ellipse
											cx="12"
											cy="5"
											rx="7"
											ry="3"
											stroke-width="1.8"
										/>
										<path
											d="M5 5v7c0 1.66 3.13 3 7 3s7-1.34 7-3V5"
											stroke-width="1.8"
										/>
										<path
											d="M5 12v7c0 1.66 3.13 3 7 3s7-1.34 7-3v-7"
											stroke-width="1.8"
										/>
									</svg>
								</div>
							</div>

							<div class="dialog-heading">
								<h2>
									{{ processingTitle }}
								</h2>

								<p>
									{{ processingDescription }}
								</p>
							</div>

							<div class="progress-track">
								<div class="progress-indeterminate"></div>
							</div>

							<p class="processing-note">
								{{ processingNote }}
							</p>
						</div>

						<!-- Completed -->
						<div
							v-else
							key="completed"
							class="dialog-content processing-content"
							role="status"
							aria-live="polite"
						>
							<div class="success-icon">
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									aria-hidden="true"
								>
									<path
										d="M5 13l4 4L19 7"
										stroke-width="2.5"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</div>

							<div class="dialog-heading">
								<h2>
									{{ successTitle }}
								</h2>

								<p>
									{{ successDescription }}
								</p>
							</div>

							<button
								ref="doneButtonRef"
								type="button"
								class="success-button"
								@click="handleDone"
							>
								{{ doneLabel }}
							</button>
						</div>
					</Transition>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

const props = defineProps({
	show: {
		type: Boolean,
		default: false,
	},

	/*
	 * يمكن للأب إبقاء العملية في حالة تحميل
	 * إلى أن تنتهي عملية IndexedDB / Cache / Sync فعليًا.
	 */
	loading: {
		type: Boolean,
		default: false,
	},

	disabled: {
		type: Boolean,
		default: false,
	},

	closeOnBackdrop: {
		type: Boolean,
		default: true,
	},

	closeOnEscape: {
		type: Boolean,
		default: true,
	},

	title: {
		type: String,
		default: "مسح البيانات المؤقتة",
	},

	description: {
		type: String,
		default:
			"سيتم حذف البيانات المخزنة مؤقتًا لتحسين حالة التطبيق وإعادة تحميل البيانات من المصدر.",
	},

	warningText: {
		type: String,
		default: "الفواتير والمسودات المحفوظة لن يتم حذفها.",
	},

	cancelLabel: {
		type: String,
		default: "إلغاء",
	},

	confirmLabel: {
		type: String,
		default: "مسح البيانات",
	},

	processingTitle: {
		type: String,
		default: "جاري مسح البيانات",
	},

	processingDescription: {
		type: String,
		default: "يرجى الانتظار حتى تكتمل العملية.",
	},

	processingNote: {
		type: String,
		default: "لا تغلق الصفحة أو تعيد تحميل التطبيق أثناء تنفيذ العملية.",
	},

	successTitle: {
		type: String,
		default: "تم المسح بنجاح",
	},

	successDescription: {
		type: String,
		default: "تم تنظيف البيانات المؤقتة بنجاح.",
	},

	doneLabel: {
		type: String,
		default: "تم",
	},
})

const emit = defineEmits(["cancel", "confirm", "done"])

const dialogRoot = ref(null)
const dialogRef = ref(null)
const cancelButtonRef = ref(null)
const confirmButtonRef = ref(null)
const doneButtonRef = ref(null)

const isConfirming = ref(false)
const completed = ref(false)

const isBusy = computedBusy()

let previousActiveElement = null
let originalBodyOverflow = ""

function computedBusy() {
	return {
		get value() {
			return props.loading || isConfirming.value
		},
	}
}

function handleConfirm() {
	if (props.disabled || isBusy.value || completed.value) {
		return
	}

	isConfirming.value = true
	emit("confirm")
}

function handleCancel() {
	if (isBusy.value) return

	emit("cancel")
}

function handleDone() {
	if (!completed.value) return

	emit("done")
}

function handleBackdrop() {
	if (props.closeOnBackdrop && !isBusy.value && !props.disabled) {
		handleCancel()
	}
}

function handleKeydown(event) {
	if (event.key === "Escape") {
		if (props.closeOnEscape && !isBusy.value && !props.disabled) {
			event.preventDefault()
			handleCancel()
		}

		return
	}

	if (event.key === "Tab") {
		trapFocus(event)
	}
}

function trapFocus(event) {
	if (!dialogRef.value) return

	const focusable = dialogRef.value.querySelectorAll(
		[
			"button:not([disabled])",
			"input:not([disabled])",
			"select:not([disabled])",
			"textarea:not([disabled])",
			"a[href]",
			"[tabindex]:not([tabindex='-1'])",
		].join(","),
	)

	if (!focusable.length) {
		event.preventDefault()
		dialogRef.value.focus()
		return
	}

	const first = focusable[0]
	const last = focusable[focusable.length - 1]

	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault()
		last.focus()
		return
	}

	if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault()
		first.focus()
	}
}

function lockBodyScroll() {
	originalBodyOverflow = document.body.style.overflow

	document.body.style.overflow = "hidden"
}

function unlockBodyScroll() {
	document.body.style.overflow = originalBodyOverflow
}

async function focusInitialElement() {
	await nextTick()

	if (!props.show) return

	if (completed.value) {
		doneButtonRef.value?.focus()
		return
	}

	cancelButtonRef.value?.focus()
}

function reset() {
	isConfirming.value = false
	completed.value = false
}

function complete() {
	isConfirming.value = false
	completed.value = true

	nextTick(() => {
		doneButtonRef.value?.focus()
	})
}

watch(
	() => props.show,
	(isOpen, wasOpen) => {
		if (isOpen && !wasOpen) {
			previousActiveElement = document.activeElement

			reset()
			lockBodyScroll()
			focusInitialElement()
			return
		}

		if (!isOpen && wasOpen) {
			unlockBodyScroll()

			nextTick(() => {
				if (
					previousActiveElement &&
					typeof previousActiveElement.focus === "function"
				) {
					previousActiveElement.focus()
				}

				previousActiveElement = null
				reset()
			})
		}
	},
	{
		immediate: true,
	},
)

watch(
	() => props.loading,
	(isLoading, wasLoading) => {
		if (wasLoading && !isLoading && isConfirming.value) {
			/*
			 * عند انتهاء loading من الأب نفترض أن العملية
			 * اكتملت بنجاح. في حال وجود فشل، يمكن للأب إبقاء
			 * loading كما هو أو إغلاق الـ dialog مباشرة.
			 */
			complete()
		}
	},
)

onMounted(() => {
	if (props.show) {
		lockBodyScroll()
		focusInitialElement()
	}
})

onBeforeUnmount(() => {
	unlockBodyScroll()
})

defineExpose({
	reset,
	complete,
})
</script>

<style scoped>
.cache-dialog-root {
	position: fixed;
	inset: 0;
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 1rem;
	isolation: isolate;
}

.dialog-backdrop {
	position: absolute;
	inset: 0;
	background: rgba(15, 23, 42, 0.64);
	backdrop-filter: blur(5px);
	-webkit-backdrop-filter: blur(5px);
}

.dialog-panel {
	position: relative;
	z-index: 1;
	width: min(100%, 440px);
	max-height: calc(100vh - 2rem);
	overflow: hidden;
	border: 1px solid rgba(255, 255, 255, 0.7);
	border-radius: 1.25rem;
	background: #ffffff;
	box-shadow:
		0 30px 70px rgba(15, 23, 42, 0.24),
		0 10px 25px rgba(15, 23, 42, 0.12);
	outline: none;
}

.dialog-content {
	padding: 2rem;
}

.processing-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	padding: 2.5rem 2rem;
}

.danger-icon,
.success-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 72px;
	height: 72px;
	margin: 0 auto 1.5rem;
	border-radius: 50%;
}

.danger-icon {
	background: #fef2f2;
	color: #dc2626;
}

.success-icon {
	background: #ecfdf5;
	color: #059669;
}

.danger-icon svg,
.success-icon svg {
	width: 36px;
	height: 36px;
}

.dialog-heading {
	text-align: center;
}

.dialog-heading h2 {
	margin: 0;
	color: #111827;
	font-size: 1.375rem;
	font-weight: 750;
	line-height: 1.75rem;
	letter-spacing: -0.015em;
}

.dialog-heading p {
	margin: 0.625rem auto 0;
	max-width: 360px;
	color: #6b7280;
	font-size: 0.875rem;
	line-height: 1.6;
}

.impact-notice {
	display: flex;
	align-items: flex-start;
	gap: 0.75rem;
	margin-top: 1.5rem;
	padding: 0.875rem 1rem;
	border: 1px solid #fde68a;
	border-radius: 0.75rem;
	background: #fffbeb;
	color: #92400e;
}

.impact-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 auto;
	width: 20px;
	height: 20px;
	margin-top: 1px;
}

.impact-icon svg {
	width: 18px;
	height: 18px;
}

.impact-notice p {
	margin: 0;
	font-size: 0.75rem;
	font-weight: 550;
	line-height: 1.5;
}

.dialog-actions {
	display: flex;
	gap: 0.75rem;
	margin-top: 1.75rem;
}

.dialog-actions button {
	flex: 1;
}

.secondary-button,
.danger-button,
.success-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.5rem;
	min-height: 46px;
	padding: 0.625rem 1rem;
	border-radius: 0.75rem;
	font-size: 0.875rem;
	font-weight: 650;
	cursor: pointer;
	outline: none;
	transition:
		background-color 150ms ease,
		border-color 150ms ease,
		color 150ms ease,
		box-shadow 150ms ease,
		transform 100ms ease;
}

.secondary-button {
	border: 1px solid #e5e7eb;
	background: #f9fafb;
	color: #374151;
}

.secondary-button:hover {
	background: #f3f4f6;
	border-color: #d1d5db;
}

.danger-button {
	border: 1px solid #dc2626;
	background: #dc2626;
	color: #ffffff;
	box-shadow: 0 6px 16px rgba(220, 38, 38, 0.18);
}

.danger-button:hover {
	background: #b91c1c;
	border-color: #b91c1c;
}

.success-button {
	width: 100%;
	margin-top: 1.75rem;
	border: 1px solid #059669;
	background: #059669;
	color: #ffffff;
	box-shadow: 0 6px 16px rgba(5, 150, 105, 0.18);
}

.success-button:hover {
	background: #047857;
	border-color: #047857;
}

.secondary-button:active,
.danger-button:active,
.success-button:active {
	transform: scale(0.98);
}

.secondary-button:focus-visible,
.danger-button:focus-visible,
.success-button:focus-visible {
	box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2);
}

.danger-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
	box-shadow: none;
}

.processing-icon {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 96px;
	height: 96px;
	margin-bottom: 1.5rem;
	color: #059669;
}

.spinner {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	animation: spin 850ms linear infinite;
}

.spinner-track {
	opacity: 0.16;
}

.database-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 48px;
	height: 48px;
	border-radius: 50%;
	background: #ecfdf5;
	color: #059669;
}

.database-icon svg {
	width: 28px;
	height: 28px;
}

.progress-track {
	position: relative;
	width: 100%;
	height: 4px;
	margin-top: 1.5rem;
	overflow: hidden;
	border-radius: 999px;
	background: #e5e7eb;
}

.progress-indeterminate {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 38%;
	border-radius: inherit;
	background: #059669;
	animation: progress 1.35s ease-in-out infinite;
}

.processing-note {
	margin: 0.875rem 0 0;
	color: #9ca3af;
	font-size: 0.6875rem;
	line-height: 1.5;
}

.dialog-enter-active,
.dialog-leave-active {
	transition: opacity 180ms ease;
}

.dialog-enter-active .dialog-panel,
.dialog-leave-active .dialog-panel {
	transition:
		opacity 200ms ease,
		transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.dialog-enter-from,
.dialog-leave-to {
	opacity: 0;
}

.dialog-enter-from .dialog-panel {
	opacity: 0;
	transform: translateY(12px) scale(0.97);
}

.dialog-leave-to .dialog-panel {
	opacity: 0;
	transform: translateY(8px) scale(0.985);
}

.content-enter-active,
.content-leave-active {
	transition:
		opacity 150ms ease,
		transform 150ms ease;
}

.content-enter-from,
.content-leave-to {
	opacity: 0;
	transform: scale(0.98);
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

@keyframes progress {
	0% {
		inset-inline-start: -38%;
	}

	50% {
		inset-inline-start: 35%;
	}

	100% {
		inset-inline-start: 100%;
	}
}

@media (max-width: 480px) {
	.cache-dialog-root {
		align-items: flex-end;
		padding: 0.75rem;
	}

	.dialog-panel {
		width: 100%;
		border-radius: 1.125rem;
	}

	.dialog-content {
		padding: 1.5rem;
	}

	.processing-content {
		padding: 2rem 1.5rem;
	}

	.dialog-actions {
		flex-direction: column-reverse;
	}

	.dialog-actions button {
		width: 100%;
	}
}

@media (prefers-reduced-motion: reduce) {
	.dialog-enter-active,
	.dialog-leave-active,
	.dialog-enter-active .dialog-panel,
	.dialog-leave-active .dialog-panel,
	.content-enter-active,
	.content-leave-active,
	.secondary-button,
	.danger-button,
	.success-button {
		transition: none !important;
	}

	.spinner,
	.progress-indeterminate {
		animation: none !important;
	}
}
</style>