<template>
	<!--
		لوحة تعريف النظام أعلى يمين شاشة الدخول.

		الصورة **الرسمية** (`smart-ports-og.jpg`) معروضة كما هي — لم تُقصّ
		ولا تُستبدل. هي أصل الهوية ومُثبَّتة بايتًا ببوابة `brandingIdentity`
		مقابل بطاقة المشاركة الاجتماعية، واسم الشركة فيها جزء من التصميم
		لا زخرفة يمكن اختصارها.

		تحتها صندوق تعريفي: المستخدم الجديد يحتاج أن يعرف **ما الذي
		يدخل إليه** قبل أن يكتب كلمة مروره.
	-->
	<section class="system-panel">
		<figure class="system-panel__art">
			<img
				:src="officialArtwork"
				:alt="artAlt"
				width="1200"
				height="630"
				decoding="async"
			/>
		</figure>

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
	</section>
</template>

<script setup>
/**
 * اللوحة التعريفية — عرض فقط، بلا منطق.
 *
 * النقاط الخمس إعلاه **ادّعاءات منتج** لا زخرفة، وكلها منه —
 * تشغيل دون اتصال، كاشير ذاتي وطوابير، عملات ووحدات، استيراد وتصدير،
 * ودخول حيوي. لا تُكتب من ذاكرة الكاتب ولا تُزخرف.
 */
import officialArtwork from "@/assets/smart-ports-og.jpg"
import {
	APP_NAME,
	APP_TAGLINE,
	COMPANY_NAME_AR,
	COMPANY_WEBSITE_LABEL,
} from "@/utils/brand"

const artAlt = `شركة ${COMPANY_NAME_AR} — ${APP_NAME}`

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
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-3, 0.75rem);
	inline-size: min(100%, 420px);
	/* inline-end = اليمين في RTL، اليسار في LTR. خاصية واحدة للاثنين. */
	align-self: start;
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
	/* contain لا cover: الصورة بنسبتها الأصلية، ولا نقطع كلمة في منتصفها. */
	object-fit: contain;
	aspect-ratio: 1200 / 630;
}

.system-panel__about {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-2, 0.5rem);
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

