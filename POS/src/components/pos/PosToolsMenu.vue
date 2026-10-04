<!--
	قائمة أدوات الكاشير — زر واحد في شريط شاشة البيع يفتح لوحة الأدوات.

	لماذا قائمة موحدة: الكاشير يحتاج حاسبة ومحول عملات وملاحظات ومشاركة
	الفاتورة عشرات المرات في الوردية، وكل واحدة كانت تتطلب الخروج من الشاشة
	أو تطبيقًا خارجيًا. هنا تعمل كلها دون إنترنت (الحالة المحلية فقط) ولا
	تستدعي الخادم إطلاقًا — الاستثناء الوحيد ضغطة المستخدم الصريحة على
	مشاركة واتساب (رابط wa.me يفتحه المتصفح، لا إرسال تلقائي).

	العقود الحية (لا شيء هنا معلق):
	- `action` بنفس مفردات `PosHeaderActionGroup`: صف الطلبات يطلق مفتاح
	  `held` الموجود أصلًا في `headerActions`، فيفتح لوحة المعلق دون مستمع
	  جديد. أي مفتاح آخر يُضاف هنا يجب أن يعرفه الموجّه أولًا.
	- F9 يفتح/يغلق القائمة من أي مكان خارج حقل إدخال؛ لا يتعارض مع F2/F4/F8
	  و`؟` وEscape في `useKeyboardShortcuts` (لا أحد يستخدم F9).
-->
<template>
	<div class="dy-tools">
		<ActionButton
			icon="tool"
			variant="ghost"
			size="md"
			:aria-label="t('أدوات الكاشير')"
			:title="`${t('أدوات الكاشير')} (F9)`"
			:aria-expanded="open"
			aria-haspopup="dialog"
			@click="toggle"
		/>

		<Teleport to="body">
			<div
				v-if="open"
				class="dy-tools__overlay"
				aria-hidden="true"
				@click="close"
			/>

			<section
				v-if="open"
				ref="panelRef"
				class="dy-tools__panel"
				role="dialog"
				aria-modal="false"
				:aria-label="t('أدوات الكاشير')"
				@keydown="onPanelKeydown"
			>
				<header class="dy-tools__head">
					<h2 class="dy-tools__title">
						{{ t("أدوات الكاشير") }}
					</h2>

					<ActionButton
						icon="x"
						variant="ghost"
						size="sm"
						:aria-label="t('إغلاق الأدوات')"
						@click="close"
					/>
				</header>

				<div
					class="dy-tools__tabs"
					role="tablist"
					:aria-label="t('أدوات الكاشير')"
				>
					<ActionButton
						v-for="tab in tabs"
						:key="tab.key"
						:variant="activeTab === tab.key ? 'solid' : 'subtle'"
						size="sm"
						:aria-selected="activeTab === tab.key"
						role="tab"
						@click="activeTab = tab.key"
					>
						<FeatherIcon
							:name="tab.icon"
							class="dy-tools__tab-icon"
							aria-hidden="true"
						/>
						{{ tab.label }}
					</ActionButton>
				</div>

				<!-- الحاسبة -->
				<div
					v-if="activeTab === 'calc'"
					class="dy-tools__pane"
					role="tabpanel"
				>
					<output
						class="dy-tools__calc-display"
						aria-live="polite"
						:aria-label="t('نتيجة الحاسبة')"
					>
						{{ calcDisplay }}
					</output>

					<div class="dy-tools__calc-grid">
						<ActionButton
							v-for="key in calcKeys"
							:key="key.label"
							:variant="key.accent ? 'solid' : 'outline'"
							size="md"
							class="dy-tools__calc-key"
							:aria-label="key.aria"
							@click="pressCalc(key)"
						>
							{{ key.label }}
						</ActionButton>
					</div>

					<div class="dy-tools__row">
						<ActionButton
							variant="ghost"
							size="sm"
							@click="copyCalc"
						>
							<FeatherIcon
								name="copy"
								class="dy-tools__tab-icon"
								aria-hidden="true"
							/>
							{{ copied ? t("تم النسخ") : t("نسخ النتيجة") }}
						</ActionButton>

						<span class="dy-tools__hint">
							F9 {{ t("فتح / إغلاق") }}
						</span>
					</div>
				</div>

				<!-- محول العملات -->
				<div
					v-else-if="activeTab === 'fx'"
					class="dy-tools__pane"
					role="tabpanel"
				>
					<label class="dy-tools__field">
						<span class="dy-tools__label">{{ t("المبلغ") }}</span>

						<input
							v-model="fxAmount"
							class="dy-tools__input"
							type="text"
							inputmode="decimal"
							dir="ltr"
							placeholder="100"
							:aria-label="t('المبلغ')"
						/>
					</label>

					<div class="dy-tools__fx-row">
						<label class="dy-tools__field">
							<span class="dy-tools__label">{{ t("من") }}</span>

							<select
								v-model="fxFrom"
								class="dy-tools__input"
								:aria-label="t('من عملة')"
							>
								<option
									v-for="c in currencies"
									:key="c.code"
									:value="c.code"
								>
									{{ c.nameAr }} ({{ c.code }})
								</option>
							</select>
						</label>

						<ActionButton
							icon="repeat"
							variant="ghost"
							size="sm"
							class="dy-tools__swap"
							:aria-label="t('تبديل العملتين')"
							@click="swapFx"
						/>

						<label class="dy-tools__field">
							<span class="dy-tools__label">{{ t("إلى") }}</span>

							<select
								v-model="fxTo"
								class="dy-tools__input"
								:aria-label="t('إلى عملة')"
							>
								<option
									v-for="c in currencies"
									:key="c.code"
									:value="c.code"
								>
									{{ c.nameAr }} ({{ c.code }})
								</option>
							</select>
						</label>
					</div>

					<output
						class="dy-tools__fx-result"
						aria-live="polite"
						:aria-label="t('نتيجة التحويل')"
					>
						{{ fxResult }}
					</output>

					<label class="dy-tools__field">
						<span class="dy-tools__label">
							{{ t("السعر") }}

							<span
								v-if="fxCustom"
								class="dy-tools__badge"
							>
								{{ t("مخصص") }}
							</span>
						</span>

						<span class="dy-tools__rate-row">
							<input
								v-model="fxRateInput"
								class="dy-tools__input"
								type="text"
								inputmode="decimal"
								dir="ltr"
								:aria-label="t('سعر التحويل')"
								@change="applyFxRate"
							/>

							<ActionButton
								v-if="fxCustom"
								variant="ghost"
								size="sm"
								@click="resetFxRate"
							>
								{{ t("إعادة ضبط") }}
							</ActionButton>
						</span>
					</label>
				</div>

				<!-- ملاحظات الوردية -->
				<div
					v-else-if="activeTab === 'notes'"
					class="dy-tools__pane"
					role="tabpanel"
				>
					<label class="dy-tools__field">
						<span class="dy-tools__label">{{ t("ملاحظة جديدة") }}</span>

						<textarea
							v-model="noteDraft"
							class="dy-tools__input dy-tools__textarea"
							rows="2"
							:maxlength="280"
							:placeholder="t('اكتب ملاحظة للوردية…')"
							:aria-label="t('ملاحظة جديدة')"
							@keydown.enter.exact.prevent="addNote"
						/>
					</label>

					<ActionButton
						variant="solid"
						size="sm"
						:block="true"
						:disabled="!noteDraft.trim()"
						@click="addNote"
					>
						{{ t("إضافة الملاحظة") }}
					</ActionButton>

					<p
						v-if="notes.length === 0"
						class="dy-tools__empty"
					>
						{{ t("لا ملاحظات بعد — تُحفظ على هذا الجهاز فقط") }}
					</p>

					<ul
						v-else
						class="dy-tools__notes"
					>
						<li
							v-for="note in notes"
							:key="note.id"
							class="dy-tools__note"
						>
							<span class="dy-tools__note-text">{{ note.text }}</span>

							<ActionButton
								icon="x"
								variant="ghost"
								size="xs"
								:aria-label="t('حذف الملاحظة')"
								@click="removeNote(note.id)"
							/>
						</li>
					</ul>
				</div>

				<!-- مشاركة واتساب -->
				<div
					v-else
					class="dy-tools__pane"
					role="tabpanel"
				>
					<p class="dy-tools__share-preview">
						{{ sharePreview }}
					</p>

					<ActionButton
						variant="solid"
						size="md"
						:block="true"
						:disabled="shareDisabled"
						@click="shareWhatsApp"
					>
						<FeatherIcon
							name="message-circle"
							class="dy-tools__tab-icon"
							aria-hidden="true"
						/>
						{{ t("مشاركة عبر واتساب") }}
					</ActionButton>

					<p class="dy-tools__empty">
						{{
							shareDisabled
								? t("أضف أصنافًا إلى السلة أولًا")
								: t("تُفتح المشاركة بضغطتك فقط — لا إرسال تلقائي")
						}}
					</p>
				</div>

				<footer class="dy-tools__foot">
					<ActionButton
						variant="outline"
						size="sm"
						:block="true"
						@click="emit('action', 'held')"
					>
						<FeatherIcon
							name="clock"
							class="dy-tools__tab-icon"
							aria-hidden="true"
						/>
						{{ t("الطلبات المعلقة") }}
					</ActionButton>

					<p class="dy-tools__hint">
						F2 {{ t("بحث") }} · F4 {{ t("تعليق") }} · F8
						{{ t("كاشير ذكي") }} · ؟ {{ t("مساعدة") }}
					</p>
				</footer>
			</section>
		</Teleport>
	</div>
</template>

<script setup>
import {
	computed,
	nextTick,
	onBeforeUnmount,
	onMounted,
	reactive,
	ref,
	useTemplateRef,
	watch,
} from "vue"

import { ActionButton, FeatherIcon } from "dypos-ui"

import { sessionUser } from "@/data/session"
import { usePOSCartStore } from "@/stores/posCart"
import { CURRENCY_DEFINITIONS, convertAmount } from "@/utils/uom"
import { formatCurrencySafe } from "@/utils/currency"
import { t } from "@/utils/translation"

/**
 * `action` بنفس مفردات `PosHeaderActionGroup`: لا مفاتيح جديدة هنا. صف
 * الطلبات يطلق `held` الموجود في `headerActions`، فلا مستمع جديد ولا عقد
 * ميت — زر يفتح لوحة موجودة فعلًا.
 */
const emit = defineEmits(["action"])

const open = ref(false)
const activeTab = ref("calc")
const panelRef = useTemplateRef("panelRef")

const tabs = computed(() => [
	{ key: "calc", icon: "tool", label: t("حاسبة") },
	{ key: "fx", icon: "repeat", label: t("عملات") },
	{ key: "notes", icon: "file-text", label: t("ملاحظات") },
	{ key: "share", icon: "message-circle", label: t("واتساب") },
])

function toggle() {
	open.value = !open.value
}

function close() {
	open.value = false
}

/**
 * لوحة المفاتيح داخل اللوحة: Escape يغلق، ومفاتيح الحاسبة تصلها عندما يكون
 * تبويبها نشطًا والتركيز خارج حقول الإدخال (حتى لا تخطف كتابة الملاحظات).
 */
const CALC_KEYS = {
	"+": "+",
	"-": "-",
	"*": "*",
	"/": "/",
	"=": "equals",
	Enter: "equals",
	Backspace: "back",
	"%": "percent",
	".": "dot",
	",": "dot",
}

function onPanelKeydown(event) {
	if (event.key === "Escape") {
		event.stopPropagation()
		close()
		return
	}
	if (activeTab.value !== "calc") return
	const target = event.target
	if (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement
	) {
		return
	}
	if (/^[0-9]$/.test(event.key)) {
		pressCalc({ run: "digit", digit: event.key })
		return
	}
	const run = CALC_KEYS[event.key]
	if (run === undefined) return
	event.preventDefault()
	if (
		run === "equals" ||
		run === "back" ||
		run === "percent" ||
		run === "dot"
	) {
		pressCalc({ run })
		return
	}
	pressCalc({ run: "op", op: run })
}

/**
 * F9 للأدوات — خارج حقول الإدخال فقط، حتى لا تخطف ضغطة كاشير يحرر رقمًا
 * أو ملاحظة. لا يتعارض مع F2/F4/F8 في `useKeyboardShortcuts`.
 */
function onGlobalKeydown(event) {
	if (event.key !== "F9") return
	const target = event.target
	const typing =
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement
	if (typing) return
	event.preventDefault()
	toggle()
}

onMounted(() => {
	window.addEventListener("keydown", onGlobalKeydown)
})

onBeforeUnmount(() => {
	window.removeEventListener("keydown", onGlobalKeydown)
})

watch(open, async (value) => {
	if (!value) return
	await nextTick()
	panelRef.value?.querySelector("button")?.focus?.()
})

/* ============================================================================
 * الحاسبة — حساب صريح بلا eval: المُدخل أرقام وعمليات فقط، فلا يُنفَّذ نص أبدًا.
 * ========================================================================== */

const calcKeys = [
	{ label: "C", aria: "مسح", run: "clear" },
	{ label: "⌫", aria: "حذف آخر رقم", run: "back" },
	{ label: "%", aria: "نسبة مئوية", run: "percent" },
	{ label: "÷", aria: "قسمة", run: "op", op: "/" },
	{ label: "7", aria: "7", run: "digit", digit: "7" },
	{ label: "8", aria: "8", run: "digit", digit: "8" },
	{ label: "9", aria: "9", run: "digit", digit: "9" },
	{ label: "×", aria: "ضرب", run: "op", op: "*" },
	{ label: "4", aria: "4", run: "digit", digit: "4" },
	{ label: "5", aria: "5", run: "digit", digit: "5" },
	{ label: "6", aria: "6", run: "digit", digit: "6" },
	{ label: "−", aria: "طرح", run: "op", op: "-" },
	{ label: "1", aria: "1", run: "digit", digit: "1" },
	{ label: "2", aria: "2", run: "digit", digit: "2" },
	{ label: "3", aria: "3", run: "digit", digit: "3" },
	{ label: "+", aria: "جمع", run: "op", op: "+" },
	{ label: "0", aria: "0", run: "digit", digit: "0" },
	{ label: ".", aria: "فاصلة عشرية", run: "dot" },
	{ label: "=", aria: "يساوي", run: "equals", accent: true },
]

const calc = reactive({ display: "0", acc: null, op: null, fresh: true })

const calcDisplay = computed(() => calc.display)

function calcRound(n) {
	if (!Number.isFinite(n)) return "0"
	return String(Number.parseFloat(n.toFixed(10)))
}

function calcApply(a, b, op) {
	switch (op) {
		case "+":
			return a + b
		case "-":
			return a - b
		case "*":
			return a * b
		case "/":
			return b === 0 ? Number.NaN : a / b
		default:
			return b
	}
}

function pressCalc(key) {
	const current = Number.parseFloat(calc.display) || 0
	if (key.run === "clear") {
		calc.display = "0"
		calc.acc = null
		calc.op = null
		calc.fresh = true
		return
	}
	if (key.run === "back") {
		calc.display = calc.display.length > 1 ? calc.display.slice(0, -1) : "0"
		if (calc.display === "-" || calc.display === "") calc.display = "0"
		return
	}
	if (key.run === "percent") {
		calc.display = calcRound(current / 100)
		calc.fresh = true
		return
	}
	if (key.run === "dot") {
		if (calc.fresh) {
			calc.display = "0."
			calc.fresh = false
			return
		}
		if (!calc.display.includes(".")) calc.display += "."
		return
	}
	if (key.run === "digit") {
		if (calc.fresh || calc.display === "0") {
			calc.display = key.digit
			calc.fresh = false
			return
		}
		if (calc.display.replace(/[^0-9]/g, "").length >= 12) return
		calc.display += key.digit
		return
	}
	if (key.run === "op") {
		if (calc.op !== null && !calc.fresh) {
			calc.acc = calcApply(calc.acc ?? current, current, calc.op)
			calc.display = calcRound(calc.acc)
		} else {
			calc.acc = current
		}
		calc.op = key.op
		calc.fresh = true
		return
	}
	if (key.run === "equals") {
		if (calc.op === null) return
		const result = calcApply(calc.acc ?? current, current, calc.op)
		calc.display = Number.isFinite(result) ? calcRound(result) : t("خطأ")
		calc.acc = null
		calc.op = null
		calc.fresh = true
	}
}

const copied = ref(false)
let copiedTimer = null

async function copyCalc() {
	copied.value = false
	try {
		await navigator.clipboard?.writeText?.(calc.display)
		copied.value = true
		if (copiedTimer) clearTimeout(copiedTimer)
		copiedTimer = window.setTimeout(() => {
			copied.value = false
			copiedTimer = null
		}, 1500)
	} catch {
		/* الحافظة غير متاحة (سياق غير آمن) — تبقى النتيجة معروضة */
	}
}

/* ============================================================================
 * محول العملات — أسعار `CURRENCY_DEFINITIONS` دون إنترنت، مع تجاوز يدوي
 * لسعر اليوم يُحفظ على الجهاز ويُعلَّم بشارة «مخصص» بدل التظاهر بالرسمية.
 * ========================================================================== */

const currencies = computed(() => Object.values(CURRENCY_DEFINITIONS))

const fxAmount = ref("")
const fxFrom = ref("SAR")
const fxTo = ref("USD")
const fxRateInput = ref("")

const FX_STORE_KEY = "dypos.tools.fx.v1"

function readFxOverrides() {
	try {
		return JSON.parse(localStorage.getItem(FX_STORE_KEY) || "{}") || {}
	} catch {
		return {}
	}
}

function fxPairKey() {
	return `${fxFrom.value}_${fxTo.value}`
}

function fxTableRate() {
	const list = currencies.value
	const from = list.find((c) => c.code === fxFrom.value)
	const to = list.find((c) => c.code === fxTo.value)
	if (!from || !to) return null
	return convertAmount(1, fxFrom.value, fxTo.value, list)
}

const fxCustom = computed(() => {
	const saved = readFxOverrides()[fxPairKey()]
	return typeof saved === "number" && saved > 0 ? saved : null
})

const fxRate = computed(() => fxCustom.value ?? fxTableRate() ?? 1)

watch(
	[fxFrom, fxTo],
	() => {
		fxRateInput.value = String(fxRate.value)
	},
	{ immediate: true },
)

const fxResult = computed(() => {
	const amount = Number.parseFloat(String(fxAmount.value).replace(",", "."))
	if (!Number.isFinite(amount)) return "—"
	const to = currencies.value.find((c) => c.code === fxTo.value)
	const table = fxTableRate() || 1
	// السعر المخصص يحل محل سعر الجدول كاملًا، لا يُضرب فيه.
	const out = amount * (fxCustom.value ?? table)
	const decimals = to?.precision ?? 2
	const rounded = Number(out.toFixed(decimals))
	return `${formatCurrencySafe(rounded, fxTo.value)}${fxCustom.value ? ` · ${t("مخصص")}` : ""}`
})

function swapFx() {
	const from = fxFrom.value
	fxFrom.value = fxTo.value
	fxTo.value = from
}

function applyFxRate() {
	const rate = Number.parseFloat(String(fxRateInput.value).replace(",", "."))
	if (!Number.isFinite(rate) || rate <= 0) {
		fxRateInput.value = String(fxRate.value)
		return
	}
	try {
		const all = readFxOverrides()
		all[fxPairKey()] = rate
		localStorage.setItem(FX_STORE_KEY, JSON.stringify(all))
	} catch {
		/* التخزين المحلي معطل — يعمل السعر للجلسة فقط */
	}
	fxRateInput.value = String(rate)
}

function resetFxRate() {
	try {
		const all = readFxOverrides()
		delete all[fxPairKey()]
		localStorage.setItem(FX_STORE_KEY, JSON.stringify(all))
	} catch {
		/* ignore */
	}
	fxRateInput.value = String(fxTableRate() ?? 1)
}

/* ============================================================================
 * ملاحظات الوردية — على الجهاز فقط، بلا حساب وبلا شبكة.
 * ========================================================================== */

const NOTES_KEY = "dypos.tools.notes.v1"
const noteDraft = ref("")
const notes = ref([])

function readNotes() {
	try {
		const rows = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]")
		return Array.isArray(rows)
			? rows.filter((r) => r && typeof r.text === "string")
			: []
	} catch {
		return []
	}
}

function writeNotes() {
	try {
		localStorage.setItem(NOTES_KEY, JSON.stringify(notes.value.slice(0, 50)))
	} catch {
		/* التخزين المحلي معطل — تعمل القائمة للجلسة فقط */
	}
}

function addNote() {
	const text = noteDraft.value.trim().slice(0, 280)
	if (!text) return
	notes.value.unshift({
		id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
		text,
		at: new Date().toISOString(),
	})
	noteDraft.value = ""
	writeNotes()
}

function removeNote(id) {
	notes.value = notes.value.filter((n) => n.id !== id)
	writeNotes()
}

/* ============================================================================
 * مشاركة واتساب — تُفتح بضغطة صريحة فقط (رابط wa.me، لا إرسال تلقائي).
 * ========================================================================== */

const cartStore = usePOSCartStore()

const shareLines = computed(() => {
	const items = cartStore.invoiceItems || []
	return items.slice(0, 8).map((item) => {
		const name = item.item_name || item.name || item.item_code || "صنف"
		const qty = item.quantity ?? item.qty ?? 1
		const total = item.amount ?? item.total ?? item.rate ?? 0
		return `• ${name} ×${qty} = ${formatCurrencySafe(Number(total) || 0, tillCurrency.value)}`
	})
})

const tillCurrency = computed(() => cartStore.posProfile?.currency || "SAR")

const shareDisabled = computed(
	() => (cartStore.invoiceItems || []).length === 0,
)

const sharePreview = computed(() => {
	if (shareDisabled.value) return t("السلة فارغة — لا شيء لمشاركته")
	const count = cartStore.itemCount ?? cartStore.invoiceItems.length
	return `${t("فاتورة")}: ${count} ${t("أصناف")} — ${formatCurrencySafe(Number(cartStore.grandTotal) || 0, tillCurrency.value)}`
})

function buildShareText() {
	const count = cartStore.itemCount ?? (cartStore.invoiceItems || []).length
	const total = formatCurrencySafe(
		Number(cartStore.grandTotal) || 0,
		tillCurrency.value,
	)
	const cashier = sessionUser() || ""
	const lines = [
		`${t("فاتورة")} DyPOS`,
		...shareLines.value,
		`${t("الإجمالي")}: ${total} (${count} ${t("أصناف")})`,
		cashier ? `${t("الكاشير")}: ${cashier}` : null,
	].filter(Boolean)
	return lines.join("\n")
}

function shareWhatsApp() {
	if (shareDisabled.value) return
	const url = `https://wa.me/?text=${encodeURIComponent(buildShareText())}`
	window.open(url, "_blank", "noopener,noreferrer")
}
</script>

<style scoped>
.dy-tools {
	position: relative;
	display: inline-flex;
}

.dy-tools__overlay {
	position: fixed;
	inset: 0;
	z-index: 60;
	background: rgb(15 23 42 / 0.35);
}

.dy-tools__panel {
	position: fixed;
	inset-block-start: 76px;
	inset-inline-end: 12px;
	z-index: 61;
	display: flex;
	flex-direction: column;
	gap: 12px;
	width: min(380px, calc(100vw - 24px));
	max-height: min(640px, calc(100dvh - 96px));
	overflow-y: auto;
	padding: 14px;
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-xl);
	background: var(--dy-surface);
	box-shadow: var(--dy-shadow-modal);
}

.dy-tools__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.dy-tools__title {
	margin: 0;
	color: var(--dy-text-strong);
	font-size: 1rem;
	font-weight: 800;
}

.dy-tools__tabs {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 6px;
}

.dy-tools__tab-icon {
	width: 15px;
	height: 15px;
	flex-shrink: 0;
}

.dy-tools__pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-width: 0;
}

.dy-tools__calc-display {
	display: block;
	min-height: 52px;
	padding: 10px 12px;
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-lg);
	background: var(--dy-bg-sunken);
	color: var(--dy-text-strong);
	font-size: 1.5rem;
	font-weight: 800;
	font-variant-numeric: tabular-nums;
	text-align: end;
	overflow-x: auto;
	white-space: nowrap;
}

.dy-tools__calc-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 6px;
}

.dy-tools__calc-key {
	min-height: 44px;
	font-variant-numeric: tabular-nums;
}

.dy-tools__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.dy-tools__hint {
	color: var(--dy-text-muted);
	font-size: 0.72rem;
}

.dy-tools__field {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-width: 0;
}

.dy-tools__label {
	color: var(--dy-text-secondary);
	font-size: 0.78rem;
	font-weight: 700;
}

.dy-tools__input {
	min-height: 44px;
	padding-inline: 12px;
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-md);
	background: var(--dy-surface);
	color: var(--dy-text);
	font: inherit;
	font-size: 1rem;
}

.dy-tools__input:focus {
	outline: none;
	border-color: var(--dy-ring);
	box-shadow: 0 0 0 3px var(--dy-ring-soft);
}

.dy-tools__textarea {
	padding-block: 10px;
	resize: vertical;
}

.dy-tools__fx-row {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
	align-items: end;
	gap: 6px;
}

.dy-tools__swap {
	margin-block-end: 2px;
}

.dy-tools__fx-result {
	display: block;
	min-height: 48px;
	padding: 10px 12px;
	border-radius: var(--dy-radius-lg);
	background: var(--dy-primary-soft);
	color: var(--dy-primary);
	font-size: 1.25rem;
	font-weight: 800;
	font-variant-numeric: tabular-nums;
	text-align: end;
}

.dy-tools__badge {
	display: inline-block;
	margin-inline-start: 6px;
	padding: 1px 8px;
	border-radius: var(--dy-radius-full);
	background: var(--dy-warning-soft);
	color: var(--dy-warning);
	font-size: 0.68rem;
	font-weight: 800;
}

.dy-tools__rate-row {
	display: flex;
	gap: 6px;
}

.dy-tools__rate-row .dy-tools__input {
	flex: 1;
	min-width: 0;
}

.dy-tools__empty {
	margin: 0;
	color: var(--dy-text-muted);
	font-size: 0.78rem;
	line-height: 1.7;
}

.dy-tools__notes {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.dy-tools__note {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 8px 10px;
	border: 1px solid var(--dy-border-soft);
	border-radius: var(--dy-radius-md);
	background: var(--dy-bg-sunken);
}

.dy-tools__note-text {
	flex: 1;
	min-width: 0;
	color: var(--dy-text);
	font-size: 0.84rem;
	line-height: 1.6;
	overflow-wrap: anywhere;
}

.dy-tools__share-preview {
	margin: 0;
	padding: 10px 12px;
	border: 1px dashed var(--dy-border-strong);
	border-radius: var(--dy-radius-md);
	color: var(--dy-text-secondary);
	font-size: 0.82rem;
	line-height: 1.8;
	white-space: pre-line;
}

.dy-tools__foot {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--dy-border-soft);
}

/* الموبايل: ورقة سفلية بإبهام مريح ومنطقة آمنة */
@media (max-width: 680px) {
	.dy-tools__panel {
		inset-block-start: auto;
		inset-block-end: 0;
		inset-inline: 0;
		width: auto;
		max-height: 88dvh;
		padding-block-end: max(14px, env(safe-area-inset-bottom));
		border-end-start-radius: 0;
		border-end-end-radius: 0;
		border-block-end: 0;
	}

	.dy-tools__calc-key {
		min-height: 48px;
	}
}

@media (pointer: coarse), (hover: none) {
	.dy-tools__calc-key,
	.dy-tools__input {
		min-height: 44px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.dy-tools__panel {
		transition: none;
	}
}
</style>
