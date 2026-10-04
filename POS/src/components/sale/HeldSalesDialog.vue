<!--
    HeldSalesDialog — قائمة الفواتير المركونة.
    Extracted from `pages/POSSale.vue` (file-size ratchet): the dialog
    markup and its empty-state styling moved out verbatim — same classes,
    same Arabic copy, same overlay contract (click-self + close button).
-->
<template>
    <Teleport to="body">
        <div
            v-if="show"
            class="dy-pos-sale__overlay"
            role="dialog"
            aria-modal="true"
            aria-label="المبيعات المعلقة"
            @click.self="$emit('close')"
        >
            <section class="dy-pos-sale__dialog dy-pos-sale__held-dialog">
                <header>
                    <div>
                        <span> العمليات المؤجلة </span>

                        <h2>المبيعات المعلقة</h2>
                    </div>

                    <button
                        type="button"
                        aria-label="إغلاق"
                        @click="$emit('close')"
                    >
                        <FeatherIcon name="x" :size="20" />
                    </button>
                </header>

                <OpenInvoiceTabs
                    v-if="invoices.length"
                    layout="list"
                    :invoices="invoices"
                    :active-id="activeId"
                    @switch="$emit('switch', $event)"
                    @close="$emit('close-invoice', $event)"
                    @new="$emit('new')"
                />

                <div v-else class="dy-pos-sale__held-empty">
                    <span>
                        <FeatherIcon name="pause-circle" :size="28" />
                    </span>

                    <strong> لا توجد مبيعات معلقة </strong>

                    <p>علّق البيع الحالي بزر التعليق أو F4 لخدمة عميل آخر.</p>
                </div>
            </section>
        </div>
    </Teleport>
</template>

<script setup>
import { FeatherIcon } from "dypos-ui"

import OpenInvoiceTabs from "@/components/pos/OpenInvoiceTabs.vue"

defineProps({
	show: {
		type: Boolean,
		default: false,
	},
	invoices: {
		type: Array,
		default: () => [],
	},
	activeId: {
		type: [String, Number, null],
		default: null,
	},
})

defineEmits(["close", "switch", "close-invoice", "new"])
</script>

<style scoped>
.dy-pos-sale__held-empty {
    display: flex;
    align-items: center;
    justify-content: center;

    flex-direction: column;

    gap: 8px;

    min-height: 260px;

    padding: 30px;

    color: var(--dy-text-muted);

    text-align: center;
}

.dy-pos-sale__held-empty > span {
    display: flex;
    align-items: center;
    justify-content: center;

    width: 60px;
    height: 60px;

    margin-bottom: 4px;

    border-radius: 18px;

    background: var(--dy-surface-soft);
}

.dy-pos-sale__held-empty strong {
    color: var(--dy-text-strong);

    font-size: 0.9rem;
}

.dy-pos-sale__held-empty p {
    max-width: 340px;

    margin: 0;

    font-size: 0.75rem;
    line-height: 1.8;
}
</style>
