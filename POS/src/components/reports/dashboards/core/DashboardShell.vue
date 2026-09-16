<template>
	<div class="dashboard-shell" :class="{ 'full-screen': isFullScreen }">
		<!-- Content-Security-Policy -->
		<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self';" />
		<!-- Header Bar -->
		<div class="shell-header flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 no-print">
			<div class="flex items-center gap-3">
				<Button v-if="showBack" variant="ghost" @click="$emit('back')">
					<FeatherIcon name="arrow-left" class="w-4 h-4" />
				</Button>
				<div>
					<h1 class="text-lg font-bold text-gray-900">{{ __(title) }}</h1>
					<p v-if="subtitle" class="text-xs text-gray-500">{{ __(subtitle) }}</p>
				</div>
				<Badge v-if="lastLoaded" :label="timeAgo(lastLoaded)" theme="subtle" size="sm" />
				<Badge v-if="realtime" label="Live" theme="green" size="sm" />
			</div>
			<div class="flex items-center gap-2">
				<!-- Auto-refresh Toggle -->
				<label class="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
					<input type="checkbox" :checked="autoRefresh" @change="$emit('toggle-auto-refresh')" class="rounded border-gray-300 text-indigo-500 focus:ring-indigo-400" />
					{{ __("Auto") }}
				</label>
				<!-- Export Dropdown -->
				<div v-if="exportable" class="relative" ref="exportMenuRef">
					<Button variant="subtle" @click="showExportMenu = !showExportMenu">
						<FeatherIcon name="download" class="w-4 h-4 mr-1" />
						{{ __("Export") }}
					</Button>
					<div
						v-if="showExportMenu"
						class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[140px]"
					>
						<button class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2" @click="handleExport('csv')">
							<FeatherIcon name="file-text" class="w-4 h-4 text-gray-400" />
							{{ __("CSV") }}
						</button>
						<button class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2" @click="handleExport('excel')">
							<FeatherIcon name="table" class="w-4 h-4 text-green-500" />
							{{ __("Excel") }}
						</button>
						<button class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2" @click="handleExport('pdf')">
							<FeatherIcon name="file" class="w-4 h-4 text-red-500" />
							{{ __("PDF") }}
						</button>
					</div>
				</div>
				<!-- Print -->
				<Button variant="subtle" @click="handlePrint">
					<FeatherIcon name="printer" class="w-4 h-4" />
				</Button>
				<!-- Fullscreen -->
				<Button variant="subtle" @click="toggleFullScreen">
					<FeatherIcon :name="isFullScreen ? 'minimize-2' : 'maximize-2'" class="w-4 h-4" />
				</Button>
				<!-- Refresh -->
				<Button variant="solid" :loading="loading" @click="$emit('refresh')">
					<FeatherIcon name="refresh-cw" class="w-4 h-4" />
				</Button>
			</div>
		</div>

		<!-- Filters -->
		<div v-if="$slots.filters" class="shell-filters px-4 py-3 bg-gray-50 border-b border-gray-200 no-print">
			<slot name="filters" />
		</div>

		<!-- Loading State -->
		<div v-if="loading && !hasData" class="flex items-center justify-center py-20">
			<div class="text-center">
				<div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto mb-3" />
				<p class="text-sm text-gray-500">{{ __("Loading dashboard...") }}</p>
			</div>
		</div>

		<!-- Error State -->
		<div v-else-if="error" class="m-4 bg-red-50 border border-red-200 rounded-lg p-6 text-center">
			<FeatherIcon name="alert-circle" class="w-8 h-8 text-red-400 mx-auto mb-2" />
			<p class="text-red-700 font-medium">{{ __("Failed to load data") }}</p>
			<p class="text-red-500 text-sm mt-1">{{ error }}</p>
			<Button class="mt-3" variant="solid" @click="$emit('refresh')">
				{{ __("Retry") }}
			</Button>
		</div>

		<!-- Content -->
		<div v-else class="shell-content p-4 md:p-6">
			<slot />
		</div>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue"
import { Button, Badge, FeatherIcon } from "frappe-ui"
import { useToast } from "@/composables/useToast"
import { timeAgo } from "./dashboardUtils"

const props = defineProps({
	title: { type: String, required: true },
	subtitle: { type: String, default: "" },
	loading: { type: Boolean, default: false },
	error: { type: String, default: "" },
	hasData: { type: Boolean, default: false },
	lastLoaded: { type: Date, default: null },
	realtime: { type: Boolean, default: false },
	autoRefresh: { type: Boolean, default: false },
	exportable: { type: Boolean, default: true },
	showBack: { type: Boolean, default: false },
})

const emit = defineEmits(["refresh", "export", "toggle-auto-refresh", "back"])

const { showSuccess } = useToast()

const isFullScreen = ref(false)
const showExportMenu = ref(false)
const exportMenuRef = ref(null)

function handleExport(format) {
	showExportMenu.value = false
	emit("export", format)
	showSuccess(`Exporting as ${format.toUpperCase()}...`)
}

function handlePrint() {
	window.print()
}

function toggleFullScreen() {
	if (!document.fullscreenElement) {
		document.documentElement.requestFullscreen().catch(() => {})
		isFullScreen.value = true
	} else {
		document.exitFullscreen().catch(() => {})
		isFullScreen.value = false
	}
}

function handleClickOutside(e) {
	if (exportMenuRef.value && !exportMenuRef.value.contains(e.target)) {
		showExportMenu.value = false
	}
}

onMounted(() => {
	document.addEventListener("click", handleClickOutside)
})

onUnmounted(() => {
	document.removeEventListener("click", handleClickOutside)
})
</script>

<style scoped>
.dashboard-shell.full-screen {
	position: fixed;
	inset: 0;
	z-index: 9999;
	background: white;
	overflow-y: auto;
}

@media print {
	.no-print {
		display: none !important;
	}
	.dashboard-shell {
		padding: 0;
	}
	.shell-content {
		padding: 0 !important;
	}
}
</style>
