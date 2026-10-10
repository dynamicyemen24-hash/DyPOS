<template>
	<section v-if="visible" class="dy-pwa-install" dir="rtl" aria-label="تثبيت DyPOS">
		<div class="dy-pwa-install__copy">
			<strong>ثبّت DyPOS على جهازك</strong>
			<span v-if="canInstall">تشغيل أسرع، شاشة مستقلة، والعمل دون اتصال.</span>
			<span v-else>على iPhone/iPad: افتح المشاركة ثم «إضافة إلى الشاشة الرئيسية».</span>
		</div>
		<div class="dy-pwa-install__actions">
			<button v-if="canInstall" type="button" class="dy-pwa-install__primary" @click="install">
				تثبيت التطبيق
			</button>
			<button v-else-if="showIosGuide" type="button" class="dy-pwa-install__primary" @click="showGuide">
				طريقة التثبيت
			</button>
			<button type="button" class="dy-pwa-install__dismiss" aria-label="إخفاء" @click="dismiss">
				لاحقًا
			</button>
		</div>
		<div v-if="guideOpen" class="dy-pwa-install__guide" role="dialog" aria-modal="true">
			<strong>تثبيت DyPOS على iPhone/iPad</strong>
			<ol>
				<li>افتح DyPOS في Safari أو متصفح يدعم «إضافة إلى الشاشة الرئيسية».</li>
				<li>اضغط «مشاركة».</li>
				<li>اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».</li>
			</ol>
			<button type="button" @click="guideOpen = false">تم</button>
		</div>
	</section>
</template>

<script setup>
import { computed, ref } from "vue"
import { useRoute } from "vue-router"
import { usePwaInstall } from "@/composables/usePwaInstall"

const {
	canInstall,
	showIosGuide,
	install: promptInstall,
	dismiss: dismissInstall,
} = usePwaInstall()
const route = useRoute()
const guideOpen = ref(false)

const visible = computed(
	() =>
		route.name !== "SelfCheckout" && (canInstall.value || showIosGuide.value),
)

async function install() {
	const result = await promptInstall()
	if (result?.outcome === "dismissed") dismissInstall()
}

function showGuide() {
	guideOpen.value = true
}
function dismiss() {
	dismissInstall()
}
</script>

<style scoped>
.dy-pwa-install {
	position: fixed;
	inset-inline: 16px;
	bottom: max(16px, env(safe-area-inset-bottom));
	z-index: 9000;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 14px;
	padding: 12px 14px;
	border: 1px solid var(--dy-border, #dbe2ea);
	border-radius: 14px;
	background: var(--dy-bg-elevated, #fff);
	box-shadow: 0 10px 30px rgb(15 23 42 / 14%);
}
.dy-pwa-install__copy { display: grid; gap: 3px; min-width: 0; }
.dy-pwa-install__copy span { color: var(--dy-text-muted, #64748b); font-size: .82rem; }
.dy-pwa-install__actions { display: flex; gap: 8px; flex-shrink: 0; }
.dy-pwa-install button { font: inherit; border-radius: 9px; padding: 8px 12px; cursor: pointer; }
.dy-pwa-install__primary { border: 1px solid var(--dy-brand, #2563eb); background: var(--dy-brand, #2563eb); color: #fff; font-weight: 700; }
.dy-pwa-install__dismiss { border: 1px solid var(--dy-border, #dbe2ea); background: transparent; color: inherit; }
.dy-pwa-install__guide { position: absolute; inset-inline: 0; bottom: calc(100% + 10px); padding: 16px; border: 1px solid var(--dy-border, #dbe2ea); border-radius: 14px; background: var(--dy-bg-elevated, #fff); box-shadow: 0 10px 30px rgb(15 23 42 / 14%); }
.dy-pwa-install__guide ol { margin: 10px 0 14px; padding-inline-start: 24px; }
@media (max-width: 640px) {
	.dy-pwa-install { align-items: stretch; flex-direction: column; }
	.dy-pwa-install__actions { width: 100%; }
	.dy-pwa-install__actions button { flex: 1; }
}
</style>
