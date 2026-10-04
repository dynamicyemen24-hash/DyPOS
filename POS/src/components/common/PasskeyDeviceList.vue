<template>
	<!--
		الأجهزة الموثوقة — نمط SAP Fiori «Trusted Devices».
	-->
	<section class="passkey-devices" aria-labelledby="passkey-devices-title">
		<header class="passkey-devices__head">
			<h3 id="passkey-devices-title" class="passkey-devices__title">
				الأجهزة الموثوقة
			</h3>
			<span class="passkey-devices__count">{{ activeCount }}</span>
		</header>

		<!--
			Fiori MessageStrip عبر مكوّن `Alert` الموجود أصلًا. `role="status"` لأن النتيجة ليست عطلًا: العملية نجحت أو رُفضت.
		-->
		<Alert
			v-if="error || success"
			:variant="error ? 'warning' : 'success'"
			:title="error || success"
			class="passkey-devices__msg"
		/>

		<!--
			حالة فارغة Fiori: لا «لا توجد بيانات» بل **السبب + الخطوة التالية**.
			زر التسجيل أعلاه هو الفعل المقترح.
		-->
		<p v-if="!devices.length && !loading" class="passkey-devices__empty">
			لا توجد أجهزة مسجّلة. سجّل هذا الجهاز لتدخل لاحقًا دون كتابة كلمة
			المرور.
		</p>
		<p v-else-if="loading" class="passkey-devices__empty" role="status">
			جارٍ قراءة الأجهزة…
		</p>

		<ul v-else class="passkey-devices__list">
			<li
				v-for="device in devices"
				:key="device.id"
				class="passkey-devices__item"
				:data-revoked="String(device.revoked)"
			>
				<FeatherIcon name="smartphone" class="passkey-devices__icon" aria-hidden="true" />

				<div class="passkey-devices__body">
					<p class="passkey-devices__name">
						{{ device.label }}
						<DyBadge v-if="device.revoked" variant="danger" size="sm">
							مُبطَل
						</DyBadge>
						<DyBadge v-else-if="device.synced" variant="info" size="sm">
							متزامن
						</DyBadge>
						<DyBadge v-else variant="success" size="sm">فعّال</DyBadge>
					</p>
					<p class="passkey-devices__meta">
						أُضيف {{ formatDate(device.created_at) }}
						<template v-if="device.last_used_at">
							· آخر دخول {{ formatDate(device.last_used_at) }}
						</template>
					</p>
				</div>

				<!--
					إبطال = إجراء مُدمِّر، فزر Negative (Fiori) وتسمية تسمّي الجهاز:
					`aria-label` يسمّي الجهاز نفسه: صفّ فيه ثلاثة أجهزة
					وثلاثة أزرار «إبطال» لا يُميَّز منها شيء.
				-->
				<ActionButton
					v-if="!device.revoked"
					theme="red"
					variant="solid"
					size="sm"
					:aria-label="`إبطال الدخول من ${device.label}`"
					@click="askRevoke(device)"
				>
					إبطال
				</ActionButton>
			</li>
		</ul>

		<!--
			تأكيد قبل الإبطال (Fiori Confirmation Dialog). الإبطال يوقف
			قدرة الجهاز على الدخول فورًا ولا يُسترجع، فالسؤال قبله ليس زينة.
			`disableOutsideClickToClose`: نقرة الخلفية **تُلغي العملية** ولا تُنفّذها — في نافذة إبطال النقر العرضي يجب ألّا يُفقد شيئًا.
		-->
		<Dialog
			:model-value="Boolean(pending)"
			:options="{ title: dialogTitle, size: 'sm' }"
			disable-outside-click-to-close
			@update:model-value="cancelRevoke"
		>
			<template #actions="{ close }">
				<ActionButton variant="ghost" size="md" @click="close">تراجع</ActionButton>
				<ActionButton
					theme="red"
					variant="solid"
					size="md"
					:loading="busy"
					@click="confirmRevoke"
				>
					إبطال الجهاز
				</ActionButton>
			</template>
		</Dialog>
	</section>
</template>

<script setup>
/**
 * قائمة الأجهزة الموثوقة — عرض + تأكيد إبطال.
 *
 * كل المنطق في `usePasskeyDevices`؛ هذا يعرض ويطلب تأكيدًا. لا يعرف
 * شيئًا عن WebAuthn ولا عن الجلسة.
 */
import { computed, onMounted, ref } from "vue"
import { Alert, Dialog, FeatherIcon } from "dypos-ui"

import DyBadge from "@/components/ui/DyBadge.vue"
import { ActionButton } from "dypos-ui"
import { usePasskeyDevices } from "@/composables/usePasskeyDevices"

const { devices, summary, loading, busy, error, success, load, revoke, reset } =
	usePasskeyDevices()

/** الجهاز المعروض في نافذة التأكيد. */
const pending = ref(null)

const activeCount = computed(
	() => summary.value?.active ?? devices.value.length,
)

/** عنوان النافذة يسمّي الجهاز — لا «هل أنت متأكد؟» بلا فاعل. */
const dialogTitle = computed(() =>
	pending.value ? `إبطال الدخول من ${pending.value.label}؟` : "إبطال الجهاز",
)

/** التاريخ بصيغة مقروءة. قيمة فارغة تعني «لم يُستعمل بعد». */
function formatDate(value) {
	if (!value) return "لم يُستعمل بعد"
	const parsed = new Date(`${String(value).replace(" ", "T")}Z`)
	if (Number.isNaN(parsed.getTime())) return "—"
	return parsed.toLocaleDateString("ar-SA-u-nu-latn", {
		year: "numeric",
		month: "short",
		day: "numeric",
	})
}

function askRevoke(device) {
	reset()
	pending.value = device
}

function cancelRevoke() {
	pending.value = null
}

async function confirmRevoke() {
	const device = pending.value
	if (!device) return
	const ok = await revoke(device.id)
	pending.value = null
	if (ok) await load()
}

onMounted(load)
</script>

<style scoped>
.passkey-devices {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-2, 0.5rem);
}

.passkey-devices__head {
	display: flex;
	align-items: center;
	gap: var(--dy-space-2, 0.5rem);
}

.passkey-devices__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.passkey-devices__count {
	padding: 0 var(--dy-space-2, 0.5rem);
	font-size: 0.8rem;
	color: var(--dy-text-secondary, #475569);
	background: var(--dy-bg-sunken, #f1f5f9);
	border-radius: var(--dy-radius-pill, 999px);
}

.passkey-devices__list {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-1-5, 0.4rem);
	margin: 0;
	padding: 0;
	list-style: none;
}

.passkey-devices__item {
	display: flex;
	align-items: center;
	gap: var(--dy-space-3, 0.75rem);
	padding: var(--dy-space-2, 0.5rem) var(--dy-space-3, 0.75rem);
	border: var(--dy-border-width-thin, 1px) solid var(--dy-border, #e2e8f0);
	border-radius: var(--dy-radius-md, 0.5rem);
}

.passkey-devices__item[data-revoked="true"] {
	opacity: 0.6;
}

.passkey-devices__icon {
	flex-shrink: 0;
	color: var(--dy-text-muted, #64748b);
}

.passkey-devices__body {
	flex: 1;
	min-width: 0;
}

.passkey-devices__name {
	display: flex;
	align-items: center;
	gap: var(--dy-space-2, 0.5rem);
	margin: 0;
	font-weight: 600;
}

.passkey-devices__meta {
	margin: 0;
	font-size: 0.8rem;
	color: var(--dy-text-muted, #64748b);
}

.passkey-devices__empty {
	margin: 0;
	padding: var(--dy-space-3, 0.75rem);
	font-size: 0.9rem;
	color: var(--dy-text-muted, #64748b);
}
</style>

