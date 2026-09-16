<!--
  =============================================================================
  DyPOS — Password Strength Visual Indicator
  Production Grade / RTL / Arabic Support
  =============================================================================
-->

<script setup>
import { computed } from "vue"

const props = defineProps({
	password: { type: String, default: "" },
	showLabel: { type: Boolean, default: true },
})

const strength = computed(() => {
	const pwd = props.password
	if (!pwd) return { level: 0, label: "", color: "", percent: 0 }

	let score = 0

	if (pwd.length >= 8) score += 1
	if (pwd.length >= 12) score += 1
	if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1
	if (/[0-9]/.test(pwd)) score += 1
	if (/[^A-Za-z0-9]/.test(pwd)) score += 1

	const commonPatterns = [
		/^(.)\1+$/,
		/^(012|123|234|345|456|567|678|789|890)/,
		/^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i,
		/^(qwerty|asdf|zxcv|password|letmein|admin|welcome|monkey|dragon|master)/i,
		/^(111|222|333|444|555|666|777|888|999|000)/,
	]
	if (commonPatterns.some((p) => p.test(pwd))) {
		score = Math.max(0, score - 2)
	}

	if (pwd.length < 6) score = Math.min(score, 1)

	const levels = [
		{ label: "", color: "", percent: 0 },
		{ label: "ضعيف جداً", color: "#DC2626", percent: 20 },
		{ label: "ضعيف", color: "#EA580C", percent: 40 },
		{ label: "متوسط", color: "#CA8A04", percent: 60 },
		{ label: "قوي", color: "#16A34A", percent: 80 },
		{ label: "قوي جداً", color: "#059669", percent: 100 },
	]

	return levels[Math.min(score, 5)]
})
</script>

<template>
	<div v-if="password" class="dy-pw-strength" dir="rtl">
		<div class="dy-pw-strength__bar" aria-hidden="true">
			<div
				class="dy-pw-strength__fill"
				:style="{
					width: strength.percent + '%',
					backgroundColor: strength.color,
				}"
			/>
		</div>
		<span
			v-if="showLabel && strength.label"
			class="dy-pw-strength__label"
			:style="{ color: strength.color }"
		>
			{{ strength.label }}
		</span>
	</div>
</template>

<style scoped>
.dy-pw-strength {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-top: 4px;
}

.dy-pw-strength__bar {
	height: 4px;
	border-radius: 2px;
	background: var(--dy-border);
	overflow: hidden;
}

.dy-pw-strength__fill {
	height: 100%;
	border-radius: 2px;
	transition: width 0.3s ease, background-color 0.3s ease;
}

.dy-pw-strength__label {
	font-size: 0.75rem;
	font-weight: 700;
	text-align: left;
}
</style>