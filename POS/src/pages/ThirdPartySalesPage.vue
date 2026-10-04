<template>
	<WorkShell
		title="البيع بالنيابة"
		subtitle="سجل محلي آمن للمبيعات والعمولات وتسويات الملاك"
		:nav-items="navItems"
		:breadcrumbs="breadcrumbs"
		:loading="loading"
		:has-data="sales.length > 0"
		:error="loadError"
		@refresh="loadSales"
	>
		<div class="third-party-sales">
			<p class="third-party-sales__offline" role="status">
				البيع والحسابات محفوظة محليًا. لا تبدأ المزامنة إلا وفق إعدادات الربط.
			</p>

			<section class="third-party-sales__panel" aria-labelledby="sale-form-title">
				<div class="third-party-sales__heading">
					<div>
						<h2 id="sale-form-title">تسجيل عملية بيع</h2>
						<p>وثّق الأطراف والوزن والعمولة قبل حفظ العملية.</p>
					</div>
					<span class="third-party-sales__seller">البائع: {{ sellerName }}</span>
				</div>

				<form class="third-party-sales__form" @submit.prevent="submitSale">
					<label>
						<span>الصنف أو المحصول</span>
						<input v-model="draft.itemName" required maxlength="120" />
					</label>
					<label>
						<span>المشتري</span>
						<input v-model="draft.buyerName" required maxlength="120" />
					</label>
					<label>
						<span>المالك أو المورد</span>
						<input v-model="draft.ownerName" required maxlength="120" />
					</label>
					<label>
						<span>الوسيط (اختياري)</span>
						<input v-model="draft.intermediaryName" maxlength="120" />
					</label>
					<label>
						<span>الكمية / الوزن</span>
						<input
							v-model.number="draft.quantity"
							type="number"
							min="0.0001"
							step="0.0001"
							inputmode="decimal"
							required
						/>
						<!--
							The scale fills the quantity box above. Every rule about
							WHEN that happens lives in the HAL, not here: a second copy
							of "only write a settled weight" in each page is how two
							screens start disagreeing about what a weight means.
						-->
						<ScaleField
							:target="quantityField"
							:uom="uomField"
							unit="كجم"
							:settings="scaleSettings"
							label="ميزان"
						/>
					</label>
					<label>
						<span>الوحدة</span>
						<input v-model="draft.uom" required maxlength="24" />
					</label>
					<label>
						<span>سعر الوحدة</span>
						<input
							v-model.number="draft.unitPrice"
							type="number"
							min="0"
							step="0.01"
							inputmode="decimal"
							required
						/>
					</label>
					<label>
						<span>مكان البيع</span>
						<input v-model="draft.location" required maxlength="120" />
					</label>
					<label>
						<span>طريقة العمولة</span>
						<select v-model="draft.commissionMode">
							<option value="percent">نسبة من إجمالي البيع</option>
							<option value="fixed">مبلغ ثابت</option>
						</select>
					</label>
					<label v-if="draft.commissionMode === 'percent'">
						<span>نسبة العمولة ٪</span>
						<input
							v-model.number="draft.commissionRate"
							type="number"
							min="0"
							max="100"
							step="0.01"
							inputmode="decimal"
							required
						/>
					</label>
					<label v-else>
						<span>مبلغ العمولة</span>
						<input
							v-model.number="draft.commissionAmount"
							type="number"
							min="0"
							step="0.01"
							inputmode="decimal"
							required
						/>
					</label>
					<label>
						<span>المحصل من المشتري</span>
						<input
							v-model.number="draft.buyerPaid"
							type="number"
							min="0"
							step="0.01"
							inputmode="decimal"
							required
						/>
					</label>
					<label>
						<span>طريقة تحصيل المشتري</span>
						<select v-model="draft.buyerPaymentMethod">
							<option value="cash">نقدًا</option>
							<option value="transfer">تحويل</option>
							<option value="card">بطاقة</option>
							<option value="wallet">محفظة إلكترونية</option>
							<option value="credit">آجل</option>
						</select>
					</label>
					<label>
						<span>مرجع التحصيل</span>
						<input v-model="draft.buyerPaymentReference" maxlength="100" />
					</label>
					<label>
						<span>ملاحظات</span>
						<input v-model="draft.notes" maxlength="500" />
					</label>

					<div class="third-party-sales__summary" aria-live="polite">
						<template v-if="preview">
							<div><span>إجمالي البيع</span><strong>{{ money(preview.grossMinor) }}</strong></div>
							<div><span>العمولة</span><strong>{{ money(preview.commissionMinor) }}</strong></div>
							<div><span>صافي المالك</span><strong>{{ money(preview.ownerNetMinor) }}</strong></div>
							<div><span>المتبقي على المشتري</span><strong>{{ money(preview.buyerDueMinor) }}</strong></div>
						</template>
						<p v-else role="alert">{{ previewError }}</p>
					</div>

					<p v-if="actionError" class="third-party-sales__error" role="alert">
						{{ actionError }}
					</p>
					<div class="third-party-sales__actions">
						<ActionButton type="submit" size="lg" touch :loading="saving">
							حفظ البيع محليًا
						</ActionButton>
					</div>
				</form>
			</section>

			<section class="third-party-sales__panel" aria-labelledby="sales-list-title">
				<div class="third-party-sales__heading">
					<div>
						<h2 id="sales-list-title">عمليات البيع والتسوية</h2>
						<p>المصدر: قاعدة الجهاز المحلية</p>
					</div>
					<strong class="third-party-sales__count">{{ sales.length }} عملية</strong>
				</div>

				<div v-if="!sales.length && !loading" class="third-party-sales__empty">
					لا توجد عمليات مسجلة على هذا الجهاز بعد.
				</div>
				<div v-else class="third-party-sales__list">
					<article
						v-for="sale in sales"
						:key="sale.id"
						class="third-party-sales__sale"
					>
						<div class="third-party-sales__sale-head">
							<div>
								<strong>{{ sale.saleNo }}</strong>
								<span>{{ formatDate(sale.saleDate) }}</span>
							</div>
							<span :class="['third-party-sales__status', `is-${sale.status.toLowerCase()}`]">
								{{ statusLabel(sale.status) }}
							</span>
						</div>
						<div class="third-party-sales__sale-grid">
							<div><span>المحصول</span><strong>{{ sale.itemName }} · {{ sale.quantity }} {{ sale.uom }}</strong></div>
							<div><span>المشتري</span><strong>{{ sale.buyerName }}</strong></div>
							<div><span>المالك</span><strong>{{ sale.ownerName }}</strong></div>
							<div><span>الوسيط</span><strong>{{ sale.intermediaryName || "—" }}</strong></div>
							<div><span>الإجمالي / العمولة</span><strong>{{ money(sale.grossMinor) }} / {{ money(sale.commissionMinor) }}</strong></div>
							<div><span>المحصل من المشتري</span><strong>{{ money(sale.buyerPaidMinor) }} · {{ paymentLabel(sale.buyerPaymentMethod) }}</strong></div>
							<div><span>المتبقي للمالك</span><strong>{{ money(sale.ownerDueMinor) }}</strong></div>
							<div><span>المتبقي على المشتري</span><strong>{{ money(sale.buyerDueMinor) }}</strong></div>
							<div><span>المكان</span><strong>{{ sale.location }}</strong></div>
						</div>
						<div class="third-party-sales__sale-actions">
							<ActionButton
								v-if="sale.ownerDueMinor > 0"
								variant="outline"
								size="md"
								touch
								@click="openSettlement(sale)"
							>
								تسجيل تسوية للمالك
							</ActionButton>
							<span>المزامنة: {{ sale.syncStatus === "pending" ? "بانتظار الربط المعتمد" : "تمت" }}</span>
						</div>
						<form
							v-if="settlementTarget?.id === sale.id"
							class="third-party-sales__settlement"
							@submit.prevent="submitSettlement"
						>
							<label>
								<span>مبلغ التسوية</span>
								<input
									v-model.number="settlementDraft.amount"
									type="number"
									min="0.01"
									:max="sale.ownerDueMinor / 100"
									step="0.01"
									inputmode="decimal"
									required
								/>
							</label>
							<label>
								<span>طريقة الدفع</span>
								<select v-model="settlementDraft.method">
									<option value="cash">نقدًا</option>
									<option value="transfer">تحويل</option>
									<option value="card">بطاقة</option>
									<option value="wallet">محفظة إلكترونية</option>
								</select>
							</label>
							<label>
								<span>مرجع العملية</span>
								<input v-model="settlementDraft.reference" maxlength="100" />
							</label>
							<div class="third-party-sales__actions">
								<ActionButton type="submit" theme="green"
	variant="solid" :loading="saving">
									اعتماد التسوية
								</ActionButton>
								<ActionButton variant="ghost" @click="settlementTarget = null">
									إلغاء
								</ActionButton>
							</div>
						</form>
					</article>
				</div>
			</section>
		</div>
	</WorkShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue"
import { getActivePinia } from "pinia"
import { ActionButton } from "dypos-ui"
import ScaleField from "@/components/sale/ScaleField.vue"
import WorkShell from "@/components/work/WorkShell.vue"
import { sessionUser } from "@/data/session"
import { flatWorkNav } from "@/components/work/workNav"
import { useIndustryProfileStore } from "@/stores/industryProfile"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { toMajor } from "@/utils/money"
import { generateUUID } from "@/utils/offline/uuid"
import {
	createThirdPartySale,
	formatThirdPartyMoney,
	listThirdPartySales,
	previewThirdPartySale,
	recordThirdPartySettlement,
} from "@/services/thirdPartySales"
import "@/styles/pages/third-party-sales.css"

const sellerName = sessionUser() || "المستخدم الحالي"
const industry = getActivePinia() ? useIndustryProfileStore() : null

/**
 * Scale settings come from the POS settings store so one configuration
 * serves every screen. The store is read defensively: this page mounts in
 * tests and in the standalone shell where Pinia may not be active yet, and a
 * missing scale config must degrade to "no scale", never to a crash on open.
 */
const scaleSettings = computed(() => {
	if (!getActivePinia()) return {}
	try {
		return usePOSSettingsStore().settings?.value?.scale ?? {}
	} catch {
		return {}
	}
})
const navItems = computed(() =>
	flatWorkNav().filter(
		(item) =>
			!item.capability || !industry || industry.hasCapability(item.capability),
	),
)
const breadcrumbs = [
	{ label: "شاشات العمل", to: { name: "WorkScreens" } },
	{ label: "البيع بالنيابة" },
]
const draft = reactive({
	itemName: "",
	buyerName: "",
	ownerName: "",
	intermediaryName: "",
	quantity: 1,
	uom: "كجم",
	unitPrice: 0,
	location: "",
	commissionMode: "percent",
	commissionRate: 0,
	commissionAmount: 0,
	buyerPaid: 0,
	buyerPaymentMethod: "cash",
	buyerPaymentReference: "",
	notes: "",
})
/**
 * Writable views of the two fields the scale drives.
 *
 * `draft` is a reactive object, and a component prop typed as a Ref would
 * receive a plain value — the scale would then write into a copy and the
 * field would appear to ignore it. computed(get/set) is the seam that keeps
 * v-model and the scale writing to the SAME state.
 */
const quantityField = computed({
	get: () => draft.quantity,
	set: (value) => {
		draft.quantity = value
	},
})

const uomField = computed({
	get: () => draft.uom,
	set: (value) => {
		draft.uom = value
	},
})

const sales = ref([])
const loading = ref(false)
const saving = ref(false)
const actionError = ref("")
const loadError = ref("")
const settlementTarget = ref(null)
const settlementDraft = reactive({ amount: 0, method: "cash", reference: "" })

const preview = computed(() => {
	try {
		return previewThirdPartySale(draft)
	} catch {
		return null
	}
})
const previewError = computed(() => {
	if (preview.value) return ""
	try {
		previewThirdPartySale(draft)
		return ""
	} catch (error) {
		if (error instanceof Error) return error.message
		throw error
	}
})

const money = formatThirdPartyMoney
const formatDate = (value) => new Date(value).toLocaleString("ar")
const statusLabel = (status) =>
	({ OPEN: "مستحق", PARTIAL: "مسدد جزئيًا", SETTLED: "مسدد بالكامل" })[status] ||
	status
const paymentLabel = (method) =>
	({
		cash: "نقدًا",
		transfer: "تحويل",
		card: "بطاقة",
		wallet: "محفظة",
		credit: "آجل",
	})[method] || method

async function loadSales() {
	loading.value = true
	loadError.value = ""
	try {
		sales.value = await listThirdPartySales()
	} catch (error) {
		loadError.value =
			error instanceof Error
				? `تعذر قراءة السجل المحلي: ${error.message}`
				: "تعذر قراءة السجل المحلي"
	} finally {
		loading.value = false
	}
}

async function submitSale() {
	actionError.value = ""
	saving.value = true
	try {
		await createThirdPartySale({ ...draft, sellerName })
		Object.assign(draft, {
			itemName: "",
			buyerName: "",
			ownerName: "",
			intermediaryName: "",
			quantity: 1,
			unitPrice: 0,
			location: "",
			buyerPaid: 0,
			buyerPaymentMethod: "cash",
			buyerPaymentReference: "",
			notes: "",
		})
		await loadSales()
	} catch (error) {
		actionError.value =
			error instanceof Error ? error.message : "تعذر حفظ عملية البيع"
	} finally {
		saving.value = false
	}
}

function openSettlement(sale) {
	actionError.value = ""
	settlementTarget.value = sale
	settlementDraft.amount = toMajor(sale.ownerDueMinor)
	settlementDraft.method = "cash"
	settlementDraft.reference = ""
}

async function submitSettlement() {
	const sale = settlementTarget.value
	if (!sale) return
	actionError.value = ""
	saving.value = true
	try {
		await recordThirdPartySettlement({
			saleId: sale.id,
			amount: settlementDraft.amount,
			method: settlementDraft.method,
			reference: settlementDraft.reference,
			idempotencyKey: generateUUID(),
		})
		settlementTarget.value = null
		await loadSales()
	} catch (error) {
		actionError.value =
			error instanceof Error ? error.message : "تعذر تسجيل التسوية"
	} finally {
		saving.value = false
	}
}

onMounted(loadSales)
</script>
