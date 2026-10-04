<template>
	<!--
		شرائح سياق التشغيل — المستأجر/الفرع/نقطة البيع فوق النموذج.

		كانت `if`/`v-for` داخل صفحة تقارب السقف، ولا يختبرها شيء: قواعد
		«أي شريحة تظهر» كانت مكتوبة في القالب لا في مكان يمكنassertّها. الآن
		الشرائح تأتي من جدول واحد في `useLoginContextItems`، وهذا المكوّن
		يعرضها فقط.
	-->
	<div
		v-if="show && items.length"
		class="dy-login__context"
		:aria-label="__('سياق التشغيل')"
	>
		<div
			v-for="item in items"
			:key="`${item.icon}-${item.label}`"
			class="dy-login__context-item"
		>
			<FeatherIcon :name="item.icon" :size="15" aria-hidden="true" />
			<span class="dy-login__context-label">{{ item.label }}</span>
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "dypos-ui"
import { __ } from "@/utils/translation"

/**
 * The runtime chips above the login form.
 *
 * ## The `show` prop exists because the tenant context is a SETTING
 *
 * `showTenantContext` is a page prop, so a store that cannot know it would
 * have to be told — and a store that always renders would put the chips on a
 * deployment that explicitly turned them off. Presentation stays here; the
 * rule for WHICH chips exist stays in `useLoginContextItems`.
 */
defineProps({
	/** Already-normalised rows from `useLoginContextItems`. */
	items: { type: Array, default: () => [] },
	/** The page's `showTenantContext` prop. */
	show: { type: Boolean, default: false },
})
</script>