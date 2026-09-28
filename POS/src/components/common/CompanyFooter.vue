<!--
  =============================================================================
  اعتماد هوية الشركة — التذييل الرسمي
  =============================================================================
  يحل محل سطور «DyPOS © … جميع الحقوق محفوظة» الموجودة في كل صفحة دخول
  باسم شركة واحد: لا تذكر «شركة المنافذ الذكية للبرمجيات» ولا تربط موقعها
  الرسمي، فتترك المستخدم بلا طريق للشركة بعد التثبيت.
  الرابط خارجي دائمًا: target=_blank مع rel=noopener noreferrer.
  =============================================================================
-->
<template>
	<footer class="dy-company">
		<span class="dy-company__product">
			{{ APP_NAME }}
		</span>

		<span
			class="dy-company__sep"
			aria-hidden="true"
		>
			·
		</span>

		<span>
			©
			{{ year }}
			{{ COMPANY_NAME_AR }}
		</span>

		<span
			class="dy-company__sep"
			aria-hidden="true"
		>
			·
		</span>

		<a
			class="dy-company__link"
			:href="COMPANY_WEBSITE"
			target="_blank"
			rel="noopener noreferrer"
		>
			{{ COMPANY_WEBSITE_LABEL }}
		</a>
	</footer>
</template>

<script setup>
import { computed } from "vue"

import {
	APP_NAME,
	COMPANY_NAME_AR,
	COMPANY_WEBSITE,
	COMPANY_WEBSITE_LABEL,
} from "@/utils/brand"

const year = computed(() => new Date().getFullYear())
</script>

<style scoped>
/*
 * التخطيط واللون والحجم يورثها من الكلاس الذي تمرره الصفحة
 * (dy-login__footer / dy-register__footer) ليبقى متوافقًا مع تصميمها.
 */
.dy-company__product {
	font-weight: 700;
}

.dy-company__sep {
	opacity: 0.6;
}

.dy-company__link {
	font-weight: 600;

	color: inherit;
	text-decoration: underline;
	text-underline-offset: 2px;
	/*
	 * لا `opacity` هنا. كان 0.85 فوق `--dy-text-muted`، فيُركّب التعتيم مرتين:
	 * القياس في المتصفح لرابط الموقع كان 3.56:1 بدل 4.76:1. اللون يرث من
	 * تذييل الصفحة، و:hover يزيد التشديد باللون لا بالعتيم.
	 */
}

.dy-company__link:hover {
	color: var(--dy-text);
}

.dy-company__link:focus-visible {
	outline: 2px solid currentcolor;
	outline-offset: 2px;
	border-radius: 2px;
}
</style>