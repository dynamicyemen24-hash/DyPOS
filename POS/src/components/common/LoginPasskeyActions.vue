<template>
	<!--
		أدوات الدخول الحيوي (بصمة/وجه) + تسجيل الجهاز.

		`role="group"`: الزرّان مجموعة إجراءات واحدة («تسجيل الجهاز»)،
		وليست إجراءات مستقلة بلا سياق لقارئ الشاشة.
	-->
	<div class="dy-login__passkey" role="group" aria-label="الدخول الحيوي">
		<!--
			لا زرّ إطلاقًا حين لا يدعم الجهاز — لا زرّ معطّل بتخمين السبب.
			كل رسالة هنا سببها معروف ومقصود.
		-->
		<DyButton
			v-if="mode === 'login' && available"
			variant="outline"
			size="lg"
			block
			:icon="icon"
			:loading="busy"
			:disabled="busy"
			@click="onLogin"
		>
			{{ __("دخول بالبصمة أو الوجه") }}
		</DyButton>

		<DyButton
			v-else-if="mode === 'register' && canRegister"
			variant="outline"
			size="lg"
			block
			:icon="icon"
			:loading="busy"
			:disabled="busy"
			@click="onRegister"
		>
			{{ __("تسجيل هذا الجهاز للدخول السريع") }}
		</DyButton>

		<!--
			Fiori MessageStrip عبر `Alert` الموجود أصلًا. النتيجة ليست
			عطلًا بل حالة (رفض، إلغاء، نجاح)، و`role="alert"` كان
			سيقطع كل ما يقرؤه قارئ الشاشة — لذلك `Alert` بـ role status.
		-->
		<Alert
			v-if="error || success"
			:variant="error ? 'warning' : 'success'"
			:title="error || success"
			dismissable
			class="dy-login__passkey-msg"
			@update:model-value="reset"
		/>
	</div>
</template>

<script setup>
/**
 * أزرار البصمة — عرض فقط.
 *
 * كل المنطق في `usePasskeyAuth`؛ هذا يمرّر البريد ويبلّغ النتيجة. لا
 * يعرف شيئًا عن الجلسة ولا عن التنقل.
 */
import { computed } from "vue"
import { Alert } from "dypos-ui"

import DyButton from "@/components/ui/DyButton.vue"
import { usePasskeyAuth } from "@/composables/usePasskeyAuth"
import { __ } from "@/utils/translation"

const props = defineProps({
	/** `login` = دخول · `register` = تسجيل الجهاز بعد الدخول. */
	mode: { type: String, default: "login" },
	/** بريد المستخدم (لاختيار المفتاح). */
	email: { type: String, default: "" },
	/** اسم يظهر في قائمة الأجهزة المسجَّلة. */
	deviceLabel: { type: String, default: "" },
})

const emit = defineEmits(["authenticated", "registered"])

const { available, canRegister, busy, error, success, register, login, reset } =
	usePasskeyAuth(async () => {
		emit("authenticated")
		return true
	})

/** أيقونة واحدة تخدم البصمة والوجه: الجهاز يقرّر أيّهما يفتح. */
const icon = computed(() => "smartphone")

function onLogin() {
	reset()
	login(props.email)
}

function onRegister() {
	reset()
	register(props.email, props.deviceLabel).then((ok) => {
		if (ok) emit("registered")
	})
}
</script>

<style scoped>
.dy-login__passkey {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-2, 0.5rem);
	margin-block-start: var(--dy-space-3, 0.75rem);
}
</style>
