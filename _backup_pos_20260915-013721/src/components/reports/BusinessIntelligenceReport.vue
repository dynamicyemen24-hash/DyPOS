<template>
	<div>
		<ReportHeader v-if="enableZATCA" :enableZATCA="enableZATCA" />
		<div class="analysis-container p-4">
		<h2 class="text-xl font-bold text-gray-800 mb-4">
			{{ __("Business Intelligence Analysis") }}
		</h2>

		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
			<!-- Performance Score Card -->
			<div
				class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-indigo-500 hover:border-indigo-600 transition-colors"
			>
				<div class="flex items-start justify-between">
					<div>
						<p class="text-sm text-gray-500">{{ __("Performance Score") }}</p>
						<p
							class="text-3xl font-bold text-indigo-600"
							:v-html="performanceScore"
						></p>
						<p class="text-xs text-gray-400">{{ __("out of 100") }}</p>
					</div>
					<svg
						class="w-6 h-6 text-indigo-500"
						fill="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 7v6l4 4M5 7h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2m3 4H4a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2m7 7V3.086m7 15.914l-3-3m-3 3l3 3"
						/>
					</svg>
				</div>
			</div>

			<!-- Revenue Growth Card -->
			<div
				class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500 hover:border-green-600 transition-colors"
			>
				<div class="flex items-start justify-between">
					<div>
						<p class="text-sm text-gray-500">{{ __("Revenue Growth") }}</p>
						<p
							class="text-2xl font-bold text-green-600"
							:v-html="revenueGrowth"
						></p>
						<p class="text-xs text-gray-400">{{ __("vs last period") }}</p>
					</div>
					<svg
						class="w-6 h-6 text-green-500"
						fill="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 7v6l4 4M5 7h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2m3 4H4a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2m7 7V3.086m7 15.914l-3-3m-3 3l3 3"
						/>
					</svg>
				</div>
			</div>

			<!-- Customer Retention Card -->
			<div
				class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-purple-500 hover:border-purple-600 transition-colors"
			>
				<div class="flex items-start justify-between">
					<div>
						<p class="text-sm text-gray-500">{{ __("Customer Retention") }}</p>
						<p
							class="text-2xl font-bold text-purple-600"
							:v-html="customerRetention"
						></p>
						<p class="text-xs text-gray-400">{{ __("% returning customers") }}</p>
					</div>
					<svg
						class="w-6 h-6 text-purple-500"
						fill="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 7v6l4 4M5 7h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2-2m3 4H4a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2m7 7V3.086m7 15.914l-3-3m-3 3l3 3"
						/>
					</svg>
				</div>
			</div>
		</div>

		<!-- Key Metrics Row -->
		<div class="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
			<!-- Sales per Transaction -->
			<div
				class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-indigo-500 hover:border-indigo-600 transition-colors"
			>
				<div class="p-3">
					<p class="text-xs text-gray-500">{{ __("Sales per Transaction") }}</p>
					<p
						class="text-2xl font-bold text-indigo-600"
						:v-html="salesPerTransaction"
					></p>
				</div>
			</div>

			<!-- Items per Order -->
			<div
				class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500 hover:border-green-600 transition-colors"
			>
				<div class="p-3">
					<p class="text-xs text-gray-500">{{ __("Items per Order") }}</p>
					<p
						class="text-2xl font-bold text-green-600"
						:v-html="itemsPerOrder"
					></p>
				</div>
			</div>

			<!-- Discount Applied -->
			<div
				class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-orange-500 hover:border-orange-600 transition-colors"
			>
				<div class="p-3">
					<p class="text-xs text-gray-500">{{ __("Discount Applied") }}</p>
					<p
						class="text-2xl font-bold text-orange-600"
						:v-html="discountApplied"
					></p>
				</div>
			</div>

			<!-- Refund Rate -->
			<div
				class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-500 hover:border-red-600 transition-colors"
			>
				<div class="p-3">
					<p class="text-xs text-gray-500">{{ __("Refund Rate") }}</p>
					<p
						class="text-2xl font-bold text-red-600"
						:v-html="refundRate"
					></p>
				</div>
			</div>
		</div>

		<!-- Detailed Analysis Section -->
		<div class="mt-8">
			<h3 class="text-font-semibold text-gray-700 mb-4">
				{{ __("Detailed Analysis") }}
			</h3>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<!-- Revenue by Hour -->
				<div class="bg-white rounded-lg shadow-sm p-4">
					<h4 class="text-sm font-medium text-gray-700 mb-3">
						{{ __("Revenue by Hour") }}
					</h4>
					<div class="overflow-x-auto">
						<table class="min-w-full">
							<thead>
								<tr class="bg-gray-50">
									<th class="px-3 py-2 text-xs font-medium text-gray-500">
										{{ __("Hour") }}
									</th>
									<th class="px-3 py-2 text-xs font-medium text-gray-500">
										{{ __("Revenue") }}
									</th>
									<th class="px-3 py-2 text-xs font-medium text-gray-500">
										{{ __("Transactions") }
									</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="hour in hourlyRevenue" :key="hour.hour">
									<td class="px-3 py-2 text-sm text-gray-500">{{ hour.hour }}:00</td>
									<td class="px-3 py-2 text-sm font-medium text-gray-900">
										{{ formatCurrency(hour.revenue) }}
									</td>
									<td class="px-3 py-2 text-sm text-gray-500">{{ hour.transactions }} {{ __("tx") }}</td>
								</tr>
								<tr>
									<td class="px-3 py-2 text-right font-medium text-gray-900">{{ __("Total") }}</td>
									<td class="px-3 py-2 text-sm font-medium text-gray-900">
										{{ formatCurrency(hourlyRevenue.reduce((sum, h) => sum + h.revenue, 0)) }}
									</td>
									<td class="px-3 py-2 text-sm font-medium text-gray-900">
										{{ hourlyRevenue.reduce((sum, h) => sum + h.transactions, 0) }}
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>

				<!-- Top Customers -->
				<div class="bg-white rounded-lg shadow-sm p-4">
					<h4 class="text-sm font-medium text-gray-700 mb-3">
						{{ __("Top Customers") }}
					</h4>
					<div class="overflow-x-auto">
						<table class="min-w-full">
							<thead>
								<tr class="bg-gray-50">
									<th class="px-3 py-2 text-xs font-medium text-gray-500">
										{{ __("Customer") }}
									</th>
									<th class="px-3 py-2 text-xs font-medium text-gray-500">
										{{ __("Purchases") }}
									</th>
									<th class="px-3 py-2 text-xs font-medium text-gray-500">
										{{ __("Total Spent") }}
									</th>
								</tr>
							</thead>
							<tbody>
								<tr v-for="(customer, index) in topCustomers" :key="index">
									<td class="px-3 py-2 text-sm font-medium text-gray-900">
										{{ customer.name }}
									</td>
									<td class="px-3 py-2 text-sm text-gray-500">{{ customer.count }} {{ __("orders") }}</td>
									<td class="px-3 py-2 text-sm font-medium text-gray-900">
										{{ formatCurrency(customer.totalSpent) }}
									</td>
								</tr>
								<tr>
									<td class="px-3 py-2 text-right font-medium text-gray-900">{{ __("Total") }}</td>
									<td class="px-3 py-2 text-sm text-gray-500"></td>
									<td class="px-3 py-2 text-sm font-medium text-gray-900"></td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>

		<!-- Insights and Recommendations -->
		<div class="mt-8 p-4 bg-gradient-to-b from-indigo-50 to-indigo-50 rounded-lg">
			<h3 class="text-font-semibold text-gray-800 mb-3">
				{{ __("Key Insights") }}
			</h3>
			<ul class="list-disc list-inside space-y-2 text-gray-700">
				<li
					v-for="insight in insights"
					:key="insight.id"
					class="flex items-start"
				>
					<svg
						class="flex-sr-1 text-indigo-500 shrink-0"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
						/>
					</svg>
					<span>{{ insight.text }}</span>
				</li>
			</ul>
		</div>
	</div>
</template>

<script setup>
import { ref, computed } from "vue"
import { usePOSUIStore } from "@/stores/posUI"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { useHelpers } from "@/utils/helpers"
import { useToast } from "@/composables/useToast"
import ReportHeader from "@/components/headers/ZATCAHeader.vue"

const { formatCurrency, calculatePercentage } = useHelpers()
const uiStore = usePOSUIStore()
const cartStore = usePOSCartStore()
const toast = useToast()
const posSettingsStore = usePOSSettingsStore()

const enableZATCA = computed(() => posSettingsStore.enableZATCA)

// State
const performanceScore = ref("78")
const revenueGrowth = ref("+12.5%")
const customerRetention = ref("+8.3%")
const salesPerTransaction = ref("+$45.20")
const itemsPerOrder = ref("+2.3")
const discountApplied = ref("+$340.50")
const refundRate = ref("+1.2%")
const hourlyRevenue = ref([
	{ hour: "9", revenue: 240, transactions: 12 },
	{ hour: "10", revenue: 310, transactions: 15 },
	{ hour: "11", revenue: 380, transactions: 18 },
	{ hour: "12", revenue: 420, transactions: 20 },
	{ hour: "13", revenue: 390, transactions: 19 },
	{ hour: "14", revenue: 410, transactions: 21 },
	{ hour: "15", revenue: 430, transactions: 22 },
	{ hour: "16", revenue: 400, transactions: 20 },
	{ hour: "17", revenue: 450, transactions: 23 },
	{ hour: "18", revenue: 380, transactions: 19 },
])

const topCustomers = ref([
	{ name: "John Doe", count: 24, totalSpent: 3450 },
	{ name: "Jane Smith", count: 18, totalSpent: 2890 },
	{ name: "Robert Johnson", count: 15, totalSpent: 2150 },
	{ name: "Maria Garcia", count: 12, totalSpent: 1780 },
])

const insights = ref([
	{ id: 1, text: "{{ __('Sales increased by 15% this quarter') }}" },
	{ id: 2, text: "{{ __('Customer retention improved by 8%') }}" },
	{ id: 3, text: "{{ __('Top performing hour is 17:00 with $450 revenue') }}" },
	{ id: 4, text: "{{ __('Most popular payment method is Cash at 35%)'}}" },
])
</script>

<style scoped>
.analysis-container {
	max-width: 1400px;
	margin: 0 auto;
}

@media (max-width: 768px) {
	.analysis-container {
		padding: 20px;
	}
}
</style>