<template>
	<!--
		مجموعة أزرار أيقونة في رأس شاشة البيع.

		الأزرار الأربعة متطابقة في الشكل (أيقونة + تسمية + إجراء)، فكتابتها
		أربعة `<button>` مكرّرة كانت تضيف 40 سطرًا إلى `POSSale.vue` عند
		سقف حجمه. هنا صف واحد + `v-for`، والتسمية تُترجم في مكانها
		(`__`) كما كان يفعل الاستدعاء المباشر.
	-->
	<button
		v-for="item in items"
		:key="item.key"
		type="button"
		class="dy-pos-header-action"
		:title="item.label"
		:aria-label="item.label"
		@click="emit('action', item.key)"
	>
		<FeatherIcon :name="item.icon" class="h-[18px] w-[18px]" />
	</button>
</template>

<script setup>
/**
 * عرض فقط — يطلق `action` بالمفتاح، والتنفيذ في الشاشة عبر
 * `handleHeaderAction`. لا يعرف هذا المكوّن ماذا يفعل أي زر.
 */
import { computed } from "vue"
import { FeatherIcon } from "dypos-ui"
import { t } from "@/utils/translation"

const props = defineProps({
	/** زر الطباعة يظهر فقط حيث يُسمح بالطباعة. */
	allowPrintLastInvoice: { type: Boolean, default: true },
})

const emit = defineEmits(["action"])

/**
 * `t` (الترجمة) تُستدعى داخل `computed` لا في القالب: النصوص تُقرأ مرة
 * عند التركيب، فتغيير اللغة لاحقًا لا يغيّر التسميات المعروضة.
 */
const items = computed(() => {
	const all = [
		{ key: "settlements", icon: "clipboard", label: t("التسويات") },
		{
			key: "printLast",
			icon: "printer",
			label: t("طباعة آخر فاتورة"),
			// الإخفاء شرط عمل لا زينة: بلا صلاحية طباعة لا يظهر الزر.
			hidden: !props.allowPrintLastInvoice,
		},
		{ key: "stock", icon: "package", label: t("إدارة المخزون") },
	]
	return all.filter((item) => !item.hidden)
})
</script>
