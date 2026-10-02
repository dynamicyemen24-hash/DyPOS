<template>
	<!--
		شاشة عرض الطابور للزبون.

		`aria-live="polite"` على الأرقام: قارئ الشاشة يجب أن ينطق الرقم
		الجديد دون مقاطعة من يقرأ شيئًا آخر — هذه هي القيمة الوحيدة
		التي تخرج من هنا لزبون أصمّ.

		ملاحظة على «لا يوجد منتظرون»: ليست حالة عرض بل نتيجة قياس. إن
		تعذّر تحميل الطابور نعرض التحذير ونُخفي العدّاد، لأن «صفر» و
		«تعذّر القراءة» رقمان مختلفان تمامًا أمام زبون ينتظر.
	-->
	<section
		class="queue-display"
		:dir="dir"
		:aria-label="title"
		:aria-busy="loading"
	>
		<header class="queue-display__header">
			<h2 class="queue-display__title">{{ title }}</h2>
			<p v-if="serviceName" class="queue-display__service">{{ serviceName }}</p>
			<span class="queue-display__source" :data-source="source">
				{{ sourceNote }}
			</span>
		</header>

		<p v-if="error" class="queue-display__error" role="alert">{{ error }}</p>

		<template v-else>
			<div class="queue-display__now" aria-live="polite" aria-atomic="true">
				<span class="queue-display__now-label">الآن يُخدم</span>
				<strong
					class="queue-display__now-ticket"
					:data-empty="String(!nowServing)"
				>
					{{ nowServing ? nowServing.number : "—" }}
				</strong>
				<span v-if="nowServing?.counterName" class="queue-display__now-counter">
					{{ nowServing.counterName }}
				</span>
			</div>

			<div v-if="recentlyCalled.length" class="queue-display__recent">
				<h3 class="queue-display__section-title">آخر النداءات</h3>
				<ul class="queue-display__recent-list">
					<li
						v-for="entry in recentlyCalled"
						:key="entry.id"
						class="queue-display__recent-item"
					>
						{{ entry.number }}
					</li>
				</ul>
			</div>

			<div class="queue-display__waiting">
				<h3 class="queue-display__section-title">
					المنتظرون
					<span class="queue-display__count">{{ waiting.length }}</span>
				</h3>
				<ul v-if="waiting.length" class="queue-display__waiting-list">
					<li
						v-for="ticket in waitingNumbers"
						:key="ticket"
						class="queue-display__waiting-item"
					>
						{{ ticket }}
					</li>
				</ul>
				<p v-else class="queue-display__empty" role="status">{{ emptyMessage }}</p>
			</div>
		</template>
	</section>
</template>

<script setup>
/**
 * شاشة العميل — عرض فقط.
 *
 * لا تكتب في الطابور ولا تحسب: تقرأ `useCashierQueue` وتُصيغ. أي حساب
 * هنا سيكون حسابًا ثانيًا لنفس القيمة — وهو ما تنهى إليه المواصفة.
 */
import { computed, onMounted } from "vue"

import { useCashierQueue } from "@/components/selfCheckout/queue/features/cashier/hooks/useCashierQueue"
import { DEFAULT_DISPLAY_WINDOW } from "@/components/selfCheckout/queue/shared/constants/queue.constants"

const props = defineProps({
	title: { type: String, default: "الطابور" },
	serviceId: { type: String, default: "" },
	counterId: { type: String, default: "" },
	/** `rtl` عربية · `ltr` إنجليزية. */
	dir: { type: String, default: "rtl" },
})

const queue = useCashierQueue({
	counterId: props.counterId,
	// شاشة العميل صامتة: النداء الصوتي من الكاونتر لا من هنا، ولو نطقت
	// الشاشة لتكلّمت كل شاشات الصالة معًا.
	silent: true,
})

const {
	waiting,
	counters,
	currentTicket,
	loading,
	error,
	refresh,
	statistics,
} = queue

const source = computed(() => (error.value ? "unavailable" : "local"))
const sourceNote = computed(() =>
	error.value ? "تعذّر قراءة الطابور" : "يعمل دون اتصال",
)

const serviceName = computed(() =>
	props.serviceId
		? (queue.services.value.find((s) => s.id === props.serviceId)?.name ?? "")
		: "",
)

const nowServing = computed(() => currentTicket.value)

/** آخر خمسة نداءات — الزبون الذي فاته نداءه يجد رقمه هنا. */
const recentlyCalled = computed(() =>
	counters.value
		.map((counter) => {
			const ticket = queue.tickets.value.find(
				(t) => t.id === counter.currentTicketId,
			)
			return ticket ? { id: ticket.id, number: ticket.number } : null
		})
		.filter((entry) => entry !== null)
		.slice(0, 5),
)

/** أرقام المنتظرين مقصوصة على نافذة العرض. */
const waitingNumbers = computed(() =>
	queue.waiting.value
		.slice(0, DEFAULT_DISPLAY_WINDOW)
		.map((ticket) => ticket.number),
)

const emptyMessage = computed(() =>
	statistics.value.completed > 0
		? "تمّت خدمة الجميع — شكرًا لزيارتكم"
		: "لا يوجد منتظرون حاليًا",
)

onMounted(refresh)
</script>

<style scoped>
/*
 * شاشة العرض: تُقرأ من مسافة، لذلك المسافات والحدود تتبع طبقة نظام
 * التصميم (`--dy-space-*` / `--dy-radius-*`) لا قيماً خام — وإلا ظهرت
 * بمقاسات لا تطابق بقية الشاشات على الجهاز نفسه.
 */
.queue-display {
	display: flex;
	flex-direction: column;
	gap: var(--dy-space-4);
	padding: var(--dy-space-5);
	background: var(--dy-bg);
	border: var(--dy-border-width-thin) solid var(--dy-border);
	border-radius: var(--dy-radius-lg);
}

.queue-display__header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: var(--dy-space-3);
	flex-wrap: wrap;
}

.queue-display__title {
	margin: 0;
	font-size: var(--dy-text-2xl);
	font-weight: 700;
}

.queue-display__service {
	margin: 0;
	font-size: var(--dy-text-base);
	color: var(--dy-text-muted);
}

.queue-display__source {
	font-size: var(--dy-text-xs);
	color: var(--dy-text-muted);
}

.queue-display__source[data-source="unavailable"] {
	color: var(--dy-color-status-warning-text);
}

.queue-display__error {
	padding: var(--dy-space-3) var(--dy-space-4);
	color: var(--dy-color-status-danger-text);
	background: rgb(239 68 68 / 10%);
	border-radius: var(--dy-radius-sm);
}

.queue-display__now {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: var(--dy-space-1);
	padding: var(--dy-space-6) var(--dy-space-4);
	background: var(--dy-bg-sunken);
	border-radius: var(--dy-radius-lg);
}

.queue-display__now-label {
	font-size: var(--dy-text-base);
	color: var(--dy-text-muted);
}

/* الرقم بحجم يقرأ من 3 أمتار — الهدف من الشاشة، لا زينة. */
.queue-display__now-ticket {
	font-size: var(--dy-text-5xl);
	font-weight: 800;
	line-height: 1.1;
	color: var(--dy-color-interactive-primary-bg);
	font-variant-numeric: tabular-nums;
}

.queue-display__now-ticket[data-empty="true"] {
	color: var(--dy-text-muted);
}

.queue-display__now-counter {
	font-size: var(--dy-text-xl);
	color: var(--dy-text);
}

.queue-display__section-title {
	display: flex;
	align-items: center;
	gap: var(--dy-space-2);
	margin: 0 0 var(--dy-space-2);
	font-size: var(--dy-text-lg);
	font-weight: 600;
}

.queue-display__count {
	padding: 0 var(--dy-space-2);
	font-size: var(--dy-text-sm);
	background: var(--dy-bg-sunken);
	border-radius: var(--dy-radius-pill);
}

.queue-display__recent-list,
.queue-display__waiting-list {
	display: flex;
	flex-wrap: wrap;
	gap: var(--dy-space-2);
	margin: 0;
	padding: 0;
	list-style: none;
}

.queue-display__recent-item,
.queue-display__waiting-item {
	padding: var(--dy-space-2) var(--dy-space-3);
	font-size: var(--dy-text-xl);
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	background: var(--dy-bg-sunken);
	border-radius: var(--dy-radius-md);
}

.queue-display__recent-item {
	color: var(--dy-text-muted);
}

.queue-display__empty {
	margin: 0;
	font-size: var(--dy-text-lg);
	color: var(--dy-text-muted);
}

@media (prefers-reduced-motion: reduce) {
	.queue-display__now {
		transition: none;
	}
}
</style>

