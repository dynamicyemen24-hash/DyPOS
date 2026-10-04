<template>
	<!--
		أزرار المخزون والطباعة في رأس شاشة البيع.

		كانت ثلاث نسخ من نفس الكتلة موزّعة على الصفحة: «استيراد» و«مخزون» في
		الرأس، ثم «مخزون» و«طباعة» مرة أخرى في شريط الإجراءات السريعة. أربعة
		أزرار، ونسختان من «مخزون» تذهبان إلى الوجهة نفسها. الاستخراج هنا ليس
		تنسيقًا: هو ما أعاد `POSSale.vue` تحت رافعة الحجم، وهو ما يمنع النسخة
		الرابعة من الظهور.
	-->
	<ActionButton
		v-if="showImport"
		variant="subtle"
		size="sm"
		:title="__('استيراد/تصدير')"
		:aria-label="__('استيراد/تصدير')"
		@click="$emit('open')"
	>
		<FeatherIcon name="upload" class="h-[16px] w-[16px]" />
		<span>{{ __("استيراد") }}</span>
	</ActionButton>

	<ActionButton
		variant="subtle"
		size="sm"
		:title="__('فحص المخزون')"
		:aria-label="__('فحص المخزون')"
		@click="$emit('open')"
	>
		<FeatherIcon name="search" class="h-[14px] w-[14px]" />
		<span>{{ __("مخزون") }}</span>
	</ActionButton>

	<ActionButton
		v-if="showPrint"
		variant="subtle"
		size="sm"
		:title="__('طباعة سريعة')"
		:aria-label="__('طباعة سريعة')"
		@click="$emit('print')"
	>
		<FeatherIcon name="printer" class="h-[14px] w-[14px]" />
		<span>{{ __("طباعة") }}</span>
	</ActionButton>
</template>

<script setup>
import { ActionButton, FeatherIcon } from "dypos-ui"
import { __ } from "@/utils/translation"

/**
 * The stock button is not optional: both call sites need it and both lead to
 * the same destination. Import and print are optional because the two
 * surfaces differ — the header had all three, the quick bar only the last two.
 *
 * `open` carries ONE destination for both stock labels, which is what stops
 * the two labels from drifting apart into two different routes later.
 */
defineProps({
	/** The header shows the import entry point; the quick bar does not. */
	showImport: { type: Boolean, default: false },
	/** Only the quick bar carries the reprint shortcut. */
	showPrint: { type: Boolean, default: false },
})

defineEmits(["open", "print"])
</script>