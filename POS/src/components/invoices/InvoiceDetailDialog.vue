<template>
	<Dialog v-model="show" :options="{ title: __('Invoice Details'), size: '5xl' }">
		<template #body-content>
			<div v-if="loading" class="text-center py-12">
				<div
					class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto"
				></div>
				<p class="mt-3 text-sm text-gray-500">{{ __("Loading invoice details...") }}</p>
			</div>

			<div v-else-if="invoiceData" class="flex flex-col gap-6">
				<!-- Invoice Header -->
				<div
					class="bg-gradient-to-r from-indigo-50 to-indigo-50 rounded-lg p-4 md:p-5 border border-indigo-100"
				>
					<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
						<div class="flex-1">
							<div class="flex items-center gap-3 mb-2 flex-wrap">
								<h3 class="text-lg md:text-xl font-bold text-gray-900">
									{{ invoiceData.name }}
								</h3>
								<span
									v-if="invoiceData.is_return"
									class="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800"
								>
									{{ __("Return Invoice") }}
								</span>
								<span
									v-else
									:class="[
										'px-3 py-1 text-xs font-semibold rounded-full',
										getInvoiceStatusColor(invoiceData),
									]"
								>
									{{ __(invoiceData.status) }}
								</span>
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
								<div class="text-start">
									<span class="text-gray-600">{{ __("Customer:") }}</span>
									<span class="ms-2 font-semibold text-gray-900">{{
										invoiceData.customer_name || invoiceData.customer
									}}</span>
								</div>
								<div class="text-start">
									<span class="text-gray-600">{{ __("Date:") }}</span>
									<span class="ms-2 font-medium text-gray-900"
										>{{ formatDate(invoiceData.posting_date) }}
										{{ formatTime(invoiceData.posting_time) }}</span
									>
								</div>
								<div v-if="invoiceData.return_against" class="text-start">
									<span class="text-gray-600">{{ __("Return Against:") }}</span>
									<span class="ms-2 font-medium text-gray-900">{{
										invoiceData.return_against
									}}</span>
								</div>
							</div>
						</div>
						<div class="text-start sm:text-end">
							<div class="text-xs text-gray-500 mb-1">{{ __("Grand Total") }}</div>
							<div class="text-xl md:text-2xl font-bold text-indigo-600">
								{{ formatCurrency(invoiceData.grand_total) }}
							</div>
						</div>
					</div>
				</div>

				<!-- Return Type Notice: Added to Customer Credit (no payments, negative outstanding) -->
				<div
					v-if="invoiceData.is_return && isAddedToCustomerCredit"
					class="bg-gradient-to-r rtl:bg-gradient-to-l from-indigo-50 to-indigo-50 rounded-lg p-4 border border-indigo-200"
				>
					<div class="flex items-start gap-3">
						<div
							class="w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center flex-shrink-0"
						>
							<svg
								class="w-4 h-4 text-indigo-700"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
								/>
							</svg>
						</div>
						<div class="text-start flex-1">
							<h4 class="text-sm font-semibold text-indigo-900">
								{{ __("Added to Customer Credit") }}
							</h4>
							<p class="text-xs text-indigo-700 mt-1">
								{{
									__(
										"The return amount was added to the customer credit balance. No cash refund was given.",
									)
								}}
							</p>
						</div>
					</div>
				</div>

				<!-- Return Type Notice: Cash Refund (has payments) -->
				<div
					v-else-if="invoiceData.is_return && isCashRefund"
					class="bg-gradient-to-r rtl:bg-gradient-to-l from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200"
				>
					<div class="flex items-start gap-3">
						<div
							class="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center flex-shrink-0"
						>
							<svg
								class="w-4 h-4 text-green-700"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
								/>
							</svg>
						</div>
						<div class="text-start flex-1">
							<h4 class="text-sm font-semibold text-green-900">
								{{ __("Cash Refund") }}
							</h4>
							<p class="text-xs text-green-700 mt-1">
								{{ __("The customer received a cash refund for this return.") }}
							</p>
						</div>
					</div>
				</div>

				<!-- Pay on Account Notice (for original credit sales) -->
				<div
					v-else-if="!invoiceData.is_return && isCreditSale"
					class="bg-gradient-to-r rtl:bg-gradient-to-l from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-200"
				>
					<div class="flex items-start gap-3">
						<div
							class="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0"
						>
							<svg
								class="w-4 h-4 text-amber-700"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
						</div>
						<div class="text-start flex-1">
							<h4 class="text-sm font-semibold text-amber-900">
								{{ __("Pay on Account") }}
							</h4>
							<p class="text-xs text-amber-700 mt-1">
								{{
									__(
										"This invoice was sold on credit. The customer owes the full amount.",
									)
								}}
							</p>
						</div>
					</div>
				</div>

				<!-- Items Section -->
				<div>
					<h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center">
						<svg
							class="w-4 h-4 me-2"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 6h16M4 12h16M4 18h16"
							/>
						</svg>
						{{ __("Items") }}
					</h4>
					<!-- Mobile Cards View -->
					<div class="md:hidden flex flex-col gap-3">
						<div
							v-for="(item, idx) in invoiceData.items"
							:key="idx"
							class="bg-white border border-gray-200 rounded-lg p-3"
						>
							<!-- Item Name & Amount Row -->
							<div class="flex items-center justify-between gap-3 mb-2">
								<div class="flex-1 min-w-0 text-center">
									<div class="text-sm font-semibold text-gray-900">
										{{ item.item_name }}
									</div>
									<div class="text-xs text-gray-500">{{ item.item_code }}</div>
								</div>
							</div>
							<!-- Details Grid -->
							<div
								class="grid grid-cols-3 gap-2 text-center border-t border-gray-100 pt-2"
							>
								<div>
									<div class="text-xs text-gray-500">{{ __("Qty") }}</div>
									<div class="text-sm font-medium text-gray-900">
										{{ item.quantity }}
									</div>
								</div>
								<div>
									<div class="text-xs text-gray-500">{{ __("Rate") }}</div>
									<div class="text-sm font-medium text-gray-900">
										{{ formatCurrency(item.rate) }}
									</div>
								</div>
								<div>
									<div class="text-xs text-gray-500">{{ __("Amount") }}</div>
									<div class="text-sm font-semibold text-gray-900">
										{{ formatCurrency(item.amount) }}
									</div>
								</div>
							</div>
							<!-- Discount Row (if applicable) -->
							<div
								v-if="item.discount_percentage"
								class="text-center text-xs text-orange-600 mt-2 pt-2 border-t border-gray-100"
							>
								{{ __("Discount:") }} {{ item.discount_percentage }}%
							</div>
						</div>
					</div>
					<!-- Desktop Table View -->
					<div class="hidden md:block border border-gray-200 rounded-lg overflow-hidden">
						<table class="min-w-full divide-y divide-gray-200">
							<thead class="bg-gray-50">
								<tr>
									<th
										class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider"
									>
										{{ __("Item") }}
									</th>
									<th
										class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider"
									>
										{{ __("Qty") }}
									</th>
									<th
										class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider"
									>
										{{ __("Rate") }}
									</th>
									<th
										class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider"
									>
										{{ __("Discount") }}
									</th>
									<th
										class="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider"
									>
										{{ __("Amount") }}
									</th>
								</tr>
							</thead>
							<tbody class="bg-white divide-y divide-gray-200">
								<tr
									v-for="(item, idx) in invoiceData.items"
									:key="idx"
									class="hover:bg-gray-50"
								>
									<td class="px-4 py-3 text-center">
										<div class="text-sm font-medium text-gray-900">
											{{ item.item_name }}
										</div>
										<div class="text-xs text-gray-500">
											{{ item.item_code }}
										</div>
									</td>
									<td class="px-4 py-3 text-center text-sm text-gray-900">
										{{ item.quantity }}
									</td>
									<td class="px-4 py-3 text-center text-sm text-gray-900">
										{{ formatCurrency(item.rate) }}
									</td>
									<td class="px-4 py-3 text-center text-sm text-gray-600">
										{{
											item.discount_percentage
												? `${item.discount_percentage}%`
												: "-"
										}}
									</td>
									<td
										class="px-4 py-3 text-center text-sm font-semibold text-gray-900"
									>
										{{ formatCurrency(item.amount) }}
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</div>

				<!-- Totals Section -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
					<!-- Payment Info -->
					<div v-if="invoiceData.payments && invoiceData.payments.length > 0">
						<h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center">
							<svg
								class="w-4 h-4 me-2"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
								/>
							</svg>
							{{ __("Payments") }}
						</h4>
						<div class="flex flex-col gap-2">
							<div
								v-for="(payment, idx) in invoiceData.payments"
								:key="idx"
								class="flex justify-between items-center p-3 bg-green-50 border border-green-200 rounded-lg"
							>
								<div class="text-start">
									<div class="text-sm font-medium text-gray-900">
										{{ payment.mode_of_payment }}
									</div>
									<div v-if="payment.account" class="text-xs text-gray-500">
										{{ payment.account }}
									</div>
								</div>
								<div class="text-sm font-semibold text-green-700">
									{{ formatCurrency(payment.amount) }}
								</div>
							</div>
						</div>
					</div>

					<!-- Summary -->
					<div>
						<h4 class="text-sm font-semibold text-gray-700 mb-3 text-start">
							{{ __("Summary") }}
						</h4>
						<div
							class="flex flex-col gap-2 bg-gray-50 p-4 rounded-lg border border-gray-200"
						>
							<div class="flex justify-between text-sm">
								<span class="text-gray-600">{{ __("Net Total:") }}</span>
								<span class="font-medium text-gray-900">{{
									formatCurrency(invoiceData.net_total || invoiceData.total)
								}}</span>
							</div>
							<div
								v-if="invoiceData.total_taxes_and_charges"
								class="flex justify-between text-sm"
							>
								<span class="text-gray-600">{{ __("Taxes:") }}</span>
								<span class="font-medium text-gray-900">{{
									formatCurrency(invoiceData.total_taxes_and_charges)
								}}</span>
							</div>
							<div
								v-if="invoiceData.discount_amount"
								class="flex justify-between text-sm"
							>
								<span class="text-gray-600">{{ __("Discount:") }}</span>
								<span class="font-medium text-red-600"
									>-{{ formatCurrency(invoiceData.discount_amount) }}</span
								>
							</div>
							<div class="pt-2 border-t border-gray-300 flex justify-between">
								<span class="font-semibold text-gray-900">{{
									__("Grand Total:")
								}}</span>
								<span class="font-bold text-lg text-indigo-600">{{
									formatCurrency(invoiceData.grand_total)
								}}</span>
							</div>
							<div
								v-if="invoiceData.paid_amount"
								class="flex justify-between text-sm"
							>
								<span class="text-gray-600">{{ __("Paid Amount:") }}</span>
								<span class="font-semibold text-green-600">{{
									formatCurrency(invoiceData.paid_amount)
								}}</span>
							</div>
							<!-- For return invoices with negative outstanding (credit to customer) -->
							<div
								v-if="invoiceData.is_return && invoiceData.outstanding_amount < 0"
								class="flex justify-between text-sm"
							>
								<span class="text-gray-600">{{ __("Customer Credit:") }}</span>
								<span class="font-semibold text-indigo-600">{{
									formatCurrency(Math.abs(invoiceData.outstanding_amount))
								}}</span>
							</div>
							<!-- For regular invoices with outstanding (customer owes) -->
							<div
								v-else-if="
									invoiceData.outstanding_amount &&
									invoiceData.outstanding_amount > 0
								"
								class="flex justify-between text-sm"
							>
								<span class="text-gray-600">{{ __("Outstanding:") }}</span>
								<span class="font-semibold text-orange-600">{{
									formatCurrency(invoiceData.outstanding_amount)
								}}</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Additional Info -->
				<div
					v-if="invoiceData.remarks"
					class="bg-gray-50 p-4 rounded-lg border border-gray-200"
				>
					<h4 class="text-sm font-semibold text-gray-700 mb-2 text-start">
						{{ __("Remarks") }}
					</h4>
					<p class="text-sm text-gray-600 text-start">{{ invoiceData.remarks }}</p>
				</div>
			</div>

			<div v-else class="text-center py-12">
				<svg
					class="mx-auto h-12 w-12 text-gray-400"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<p class="mt-2 text-sm text-gray-500">
					{{ __("Failed to load invoice details") }}
				</p>
			</div>
		</template>
		<template #actions>
			<div class="flex justify-between items-center w-full">
				<Button variant="subtle" @click="show = false">
					{{ __("Close") }}
				</Button>
				<div class="flex items-center gap-2">
					<!-- Send receipt (native share + fallback deep-links menu) -->
					<div ref="shareMenuRef" class="relative">
						<Button @click="handleShare">
							<template #prefix>
								<svg
									class="w-4 h-4"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
									/>
								</svg>
							</template>
							{{ __("Send") }}
						</Button>

						<div
							v-if="showShareMenu"
							@click.stop
							class="absolute bottom-full end-0 mb-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-[9999] overflow-hidden"
						>
							<a
								v-if="sendLinks.whatsapp"
								:href="sendLinks.whatsapp"
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
							>
								<svg
									class="w-5 h-5 text-green-600 flex-shrink-0"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 004.74 1.21c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.86 9.86 0 0012.04 2zm5.83 14.12c-.25.7-1.45 1.34-1.99 1.39-.54.05-1.05.24-3.54-.73-3-1.18-4.89-4.26-5.04-4.46-.15-.2-1.2-1.6-1.2-3.05 0-1.45.76-2.16 1.03-2.46.27-.3.59-.37.79-.37l.57.01c.18.01.42-.07.66.5.25.6.84 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.29.5l-.44.51c-.14.15-.29.31-.12.61.16.3.73 1.21 1.57 1.96 1.08.96 1.99 1.26 2.27 1.4.28.14.44.12.61-.07.16-.19.7-.81.88-1.09.18-.28.37-.23.61-.14.25.09 1.6.75 1.87.89.28.14.46.2.53.32.07.11.07.67-.17 1.36z"
									/>
								</svg>
								<span>WhatsApp</span>
							</a>
							<a
								v-if="sendLinks.mailto"
								:href="sendLinks.mailto"
								class="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
							>
								<svg
									class="w-5 h-5 text-indigo-600 flex-shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
									/>
								</svg>
								<span>{{ __("Email") }}</span>
							</a>
							<a
								v-if="sendLinks.sms"
								:href="sendLinks.sms"
								class="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
							>
								<svg
									class="w-5 h-5 text-indigo-600 flex-shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
									/>
								</svg>
								<span>{{ __("SMS") }}</span>
							</a>
							<button
								type="button"
								@click="copyReceiptSummary"
								class="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-start"
							>
								<svg
									class="w-5 h-5 text-gray-600 flex-shrink-0"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
									/>
								</svg>
								<span>{{ __("Copy summary") }}</span>
							</button>
							<div
								v-if="!hasSendLinks && !canShareNative"
								class="px-3 py-2.5 border-t border-gray-100 text-xs text-gray-500 text-start"
							>
								{{ __("Add a phone or email to the customer to enable sending.") }}
							</div>
						</div>
					</div>

					<Button @click="handlePrint">
						<template #prefix>
							<svg
								class="w-4 h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
								/>
							</svg>
						</template>
						{{ __("Print") }}
					</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { useFormatters } from "@/composables/useFormatters"
import {
	DEFAULT_CURRENCY,
	formatCurrency as formatCurrencyUtil,
} from "@/utils/currency"
import { getInvoiceStatusColor } from "@/utils/invoice"
import { logger } from "@/utils/logger"
import {
	hydrateLocalOnlyInvoice,
	isLocalOnlyInvoiceName,
} from "@/utils/printInvoice"
import {
	buildReceiptSummary,
	buildSendLinks,
	shareReceipt,
	canWebShare,
} from "@/utils/sendReceipt"
import { useLocale } from "@/composables/useLocale"
import { useToast } from "@/composables/useToast"
import { Button, Dialog, call } from "frappe-ui"
import { ref, watch, nextTick, computed, onUnmounted } from "vue"

const log = logger.create("InvoiceDetailDialog")
const { formatDate, formatTime } = useFormatters()
const { locale } = useLocale()
const { showInfo, showError } = useToast()

const props = defineProps({
	modelValue: Boolean,
	invoiceName: String,
	posProfile: String,
	currency: {
		type: String,
		default: DEFAULT_CURRENCY,
	},
})

function formatCurrency(amount) {
	return formatCurrencyUtil(Number.parseFloat(amount || 0), props.currency)
}

const emit = defineEmits(["update:modelValue", "print-invoice"])

const show = ref(props.modelValue)
const loading = ref(false)
const invoiceData = ref(null)

// Computed: Check if this is a credit sale (Pay on Account - no payments, full outstanding)
const isCreditSale = computed(() => {
	if (!invoiceData.value) return false
	const hasNoPayments =
		!invoiceData.value.payments || invoiceData.value.payments.length === 0
	const totalPaid =
		invoiceData.value.payments?.reduce(
			(sum, p) => sum + Math.abs(p.amount || 0),
			0,
		) || 0
	const grandTotal = Math.abs(invoiceData.value.grand_total || 0)
	const outstanding = Math.abs(invoiceData.value.outstanding_amount || 0)
	// Credit sale if no payments and outstanding equals grand total
	return (
		hasNoPayments ||
		(totalPaid < 0.01 && Math.abs(outstanding - grandTotal) < 0.01)
	)
})

// Computed: Check if this return was added to customer credit (no payments, negative outstanding)
const isAddedToCustomerCredit = computed(() => {
	if (!invoiceData.value || !invoiceData.value.is_return) return false
	const hasNoPayments =
		!invoiceData.value.payments || invoiceData.value.payments.length === 0
	const totalPaid =
		invoiceData.value.payments?.reduce(
			(sum, p) => sum + Math.abs(p.amount || 0),
			0,
		) || 0
	const hasNegativeOutstanding = (invoiceData.value.outstanding_amount || 0) < 0
	// Added to customer credit if no payments AND outstanding is negative
	return (hasNoPayments || totalPaid < 0.01) && hasNegativeOutstanding
})

// Computed: Check if this return was a cash refund (has payments)
const isCashRefund = computed(() => {
	if (!invoiceData.value || !invoiceData.value.is_return) return false
	const totalPaid =
		invoiceData.value.payments?.reduce(
			(sum, p) => sum + Math.abs(p.amount || 0),
			0,
		) || 0
	// Cash refund if payments were made (refund given)
	return totalPaid >= 0.01
})

watch(
	() => props.modelValue,
	(val) => {
		show.value = val
		if (val && props.invoiceName) {
			loadInvoiceDetails()
		}
	},
)

watch(show, async (val) => {
	emit("update:modelValue", val)
	if (!val) {
		// Clear data when closing
		invoiceData.value = null
	} else {
		// Ensure dialog appears above other dialogs
		await nextTick()
		const dialogs = document.querySelectorAll(
			".modal-container, .modal-backdrop",
		)
		dialogs.forEach((dialog) => {
			const title = dialog.querySelector('[class*="title"]')
			if (title?.textContent?.includes("Invoice Details")) {
				dialog.style.zIndex = "400"
			}
		})
	}
})

async function loadInvoiceDetails() {
	if (!props.invoiceName) return

	loading.value = true
	try {
		if (isLocalOnlyInvoiceName(props.invoiceName)) {
			// Hydrate from sessionStorage first, fall back to IndexedDB so a
			// post-reload detail view still resolves offline receipts.
			const cached = await hydrateLocalOnlyInvoice({ name: props.invoiceName })
			if (cached?.items?.length > 0) {
				const result = JSON.parse(JSON.stringify(cached))
				result.items = result.items.map((item) => ({
					...item,
					quantity: item.quantity ?? item.qty,
				}))
				invoiceData.value = result
				return
			}
			invoiceData.value = null
			return
		}

		const result = await call("DyPOS.api.invoices.get_invoice", {
			invoice_name: props.invoiceName,
		})

		// Map server 'qty' to 'quantity' for internal consistency
		if (result?.items) {
			result.items = result.items.map((item) => ({
				...item,
				quantity: item.qty,
			}))
		}
		invoiceData.value = result
	} catch (error) {
		log.error("Error loading invoice details:", error)
		invoiceData.value = null
	} finally {
		loading.value = false
	}
}

// ------------------------------------------------------------------
// SEND / SHARE RECEIPT
// Native share sheet when available; otherwise a small menu with
// WhatsApp / Email / SMS deep-links plus copy-to-clipboard.
// ------------------------------------------------------------------
const showShareMenu = ref(false)
const shareMenuRef = ref(null)

function buildReceiptData() {
	return invoiceData.value || {}
}

const sendLinks = computed(() =>
	buildSendLinks(buildReceiptData(), {
		phone:
			invoiceData.value?.mobile_no ||
			invoiceData.value?.contact_phone ||
			invoiceData.value?.customer_phone ||
			"",
		email:
			invoiceData.value?.contact_email ||
			invoiceData.value?.customer_email ||
			"",
		locale: locale.value,
	}),
)

const hasSendLinks = computed(() =>
	Boolean(
		sendLinks.value.whatsapp || sendLinks.value.mailto || sendLinks.value.sms,
	),
)

const canShareNative = computed(() => canWebShare())

function handleMenuOutside(event) {
	if (shareMenuRef.value && !shareMenuRef.value.contains(event.target)) {
		closeShareMenu()
	}
}

function openShareMenu() {
	showShareMenu.value = true
	window.addEventListener("click", handleMenuOutside)
}

function closeShareMenu() {
	showShareMenu.value = false
	window.removeEventListener("click", handleMenuOutside)
}

onUnmounted(closeShareMenu)

async function handleShare() {
	if (!invoiceData.value) return
	await shareReceipt(buildReceiptData(), {
		title: __("Invoice {0}", [invoiceData.value.name]),
		locale: locale.value,
		onFallback: openShareMenu,
	})
}

async function copyReceiptSummary() {
	const text = buildReceiptSummary(buildReceiptData(), { locale: locale.value })
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text)
		} else {
			const textarea = document.createElement("textarea")
			textarea.value = text
			textarea.style.position = "fixed"
			textarea.style.opacity = "0"
			document.body.appendChild(textarea)
			textarea.select()
			document.execCommand("copy")
			document.body.removeChild(textarea)
		}
		showInfo(__("Receipt copied"))
	} catch {
		showError(__("Failed to copy"))
	} finally {
		closeShareMenu()
	}
}

function handlePrint() {
	if (!invoiceData.value) return
	emit("print-invoice", invoiceData.value)
}
</script>
