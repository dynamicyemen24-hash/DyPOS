<!--
  NetworkDiagnosticsPanel — connectivity and endpoint health panel (Odoo-like network tools).

  Provides:
  - Endpoint latency tests (health, method API, sync)
  - DNS resolution test
  - Real-time (SSE/WebSocket) connectivity
  - Sync availability test
  - Overall summary with pass/fail count

  Only renders when technical mode is enabled.
-->
<script setup>
import { onMounted, onUnmounted, ref } from "vue"

import { ActionButton } from "dypos-ui"
import { FeatherIcon } from "dypos-ui"
import { useNetworkDiagnostics } from "@/composables/useNetworkDiagnostics"
import { __ } from "@/utils/translation"

const {
	testing,
	results,
	error,
	testEndpoints,
	testDNS,
	testRealtime,
	testSync,
	runAllTests,
	clearResults,
	summary,
} = useNetworkDiagnostics()

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
	return results.value[key]
}

function getStatus(key) {
	const result = getResult(key)
	if (!result) return "idle"
	if (runningTest.value === key || runningTest.value === "all") return "running"
	return result.ok ? "success" : "error"
}
</script>

<template>
	<div class="dy-login__network-diagnostics" :class="{ 'dy-login__network-diagnostics--expanded': expanded }">
		<!-- Panel Header -->
		<div class="dy-login__network-header" @click="expanded = !expanded">
			<div class="dy-login__network-title">
				<FeatherIcon name="wifi" :size="18" aria-hidden="true" />
				<span>{{ __('أدوات تشخيص الشبكة') }}</span>
			</div>

			<div class="dy-login__network-summary" v-if="summary.total > 0">
				<span
					:class="[
						'dy-login__network-badge',
						summary.allOk ? 'success' : 'warning',
					]"
				>
					{{ summary.passed }} / {{ summary.total }} {{ __('اختبارات ناجحة') }}
				</span>
			</div>

			<div class="dy-login__network-actions">
				<ActionButton
					v-if="!expanded"
					variant="ghost"
					size="sm"
					@click.stop="expanded = true"
					:aria-label="__('توسيع أدوات تشخيص الشبكة')"
				>
					<FeatherIcon name="chevron-down" :size="14" aria-hidden="true" />
				</ActionButton>

				<div v-else class="dy-login__network-buttons">
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
						:aria-label="__('تشغيل جميع اختبارات الشبكة')"
					>
						<FeatherIcon name="play" :size="14" aria-hidden="true" />
						<span>{{ __('اختبار الكل') }}</span>
					</ActionButton>

					<ActionButton
						variant="ghost"
						size="sm"
						@click.stop="expanded = false"
						:aria-label="__('طي أدوات تشخيص الشبكة')"
					>
						<FeatherIcon name="chevron-up" :size="14" aria-hidden="true" />
					</ActionButton>
				</div>
			</div>
		</div>

		<!-- Test List -->
		<div v-if="expanded" class="dy-login__network-tests">
			<!-- Endpoint Tests -->
			<div class="dy-login__network-section">
				<h4 class="dy-login__network-section-title">
					<FeatherIcon name="server" :size="14" aria-hidden="true" />
					{{ __('نقاط نهاية API') }}
				</h4>

				<div
					v-for="key in ['health', 'method', 'sync']"
					:key="key"
					class="dy-login__network-test"
				>
					<div class="dy-login__network-test-info">
						<div class="dy-login__network-test-meta">
							<span class="dy-login__network-test-label">
								{{ getResult(key)?.label || key }}
							</span>
							<span
								v-if="getStatus(key) === 'running'"
								class="dy-login__network-test-status running"
							>
								<FeatherIcon name="loader" :size="12" aria-hidden="true" class="dy-spin" />
								{{ __('جاري الاختبار...') }}
							</span>
							<span
								v-else-if="getStatus(key) === 'success'"
								class="dy-login__network-test-status success"
							>
								<FeatherIcon name="check-circle" :size="12" aria-hidden="true" />
								{{ __('متاح') }}
								<span v-if="getResult(key)?.latency"
									class="dy-login__network-latency"
								>
									({{ getResult(key).latency }}ms)
								</span>
							</span>
							<span
								v-else-if="getStatus(key) === 'error'"
								class="dy-login__network-test-status error"
							>
								<FeatherIcon name="x-circle" :size="12" aria-hidden="true" />
								{{ __('غير متاح') }}
							</span>
						</div>
					</div>

					<div class="dy-login__network-test-actions">
						<ActionButton
							variant="outline"
							size="sm"
							:loading="runningTest === key"
							:disabled="testing && runningTest !== key"
							@click="runTest(key === 'health' ? testEndpoints : key === 'sync' ? testSync : testEndpoints, key)"
							:aria-label="__('اختبار {0}', { 0: getResult(key)?.label || key })"
						>
							<FeatherIcon name="refresh-cw" :size="14" aria-hidden="true" />
						</ActionButton>
					</div>

					<div
						v-if="getResult(key) && getStatus(key) !== 'running'"
						class="dy-login__network-test-result"
						:class="getStatus(key)"
					>
						<pre>{{ getResult(key).message }}</pre>
					</div>
				</div>
			</div>

			<!-- DNS Test -->
			<div class="dy-login__network-section">
				<h4 class="dy-login__network-section-title">
					<FeatherIcon name="globe" :size="14" aria-hidden="true" />
					{{ __('تحليل DNS') }}
				</h4>

				<div class="dy-login__network-test">
					<div class="dy-login__network-test-info">
						<div class="dy-login__network-test-meta">
							<span class="dy-login__network-test-label">{{ __('النطاق الخلفي') }}</span>
							<span
								v-if="getStatus('dns') === 'running'"
								class="dy-login__network-test-status running"
							>
								<FeatherIcon name="loader" :size="12" aria-hidden="true" class="dy-spin" />
								{{ __('جاري الاختبار...') }}
							</span>
							<span
								v-else-if="getStatus('dns') === 'success'"
								class="dy-login__network-test-status success"
							>
								<FeatherIcon name="check-circle" :size="12" aria-hidden="true" />
								{{ __('ناجح') }}
								<span v-if="getResult('dns')?.latency"
									class="dy-login__network-latency"
								>
									({{ getResult('dns').latency }}ms)
								</span>
							</span>
							<span
								v-else-if="getStatus('dns') === 'error'"
								class="dy-login__network-test-status error"
							>
								<FeatherIcon name="x-circle" :size="12" aria-hidden="true" />
								{{ __('فشل') }}
							</span>
						</div>
					</div>

					<div class="dy-login__network-test-actions">
						<ActionButton
							variant="outline"
							size="sm"
							:loading="runningTest === 'dns'"
							:disabled="testing && runningTest !== 'dns'"
							@click="runTest(testDNS, 'dns')"
							:aria-label="__('اختبار تحليل DNS')"
						>
							<FeatherIcon name="refresh-cw" :size="14" aria-hidden="true" />
						</ActionButton>
					</div>

					<div
						v-if="getResult('dns') && getStatus('dns') !== 'running'"
						class="dy-login__network-test-result"
						:class="getStatus('dns')"
					>
						<pre>{{ getResult('dns').message }}</pre>
					</div>
				</div>
			</div>

			<!-- Real-time Test -->
			<div class="dy-login__network-section">
				<h4 class="dy-login__network-section-title">
					<FeatherIcon name="radio" :size="14" aria-hidden="true" />
					{{ __('الاتصال المباشر (SSE/WebSocket)') }}
				</h4>

				<div class="dy-login__network-test">
					<div class="dy-login__network-test-info">
						<div class="dy-login__network-test-meta">
							<span class="dy-login__network-test-label">{{ __('قناة الوقت الحقيقي') }}</span>
							<span
								v-if="getStatus('realtime') === 'running'"
								class="dy-login__network-test-status running"
							>
								<FeatherIcon name="loader" :size="12" aria-hidden="true" class="dy-spin" />
								{{ __('جاري الاختبار...') }}
							</span>
							<span
								v-else-if="getStatus('realtime') === 'success'"
								class="dy-login__network-test-status success"
							>
								<FeatherIcon name="check-circle" :size="12" aria-hidden="true" />
								{{ __('يعمل') }}
							</span>
							<span
								v-else-if="getStatus('realtime') === 'error'"
								class="dy-login__network-test-status error"
							>
								<FeatherIcon name="x-circle" :size="12" aria-hidden="true" />
								{{ __('غير متاح') }}
							</span>
						</div>
					</div>

					<div class="dy-login__network-test-actions">
						<ActionButton
							variant="outline"
							size="sm"
							:loading="runningTest === 'realtime'"
							:disabled="testing && runningTest !== 'realtime'"
							@click="runTest(testRealtime, 'realtime')"
							:aria-label="__('اختبار الاتصال المباشر')"
						>
							<FeatherIcon name="refresh-cw" :size="14" aria-hidden="true" />
						</ActionButton>
					</div>

					<div
						v-if="getResult('realtime') && getStatus('realtime') !== 'running'"
						class="dy-login__network-test-result"
						:class="getStatus('realtime')"
					>
						<pre>{{ getResult('realtime').message }}</pre>
					</div>
				</div>
			</div>

			<!-- Global Error -->
			<div v-if="error" class="dy-login__network-error" role="alert">
				<FeatherIcon name="alert-circle" :size="16" aria-hidden="true" />
				<span>{{ error }}</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
.dy-login__network-diagnostics {
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-xl);
	background: var(--dy-surface);
	overflow: hidden;
}

.dy-login__network-diagnostics--expanded {
	box-shadow: var(--dy-elevation-2);
}

.dy-login__network-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;

	padding: 12px 16px;

	background: var(--dy-surface-soft);
	border-bottom: 1px solid var(--dy-border);
	cursor: pointer;
}

.dy-login__network-title {
	display: inline-flex;
	align-items: center;
	gap: 8px;

	color: var(--dy-text-strong);
	font-size: 0.875rem;
	font-weight: 700;
}

.dy-login__network-summary {
	display: inline-flex;
	align-items: center;
}

.dy-login__network-badge {
	display: inline-flex;
	align-items: center;
	gap: 4px;

	padding: 4px 10px;
	border-radius: var(--dy-radius-full);

	font-size: 0.7rem;
	font-weight: 700;
}

.dy-login__network-badge.success {
	background: rgb(var(--dy-mint-c-500) / 0.15);
	color: var(--dy-mint-700);
	border: 1px solid rgb(var(--dy-mint-c-500) / 0.3);
}

.dy-login__network-badge.warning {
	background: rgb(var(--dy-amber-c-500) / 0.15);
	color: var(--dy-amber-700);
	border: 1px solid rgb(var(--dy-amber-c-500) / 0.3);
}

.dy-login__network-actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.dy-login__network-buttons {
	display: flex;
	align-items: center;
	gap: 8px;
}

.dy-login__network-tests {
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.dy-login__network-section {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.dy-login__network-section-title {
	display: inline-flex;
	align-items: center;
	gap: 6px;

	margin: 0;
	padding-bottom: 8px;
	border-bottom: 1px solid var(--dy-border-soft);

	color: var(--dy-text-secondary);
	font-size: 0.75rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.dy-login__network-test {
	display: flex;
	flex-direction: column;
	gap: 8px;

	padding: 12px;
	border: 1px solid var(--dy-border-soft);
	border-radius: var(--dy-radius-lg);
	background: var(--dy-surface-soft);
}

.dy-login__network-test-info {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
}

.dy-login__network-test-meta {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: 1;
	flex-wrap: wrap;
	min-width: 0;
}

.dy-login__network-test-label {
	font-weight: 600;
	color: var(--dy-text);
}

.dy-login__network-test-status {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 0.75rem;
	font-weight: 600;
	white-space: nowrap;
}

.dy-login__network-test-status.running {
	color: var(--dy-accent);
}

.dy-login__network-test-status.success {
	color: var(--dy-mint-600);
}

.dy-login__network-test-status.error {
	color: var(--dy-crimson-600);
}

.dy-login__network-latency {
	color: var(--dy-text-muted);
	font-weight: 500;
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

.dy-login__network-test-actions {
	display: flex;
	justify-content: flex-end;
}

.dy-login__network-test-result {
	margin-top: 8px;
	padding: 8px 12px;
	border-radius: var(--dy-radius-md);
	font-size: 0.75rem;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
}

.dy-login__network-test-result.success {
	background: rgb(var(--dy-mint-c-500) / 0.1);
	color: var(--dy-mint-700);
	border: 1px solid rgb(var(--dy-mint-c-500) / 0.2);
}

.dy-login__network-test-result.error {
	background: rgb(var(--dy-crimson-c-500) / 0.1);
	color: var(--dy-crimson-700);
	border: 1px solid rgb(var(--dy-crimson-c-500) / 0.2);
}

.dy-login__network-test-result pre {
	margin: 0;
	font-family: var(--dy-font-mono);
	font-size: inherit;
}

.dy-login__network-error {
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
	.dy-login__network-diagnostics {
		border-color: CanvasText;
	}

	.dy-login__network-header {
		border-color: CanvasText;
		background: Canvas;
	}

	.dy-login__network-test {
		border-color: CanvasText;
		background: Canvas;
	}

	.dy-login__network-section-title {
		border-color: CanvasText;
	}

	.dy-login__network-test-result.success,
	.dy-login__network-test-result.error {
		border-color: CanvasText;
		background: Canvas;
	}

	.dy-login__network-error {
		border-color: CanvasText;
		background: Canvas;
		color: CanvasText;
	}

	.dy-login__network-badge {
		border-color: CanvasText;
	}
}
</style>