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

		<!--
			قسم أمان الجهاز: تسجيل بصمة هذا الجهاز.
			مكانه هنا لا في شاشة الدخول: التسجيل يتطلّب جلسة قائمة (لا
			يمكن ربط مفتاح بمستخدم لم يُثبت هويته بعد)، وشاشة الدخول
			تغادر فور النجاح.
		-->
		<section class="dy-pos-settings__device" aria-labelledby="device-security-title">
			<h2 id="device-security-title" class="dy-pos-settings__device-title">
				أمان هذا الجهاز
			</h2>
			<p class="dy-pos-settings__device-hint">
				سجّل بصمة إصبعك أو وجهك لتدخل بسرعة في المرات القادمة.
			</p>
			<LoginPasskeyActions
				mode="register"
				:email="email"
				:device-label="deviceLabel"
				@registered="onRegistered"
			/>

			<!--
				قائمة الأجهزة المسجّلة + إبطالها. بدونها التسجيل أحادي الاتجاه:
				مفتاحٌ لا يستطيع صاحبه إبطاله يبقى في حسابه إلى الأبد.
				نمط SAP Fiori «Trusted Devices».
			-->
			<PasskeyDeviceList class="dy-pos-settings__devices" />
		</section>

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
import { computed } from "vue"
import { useRouter } from "vue-router"

import LoginPasskeyActions from "@/components/common/LoginPasskeyActions.vue"
import PasskeyDeviceList from "@/components/common/PasskeyDeviceList.vue"
import POSSettings from "@/components/settings/POSSettings.vue"
import { sessionUser } from "@/data/session"

const router = useRouter()

/** البريد من الجلسة المحلية — لا من متغيّر عام. */
const email = computed(() => sessionUser() || "")

/**
 * اسم الجهاز كما يراه المستخدم. `navigator.platform` مهجور لكنه الوحيد
 * المتاح بلا إذن إضافي؛ الهدف تمييز الجهاز في القائمة لا التعرّف عليه.
 */
const deviceLabel = computed(() => {
	const platform = globalThis.navigator?.platform || ""
	return platform ? `جهاز ${platform}` : "جهاز هذا المستخدم"
})

function goBack() {
	if (window.history.length > 1) router.back()
	else router.replace({ name: "POSSale" })
}

/** لا شيء يُفعل: الزر نفسه يعرض تأكيده. نُبقي المستمع للتوسّع لاحقًا. */
function onRegistered() {}
</script>

<style scoped>
.dy-pos-settings__device {
	margin: 0 0 1rem;
	padding: 1rem;
	background: var(--dy-bg, #fff);
	border: 1px solid var(--dy-border, #e2e8f0);
	border-radius: 0.75rem;
}

.dy-pos-settings__device-title {
	margin: 0 0 0.25rem;
	font-size: 1.1rem;
	font-weight: 700;
}

.dy-pos-settings__device-hint {
	margin: 0;
	font-size: 0.9rem;
	color: var(--dy-text-muted, #64748b);
}
</style>

