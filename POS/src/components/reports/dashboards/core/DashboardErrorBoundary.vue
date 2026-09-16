<!--
  =============================================================================
  DyPOS — Dashboard Error Boundary
  Catches and recovers from dashboard-specific errors.
  =============================================================================
-->

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue"
import { FeatherIcon } from "frappe-ui"
import { logger } from "@/utils/logger"
import DyButton from "@/components/ui/DyButton.vue"

const props = defineProps({
	dashboardId: { type: String, default: "" },
	showRetry: { type: Boolean, default: true },
	onRetry: { type: Function, default: null },
})

const error = ref(null)
const errorCount = ref(0)
const lastErrorTime = ref(null)
const isRecovering = ref(false)

const isError = computed(() => !!error.value)
const canRetry = computed(() => errorCount.value < 3)

const errorMessages = {
	sales: {
		title: "خطأ في لوحة المبيعات",
		message: "تعذر تحميل بيانات المبيعات",
	},
	finance: {
		title: "خطأ في لوحة المالية",
		message: "تعذر تحميل البيانات المالية",
	},
	inventory: {
		title: "خطأ في لوحة المخزون",
		message: "تعذر تحميل بيانات المخزون",
	},
	customers: {
		title: "خطأ في لوحة العملاء",
		message: "تعذر تحميل بيانات العملاء",
	},
	executive: {
		title: "خطأ في لوحة التنفيذيين",
		message: "تعذر تحميل بيانات التنفيذيين",
	},
	operations: {
		title: "خطأ في لوحة العمليات",
		message: "تعذر تحميل بيانات العمليات",
	},
}

const currentError = computed(() => {
	return (
		errorMessages[props.dashboardId] || {
			title: "خطأ في اللوحة",
			message: error.value?.message || "حدث خطأ غير متوقع",
		}
	)
})

function handleError(err) {
	error.value = err
	errorCount.value += 1
	lastErrorTime.value = Date.now()

	logger?.error?.(`Dashboard [${props.dashboardId}] error`, {
		error: err,
		count: errorCount.value,
	})
}

async function retry() {
	if (!canRetry.value) return

	isRecovering.value = true
	try {
		if (props.onRetry) {
			await props.onRetry()
		}
		error.value = null
	} catch (err) {
		handleError(err)
	} finally {
		isRecovering.value = false
	}
}

function dismiss() {
	error.value = null
	errorCount.value = 0
}

const errorHandler = (e) => handleError(e.detail)

onMounted(() => {
	window.addEventListener(
		`dy:dashboard-error-${props.dashboardId}`,
		errorHandler,
	)
})

onUnmounted(() => {
	window.removeEventListener(
		`dy:dashboard-error-${props.dashboardId}`,
		errorHandler,
	)
})
</script>

<template>
	<div
		v-if="isError"
		class="dy-dashboard-error"
		role="alert"
		aria-live="assertive"
		dir="rtl"
	>
		<div class="dy-dashboard-error__icon" aria-hidden="true">
			<FeatherIcon name="alert-triangle" :size="32" />
		</div>

		<div class="dy-dashboard-error__content">
			<h3 class="dy-dashboard-error__title">
				{{ currentError.title }}
			</h3>

			<p class="dy-dashboard-error__message">
				{{ currentError.message }}
			</p>

			<p v-if="errorCount > 1" class="dy-dashboard-error__count">
				تمت المحاولة {{ errorCount }} مرة
			</p>
		</div>

		<div v-if="showRetry" class="dy-dashboard-error__actions">
			<DyButton
				v-if="canRetry && !isRecovering"
				variant="primary"
				size="sm"
				@click="retry"
			>
				<FeatherIcon name="refresh-cw" :size="16" />
				إعادة المحاولة
			</DyButton>

			<button
				v-else-if="!canRetry"
				type="button"
				class="dy-dashboard-error__report"
				@click="$emit('report', error)"
			>
				إبلاغ المطور
			</button>
		</div>
	</div>
</template>

<style scoped>
.dy-dashboard-error {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 16px;

	padding: 32px 24px;

	background: var(--dy-surface);
	border: 1px solid rgb(var(--dy-crimson-c-500) / 0.2);
	border-radius: var(--dy-radius-xl);
	text-align: center;
}

.dy-dashboard-error__icon {
	color: var(--dy-crimson-500);
}

.dy-dashboard-error__content {
	max-width: 400px;
}

.dy-dashboard-error__title {
	margin: 0;
	color: var(--dy-text-strong);
	font-size: 1.2rem;
	font-weight: 800;
}

.dy-dashboard-error__message {
	margin: 8px 0 0;
	color: var(--dy-text-secondary);
	font-size: 0.9rem;
	line-height: 1.8;
}

.dy-dashboard-error__count {
	margin: 8px 0 0;
	color: var(--dy-text-muted);
	font-size: 0.8rem;
}

.dy-dashboard-error__actions {
	display: flex;
	gap: 12px;
	margin-top: 8px;
}

.dy-dashboard-error__report {
	padding: 8px 16px;
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-lg);
	background: transparent;
	color: var(--dy-text-secondary);
	font-size: 0.85rem;
	cursor: pointer;
	transition: all 0.2s;
}

.dy-dashboard-error__report:hover {
	background: var(--dy-surface);
	border-color: var(--dy-accent);
	color: var(--dy-accent);
}
</style>

