<!--
  =============================================================================
  DyPOS — Login display preferences (language + theme)

  لماذا هذا الشريط هنا بالذات؟
  شاشة الدخول أول شاشة يراها الكاشير، وقبلها لا توجد إعدادات يمكن الوصول
  إليها. من يعمل بلغة غير العربية أو في غرفة إضاءة خافتة كان بلا وسيلة
  لتغيير اللغة أو السمة إلا بتعديل localStorage باليد. الاختيار هنا:
  مُتاح قبل تسجيل الدخول، محفوظ محليًا، ويعمل بلا خادم.

  قرارات متعمّدة:
  - `<select>` أصلي للغة، لا قائمة مخصّصة: يحصل على منتقي النظام على الجوال،
    وتنقّل لوحة المفاتيح مجانًا، ولا يحتاج إدارة تركيز أو إغلاق بالنقر
    خارجًا. البديل المخصّص يفتح نافذة لا تغلق بـEscape على iPad.
  - `fieldset` + `legend` + `radio` أصلي للسِمة: مجموعة واحدة يقرؤها قارئ
    الشاشة كمجموعة، وأسهم لوحة المفاتيح تنتقل بينها بلا كود.
  - هدف اللمس 44px، وحدٌّ أدنى 16px لكل نص (iOS Safari يكبّر أي حقل إدخال
    أصغر من ذلك فتزدحم الشاشة بمجرد التركيز).
  - بلا أي صورة خارجية: الأعلام رموز emoji في النظام (انظر utils/flags.js)،
    والأيقونات SVG مضمّنة من حزمة dypos-ui.
  =============================================================================
-->
<script setup>
import { ref } from "vue"

import { FeatherIcon } from "dypos-ui"

import { __ } from "@/utils/translation"
import { useLoginPreferences } from "@/composables/useLoginPreferences"

defineProps({
	compact: { type: Boolean, default: false },
})

/**
 * تسميات السِمة: المفاتيح العربية نفسها، فتُترجَم من قاموس اللغة الحالي
 * بلا قاموس خاص بهذه الشاشة.
 */
const THEME_LABELS = {
	light: "فاتح",
	dark: "داكن",
	system: "تلقائي",
}

const {
	locale,
	localeOptions,
	setLocale,
	themeMode,
	themeOptions,
	setThemeMode,
	switching,
} = useLoginPreferences()

/** رسالة فشل التبديل بدل حالة صامتة (تُقرأ بصوت عبر `role="alert"`). */
const localeError = ref("")

/**
 * تبديل اللغة مع تراجع صريح عند الفشل.
 *
 * `event.target.value` يُعاد إلى اللغة الفعّالة: قائمة تعرض لغة لم
 * تُطبَّق (قاموسها غير موجود) تخدع الكاشير بأنه يتكلم بها.
 */
async function onLocaleChange(event) {
	const select = event.target
	const next = select.value

	if (next === locale.value) {
		localeError.value = ""
		return
	}

	const applied = await setLocale(next)

	if (!applied) {
		localeError.value = __("تعذّر تغيير اللغة")
		select.value = locale.value
		return
	}

	localeError.value = ""
}
</script>

<template>
	<div
		class="dy-login-prefs"
		:class="{ 'dy-login-prefs--compact': compact }"
		role="group"
		:aria-label="__('تفضيلات العرض')"
	>
		<div class="dy-login-prefs__field">
			<label
				class="dy-login-prefs__label"
				for="dypos-login-locale"
			>
				<FeatherIcon
					name="globe"
					:size="15"
					aria-hidden="true"
				/>

				{{ __("اللغة") }}
			</label>

			<select
				id="dypos-login-locale"
				class="dy-login-prefs__select"
				:value="locale"
				:disabled="switching"
				@change="onLocaleChange"
			>
				<option
					v-for="option in localeOptions"
					:key="option.value"
					:value="option.value"
					:lang="option.value"
					:dir="option.dir"
				>
					{{ option.label }}
				</option>
			</select>
		</div>

		<fieldset class="dy-login-prefs__field">
			<legend class="dy-login-prefs__label">
				<FeatherIcon
					name="sun"
					:size="15"
					aria-hidden="true"
				/>

				{{ __("السمة") }}
			</legend>

			<div class="dy-login-prefs__options">
				<label
					v-for="option in themeOptions"
					:key="option.value"
					class="dy-login-prefs__option"
				>
					<input
						class="dy-login-prefs__radio"
						type="radio"
						name="dypos-login-theme"
						:value="option.value"
						:checked="themeMode === option.value"
						@change="setThemeMode(option.value)"
					/>

					<span class="dy-login-prefs__option-face">
						<FeatherIcon
							:name="option.icon"
							:size="15"
							aria-hidden="true"
						/>

						{{ __(THEME_LABELS[option.value]) }}
					</span>
				</label>
			</div>
		</fieldset>

		<p
			v-if="localeError"
			class="dy-login-prefs__error"
			role="alert"
		>
			<FeatherIcon
				name="alert-circle"
				:size="14"
				aria-hidden="true"
			/>

			{{ localeError }}
		</p>
	</div>
</template>

<style scoped>
/*
 * كل القيم منطقية (inline) لا فيزيائية: الشريط ينقلب مع اتجاه الصفحة دون
 * قاعدة `[dir="ltr"]` موازية تبقى في حالة سكون.
 */
.dy-login-prefs {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 12px 20px;

	margin-block-start: 22px;
	padding-block-start: 18px;
	border-block-start: 1px solid var(--dy-border-soft);
}

.dy-login-prefs--compact {
	align-items: center;
	gap: 8px 16px;
	margin-block-start: 0;
	padding-block-start: 0;
	border-block-start: 0;
}

.dy-login-prefs--compact .dy-login-prefs__field {
	flex-direction: row;
	align-items: center;
	gap: 8px;
}

.dy-login-prefs--compact .dy-login-prefs__field:nth-child(2) {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: center;
}

.dy-login-prefs--compact .dy-login-prefs__field:nth-child(2) .dy-login-prefs__label {
	grid-column: 1;
	grid-row: 1;
}

.dy-login-prefs--compact .dy-login-prefs__field:nth-child(2) .dy-login-prefs__options {
	grid-column: 2;
	grid-row: 1;
}

.dy-login-prefs--compact .dy-login-prefs__select {
	min-height: 44px;
}

.dy-login-prefs--compact .dy-login-prefs__option-face {
	min-height: 40px;
}

.dy-login-prefs__field {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
	margin: 0;
	padding: 0;
	border: 0;
}

.dy-login-prefs__label {
	display: inline-flex;
	align-items: center;
	gap: 6px;

	font-size: 0.8125rem;
	font-weight: 600;
	color: var(--dy-text-muted);
}

/* 44px هو حدّ هدف اللمس (WCAG 2.5.8 / إرشادات المنصات)، و16px هو الحدّ
   الذي يمنع iOS من تكبير الصفحة عند التركيز داخل `<select>`. */
.dy-login-prefs__select {
	min-height: 44px;
	padding-inline: 12px 34px;
	padding-block: 8px;

	font-size: 1rem;
	font-family: inherit;
	color: var(--dy-text);
	background-color: var(--dy-surface);
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-lg, 10px);

	cursor: pointer;
	max-width: 100%;
}

.dy-login-prefs__select:hover {
	border-color: var(--dy-border-strong);
}

.dy-login-prefs__options {
	display: inline-flex;
	gap: 4px;

	padding: 4px;
	background: var(--dy-surface-soft);
	border-radius: var(--dy-radius-lg, 10px);
}

.dy-login-prefs__option {
	position: relative;
	display: inline-flex;
}

/* الإخفاء بصري لا وظيفي: العنصر يبقى في شجرة الوصول ويقبل التركيز،
   والرسم على الوجه المرئي هو ما يراه الكاشير. */
.dy-login-prefs__radio {
	position: absolute;
	inset: 0;

	inline-size: 100%;
	block-size: 100%;

	margin: 0;
	opacity: 0;
	cursor: pointer;
}

.dy-login-prefs__option-face {
	display: inline-flex;
	align-items: center;
	gap: 6px;

	min-height: 36px;
	padding-inline: 12px;

	font-size: 0.875rem;
	font-weight: 600;
	color: var(--dy-text-muted);
	border-radius: calc(var(--dy-radius-lg, 10px) - 4px);

	transition:
		background-color 0.15s ease,
		color 0.15s ease;
}

.dy-login-prefs__option:hover .dy-login-prefs__option-face {
	color: var(--dy-text);
	background: var(--dy-surface);
}

.dy-login-prefs__radio:checked + .dy-login-prefs__option-face {
	color: var(--dy-surface);
	background: var(--dy-accent-600, var(--dy-accent-500));
}

.dy-login-prefs__select:focus-visible,
.dy-login-prefs__radio:focus-visible + .dy-login-prefs__option-face {
	outline: var(--dy-focus-width, 2px) solid
		var(--dy-accent-500, currentColor);
	outline-offset: var(--dy-focus-offset, 2px);
}

.dy-login-prefs__select:disabled {
	cursor: progress;
	opacity: 0.6;
}

.dy-login-prefs__error {
	display: inline-flex;
	align-items: center;
	gap: 6px;

	flex-basis: 100%;

	margin: 0;
	font-size: 0.8125rem;
	color: var(--dy-crimson-600, #b91c1c);
}

/*
 * الشريط يتقلّم على الشاشة الصغيرة قبل أن يتقلّم النص: هدف اللمس يبقى
 * 44px، فقط يلتفّ إلى سطرين.
 */
@media (max-width: 480px) {
	.dy-login-prefs {
		align-items: stretch;
		flex-direction: column;
	}

	.dy-login-prefs--compact {
		align-items: center;
		flex-direction: row;
		flex-wrap: wrap;
	}

	.dy-login-prefs--compact .dy-login-prefs__field {
		flex-direction: row;
		align-items: center;
		min-width: 0;
		gap: 0;
	}

	.dy-login-prefs--compact .dy-login-prefs__field:first-child {
		flex: 1 1 120px;
	}

	.dy-login-prefs--compact .dy-login-prefs__field:nth-child(2) {
		display: flex;
		position: relative;
		flex: 1 1 215px;
	}

	.dy-login-prefs--compact .dy-login-prefs__label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}

	.dy-login-prefs__select,
	.dy-login-prefs__options {
		inline-size: 100%;
	}

	.dy-login-prefs--compact .dy-login-prefs__select {
		inline-size: auto;
		min-inline-size: 0;
		flex: 1 1 auto;
		padding-inline: 8px 28px;
	}

	.dy-login-prefs--compact .dy-login-prefs__options {
		inline-size: auto;
		min-inline-size: 0;
		flex: 1 1 auto;
		justify-content: space-between;
	}

	.dy-login-prefs--compact .dy-login-prefs__option-face {
		min-height: 44px;
		padding-inline: 7px;
		font-size: 0.82rem;
	}

	.dy-login-prefs__option {
		flex: 1 1 0;
		justify-content: center;
	}
}

@media (prefers-reduced-motion: reduce) {
	.dy-login-prefs__option-face {
		transition: none;
	}
}

@media (forced-colors: active) {
	.dy-login-prefs__radio:checked + .dy-login-prefs__option-face {
		background: Highlight;
		color: HighlightText;
	}

	.dy-login-prefs__select {
		border-color: CanvasText;
	}
}
</style>
