<template>
	<div class="bg-white shadow-sm sticky top-0 z-[300] border-b border-gray-200">
		<div class="flex py-2 sm:py-3 px-4">
			<!-- Company Logo and Name -->
			<div class="w-16 flex-shrink-0 flex items-center justify-center">
				<div
					class="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-md flex-shrink-0"
				>
					<span
						class="text-white text-xs font-bold uppercase tracking-wider"
						:title="companyName"
					>
						{{ companyInitials }}
					</span>
				</div>
			</div>

			<!-- Main Header Content -->
			<div class="flex-1 flex justify-between items-center gap-1 sm:gap-2 px-2 sm:px-4 md:px-6">
				<!-- Left Side: Brand and Info -->
				<div class="flex items-center gap-1 sm:gap-4 min-w-0 flex-1 overflow-hidden">
					<div class="min-w-0 flex-shrink overflow-hidden">
						<div class="flex items-center gap-1 sm:gap-2">
							<h1
								class="text-xs sm:text-base font-bold text-gray-900 truncate flex-shrink"
							>
								{{ __("DyPOS") }}
							</h1>
							<div
								class="flex items-center gap-1 sm:gap-2"
							>
								<span
									class="hidden sm:inline-flex relative items-center px-1 sm:px-2 py-0.5 text-[8px] sm:text-[10px] font-bold bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-md shadow-sm hover:shadow-md transition-shadow flex-shrink-0"
								>
									<span
										class="absolute inset-0 bg-white/20 rounded-md animate-pulse"
									></span>
									<span class="relative">v{{ appVersion }}</span>
								</span>
							</div>
							<p
								v-if="profileName"
								class="text-[9px] sm:text-xs text-gray-500 truncate hidden sm:block mt-0.5"
							>
								{{ profileName }}
							</p>
						</div>

						<!-- ZATCA Compliance Status -->
						<div
							v-if="enableZATCA"
							class="mt-2 sm:mt-2 flex items-center gap-2 text-[8px] sm:text-xs text-indigo-600"
						>
							<svg
								class="w-3 h-3 text-indigo-400"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 011.414 0L10 8.414l1.293-1.293a1 1 0 111.414 1.414L11.414 10l1.293 1.293a1 1 0 010 1.414L10 11.414l-1.293 1.293a1 1 0 01-1.414 0L8.586 10 7.293 9.293a1 1 0 010-1.414z"
								/>
							</svg>
							<span
								class="text-indigo-600 font-medium"
							>
								{{ __("ZATCA Compliant") }}
							</span>
						</div>
					</div>
				</div>

				<!-- Right Side: User and Controls -->
				<div class="flex items-center gap-0.5 sm:gap-1 md:gap-2 flex-shrink-0">
					<!-- User Display -->
					<div class="flex items-center gap-2">
						<img
							v-if="userImage"
							:src="userImage"
							class="w-8 h-8 rounded-full object-cover"
							alt="User"
						/>
						<span
							v-else
							class="hidden sm:inline-block text-[9px] sm:text-xs font-medium text-gray-700"
						>
							{{ userName || __("User") }}
						</span>
					</div>

					<!-- ZATCA Registration -->
					<div v-if="enableZATCA" class="relative">
						<button
							@click="showZATCATooltip = !showZATCATooltip"
							class="p-1.5 sm:p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[8px] sm:text-xs font-medium transition-colors"
							:aria-label="__('ZATCA Settings')"
						>
							<svg
								class="w-3.5 h-3.5 sm:w-4 sm:h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 6v6l4 4"
								/>
							</svg>
							<span class="hidden sm:inline">{{ __("ZATCA") }}</span>
						</button>
					</div>

					<!-- WiFi/Offline Status -->
					<button
						@click="$emit('sync-click')"
						:class="[
							'p-1.5 sm:p-2 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors relative group touch-manipulation',
							isSyncing ? 'animate-pulse' : '',
						]"
						:title="
							isOffline
								? __('Offline ({0} pending)', [pendingInvoicesCount])
								: __('Online - Click to sync')
						"
						:aria-label="
							isOffline ? __('Offline mode active') : __('Online mode active')
						"
					>
						<svg
							v-if="!isOffline"
							class="w-4 h-4 sm:w-5 sm:h-5 text-green-600"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"
							/>
						</svg>
						<svg
							v-else
							class="w-4 h-4 sm:w-5 sm:h-5 text-orange-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
							/>
						</svg>
						<span
							v-if="pendingInvoicesCount > 0"
							class="absolute -top-1 -end-1 bg-orange-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-md"
						>
							{{ pendingInvoicesCount }}
						</span>
					</button>

					<!-- ZATCA Tooltip -->
					<div
						v-if="showZATCATooltip"
						@mousedown.prevent
						class="absolute top-full mt-2 z-[999] w-[90vw] max-w-[280px] sm:max-w-[320px]"
						:style="{ left: '50%', transform: 'translateX(-50%)' }"
					>
						<div class="bg-gray-900 text-white text-xs rounded-lg shadow-xl py-3 px-4 sm:px-5">
							<!-- Arrow -->
							<div class="absolute bottom-full mb-px left-1/2 -translate-x-1/2">
								<div class="border-[5px] sm:border-4 border-transparent border-b-indigo-900"></div>
							</div>

							<!-- Header -->
							<div class="flex items-center justify-between mb-3 sm:mb-4">
								<span class="font-semibold text-[11px] sm:text-xs">
									{{ __("ZATCA Compliance") }}
								</span>
								<span
									class="px-2 py-1 rounded text-[9px] sm:text-xs font-bold uppercase bg-indigo-600 text-white"
								>
									{{ __("Active") }}
								</span>
							</div>

							<!-- Compliance Details -->
							<div class="space-y-2 text-[10px] sm:text-xs">
								<!-- ZATCA Registration Number -->
								<div class="flex items-center justify-between mb-2 sm:mb-3">
									<span class="text-gray-400">{{ __("Registration Number:") }}</span>
									<span
										class="font-medium text-indigo-300 break-all"
										:title="zatcaRegistrationNumber"
									>
										{{ zatcaRegistrationNumber }}
									</span>
								</div>

								<!-- Validity Period -->
								<div class="flex items-center justify-between mb-2 sm:mb-3">
									<span class="text-gray-400">{{ __("Valid Until:") }}</span>
									<span class="font-medium">{{ validityDate }}</span>
								</div>

								<!-- Last Sync -->
								<div class="flex items-center justify-between">
									<span class="text-gray-400">{{ __("Last Sync:") }}</span>
									<span class="text-sm font-medium text-indigo-300">{{ lastSyncDate }}</span>
								</div>

								<!-- ZATCA Status -->
								<div
									v-if="zatcaStatus === 'active'"
									class="flex items-center gap-2 px-2 py-1 rounded bg-indigo-500/20 text-indigo-100 text-[9px] sm:text-xs"
								>
									<svg
										class="w-3 h-3 text-indigo-400"
										fill="currentColor"
										viewBox="0 0 20 20"
									>
										<path
											d="M9 12l2 2 4-4M6 8l2 2m2-2v8m0-12l2 2m-2 2v8m0 16l2-2m-2-2v-8m8 2l-2-2m2 2v-8m0-16l-2-2m2 2v-8"
									/>
									<span>{{ __("Active") }}</span>
								</div>
								<div
									v-else
									class="flex items-center gap-2 px-2 py-1 rounded bg-red-500/20 text-red-100 text-[9px] sm:text-xs"
								>
									<svg
										class="w-3 h-3 text-red-400"
										fill="currentColor"
										viewBox="0 0 20 20"
									>
										<path
											d="M9 12l2 2 4-4M6 8l2 2m2-2v8m0-12l2 2m-2 2v8m0 16l2-2m-2-2v8"
									/>
									<span>{{ __("Expired") }}</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Printer - Visible only while shift is open -->
					<div v-if="hasOpenShift" class="hidden md:block relative">
						<ActionButton
							:icon="printerIcon"
							:title="
								silentPrintEnabled
									? qzConnected
										? __('Silent Print: Connected')
										: __('Silent Print: Disconnected')
									: __('Print Invoice')
							"
							@click="$emit('printer-click')"
						/>
						<span
							v-if="silentPrintEnabled"
							class="absolute top-0.5 end-0.5 w-2 h-2 rounded-full border border-white"
							:class="qzConnected ? 'bg-green-500' : 'bg-red-500'"
						></span>
					</div>

					<!-- Refresh -->
					<ActionButton
						:icon="refreshIcon"
						:title="isRefreshing ? __('Refreshing...') : __('Refresh')"
						@click="$emit('refresh-click')"
						:class="[
							'touch-manipulation p-1 sm:p-2',
							isRefreshing ? 'animate-spin' : '',
						]"
						:aria-label="
							isRefreshing ? __('Refreshing...') : __('Refresh items and customers')
						"
					/>

					<div class="w-px h-4 sm:h-6 bg-gray-200 hidden md:block"></div>

					<!-- Language Switcher - Hidden on mobile, shown in UserMenu instead -->
					<div class="hidden md:block">
						<LanguageSwitcher />
					</div>

					<div class="w-px h-4 sm:h-6 bg-gray-200"></div>

					<!-- User Menu -->
					<UserMenu
						:user-name="userName"
						:profile-name="profileName"
						:profile-image="userImage"
						@logout="$emit('logout')"
						@menu-opened="$emit('menu-opened')"
						@menu-closed="$emit('menu-closed')"
					>
						<template #menu-items>
							<slot name="menu-items"></slot>
						</template>
						<template #additional-actions>
							<slot name="additional-actions"></slot>
						</template>
					</UserMenu>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import ActionButton from "@/components/common/ActionButton.vue"
import LanguageSwitcher from "@/components/common/LanguageSwitcher.vue"
import UserMenu from "@/components/common/UserMenu.vue"
import { version } from "../../../package.json"
import { ref, computed } from "vue"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { useLocale } from "@/composables/useLocale"

const appVersion = version

// Props
const props = defineProps({
	currentTime: {
		type: String,
		default: "",
	},
	shiftDuration: {
		type: String,
		default: null,
	},
	hasOpenShift: {
		type: Boolean,
		default: false,
	},
	profileName: {
		type: String,
		default: null,
	},
	userName: {
		type: String,
		required: true,
	},
	userImage: {
		type: String,
		default: null,
	},
	isOffline: {
		type: Boolean,
		default: false,
	},
	isSyncing: {
		type: Boolean,
		default: false,
	},
	pendingInvoicesCount: {
		type: Number,
		default: 0,
	},
	isAnyDialogOpen: {
		type: Boolean,
		default: false,
	},
	enableZATCA: {
		type: Boolean,
		default: false,
	},
	cacheSyncing: {
		type: Boolean,
		default: false,
	},
	cacheStats: {
		type: Object,
		default: () => ({ items: 0, lastSync: null }),
	},
	stockSyncActive: {
		type: Boolean,
		default: false,
	},
	isRefreshing: {
		type: Boolean,
		default: false,
	},
	silentPrintEnabled: {
		type: Boolean,
		default: false,
	},
	qzConnected: {
		type: Boolean,
		default: false,
	},
})

// Locale state for Arabic-first display
const { isRTL, locale } = useLocale()

// POS Settings store provides company/branch/compliance configuration
const posSettingsStore = usePOSSettingsStore()

// Company & branch information from settings (default header)
const companyName = computed(
	() =>
		posSettingsStore.companyName ||
		posSettingsStore.settings?.company_name ||
		"",
)
const companyLogo = computed(
	() =>
		posSettingsStore.companyLogo ||
		posSettingsStore.settings?.company_logo ||
		"",
)
const companyAddress = computed(
	() =>
		posSettingsStore.companyAddress ||
		posSettingsStore.settings?.company_address ||
		"",
)
const companyPhone = computed(
	() =>
		posSettingsStore.companyPhone ||
		posSettingsStore.settings?.company_phone ||
		"",
)
const companyEmail = computed(
	() =>
		posSettingsStore.companyEmail ||
		posSettingsStore.settings?.company_email ||
		"",
)
const companyTaxId = computed(
	() =>
		posSettingsStore.companyTaxId ||
		posSettingsStore.settings?.company_tax_id ||
		"",
)
const branchName = computed(
	() =>
		posSettingsStore.branchName || posSettingsStore.settings?.branch_name || "",
)
const branchCode = computed(
	() =>
		posSettingsStore.branchCode || posSettingsStore.settings?.branch_code || "",
)
const branchAddress = computed(
	() =>
		posSettingsStore.branchAddress ||
		posSettingsStore.settings?.branch_address ||
		"",
)

// ZATCA registration data (persisted in offline DB / settings)
const zatcaRegistrationNumber = ref(
	posSettingsStore.settings?.zatca_registration_number || "",
)
const validityDate = ref(posSettingsStore.settings?.zatca_validity_date || "")
const lastSyncDate = ref(posSettingsStore.settings?.zatca_last_sync || "")
const zatcaStatus = ref(
	posSettingsStore.settings?.zatca_status ||
		(props.enableZATCA ? "active" : "pending"),
)

// Initials from company name
const companyInitials = computed(() => {
	const name =
		companyName.value ||
		(branchName.value ? `${branchName.value} ${branchCode.value}` : "")
	if (!name) return "POS"
	const words = name.split(" ")
	if (words.length >= 2) {
		return `${words[0][0]}${words[words.length - 1][0]}`
	}
	return name.substring(0, 3).toUpperCase()
})

// SVG Path Icons
const printerIcon =
	"M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z"
const refreshIcon =
	"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
</script>

<style scoped>
/* Header specific styles */
.report-header {
	@apply bg-white shadow-sm sticky top-0 z-[300] border-b border-gray-200;
}

.company-badge {
	@apply w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-md flex-shrink-0;
}

.company-initials {
	@apply text-white text-xs font-bold uppercase tracking-wider;
}

.zatca-compliance {
	@apply mt-2 sm:mt-2 flex items-center gap-2 text-[8px] sm:text-xs text-indigo-600;
}

.zatca-status-active {
	@apply flex items-center gap-2 px-2 py-1 rounded bg-indigo-500/20 text-indigo-100 text-[9px] sm:text-xs;
}

.zatca-status-expired {
	@apply flex items-center gap-2 px-2 py-1 rounded bg-red-500/20 text-red-100 text-[9px] sm:text-xs;
}
</style>