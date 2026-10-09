<template>
	<!--
		شاشة الكاشير الذاتي — سطح مستقل تماماً.

		لا `WorkShell` هنا عن قصد: هذه واجهة زبون على جهاز لمس (كشك مطعم،
		طاولة نادٍ، مدخل متجر)، لا شاشة موظف داخل سطح العمل.导航 العام
		(other work nav) ما معنى لها على جهاز لا Pian فيه كاشير.
	-->
	<div class="self-checkout" dir="rtl">
		<header class="self-checkout__header">
			<div class="self-checkout__brand">
				<FeatherIcon name="zap" :stroke-width="2" aria-hidden="true" />
				<div>
					<h1 class="self-checkout__title">{{ title }}</h1>
					<p class="self-checkout__subtitle">{{ subtitle }}</p>
					<p v-if="metaChips.length" class="self-checkout__meta" role="status">
						<span v-for="chip in metaChips" :key="chip.label" class="self-checkout__chip">
							<FeatherIcon :name="chip.icon" :size="13" aria-hidden="true" />
							{{ chip.label }}
						</span>
					</p>
				</div>
			</div>

			<div class="self-checkout__header-actions">
				<!--
					العمل دون اتصال ليس حالة يظهرها مؤشر، بل الوضع الافتراضي:
					لا مؤشر «متصل» ولا «غير متصل» يوحي بأن الشاشة تحتاج سيرفرًا.
				-->
				<ActionButton variant="ghost" iconLeft="refresh-cw" @click="loadCatalog">
					تحديث الأصناف
				</ActionButton>
			</div>
		</header>

		<div class="self-checkout__body">
			<!-- ================= الكتالوج ================= -->
			<section class="self-checkout__catalog" aria-label="الأصناف">
				<p
					v-if="sourceNote"
					class="self-checkout__source"
					role="status"
					:data-source="catalogSource"
				>
					{{ sourceNote }}
				</p>
				<p
					v-else-if="loadingCatalog"
					class="self-checkout__source"
					role="status"
				>
					جارٍ تحميل الأصناف…
				</p>

				<div class="self-checkout__search" role="search">
					<FeatherIcon name="search" :size="16" aria-hidden="true" />
					<input
						v-model="searchQuery"
						type="search"
						placeholder="ابحث بالاسم أو الرمز أو الباركود…"
						aria-label="البحث في الأصناف"
						autocomplete="off"
					/>
				</div>

				<div class="self-checkout__grid">
					<p
						v-if="visibleCatalog.length === 0 && !loadingCatalog"
						class="self-checkout__grid-empty"
					>
						{{ searchQuery.trim() ? "لا أصناف مطابقة لبحثك" : (catalogError || "لا توجد أصناف متاحة للبيع حاليًا") }}
					</p>

					<button
						v-for="product in visibleCatalog"
						:key="product.id"
						type="button"
						class="self-checkout__product"
						:disabled="!canBrowse"
						@click="onPick(product)"
					>
						<span v-if="product.code" class="self-checkout__sku">{{ product.code }}</span>
						<span class="self-checkout__product-name">{{ product.name }}</span>
						<span class="self-checkout__product-price">
							{{ money(product.price) }}
						</span>
					</button>
				</div>
			</section>

			<!-- ================= السلة ================= -->
			<aside class="self-checkout__cart" aria-label="سلة المشتريات">
				<h2 class="self-checkout__cart-title">
					<span>سلة المشتريات</span>
					<span v-if="itemCount > 0" class="self-checkout__cart-count">
						{{ itemCount }} قطعة
					</span>
				</h2>

				<p v-if="isEmpty" class="self-checkout__empty">
					{{ idleHint }}
				</p>

				<ul v-else class="self-checkout__lines">
					<li v-for="line in cart" :key="line.productId" class="self-checkout__line">
						<span class="self-checkout__line-name">{{ line.name }}</span>
						<span class="self-checkout__line-total">
							{{ money(lineTotal(line)) }}
						</span>
						<span class="self-checkout__line-meta">
							<span class="self-checkout__qty">
								<button
									type="button"
									class="self-checkout__remove"
									:aria-label="`إنقاص ${line.name}`"
									:disabled="!canBrowse"
									@click="onDecrement(line)"
								>
									<FeatherIcon name="minus" aria-hidden="true" />
								</button>
								<span class="self-checkout__qty-value">{{ line.qty }}</span>
								<button
									type="button"
									class="self-checkout__remove"
									:aria-label="`زيادة ${line.name}`"
									:disabled="!canBrowse"
									@click="onIncrement(line)"
								>
									<FeatherIcon name="plus" aria-hidden="true" />
								</button>
							</span>
							<button
								type="button"
								class="self-checkout__remove"
								:aria-label="`حذف ${line.name}`"
								:disabled="!canBrowse"
								@click="removeItem(line.productId)"
							>
								<FeatherIcon name="trash-2" aria-hidden="true" />
							</button>
						</span>
					</li>
				</ul>

				<div v-if="!isEmpty" class="self-checkout__totals">
					<div class="self-checkout__total-row">
						<span>المجموع قبل الضريبة</span>
						<span>{{ money(totals.subtotal) }}</span>
					</div>
					<div class="self-checkout__total-row">
						<span>الضريبة</span>
						<span>{{ money(totals.taxTotal) }}</span>
					</div>
					<div class="self-checkout__total-row self-checkout__total-row--grand">
						<span>الإجمالي</span>
						<span>{{ money(totals.total) }}</span>
					</div>
				</div>

				<p v-if="error" class="self-checkout__error" role="alert">{{ error }}</p>

				<div class="self-checkout__actions">
					<ActionButton
						v-if="!isOpen"
						variant="solid"
						size="lg"
						block
						icon="play"
						@click="startSession"
					>
						ابدأ الجلسة
					</ActionButton>

					<template v-else>
						<ActionButton
							variant="solid"
							size="lg"
							block
							icon="credit-card"
							:disabled="!canPay"
							@click="beginPayment"
						>
							ادفع — {{ money(totals.total) }}
						</ActionButton>
						<ActionButton variant="ghost" size="lg" block @click="cancel">
							إلغاء الجلسة
						</ActionButton>
					</template>
				</div>
			</aside>
		</div>


		<!--
			طبقة الدفع: `role="dialog"` + `aria-modal` لعزل القراءة على
			الخلفية. لاVB-layout: هذه طبقة تغطي الشاشة بمعيار `position:fixed`.
		-->
		<div
			v-if="isPaying"
			class="self-checkout__payment"
			role="dialog"
			aria-modal="true"
			aria-labelledby="self-checkout-payment-title"
		>
			<div class="self-checkout__payment-panel">
				<h2 id="self-checkout-payment-title" class="self-checkout__payment-title">
					إتمام الدفع
				</h2>

				<div class="self-checkout__method-row">
					<button
						v-for="option in paymentMethods"
						:key="option.id"
						type="button"
						class="self-checkout__method"
						:aria-pressed="method === option.id"
						:disabled="option.availableOffline === false"
						@click="chooseMethod(option.id)"
					>
						<FeatherIcon :name="option.icon" aria-hidden="true" />
						<span>{{ option.label }}</span>
						<small v-if="option.availableOffline === false">يتطلب ربط دفع</small>
					</button>
				</div>

				<!-- المبلغ يعمل بالهللة ويحوَّل للعرض فقط عند الطباعة. -->
				<p class="self-checkout__tender" aria-live="polite">
					{{ money(tenderMajor) }}
				</p>

				<div v-if="method === 'cash'" class="self-checkout__keypad">
					<button
						v-for="key in keypadKeys"
						:key="key"
						type="button"
						class="self-checkout__key"
						@click="pressKey(key)"
					>
						{{ key }}
					</button>
				</div>

				<!--
					الفئات السريعة: «بالضبط» تجعل الباقي صفرًا في أغلب
					الحالات، وهي الحالة الأشيع في الكشك النقدي.
				-->
				<div v-if="method === 'cash'" class="self-checkout__quick">
					<ActionButton
						v-for="quick in quickTenders"
						:key="quick"
						variant="outline"
						size="md"
						@click="bumpTenderMinor(quick)"
					>
						+{{ money(quick / 100) }}
					</ActionButton>
				</div>

				<!-- خطوة الدفع الفعلية لكل طريقة: انظر PAYMENT_STEPS -->
				<p v-if="method === 'card'" class="self-checkout__source" role="status">
					أدخل البطاقة في الجهاز ثم أزرار المفاتيح — سيُعتمد الدفع.
				</p>
				<p v-else-if="method === 'wallet'" class="self-checkout__source" role="status">
					وجّه الكاميرا نحو رمز QR في محفظتك لإتمام التحويل.
				</p>
				<p v-else-if="method === 'transfer'" class="self-checkout__source" role="status">
					حوّل المبلغ ثم أدخل رقم عملية التحويل للربط.
				</p>

				<div
					v-if="tender.changeMinor > 0"
					class="self-checkout__change"
					:data-short="String(tender.short)"
					role="status"
				>
					<span>الباقي للزبون</span>
					<span>{{ money(tender.changeMinor / 100) }}</span>
				</div>
				<div
					v-else-if="tender.short"
					class="self-checkout__change"
					data-short="true"
					role="status"
				>
					<span>المتبقّي</span>
					<span>{{ money(tender.remainingMinor / 100) }}</span>
				</div>

				<p v-if="error" class="self-checkout__error" role="alert">{{ error }}</p>

				<div class="self-checkout__actions-row">
					<ActionButton variant="ghost" size="lg" @click="backToCart">رجوع</ActionButton>
					<ActionButton
						theme="green"
						variant="solid"
						size="lg"
						:disabled="!canConfirm"
						:loading="processing"
						@click="confirmPayment"
					>
						تأكيد الدفع
					</ActionButton>
				</div>
			</div>
		</div>

		<!-- ================= الإيصال ================= -->
		<div
			v-if="receipt"
			class="self-checkout__receipt"
			role="dialog"
			aria-modal="true"
			aria-labelledby="self-checkout-receipt-title"
		>
			<div class="self-checkout__receipt-panel">
				<FeatherIcon
					name="check-circle"
					:stroke-width="1.5"
					class="self-checkout__receipt-icon"
					aria-hidden="true"
				/>
				<h2 id="self-checkout-receipt-title" class="self-checkout__receipt-title">
					تمت العملية
				</h2>
				<div class="self-checkout__receipt-rows">
					<div class="self-checkout__receipt-row">
						<span>رقم العملية</span>
						<strong>{{ receipt.invoiceNo }}</strong>
					</div>
					<div class="self-checkout__receipt-row">
						<span>طريقة الدفع</span>
						<strong>{{ receipt.methodLabel }}</strong>
					</div>
					<div class="self-checkout__receipt-row">
						<span>عدد الأصناف</span>
						<strong>{{ receipt.items }}</strong>
					</div>
					<div v-if="receipt.changeMinor > 0" class="self-checkout__receipt-row">
						<span>الباقي</span>
						<strong>{{ money(receipt.changeMinor / 100) }}</strong>
					</div>
					<div class="self-checkout__receipt-row self-checkout__receipt-row--total">
						<span>الإجمالي</span>
						<strong>{{ money(receipt.totalMinor / 100) }}</strong>
					</div>
				</div>
				<p class="self-checkout__source" role="status">
					حُفظت العملية محليًا. تبقى في الطابور حتى تطلب المزامنة.
				</p>
				<ActionButton variant="solid" size="lg" block @click="dismissReceipt">
					بدء عملية جديدة
				</ActionButton>
</div>
		</div>
	</div>
</template>

<script setup>
/**
 * عرض فقط: كل الحالة في `useSelfCheckoutSession` وكل الحساب في
 * `selfCheckoutState`. لا `fetch` هنا — الشاشة تعمل بلا شبكة.
 */
import { computed, onMounted, ref } from "vue"
import { FeatherIcon } from "dypos-ui"

import { ActionButton } from "dypos-ui"
import { formatNumberSafe, getCurrencySymbol } from "@/utils/currency"
import { PAYMENT_METHODS, SESSION_STATES, filterCatalog } from "./selfCheckoutState.js"
import { useSelfCheckoutSession } from "./useSelfCheckoutSession.js"

const props = defineProps({
	/** عنوان المنشأة أعلى الشاشة. */
	title: { type: String, default: "الكاشير الذاتي" },
	/** سطر وصفي تحت العنوان. */
	subtitle: { type: String, default: "امسح الأصناف أو المسها، ثم ادفع بنفسك" },
	/** رمز الفرع — جزء من رقم الفاتورة المحلي. */
	branch: { type: String, default: undefined },
	/** رمز الطرفية — جزء من رقم الفاتورة المحلي. */
	terminal: { type: String, default: undefined },
})

const {
	state,
	cart,
	method,
	catalog,
	catalogSource,
	catalogError,
	loadingCatalog,
	processing,
	error,
	receipt,
	totals,
	itemCount,
	isEmpty,
	canPay,
	tender,
	canConfirm,
	sourceNote,
	loadCatalog,
	startSession,
	addItem,
	changeQty,
	removeItem,
	beginPayment,
	backToCart,
	chooseMethod,
	setTenderMinor,
	bumpTenderMinor,
	confirmPayment,
	cancel,
	dismissReceipt,
} = useSelfCheckoutSession({ branch: props.branch, terminal: props.terminal })

const paymentMethods = PAYMENT_METHODS

/** لوحة الأرقام: 1-9 ثم «خلف» و«مسح» و«0». */
const keypadKeys = Object.freeze([
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"back",
	"0",
	"clear",
])

/** فئات نقدية سريعة بالهللة (تمثّل 1/5/10/20/50 ريالًا). */
const quickTenders = Object.freeze([100, 500, 1000, 2000, 5000])

const isOpen = computed(() => state.value === SESSION_STATES.OPEN)
const isPaying = computed(() => state.value === SESSION_STATES.PAYING)
/** الكتالوج قابل للّمس فقط أثناء الجلسة المفتوحة. */
const canBrowse = computed(() => isOpen.value)
/** بحث فوري محلي بالاسم أو الرمز أو الباركود — لا شبكة ولا انتظار. */
const searchQuery = ref("")
const visibleCatalog = computed(() => filterCatalog(catalog.value, searchQuery.value))
/** شرائح التشغيل: الفرع والطرفية والعملة — تُعرض فقط عند معرفتها. */
const currencySymbol = computed(() => getCurrencySymbol())
const metaChips = computed(() =>
	[
		props.branch ? { icon: "map-pin", label: `الفرع ${props.branch}` } : null,
		props.terminal ? { icon: "smartphone", label: `طرفية ${props.terminal}` } : null,
		{ icon: "dollar-sign", label: `العملة ${currencySymbol.value}` },
	].filter(Boolean),
)
const tenderMajor = computed(() => tenderMinor.value / 100)
const idleHint = computed(() =>
	isOpen.value ? "المس أي صنف لإضافته" : "ابدأ الجلسة لتبدأ",
)

/** عرض نقدي بأرقام لاتينية (محاسبة قابلة للقراءة آليًا). */
function money(major) {
	return `${formatNumberSafe(major)} ${getCurrencySymbol()}`
}

/** إجمالي سطر واحد بالريال (للعرض فقط — الحساب يبقى في `totals`). */
function lineTotal(line) {
	return (line.unitPriceMinor * line.qty) / 100
}

function onPick(product) {
	addItem(product, 1)
}

function onIncrement(line) {
	changeQty(line.productId, line.qty + 1)
}

/** إنقاص حتى الصفر يحذف السطر — لا «كمية صفر» في السلة. */
function onDecrement(line) {
	changeQty(line.productId, line.qty - 1)
}

/**
 * لوحة الأرقام: كل ضغطة تضيف 10هللة (رقمان عشريان) لأن المبلغ
 * بالهللة ولا نريد أن يقول مستخدم «٥٠» ما يعنيه 0.50 أو 50.
 * `back` يقصّ آخر خانة، `clear` يصفّر.
 */
function pressKey(key) {
	if (key === "clear") {
		setTenderMinor(0)
		return
	}
	if (key === "back") {
		setTenderMinor(Math.floor(tenderMinor.value / 10))
		return
	}
	const digits = String(tenderMinor.value)
	setTenderMinor(Number(digits + key))
}

/**
 * شاشة الكاشير الذاتي تبدأ بجلسة `IDLE`، و`addItem` يتجاهل الطلب إلا في
 * `OPEN`. كان التركيب ينادي `loadCatalog` وحدها، فبقيت الحالة `IDLE` إلى الأبد
 * فتصبح إضافة الصنف — أي أن **كل نقرة صنف كانت تُتجاهل بصمت** ولا يستطيع
 * الكاشير الذاتي بيع أي شيء. `startSession` هي ما يفتح الجلسة، فصار نداءها
 * جزءًا من التركيب لا خطوة اختيارية.
 */
onMounted(async () => {
	startSession()
	await loadCatalog()
})
</script>

	<style scoped src="./selfCheckout.css"></style>

