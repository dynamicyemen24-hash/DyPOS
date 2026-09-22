<!--
  =============================================================================
  DyPOS — Live Cart Recovery Notice v1.32.0
  After any restart / power cut / logout, tells the cashier an unsent open
  invoice survived and offers one-tap restore or discard. Global, like the
  PWA update banner. Never blocks POS rendering.
  =============================================================================
-->

<script setup>
import { onMounted } from "vue"
import { useLiveCartRecovery } from "@/composables/useLiveCartRecovery"
import { FeatherIcon } from "frappe-ui"
import DyButton from "@/components/ui/DyButton.vue"

const {
	pendingRecovery,
	recovering,
	checkBootRecovery,
	restoreLiveCart,
	discardLiveCart,
} = useLiveCartRecovery()

onMounted(() => {
	void checkBootRecovery()
})

function formatSavedAt(iso) {
	try {
		return new Date(iso).toLocaleString("ar-SA", {
			dateStyle: "medium",
			timeStyle: "short",
		})
	} catch {
		return ""
	}
}
</script>

<template>
	<transition name="dy-slide-up">
		<div
			v-if="pendingRecovery"
			class="dy-recovery-banner"
			role="alert"
			aria-live="assertive"
		>
			<div class="dy-recovery-banner__content">
				<FeatherIcon
					name="shield"
					:size="22"
					class="dy-recovery-banner__icon"
					aria-hidden="true"
				/>

				<div class="dy-recovery-banner__text">
					<strong>وجدنا فاتورة مفتوحة غير مرسلة</strong>
					<span>
						تم حفظ {{ pendingRecovery.itemsCount }} صنف تلقائياً
						<template v-if="pendingRecovery.customerName">
							للعميل «{{ pendingRecovery.customerName }}»
						</template>
						<template v-if="pendingRecovery.savedAt">
							({{ formatSavedAt(pendingRecovery.savedAt) }})
						</template>
						— هل تريد استعادتها ومتابعة البيع؟
					</span>
				</div>

				<div class="dy-recovery-banner__actions">
					<DyButton
						variant="primary"
						size="sm"
						:disabled="recovering"
						@click="restoreLiveCart"
					>
						{{ recovering ? "جارٍ الاستعادة…" : "استعادة الفاتورة" }}
					</DyButton>

					<button
						type="button"
						class="dy-recovery-banner__dismiss"
						aria-label="تجاهل الفاتورة المحفوظة"
						:disabled="recovering"
						@click="discardLiveCart"
					>
						<FeatherIcon name="x" :size="16" />
					</button>
				</div>
			</div>
		</div>
	</transition>
</template>

<style scoped>
.dy-recovery-banner {
	position: fixed;
	/* Stacked above the PWA update banner so both can show together. */
	bottom: 104px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 10001;
	max-width: min(560px, calc(100vw - 32px));
}

.dy-recovery-banner__content {
	display: flex;
	align-items: flex-start;
	gap: 12px;

	padding: 14px 20px;

	background: var(--dy-brand-c-900);
	color: white;
	border-radius: var(--dy-radius-xl);
	box-shadow: 0 8px 32px rgb(0 0 0 / 0.2);
	border-inline-start: 4px solid var(--dy-mint-400);
}

.dy-recovery-banner__icon {
	flex: 0 0 auto;
	margin-top: 2px;
	color: var(--dy-mint-400);
}

.dy-recovery-banner__text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 0.85rem;
}

.dy-recovery-banner__actions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: 0 0 auto;
}

.dy-recovery-banner__dismiss {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border: 0;
	border-radius: var(--dy-radius-md);
	background: transparent;
	color: white;
	cursor: pointer;
	opacity: 0.7;
	transition: opacity 0.2s;
}

.dy-recovery-banner__dismiss:hover {
	opacity: 1;
}
</style>
