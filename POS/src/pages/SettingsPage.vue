<template>
	<!--
		الإعدادات العامة كصفحة كاملة (قابل للرابط العميق وزر الرجوع).
		POSSettings نفسه طبقة تغطية ثابتة — نمرّر model-value=true ونقربها للصفحة.
		العقد هو modelValue/update:modelValue (كما تُعلنه POSSettings) لا show/close:
		مرّرنا `show` فوصل `modelValue=undefined` فلم يرendor الجذر `v-if="show"`،
		فبقيت الصفحة فارغة تمامًا.
	-->
	<div class="dy-pos-settings__wrapper">
		<ActionButton
			variant="subtle"
			size="sm"
			@click="goBack"
			:title="عودة"
			:aria-label="عودة"
		>
			<FeatherIcon name="arrow-left" class="h-[14px] w-[14px]" />
			<span>عودة</span>
		</ActionButton>
		<POSSettings :model-value="true" @update:model-value="goBack" />
	</div>
</template>

<script setup>
/**
 * صفحة الإعدادات العامة.
 *
 * `POSSettings.vue` كان أيقونة ترس في ترويسة نقطة البيع تُطلق `settings-clicked`
 * دون مستمع — أي أن الإعدادات العامة غير قابلة للوصول فعليًا. الآن لها مسار
 * `/settings` (يصل إليها زر الترس و عنصر التنقل و رابط عميق) وتُغلق بالرجوع
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
