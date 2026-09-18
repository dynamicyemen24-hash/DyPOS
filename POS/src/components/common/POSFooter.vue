<template>
	<footer
		class="dy-pos-footer"
		:data-dypos="footerVersion"
	>
		<div class="dy-pos-footer__inner">
			<div class="dy-pos-footer__brand">
				<span class="dy-pos-footer__label">{{ t.footerPoweredBy }}</span>
				<DyLogo class="dy-pos-footer__logo" />
				<span class="dy-pos-footer__brand-name">{{ t.footerBrand }}</span>
			</div>
			<div class="dy-pos-footer__meta" dir="rtl">
				<span class="dy-pos-footer__copy">
					&copy; {{ currentYear }} {{ companyName }}
				</span>
			</div>
		</div>
	</footer>
</template>

<script setup>
import { computed } from "vue"
import { useLocale } from "@/composables/useLocale"
import { __ } from "@/utils/translation"
import DyLogo from "@/components/ui/DyLogo.vue"

const { locale } = useLocale()
const t = computed(() => ({
	footerPoweredBy: __("Powered by"),
	footerBrand: __("DyPOS"),
}))
const currentYear = new Date().getFullYear()
const footerVersion = "1.0.0-rt"
const companyName = "شركة المنافذ الذكية للبرمجيات"
// reactive locale binding (keeps footer translated on language switch)
void locale
</script>

<style scoped>
.dy-pos-footer {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--dy-footer-bg, rgba(15, 23, 42, 0.92));
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border-top: 1px solid var(--dy-footer-border, rgba(255, 255, 255, 0.08));
	color: var(--dy-text-secondary, rgba(255, 255, 255, 0.6));
	font-size: var(--dy-text-xs, 11px);
	font-weight: var(--dy-weight-medium, 500);
	padding: var(--dy-space-2, 6px) var(--dy-space-3, 12px);
	letter-spacing: var(--dy-letter-spacing-narrow, 0.04em);
	box-shadow: 0 -2px 16px rgba(0, 0, 0, 0.15);
	transition: background var(--dy-dur-fast, 0.2s) ease;
}

.dy-pos-footer__inner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--dy-space-4, 16px);
	max-width: 1400px;
	width: 100%;
}

.dy-pos-footer__brand {
	display: flex;
	align-items: center;
	gap: var(--dy-space-2, 6px);
}

.dy-pos-footer__label {
	color: var(--dy-text-muted, rgba(255, 255, 255, 0.4));
	font-size: var(--dy-text-2xs, 10px);
	letter-spacing: var(--dy-letter-spacing-wide, 0.08em);
	text-transform: uppercase;
}

.dy-pos-footer__logo {
	width: 14px;
	height: 14px;
	flex-shrink: 0;
}

.dy-pos-footer__brand-name {
	color: var(--dy-text, #f8fafc);
	font-weight: var(--dy-weight-semibold, 600);
	font-size: var(--dy-text-sm, 12px);
	letter-spacing: 0.02em;
}

.dy-pos-footer__meta {
	display: flex;
	align-items: center;
	gap: var(--dy-space-1, 4px);
}

.dy-pos-footer__copy {
	color: var(--dy-text-muted, rgba(255, 255, 255, 0.4));
	font-size: var(--dy-text-2xs, 10px);
}

@media (max-width: 480px) {
	.dy-pos-footer__inner {
		flex-direction: column;
		gap: var(--dy-space-1, 4px);
	}
	.dy-pos-footer__brand {
		flex-direction: column;
		gap: var(--dy-space-1, 4px);
	}
	.dy-pos-footer__label {
		font-size: var(--dy-text-3xs, 9px);
	}
	.dy-pos-footer__brand-name {
		font-size: var(--dy-text-xs, 11px);
	}
}
</style>
