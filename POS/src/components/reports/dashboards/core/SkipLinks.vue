<!--
  =============================================================================
  DyPOS — Skip Links & Accessibility Navigation
  Production Grade / RTL / Arabic Support
  =============================================================================
-->

<script setup>
import { ref } from "vue"

const skipTargets = ref([
	{ id: "main-content", label: "انتقل إلى المحتوى الرئيسي" },
	{ id: "main-nav", label: "انتقل إلى التنقل" },
	{ id: "search-input", label: "انتقل إلى محرك البحث" },
	{ id: "footer", label: "انتقل إلى التذييل" },
])

const currentTarget = ref(0)

function skipTo(targetId) {
	const el = document.getElementById(targetId)
	if (el) {
		el.setAttribute("tabindex", "-1")
		el.focus()
		el.scrollIntoView({ behavior: "smooth" })
	}
}

function cycleTarget() {
	currentTarget.value = (currentTarget.value + 1) % skipTargets.value.length
	skipTo(skipTargets.value[currentTarget.value].id)
}
</script>

<template>
	<div class="dy-skip-links" dir="rtl">
		<a
			v-for="(target, index) in skipTargets"
			:key="target.id"
			:href="`#${target.id}`"
			class="dy-skip-link"
			:class="{ 'dy-skip-link--active': index === currentTarget }"
			@click.prevent="skipTo(target.id)"
			@focus="currentTarget = index"
		>
			{{ target.label }}
		</a>
	</div>
</template>

<style scoped>
.dy-skip-links {
	position: fixed;
	top: 0;
	right: 0;
	z-index: 99999;
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 8px;
	background: var(--dy-brand-c-900);
	border-radius: 0 0 0 var(--dy-radius-lg);
}

.dy-skip-link {
	padding: 8px 16px;
	background: var(--dy-brand-c-800);
	color: white;
	font-size: 0.8rem;
	font-weight: 700;
	border-radius: var(--dy-radius-md);
	text-decoration: none;
	transition: background 0.2s ease;
}

.dy-skip-link:hover,
.dy-skip-link:focus {
	background: var(--dy-brand-c-600);
	outline: 2px solid white;
	outline-offset: 2px;
}

.dy-skip-link--active {
	background: var(--dy-accent);
}
</style>