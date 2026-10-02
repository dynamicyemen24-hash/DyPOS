/**
 * أزرار أسطح الكشك — الكاشير الذاتي والطوابير.
 *
 * لماذا مكوّن منفصل: `POSSale.vue` عند سقف الحجم (بوابة `fileSize`)،
 * والزرّان ajoutée له زادته فوق الحد. القاعدة تقول: استخرج السلوك
 * أولًا ثم اخفض السقف في نفس الالتزام — لا ارفع السقف لتستوعب نموًّا.
 *
 * الزرّان يستعملان نفس خريطة `headerActions` التي تستعملها بقية أزرار
 * الرأس، فتبقى نقطة النداء الوحيدة هي `handleHeaderAction`.
 */
<template>
	<!--
		`role="group"` + `aria-label`: زرّان متجاوران بلا تسمية مجموعة
		يُقرآن لقارئ الشاشة كعنصرين عابرين بلا سياق.
	-->
	<div class="dy-pos-kiosk-actions" role="group" aria-label="أسطح الكشك">
		<button
			type="button"
			class="dy-pos-header-action"
			:title="labels.selfCheckout"
			:aria-label="labels.selfCheckout"
			@click="emit('selfCheckout')"
		>
			<FeatherIcon name="smartphone" class="h-[18px] w-[18px]" />
		</button>
		<button
			type="button"
			class="dy-pos-header-action"
			:title="labels.queue"
			:aria-label="labels.queue"
			@click="emit('queue')"
		>
			<FeatherIcon name="list-ordered" class="h-[18px] w-[18px]" />
		</button>
	</div>
</template>

<script setup>
/**
 * عرض فقط — يطلق حدثين، والتنفيذ في `usePosHeaderActions`.
 */
import { FeatherIcon } from "dypos-ui"

const labels = {
	selfCheckout: "الكاشير الذاتي",
	queue: "الطوابير",
}

const emit = defineEmits(["selfCheckout", "queue"])
</script>

<style scoped>
.dy-pos-kiosk-actions {
	display: flex;
	align-items: center;
	gap: 0.25rem;
}
</style>
