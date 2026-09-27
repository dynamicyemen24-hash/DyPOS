<template>
	<!--
		الإعدادات العامة كصفحة كاملة (قابل للرابط العميق وزر الرجوع).
		POSSettings نفسه طبقة تغطية ثابتة — نمرّر show=true ونقرّبها للصفحة.
	-->
	<POSSettings :show="true" @close="goBack" />
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
