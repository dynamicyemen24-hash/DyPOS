<!--
  HardwareDiagnosticsPanel — POS peripheral testing panel (Odoo-like hardware tools).

  Provides test buttons for thermal printer, cash drawer, barcode scanner,
  customer display, and scale. Results are shown inline with status indicators.

  Only renders when technical mode is enabled.
-->
<script setup>
import { onMounted, onUnmounted, ref } from "vue"

import { ActionButton } from "dypos-ui"
import { FeatherIcon } from "dypos-ui"
import { useHardwareDiagnostics } from "@/composables/useHardwareDiagnostics"
import { __ } from "@/utils/translation"

const {
	testing,
	lastResults,
	error,
	testPrinter,
	testCashDrawer,
	testBarcodeScanner,
	testCustomerDisplay,
	testScale,
	runAllTests,
	clearResults,
	availableTests,
} = useHardwareDiagnostics()

const expanded = ref(false)
const runningTest = ref(null)

async function runTest(testFn, key) {
	runningTest.value = key
	await testFn()
	runningTest.value = null
}

async function runAll() {
	runningTest.value = "all"
	await runAllTests()
	runningTest.value = null
}

function getResult(key) {
	return lastResults.value[key]
}

function getStatus(key) {
	const result = getResult(key)
	if (!result) return "idle"
	if (runningTest.value === key || runningTest.value === "all") return "running"
	return result.ok ? "success" : "error"
}
</script>

<template>
	<div class="dy-login__hardware-diagnostics" :class="{ 'dy-login__hardware-diagnostics--expanded': expanded }">
		<!-- Panel Header -->
		<div class="dy-login__hardware-header" @click="expanded = !expanded">
			<div class="dy-login__hardware-title">
				<FeatherIcon name="cpu" :size="18" aria-hidden="true" />
				<span>{{ __('أدوات تشخيص الأجهزة') }}</span>
			</div>

			<div class="dy-login__hardware-actions">
				<ActionButton
					v-if="!expanded"
					variant="ghost"
					size="sm"
					@click.stop="expanded = true"
					:aria-label="__('توسيع أدوات التشخيص')"
				>
					<FeatherIcon name="chevron-down" :size="14" aria-hidden="true" />
				</ActionButton>

				<div v-else class="dy-login__hardware-buttons">
					<ActionButton
						variant="ghost"
						size="sm"
						@click.stop="clearResults"
						:aria-label="__('مسح النتائج')"
					>
						<FeatherIcon name="x" :size="14" aria-hidden="true" />
						<span>{{ __('مسح') }}</span>
					</ActionButton>

					<ActionButton
						variant="solid"
						size="sm"
						:loading="runningTest === 'all'"
						:disabled="testing"
						@click.stop="runAll"
						:aria-label="__('تشغيل جميع الاختبارات')"
					>
						<FeatherIcon name="play" :size="14" aria-hidden="true" />
						<span>{{ __('اختبار الكل') }}</span>
					</ActionButton>

					<ActionButton
						variant="ghost"
						size="sm"
						@click.stop="expanded = false"
						:aria-label="__('طي أدوات التشخيص')"
					>
						<FeatherIcon name="chevron-up" :size="14" aria-hidden="true" />
					</ActionButton>
				</div>
			</div>
		</div>

		<!-- Test List -->
		<div v-if="expanded" class="dy-login__hardware-tests">
			<div
				v-for="test in availableTests"
				:key="test.key"
				class="dy-login__hardware-test"
			>
				<div class="dy-login__hardware-test-info">
					<FeatherIcon :name="test.icon" :size="18" aria-hidden="true" />
					<div class="dy-login__hardware-test-meta">
						<span class="dy-login__hardware-test-label">{{ test.label }}</span>
						<span
							v-if="getStatus(test.key) === 'running'"
							class="dy-login__hardware-test-status running"
						>
							<FeatherIcon name="loader" :size="12" aria-hidden="true" class="dy-spin" />
							{{ __('جاري الاختبار...') }}
						</span>
						<span
							v-else-if="getStatus(test.key) === 'success'"
							class="dy-login__hardware-test-status success"
						>
							<FeatherIcon name="check-circle" :size="12" aria-hidden="true" />
							{{ __('نجح') }}
						</span>
						<span
							v-else-if="getStatus(test.key) === 'error'"
							class="dy-login__hardware-test-status error"
						>
							<FeatherIcon name="x-circle" :size="12" aria-hidden="true" />
							{{ __('فشل') }}
						</span>
					</div>
				</div>

				<div class="dy-login__hardware-test-actions">
					<ActionButton
						variant="outline"
						size="sm"
						:loading="runningTest === test.key"
						:disabled="testing && runningTest !== test.key"
						@click="runTest(test.test, test.key)"
						:aria-label="__('اختبار {0}', { 0: test.label })"
					>
						<FeatherIcon name="play" :size="14" aria-hidden="true" />
						<span>{{ __('اختبار') }}</span>
					</ActionButton>
				</div>

				<!-- Result Details -->
				<div
					v-if="getResult(test.key)"
					class="dy-login__hardware-test-result"
					:class="getStatus(test.key)"
				>
					<pre>{{ getResult(test.key).message }}</pre>
				</div>
			</div>

			<!-- Global Error -->
			<div v-if="error" class="dy-login__hardware-error" role="alert">
				<FeatherIcon name="alert-circle" :size="16" aria-hidden="true" />
				<span>{{ error }}</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
.dy-login__hardware-diagnostics {
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-xl);
	background: var(--dy-surface);
	overflow: hidden;
}

.dy-login__hardware-diagnostics--expanded {
	box-shadow: var(--dy-elevation-2);
}

.dy-login__hardware-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;

	padding: 12px 16px;

	background: var(--dy-surface-soft);
	border-bottom: 1px solid var(--dy-border);
	cursor: pointer;
}

.dy-login__hardware-title {
	display: inline-flex;
	align-items: center;
	gap: 8px;

	color: var(--dy-text-strong);
	font-size: 0.875rem;
	font-weight: 700;
}

.dy-login__hardware-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.dy-login__hardware-buttons {
	display: flex;
	align-items: center;
	gap: 8px;
}

.dy-login__hardware-tests {
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.dy-login__hardware-test {
	display: flex;
	flex-direction: column;
	gap: 8px;

	padding: 12px;
	border: 1px solid var(--dy-border-soft);
	border-radius: var(--dy-radius-lg);
	background: var(--dy-surface-soft);
}

.dy-login__hardware-test-info {
	display: flex;
	align-items: center;
	gap: 12px;
	flex: 1;
}

.dy-login__hardware-test-meta {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: 1;
	flex-wrap: wrap;
}

.dy-login__hardware-test-label {
	font-weight: 600;
	color: var(--dy-text);
}

.dy-login__hardware-test-status {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 0.75rem;
	font-weight: 600;
}

.dy-login__hardware-test-status.running {
	color: var(--dy-accent);
}

.dy-login__hardware-test-status.success {
	color: var(--dy-mint-600);
}

.dy-login__hardware-test-status.error {
	color: var(--dy-crimson-600);
}

.dy-spin {
	animation: dy-spin 1s linear infinite;
}

@keyframes dy-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}

.dy-login__hardware-test-actions {
	display: flex;
	justify-content: flex-end;
}

.dy-login__hardware-test-result {
	margin-top: 8px;
	padding: 8px 12px;
	border-radius: var(--dy-radius-md);
	font-size: 0.75rem;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
}

.dy-login__hardware-test-result.success {
	background: rgb(var(--dy-mint-c-500) / 0.1);
	color: var(--dy-mint-700);
	border: 1px solid rgb(var(--dy-mint-c-500) / 0.2);
}

.dy-login__hardware-test-result.error {
	background: rgb(var(--dy-crimson-c-500) / 0.1);
	color: var(--dy-crimson-700);
	border: 1px solid rgb(var(--dy-crimson-c-500) / 0.2);
}

.dy-login__hardware-test-result pre {
	margin: 0;
	font-family: var(--dy-font-mono);
	font-size: inherit;
}

.dy-login__hardware-error {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 12px;
	border-radius: var(--dy-radius-lg);
	background: rgb(var(--dy-crimson-c-500) / 0.1);
	border: 1px solid rgb(var(--dy-crimson-c-500) / 0.2);
	color: var(--dy-crimson-700);
	font-size: 0.8rem;
}

@media (forced-colors: active) {
	.dy-login__hardware-diagnostics {
		border-color: CanvasText;
	}

	.dy-login__hardware-header {
		border-color: CanvasText;
		background: Canvas;
	}

	.dy-login__hardware-test {
		border-color: CanvasText;
		background: Canvas;
	}

	.dy-login__hardware-test-result.success,
	.dy-login__hardware-test-result.error {
		border-color: CanvasText;
		background: Canvas;
	}

	.dy-login__hardware-error {
		border-color: CanvasText;
		background: Canvas;
		color: CanvasText;
	}
}
</style>