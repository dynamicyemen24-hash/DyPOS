<template>
	<!--
		لوحة التشغيل قبل الفتح — تعليمات الوردية، وفحص الأجهزة عند الطلب.

		كلاهما كان مكتوبًا بالكامل ومختبرًا منطقيًا، ولا يركّبه أحد: هذه هي
		المستهلك الذي كان ناقصًا. اللوحة مطويّة افتراضيًا حتى لا تزاحم نموذج
		الدخول، والفحص لا يعمل إلا بضغط «فحص الآن» (ثابت 8: لا استطلاع عند
		الإقلاع).
	-->
	<section class="shift-ops" :aria-label="__('لوحة التشغيل')">
		<AnnouncementTicker :announcements="announcements" />

		<button
			type="button"
			class="shift-ops__toggle"
			:aria-expanded="opsOpen"
			aria-controls="shift-ops-body"
			@click="toggleOps"
		>
			{{ opsOpen ? __('إخفاء حالة الأجهزة') : __('حالة الأجهزة') }}
		</button>

		<div v-show="opsOpen" id="shift-ops-body">
			<DeviceHealthPanel />
		</div>
	</section>
</template>

<script setup>
/**
 * ShiftOpsPanel — the two operational panels a manager reads before opening.
 *
 * Why this file exists: `AnnouncementTicker.vue` and `DeviceHealthPanel.vue`
 * were both fully written, both had their own coverage for the logic
 * underneath them, and NEITHER was mounted anywhere. `tests/deadCode.test.js`
 * caught it — "in POS/src but nothing imports them — they never reach the
 * bundle". That is the same defect AGENTS.md records for `WorkForm.vue`,
 * `WorkWizard.vue` and `WorkNotification.vue`: code that stayed broken for
 * months while every suite was green.
 *
 * This wrapper is the consumer both were missing, and it keeps the data
 * question in ONE place instead of two: the announcements come from the local
 * settings table, never from the network.
 *
 * ## Invariant 8 — nothing probes at boot
 *
 * `DeviceHealthPanel` gets NO `autoCheck`, so the devices are touched only
 * when a human presses "فحص الآن". A panel that opened ports and asked about
 * printers on every load is exactly the boot probe AGENTS.md forbids.
 *
 * ## Invariant 9 — an empty list is not a measurement
 *
 * `AnnouncementTicker` hides itself when there is nothing to say: no
 * placeholder, no fabricated exchange rate. A confident wrong instruction is
 * worse than no instruction at the till.
 */
import AnnouncementTicker from "@/components/common/AnnouncementTicker.vue"
import DeviceHealthPanel from "@/components/common/DeviceHealthPanel.vue"
import { useShiftOps } from "@/composables/useShiftOps"
import { __ } from "@/utils/translation"

const { announcements, opsOpen, toggleOps } = useShiftOps()
</script>

<style scoped>
.shift-ops {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

/* The toggle is a disclosure, not a submission: 44px so it is tappable, and
   the focus ring is the design system's, never a browser default. */
.shift-ops__toggle {
	align-self: flex-start;
	min-height: 44px;
	padding: 0 0.75rem;
	border: 1px solid var(--dy-color-surface-border, #e5e7eb);
	border-radius: 8px;
	background: transparent;
	color: var(--dy-color-text-secondary, #4b5563);
	font-size: 0.85rem;
	cursor: pointer;
}

.shift-ops__toggle:hover {
	background: var(--dy-color-surface-sunken, #f9fafb);
	color: var(--dy-color-text-primary, #111827);
}

.shift-ops__toggle:focus-visible {
	outline: var(--dy-focus-ring-width, 3px) solid
		var(--dy-focus-ring-color, var(--dy-accent, #3f63d9));
	outline-offset: var(--dy-focus-offset, 3px);
}
</style>