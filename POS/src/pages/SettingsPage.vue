<template>
	<!--
		الإعدادات العامة كصفحة كاملة (قابل للرابط العميق وزر الرجوع).
		POSSettings نفسه طبقة تغطية ثابتة — نمرّر model-value=true ونقرّبها للصفحة.
		العقد هو modelValue/update:modelValue (كما تُعلنه POSSettings) لا show/close:
		مرّرنا `show` فوصل `modelValue=undefined` فلم يرندر الجذر `v-if="show"`،
		فبقيت الصفحة فارغة تمامًا.
	-->
	<POSSettings :model-value="true" @update:model-value="goBack" />
</template>

<script setup>
/**
 * صفحة الإعدادات العامة.
 *
 * `POSSettings.vue` كان أيقونة ترس في ترويسة نقطة البيع تُطلق `settings-clicked`
 * دون مستمع — أي أن الإعدادات العامة غير قابلة للوصول فعليًا. الآن لها مسار
 * `/settings` (يصل إليها زر التروس و عنصر التنقل و رابط عميق) وتُغلق بالرجوع
 * إلى الشاشة السابقة أو نقطة البيع.
 */
import { useRouter } from "vue-router"

import POSSettings from "@/components/settings/POSSettings.vue"

const router = useRouter()

function goBack() {
	if (window.history.length > 1) router.back()
	else router.replace({ name: "POSSale" })
}
</script>
