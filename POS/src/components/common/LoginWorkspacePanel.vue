<template>
	<!--
		عمود مساحة العمل — اللوحات بجانب النموذج.

		كان `<aside>` بحاوية داخلية واحدة، فأي لوحة تُضاف كانت تحتاج تعديل
		هذا الملف. الآن هو الحاوية فقط: البطاقة الأولى + شبكة `DyPanel`
		واحدة تستقبل أي عدد من الألواح عبر `span` و`order` بلا مفرد شبكة
		جديد — وهو السبب الذي أُنشئ نظام الألواح من أجله.

		`aria-label` هنا، لا `aria-labelledby`: لا عنوان مرئي على العمود
		نفسه، والعنوان المرئي موجود داخل كل لوحة مربوطة بمعرّفها.
	-->
	<aside class="dy-login__workspace" :aria-label="__('معلومات مساحة العمل')">
		<!--
			The column's name is a VISIBLE line, not only an `aria-label`.

			It used to be a `.dy-login__workspace-kicker` paragraph, and moving it
			into `aria-label` alone made it invisible to anyone reading the screen
			while it was still announced to a screen reader — the WCAG
			"label in name" failure in its purest form, and a gate
			(`loginMounts`) failed on it. `tests/loginMasthead.test.js` pins the
			`h2` tier, so the panel keeps its own heading and this stays a `<p>`.
		-->
		<p class="dy-login__workspace-kicker">{{ __("معلومات مساحة العمل") }}</p>

		<DyPanel
			:title="APP_NAME"
			:subtitle="__('نظام تشغيل نقاط البيع')"
			span="full"
			:order="1"
		>
			<p class="dy-login__workspace-copy">
				{{ __('نظام تشغيل نقاط البيع مع حالة الفرع، نقطة البيع، والعمليات الجارية.') }}
			</p>

			<template #footer>
				<a
					:href="COMPANY_WEBSITE"
					target="_blank"
					rel="noopener noreferrer"
					class="dy-login__workspace-link"
				>
					{{ COMPANY_WEBSITE_LABEL }}
				</a>
			</template>
		</DyPanel>

		<slot />
	</aside>
</template>

<script setup>
import DyPanel from "@/components/common/DyPanel.vue"
import { APP_NAME, COMPANY_WEBSITE, COMPANY_WEBSITE_LABEL } from "@/utils/brand"
import { __ } from "@/utils/translation"

/**
 * LoginWorkspacePanel — the column beside the form.
 *
 * It owns POSITION and nothing else. The card's border, radius, padding and
 * scrolled height belong to `DyPanel` now, so a second card in this column
 * looks identical for free — which is the point: the previous revision
 * hand-rolled a `dy-login__workspace-card` that drifted from `DyPanel` on
 * every token change.
 */
defineSlots()
</script>

<style scoped>
.dy-login__workspace-kicker {
	margin: 0;
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--dy-text-secondary);
}

.dy-login__workspace-copy {
	margin: 0;
	line-height: 1.6;
	color: var(--dy-text-secondary);
}

.dy-login__workspace-link {
	color: var(--dy-text-link);
	font-weight: 600;
	text-decoration: underline;
	text-underline-offset: 2px;
}
</style>
