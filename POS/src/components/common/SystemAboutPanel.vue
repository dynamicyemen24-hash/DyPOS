<template>
	<!--
		لوحة تعريف النظام — أعلى شاشة الدخول على الشاشات الصغيرة.

		## لماذا قابلة للطوي
		على الجوال كانت البطاقة في **أسفل** نموذج الدخول (`grid-template-areas`
		يسرد `panel` ثم `showcase`)، فتدفع النموذج تحت طيّة الشاشة: المستخدم
		يمرّر ليكتب كلمة مروره بينما البطاقة تستهلك أول Isis شاشة.

		الآن: **الصورة ثابتة في الأعلى** دائمًا، و`<details>` يحمل **المحتوى
		التعريفي** (الاسم والوسم والنقاط الستّ) لا الصورة. فالطوي يوفّر مكانًا
		للنموذج، والصورة — وهي ما يجعل المستخدم يعرف *ما الذي يدخل إليه* قبل
		أن يكتب كلمة مروره — تبقى معروضة.

		`<details>`/`<summary>` أصلي-HTML: يُطوى بـJavaScript صفري، ويُفتح
		باللوحة المفاتيح و«قارئ الشاشة» كما هو، ويحفظ الطي بين التحديثات. زرّ
		مخصّص بـ`div role="button"` كان سيحتاج إدارة تركيز وحالة يدويّة بلا
		مقابل.
	-->
	<details class="system-panel" :open="isWide">
		<summary class="system-panel__summary">
			<figure class="system-panel__art">
				<!--
					No `loading="lazy"` on the artwork, on purpose. This card sits
					ABOVE the form on a phone, so the image is the first thing
					painted on the screen — deferring it would delay exactly what
					the reorder brought forward. The file is 68KB, not a catalogue
					of thumbnails, so the trade does not pay.
				-->
				<img
					:src="officialArtwork"
					:alt="artAlt"
					width="1200"
					height="630"
					decoding="async"
				/>
			</figure>

			<span class="system-panel__toggle" aria-hidden="true">
				{{ isWide ? '' : __('عن النظام') }}
			</span>
		</summary>

		<div class="system-panel__about">
			<p class="system-panel__name">{{ APP_NAME }}</p>
			<p class="system-panel__tagline">{{ APP_TAGLINE }}</p>

			<ul class="system-panel__points">
				<li v-for="point in points" :key="point">{{ point }}</li>
			</ul>

			<p class="system-panel__meta">
				{{ COMPANY_NAME_AR }} ·
				<a
					:href="COMPANY_WEBSITE"
					target="_blank"
					rel="noopener noreferrer"
				>
					{{ COMPANY_WEBSITE_LABEL }}
				</a>
			</p>
		</div>
	</details>
</template>

<script setup>
/**
 * اللوحة التعريفية — عرض فقط، وطبيعتها الوحيدة: قابلة للطوي على الجوال.
 *
 * النقاط الستّ إعلاه **ادّعاءات منتج** لا زخرفة، وكلها منه — تشغيل دون
 * اتصال، كاشير ذاتي وطوابير، عملات ووحدات، استيراد وتصدير، ودخول حيوي.
 * لا تُكتب من ذاكرة الكاتب ولا تُزخرف.
 *
 * ## `isWide` يستمع لحجم الشاشة، ولا يقرّر «الجوال» من اسم الجهاز
 *
 * الاستعلام عن المقاس هو المقياس الوحيد الذي يصف ما يراه المستخدم فعلًا.
 * الفئة المُسمّاة (جوال/لوح) تخطئ على النافذة الضيقة في جهاز لوحي، وعلى
 * النافذة العريضة في هاتف مُسطَّح — وكلاهما شاشات صغيرة عمليًا حيث تطغى
 * البطاقة على النموذج.
 */
import officialArtwork from "@/assets/smart-ports-og.jpg"
import { useMediaQuery } from "@/composables/useMediaQuery"
import {
	APP_NAME,
	APP_TAGLINE,
	COMPANY_NAME_AR,
	COMPANY_WEBSITE_LABEL,
} from "@/utils/brand"
import { __ } from "@/utils/translation"

const artAlt = `شركة ${COMPANY_NAME_AR} — ${APP_NAME}`

/** أعرض من 900px: نفس العتبة التي عندها تتحول الشبكة إلى عمودين. */
const isWide = useMediaQuery("(min-width: 901px)")

const points = Object.freeze([
	"نظام نقاط بيع عربي متكامل لإدارة المبيعات والمخزون والحسابات.",
	"يعمل بالكامل دون اتصال بالإنترنت — انقطاع الشبكة لا يوقف البيع.",
	"كاشير ذاتي وطوابير ذكية للمطاعم والنوادي والمتاجر ومنشآت الخدمة.",
	"تعدد العملات ووحدات القياس مع تقارير محاسبية دقيقة.",
	"استيراد وتصدير للبيانات ومزامنة مع الأنظمة الأخرى.",
	"دخول سريع بالبصمة أو الوجه عبر مفتاح حيوي على الجهاز.",
])
</script>
<style scoped>
.system-panel {
	/*
	 * `list-style: none` removes the browser's disclosure triangle from
	 * `<summary>` — without it the alignment differs between Chrome and Safari.
	 * `display: block` makes the `<details>` itself the box.
	 */
	display: block;
	inline-size: min(100%, 420px);
	align-self: start;
}

.system-panel__summary {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-2, 0.5rem);
	list-style: none;
	cursor: pointer;
}

.system-panel__summary::-webkit-details-marker {
	display: none;
}

/* `<summary>` is natively focusable — no tabindex, no keydown handler. */
.system-panel__summary:focus-visible {
	outline: var(--dy-focus-width) solid var(--dy-focus-color);
	outline-offset: var(--dy-focus-offset);
	border-radius: var(--dy-radius-lg, 0.75rem);
}

/* The text label for the arrow. Both images and boxes are aria-hidden. */
.system-panel__toggle {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.35rem;
	min-height: var(--dy-touch-min, 44px);
	font-size: 0.8rem;
	color: var(--dy-text-secondary, #475569);
}

.system-panel__toggle::after {
	content: "";
	inline-size: 0.4rem;
	block-size: 0.4rem;
	border-inline-end: 2px solid currentColor;
	border-block-end: 2px solid currentColor;
	transform: rotate(45deg);
	transition: transform var(--dy-dur-fast) var(--dy-ease-standard);
}

/* Open: the arrow points up instead of lifting. */
.system-panel[open] .system-panel__toggle::after {
	transform: rotate(-135deg);
}

/*
 * Wide screens: the toggle disappears and the content is always shown.
 *
 * `<details>` hides content by CSS AND by DOM, so forcing `display` here is
 * what makes "always open" true at every width. On a wide screen the card is
 * an identity, not a choice — and an identity does not fold.
 */
@media (min-width: 901px) {
	.system-panel__toggle {
		display: none;
	}

	.system-panel > .system-panel__about {
		display: flex;
	}
}

.system-panel__art {
	margin: 0;
	overflow: hidden;
	background: white;
	border: 1px solid var(--dy-border-soft, #e2e8f0);
	border-radius: var(--dy-radius-lg, 0.75rem);
}

.system-panel__art img {
	display: block;
	inline-size: 100%;
	block-size: auto;
	/* contain, not cover: the image keeps its original ratio, so no word is cut
	   in half. */
	object-fit: contain;
	aspect-ratio: 1200 / 630;
}

.system-panel__about {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-2, 0.5rem);
	margin-block-start: var(--dy-space-2, 0.5rem);
	padding: var(--dy-space-3, 0.75rem);
	background: var(--dy-bg, #ffffff);
	border: 1px solid var(--dy-border-soft, #e2e8f0);
	border-radius: var(--dy-radius-lg, 0.75rem);
}

.system-panel__name {
	margin: 0;
	font-size: 1.15rem;
	font-weight: 800;
	line-height: 1.2;
}

.system-panel__tagline {
	margin: 0;
	font-size: 0.85rem;
	color: var(--dy-text-muted, #64748b);
}

.system-panel__points {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-1-5, 0.4rem);
	margin: 0;
	padding-inline-start: 1.1rem;
	font-size: 0.85rem;
	line-height: 1.6;
	color: var(--dy-text-secondary, #475569);
}

.system-panel__meta {
	margin: 0;
	padding-block-start: var(--dy-space-2, 0.5rem);
	font-size: 0.75rem;
	color: var(--dy-text-muted, #64748b);
	border-block-start: 1px solid var(--dy-border-soft, #e2e8f0);
}
</style>