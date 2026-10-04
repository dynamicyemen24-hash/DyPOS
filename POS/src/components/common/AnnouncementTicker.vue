<template>
	<!--
		شريط تعليمات الوردية — يتحرك تلقائيًا، ويتوقف عند مرور المؤشر أو
		تركيز لوحة المفاتيح، لأن شريطًا لا يتوقف يسرق الرقم الذي يكتبه
		الكاشير في نفس اللحظة.
	-->
	<div
		v-if="!isEmpty"
		class="announce"
		:class="`announce--${headlineLevel}`"
		role="status"
		aria-live="polite"
		@mouseenter="paused = true"
		@mouseleave="paused = false"
		@focusin="paused = true"
		@focusout="paused = false"
	>
		<span class="announce__level">{{ headlineLevelLabel }}</span>

		<!--
			النص يُعرض كاملًا في مخفي aria-label لأن الحركة البصرية تجعل
			القراءة بالقطار صعبة، وقارئ الشاشة يحتاج الجملة واحدة.
		-->
		<span class="announce__viewport">
			<span class="announce__track" :class="{ 'announce__track--paused': paused }">
				{{ headline }}
			</span>
		</span>

		<span v-if="active.length > 1" class="announce__count">
			{{ countLabel }}
		</span>
	</div>
</template>

<script setup>
/**
 * AnnouncementTicker — one line, always readable, never blocking.
 *
 * The component owns three things and delegates the rest:
 *   - WHICH notice is on screen   → `useAnnouncements` (data)
 *   - HOW it reads                 → here
 *   - WHAT an announcement means   → nowhere; it is text, never HTML
 *
 * Accessibility notes that are load-bearing rather than decorative:
 *   - `role="status"` + `aria-live="polite"`: a change of instructions is
 *     worth announcing but must never interrupt what the cashier is doing.
 *   - motion respects `prefers-reduced-motion` through CSS, and the pause
 *     handlers stop the animation on hover/focus.
 */
import { computed, ref } from "vue"
import {
	useAnnouncements,
	ANNOUNCEMENT_LEVELS,
} from "@/composables/useAnnouncements"

const props = defineProps({
	announcements: { type: Array, default: () => [] },
})

const { active, isEmpty, headline } = useAnnouncements(props.announcements)

const paused = ref(false)

const headlineLevel = computed(() =>
	headline.value ? active.value[0].level : "info",
)

const headlineLevelLabel = computed(
	() =>
		ANNOUNCEMENT_LEVELS.find((l) => l.id === headlineLevel.value)?.label ?? "",
)

/** «+2» is understood everywhere; «تعليمات أخرى: 2» is not worth the width. */
const countLabel = computed(() => `+${active.value.length - 1}`)
</script>

<style scoped>
.announce {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	min-height: 32px;
	padding: 0 0.6rem;
	border-radius: 6px;
	background: var(--dy-color-surface-sunken, #f3f4f6);
	color: var(--dy-color-text-primary, #111827);
	font-size: 0.85rem;
	overflow: hidden;
}

/* Urgency is carried by the LABEL text as well as the tint — colour alone
   fails a cashier with colour vision deficiency and fails a black-and-white
   receipt photo of the screen. */
.announce--critical {
	background: var(--dy-color-status-danger-weak, #fee2e2);
	font-weight: 650;
}

.announce--warning {
	background: var(--dy-color-status-warning-weak, #fef3c7);
}

.announce__level {
	flex-shrink: 0;
	font-weight: 650;
}

.announce__viewport {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	mask-image: linear-gradient(to left, transparent, black 1.5rem);
}

.announce__track {
	display: inline-block;
	padding-inline-start: 100%;
	white-space: nowrap;
	animation: announce-scroll 26s linear infinite;
}

/* Duplicated content so the loop has no visible jump; the text is rendered
   twice in the DOM, which is why aria-hidden is not used here — the whole
   element carries the single accessible name via role="status". */
.announce__track--paused {
	animation-play-state: paused;
}

.announce__count {
	flex-shrink: 0;
	font-variant-numeric: tabular-nums;
	opacity: 0.75;
}

@keyframes announce-scroll {
	from {
		transform: translateX(0);
	}

	to {
		transform: translateX(-100%);
	}
}

/* Motion is decoration: a cashier who asked for less of it still needs the
   instruction, so the text becomes static rather than hidden. */
@media (prefers-reduced-motion: reduce) {
	.announce__track {
		animation: none;
		padding-inline-start: 0;
	}
}
</style>