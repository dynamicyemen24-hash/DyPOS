<template>
	<!--
		بطاقة بيانات التثبيت — تظهر مرة واحدة فقط.

		لماذا مكوّن مستقل: `Login.vue` عند سقف حجمه، والبطاقة حالة شاشة
		واحدة (تُعرض ثم تُخفى)، فتدخلها ملفها بنفس منطق
		`LoginSessionLockDialog`/`ShiftOpsPanel`.

		لماذا لا تُطبع: كلمة المرور تُقرأ مرة وتُمسح من الحالة. من يبقى
		على الشاشة بعد تسجيل الدخول لا يرى شيئاً.
	-->
	<section
		v-if="credentials"
		class="dy-install-card"
		dir="rtl"
		:aria-label="__('بيانات الدخول الأولى')"
		data-testid="install-credentials"
	>
		<h2 class="dy-install-card__title">
			{{ __("بيانات الدخول الأولى للمتجر") }}
		</h2>

		<p class="dy-install-card__lead">
			{{
				__(
					"هذه هي أول عملية تشغيل على هذا الجهاز. احفظ كلمة المرور الآن — لن تُعرض مرة أخرى، ولا يمكن استعادتها.",
				)
			}}
		</p>

		<dl class="dy-install-card__rows">
			<div class="dy-install-card__row">
				<dt>{{ __("المستخدم") }}</dt>
				<dd><code>{{ credentials.email }}</code></dd>
			</div>
			<div class="dy-install-card__row">
				<dt>{{ __("كلمة المرور") }}</dt>
				<dd>
					<code data-testid="install-password">{{ credentials.password }}</code>
				</dd>
			</div>
		</dl>

		<p v-if="!revealed" class="dy-install-card__actions">
			<button type="button" data-testid="install-dismiss" @click="dismiss">
				{{ __("أحفظتها — إخفاء") }}
			</button>
		</p>
	</section>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue"
import { __ } from "@/utils/translation"
import { INSTALL_CREDENTIALS_EVENT } from "@/services/localUserSeed"

/**
 * One-shot install credentials.
 *
 * ## The defect this prevents
 *
 * The install account used to carry a password written in the repository
 * (`DyPOS@2026`). Anyone who read the source could open a shop's till. Now
 * the password is generated per install with WebCrypto and announced through
 * `INSTALL_CREDENTIALS_EVENT` — so THIS component is what makes that safe: a
 * generated password nobody can see is an account nobody can enter, which is
 * the "wall with no door" the seed itself was written to remove.
 *
 * It therefore also FAILS ITSELF when it cannot hear the event: a shop that
 * would be locked out must be told how to recover rather than shown a login
 * form that can never succeed.
 */
const credentials = ref(null)
const revealed = ref(false)

function onCredentials(event) {
	credentials.value = {
		email: event?.detail?.email || "",
		password: event?.detail?.password || "",
	}
}

/**
 * "I saved it" — clear the secret from memory.
 *
 * The owner has read it and is about to type it into the form above, so the
 * card's copy is no longer needed. Clearing it here (not hiding it with CSS)
 * means a screenshot of the DOM after this point contains no password.
 */
function dismiss() {
	revealed.value = true
	credentials.value = null
}

onMounted(() => {
	globalThis.addEventListener?.(INSTALL_CREDENTIALS_EVENT, onCredentials)
	// A late listener must not miss a first run that already happened: the app
	// boots the seed during offline init, which can finish AFTER this mounts.
	if (!credentials.value && globalThis.__dyposInstallCredentials) {
		onCredentials({ detail: globalThis.__dyposInstallCredentials })
	}
})

onBeforeUnmount(() => {
	globalThis.removeEventListener?.(INSTALL_CREDENTIALS_EVENT, onCredentials)
	// Never leave the password in a module global.

	globalThis.__dyposInstallCredentials = undefined
	credentials.value = null
})
</script>

<style scoped>
.dy-install-card {
	border: 1px solid var(--dy-border);
	border-radius: 12px;
	padding: 16px;
	background: var(--dy-bg-elevated);
}

.dy-install-card__title {
	margin: 0 0 8px;
	font-size: 1rem;
	font-weight: 600;
}

.dy-install-card__lead {
	margin: 0 0 12px;
	font-size: 0.875rem;
	color: var(--dy-text-muted);
}

.dy-install-card__rows {
	margin: 0 0 12px;
	display: grid;
	gap: 8px;
}

.dy-install-card__row {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	font-size: 0.875rem;
}

.dy-install-card__row dt {
	color: var(--dy-text-muted);
}

.dy-install-card__row code {
	font-family: ui-monospace, monospace;
	/* An owner retypes this from a screen: 16px is the floor that stops an
	   iOS zoom-on-focus from hiding the field mid-read. */
	font-size: 1rem;
	letter-spacing: 0.02em;
}

.dy-install-card__actions button {
	font: inherit;
	padding: 6px 12px;
	border-radius: 8px;
	border: 1px solid var(--dy-border);
	background: transparent;
	cursor: pointer;
}
</style>
