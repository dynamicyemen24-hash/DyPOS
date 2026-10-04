<template>
	<div class="queue-page">
		<header class="queue-page__header">
			<h1 class="queue-page__title">نظام الطوابير</h1>
			<ActionButton variant="ghost" iconLeft="refresh-cw" :disabled="busy" @click="refresh">
				تحديث
			</ActionButton>
		</header>

		<p v-if="error" class="queue-page__error" role="alert">{{ error }}</p>

		<div class="queue-page__layout">
			<!--
				الشاشة التي يراها الزبون. هي نفسها المستخدمة على جهاز
				الصالة، لا نسخة مبسّطة: لولا ذلك لتغيّر الرقم المعروض بين
				الكاشير والشاشة عند أي تحديث.
			-->
			<QueueDisplay
				:service-id="serviceId"
				:counter-id="counterId"
				title="الطابور"
			/>
		</div>
	</div>
</template>

<script setup>
/**
 * صفحة الطابور — تركيب شاشة العرض مع أدوات الكاشير.
 *
 * الصفحة **تركيب فقط**: لا تحسب ولا تكتب. كل شيء في
 * `useCashierQueue` و`QueueOrchestrator`.
 */
import { computed, onMounted, ref, watch } from "vue"

import { ActionButton } from "dypos-ui"
import { QueueDisplay, useCashierQueue } from "@/components/selfCheckout/queue"

const props = defineProps({
	/** الكاونتر الذي تدير هذه الصفحة. */
	counterId: { type: String, default: "" },
	serviceId: { type: String, default: "" },
})

const counterId = ref(props.counterId)
const serviceId = ref(props.serviceId)
const { busy, error, refresh, ensureSession, issueTicket } = useCashierQueue({
	counterId: counterId.value,
})

// تغيير الكاونتر من الخارج (اختيار من قائمة) يعيد ربط الحالة.
watch(
	() => props.counterId,
	(next) => {
		counterId.value = next
	},
)

onMounted(async () => {
	// الجلسة تُفتح قبل أي إصدار تذكرة: تذكرة بلا جلسة لا رقم لها.
	await ensureSession()
	await refresh()
})
</script>

<style scoped>
.queue-page {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-4);
	padding: var(--dy-space-5);
	min-block-size: 100dvh;
	background: var(--dy-bg-sunken);
}

.queue-page__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--dy-space-3);
}

.queue-page__title {
	margin: 0;
	font-size: var(--dy-text-2xl);
	font-weight: 700;
}

.queue-page__error {
	padding: var(--dy-space-3) var(--dy-space-4);
	color: var(--dy-color-status-danger-text);
	background: rgb(239 68 68 / 10%);
	border-radius: var(--dy-radius-sm);
}

.queue-page__layout {
	display: grid;
	grid-template-columns: 1fr;
	gap: var(--dy-space-4);
}
</style>
