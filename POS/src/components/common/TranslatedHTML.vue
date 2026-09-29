<template>
	<component
		:is="tag"
		ref="containerRef"
		v-html="sanitized"
	/>
</template>

<script setup>
import { computed } from "vue"
import DOMPurify from "dompurify"

const props = defineProps({
	tag: {
		type: String,
		required: false,
		default: "span",
	},
	inner: {
		type: String,
		required: true,
	},
})

/**
 * HTML المُنقّى — والسبب أنه يُعاد حسابه عند كل تغيير في `inner`.
 *
 * النسخة السابقة كانت تكتب `innerHTML` مرة واحدة في `onMounted`، فنصٌّ
 * مترجم يتبدّل (تبديل اللغة، أو نص محمّل لاحقًا من الإعدادات) يبقى على
 * الشاشة كما كان عند أول رسم — واجهة تعرض كلامًا قديمًا بلا أي خطأ.
 *
 * DOMPurify هو الحدّ: أي HTML يمرّ من هنا بلا تعقيم يمرّ إلى `v-html` مباشرة.
 * الفصل (`:=""`) كان resurrect لقالب ناقص بلا معنى.
 */
const sanitized = computed(() => DOMPurify.sanitize(props.inner ?? ""))
</script>
