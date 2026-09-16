<template>
	<div>
		<ReportHeader v-if="enableZATCA" :enableZATCA="enableZATCA" />
		<div class="report-container p-4">
		<h2 class="text-xl font-bold text-gray-800 mb-4">
			{{ __("Sales Summary Report") }}
		</h2>

		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
			<!-- Total Sales Card -->
			<div
				class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-indigo-500 hover:border-indigo-600 transition-colors"
			>
				<div class="flex items-start justify-between">
					<div>
						<p class="text-sm text-gray-500">{{ __("Total Sales") }}</p>
						<p
							class="text-2xl font-bold text-indigo-600"
							:v-html="formatCurrency(totalSales)"
						></p>
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
							d="M12 7v6l4 4M4 7h16M4 7h16l-7 7-3-3M7 7l5 5"
						/>
					</svg>
				</div>
			</div>

			<!-- Today's Sales Card -->
			<div
				class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500 hover:border-green-600 transition-colors"
			>
				<div class="flex items-start justify-between">
					<div>
						<p class="text-sm text-gray-500">{{ __("Today's Sales") }}</p>
						<p
							class="text-2xl font-bold text-green-600"
							:v-html="formatCurrency(todaySales)"
						></p>
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
							d="M12 7v6l4 4M4 7h16M4 7h16l-7 7-3-3M7 7l5 5"
						/>
					</svg>
				</div>
			</div>

			<!-- Average Ticket Card -->
			<div
				class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-purple-500 hover:border-purple-600 transition-colors"
			>
				<div class="flex items-start justify-between">
					<div>
						<p class="text-sm text-gray-500">{{ __("Average Ticket") }}</p>
						<p
							class="text-2xl font-bold text-purple-600"
							:v-html="formatCurrency(averageTicket)"
						></p>
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
							d="M12 7v6l4 4M4 7h16M4 7h16l-7 7-3-3M7 7l5 5"
						/>
					</svg>
				</div>
			</div>
		</div>

		<!-- Sales Trends Section -->
		<div class="mt-6">
			<h3 class="text-font-semibold text-gray-700 mb-3">
				{{ __("Sales Trends") }}
			</h3>

			<div class="overflow-x-auto">
				<table class="min-w-full rounded-lg shadow-sm">
					<thead>
						<tr class="bg-gray-50">
							<th
								class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider"
							>
								{{ __("Date") }}
							</th>
							<th
								class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider"
							>
								{{ __("Total Sales") }}
							</th>
							<th
								class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider"
							>
								{{ __("Transactions") }}
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="(sale, index) in salesData"
							:key="index"
							class="border-b hover:bg-gray-50"
						>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm font-medium text-gray-900">{{ sale.date }}</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-500">{{ formatCurrency(sale.total) }}</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-500">{{ sale.count }} {{ __("invoices") }}</div>
							</td>
						</tr>
						<tr>
							<td class="px-6 py-4" colspan="3">
								<div class="text-right">
									<div class="text-sm font-medium text-gray-900">{{ __("Total") }}</div>
									<div class="text-sm text-gray-500">
										{{ formatCurrency(salesData.reduce((sum, s) => sum + s.total, 0)) }}
									</div>
								</div>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>

		<!-- Payment Methods Distribution -->
		<div class="mt-6">
			<h3 class="text-font-semibold text-gray-700 mb-3">
				{{ __("Payment Methods Distribution") }}
			</h3>

			<div class="grid grid-cols-2 gap-2">
				<button
					v-for="(method, index) in paymentMethods"
					:key="index"
					class="flex items-center justify-between px-3 py-2 rounded-lg border hover:border-gray-300 transition-colors"
					:style="{
						background: method.percentage > 20 ? 'rgba(59, 130, 246, 0.1)' : 'rgba(100, 100, 100, 0.05)',
						borderColor: method.percentage > 20 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(100, 100, 100, 0.2)',
					}"
				>
					<div class="flex items-center gap-2">
						<svg
							class="w-4 h-4 text-gray-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 7v6l4 4M5 7h1a3 3 0 013 3v3a3 3 0 01-3-3H5a3 3 0 01-3-3v-3a3 3 0 013-3zm4 0h6m0 0H7m4 0h6m-6 0a3 3 0 013 3v3a3 3 0 01-3-3H5a3 3 0 01-3-3v-3a3 3 0 013-3z"
							/>
						</svg>
						<span class="ms-2 text-sm text-gray-700">{{ method.name }}</span>
					</div>
					<div class="text-right">
						<span class="text-xs text-gray-500">{{ method.count }} {{ __("sales") }}</span>
						<span
							class="text-xs font-medium text-gray-400"
							:title="__('{0}%', [method.percentage])"
						>
							{{ method.percentage.toFixed(1) }}%
						</span>
					</div>
				</button>
			</div>

			<div
				class="mt-3 text-xs text-gray-500"
				:title="__('Total transactions: {0}', [totalTransactions])"
			>
				{{ __("of {0} total transactions", [totalTransactions]) }}
			</div>
		</div>

		<!-- Top Items Section -->
		<div class="mt-6">
			<h3 class="text-font-semibold text-gray-700 mb-3">
				{{ __("Top Selling Items") }}
			</h3>

			<div class="overflow-x-auto">
				<table class="min-w-full rounded-lg shadow-sm">
					<thead>
						<tr class="bg-gray-50">
							<th
								class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider"
							>
								{{ __("Item") }}
							</th>
							<th
								class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider"
							>
								{{ __("Quantity") }}
							</th>
							<th
								class="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider"
							>
								{{ __("Revenue") }}
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="(item, index) in topItems"
							:key="index"
							class="border-b hover:bg-gray-50"
						>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm font-medium text-gray-900">{{ item.name }}</div>
								<div class="text-xs text-gray-500">{{ item.code }}</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-500">{{ item.quantity }}</div>
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								<div class="text-sm text-gray-500">{{ formatCurrency(item.revenue) }}</div>
							</td>
						</tr>
						<tr>
							<td class="px-6 py-4" colspan="3">
								<div class="text-right">
									<div class="text-sm font-medium text-gray-900">{{ __("Total") }}</div>
								</div>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, onMounted, watch } from "vue"
import { usePOSUIStore } from "@/stores/posUI"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSShiftStore } from "@/stores/posShift"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { useHelpers } from "@/utils/helpers"
import ReportHeader from "@/components/headers/ZATCAHeader.vue"

const { formatCurrency, calculateTotals, isValidNumber } = useHelpers()
const uiStore = usePOSUIStore()
const cartStore = usePOSCartStore()
const shiftStore = usePOSShiftStore()
const posSettingsStore = usePOSSettingsStore()

const enableZATCA = computed(() => posSettingsStore.enableZATCA)

// Initial data - in production this would come from API
const totalSales = ref(0)
const todaySales = ref(0)
const averageTicket = ref(0)
const salesData = ref([])
const topItems = ref([])
const paymentMethods = ref([])
const totalTransactions = ref(0)

onMounted(async () => {
	// Load sales data from POS cart and shift store
	// In production, this would fetch from backend API
	loadSalesData()
})

function loadSalesData() {
	// Calculate from current shift data
	const items = cartStore.invoiceItems || []
	const subtotal = items.reduce(
		(sum, item) => sum + item.rate * (item.quantity || 1),
		0,
	)

	totalSales.value = subtotal
	todaySales.value = subtotal // Simplified - would calculate from shift data
	averageTicket.value =
		totalTransactions.value > 0 ? todaySales.value / totalTransactions.value : 0

	// Sample sales data for demonstration
	salesData.value = [
		{ date: "Today", total: todaySales.value, count: totalTransactions.value },
		{
			date: "Yesterday",
			total: todaySales.value * 0.8,
			count: Math.floor(totalTransactions.value * 0.8),
		},
		{
			date: "2 Days Ago",
			total: todaySales.value * 0.6,
			count: Math.floor(totalTransactions.value * 0.6),
		},
		{
			date: "3 Days Ago",
			total: todaySales.value * 0.4,
			count: Math.floor(totalTransactions.value * 0.4),
		},
		{
			date: "4 Days Ago",
			total: todaySales.value * 0.2,
			count: Math.floor(totalTransactions.value * 0.2),
		},
	]

	// Top selling items
	topItems.value = [
		{ name: "Item A", code: "ITEM-001", quantity: 45, revenue: 4500 },
		{ name: "Item B", code: "ITEM-002", quantity: 32, revenue: 3200 },
		{ name: "Item C", code: "ITEM-003", quantity: 28, revenue: 2800 },
		{ name: "Item D", code: "ITEM-004", quantity: 22, revenue: 2200 },
		{ name: "Item E", code: "ITEM-005", quantity: 18, revenue: 1800 },
	]

	// Payment methods distribution
	paymentMethods.value = [
		{ name: "Cash", count: 67, percentage: 35.5 },
		{ name: "Card", count: 52, percentage: 27.3 },
		{ name: "Mobile", count: 38, percentage: 19.9 },
		{ name: "Wallet", count: 21, percentage: 11.2 },
		{ name: "Credit", count: 15, percentage: 6.1 },
	]

	totalTransactions.value = 193
}
</script>

<style scoped>
.report-container {
	max-width: 1400px;
	margin: 0 auto;
}

@media (max-width: 768px) {
	.report-container {
		padding: 20px;
	}
}
</style>