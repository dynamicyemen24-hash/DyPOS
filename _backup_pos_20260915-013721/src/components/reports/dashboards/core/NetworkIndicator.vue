<!--
  =============================================================================
  DyPOS — Network Quality Indicator
  Shows real-time network status in the header.
  =============================================================================
-->

<script setup>
import { useNetworkIndicator } from "@/composables/useNetworkIndicator"
import { FeatherIcon } from "frappe-ui"

const { quality, isOnline, latency, config } = useNetworkIndicator()
</script>

<template>
	<div
		class="dy-network-indicator"
		:class="[`dy-network-indicator--${quality}`]"
		:aria-label="`جودة الشبكة: ${config.label}`"
		role="status"
		aria-live="polite"
	>
		<span class="dy-network-indicator__icon" aria-hidden="true">
			<FeatherIcon :name="config.icon" :size="16" />
		</span>

		<span class="dy-network-indicator__label">
			{{ config.label }}
		</span>

		<span
			v-if="quality !== 'offline' && quality !== 'unknown'"
			class="dy-network-indicator__latency"
		>
			{{ latency }}ms
		</span>
	</div>
</template>

<style scoped>
.dy-network-indicator {
	display: inline-flex;
	align-items: center;
	gap: 6px;

	padding: 4px 10px;

	border-radius: var(--dy-radius-full);
	font-size: 0.75rem;
	font-weight: 700;
	transition: all 0.3s ease;
}

.dy-network-indicator--excellent {
	background: rgb(22, 163, 74 / 0.1);
	color: #16A34A;
}

.dy-network-indicator--good {
	background: rgb(22, 118, 213 / 0.1);
	color: #1677DD;
}

.dy-network-indicator--fair {
	background: rgb(202, 138, 4 / 0.1);
	color: #CA8A04;
}

.dy-network-indicator--poor {
	background: rgb(220, 38, 38 / 0.1);
	color: #DC2626;
}

.dy-network-indicator--offline {
	background: rgb(220, 38, 38 / 0.15);
	color: #991B1B;
}

.dy-network-indicator--unknown {
	background: rgb(107, 114, 128 / 0.1);
	color: #6B7280;
}

.dy-network-indicator__latency {
	color: inherit;
	opacity: 0.7;
	font-size: 0.7rem;
}
</style>