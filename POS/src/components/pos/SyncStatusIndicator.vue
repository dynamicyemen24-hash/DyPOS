<template>
	<button
		type="button"
		class="sync-indicator"
		:class="`sync-indicator--${mode}`"
		:aria-label="accessibleLabel"
		:title="accessibleLabel"
		@click="emit('click', status)"
	>
		<span class="sync-indicator__dot" aria-hidden="true" />

		<span class="sync-indicator__label">{{ label }}</span>

		<span
			v-if="status.pendingCount > 0"
			class="sync-indicator__badge"
			aria-hidden="true"
		>
			{{ status.pendingCount > 99 ? "99+" : status.pendingCount }}
		</span>
	</button>
</template>

<script setup>
/**
 * SyncStatusIndicator — مؤشر حالة المزامنة الحي في شاشة البيع.
 *
 * يعرض: متصل / جارٍ المزامنة / مزامنة أولية (بالتقدم) / غير متصل،
 * مع شارة عدد العمليات المعلقة وتلميح بوقت آخر مزامنة ناجحة.
 * يستقصي getSyncStatus دوريًا (كل ثانيتين) ليظل دقيقًا دون فرض تفاعلية.
 */
import { computed, onMounted, onUnmounted, reactive } from "vue"

import { getSyncStatus } from "@/services/sync-manager"

const emit = defineEmits(["click"])

const POLL_INTERVAL_MS = 2000

const status = reactive({
	isOnline: true,
	isSyncing: false,
	pendingCount: 0,
	lastSyncAt: null,
	initialSync: { active: false, applied: 0, pages: 0, error: null },
})

let pollTimer = null

async function refresh() {
	try {
		const snapshot = await getSyncStatus()
		status.isOnline = snapshot.isOnline
		status.isSyncing = snapshot.isSyncing
		status.pendingCount = snapshot.pendingCount || 0
		status.lastSyncAt = snapshot.lastSyncAt
		status.initialSync = snapshot.initialSync || status.initialSync
	} catch {
		// تجاهل — سيُعاد الاستقصاء في الدورة التالية
	}
}

onMounted(() => {
	refresh()
	pollTimer = setInterval(refresh, POLL_INTERVAL_MS)
})

onUnmounted(() => {
	if (pollTimer) clearInterval(pollTimer)
	pollTimer = null
})

const mode = computed(() => {
	if (!status.isOnline) return "offline"
	if (status.isSyncing) return "syncing"
	if (status.initialSync?.active) return "initial"
	return "online"
})

const label = computed(() => {
	switch (mode.value) {
		case "offline":
			return "غير متصل"
		case "syncing":
			return "جارٍ المزامنة"
		case "initial":
			return `تحميل البيانات (${status.initialSync.applied})`
		default:
			return "متصل"
	}
})

const accessibleLabel = computed(() => {
	const parts = [label.value]
	if (status.pendingCount > 0) {
		parts.push(`${status.pendingCount} عملية بانتظار المزامنة`)
	}
	if (status.lastSyncAt) {
		let when = ""
		try {
			when = new Date(status.lastSyncAt).toLocaleTimeString("ar", {
				hour: "2-digit",
				minute: "2-digit",
			})
		} catch {
			when = new Date(status.lastSyncAt).toLocaleTimeString()
		}
		parts.push(`آخر مزامنة: ${when}`)
	}
	return parts.join(" — ")
})
</script>

<style scoped>
.sync-indicator {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 10px;
	border: 1px solid rgb(226 232 240);
	border-radius: 9999px;
	background: rgb(248 250 252);
	font-size: 11px;
	font-weight: 600;
	color: rgb(71 85 105);
	cursor: pointer;
	outline: none;
	transition:
		background-color 140ms ease,
		border-color 140ms ease;
}

.sync-indicator:focus-visible {
	outline: 2px solid rgb(5 150 105);
	outline-offset: 2px;
}

.sync-indicator__dot {
	width: 8px;
	height: 8px;
	border-radius: 9999px;
	background: rgb(34 197 94);
	flex-shrink: 0;
}

.sync-indicator--offline {
	background: rgb(254 242 242);
	border-color: rgb(254 202 202);
	color: rgb(185 28 28);
}

.sync-indicator--offline .sync-indicator__dot {
	background: rgb(239 68 68);
}

.sync-indicator--syncing,
.sync-indicator--initial {
	background: rgb(239 246 255);
	border-color: rgb(191 219 254);
	color: rgb(30 64 175);
}

.sync-indicator--syncing .sync-indicator__dot,
.sync-indicator--initial .sync-indicator__dot {
	background: rgb(59 130 246);
	animation: sync-indicator-pulse 1.1s ease-in-out infinite;
}

.sync-indicator__badge {
	min-width: 18px;
	padding: 0 5px;
	border-radius: 9999px;
	background: rgb(249 115 22);
	color: white;
	font-size: 10px;
	font-weight: 700;
	line-height: 16px;
	text-align: center;
}

@keyframes sync-indicator-pulse {
	0%,
	100% {
		opacity: 1;
	}

	50% {
		opacity: 0.35;
	}
}

@media (prefers-reduced-motion: reduce) {
	.sync-indicator__dot {
		animation: none;
	}
}
</style>
