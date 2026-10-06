<template>
    <div
        class="dy-skeleton-group"
        role="status"
        :aria-label="__('Loading')"
    >
        <template v-for="n in count" :key="n">
            <div
                v-if="variant === 'card'"
                class="dy-skeleton dy-skeleton--card"
            >
                <div class="dy-skeleton__line dy-skeleton__line--title" />
                <div class="dy-skeleton__line dy-skeleton__line--text" />
                <div
                    class="dy-skeleton__line dy-skeleton__line--text dy-skeleton__line--short"
                />
            </div>

            <div
                v-else-if="variant === 'text'"
                class="dy-skeleton dy-skeleton--text"
            >
                <div
                    v-for="i in lines"
                    :key="`${n}-${i}`"
                    :class="[
                        'dy-skeleton__line dy-skeleton__line--text',
                        i === lines ? 'dy-skeleton__line--text--short' : '',
                    ]"
                />
            </div>

            <div
                v-else-if="variant === 'input'"
                class="dy-skeleton dy-skeleton--input"
            >
                <div class="dy-skeleton__line dy-skeleton__line--input" />
                <div
                    class="dy-skeleton__line dy-skeleton__line--input dy-skeleton__line--input--short"
                />
            </div>

            <div
                v-else-if="variant === 'button'"
                class="dy-skeleton dy-skeleton--button"
            >
                <div class="dy-skeleton__line" :class="sizeClass" />
            </div>

            <div
                v-else-if="variant === 'kpi'"
                class="dy-skeleton dy-skeleton--kpi"
            >
                <div class="dy-skeleton__line dy-skeleton__line--label" />
                <div class="dy-skeleton__line dy-skeleton__line--value" />
                <div class="dy-skeleton__line dy-skeleton__line--trend" />
            </div>

            <div
                v-else-if="variant === 'chart'"
                class="dy-skeleton dy-skeleton--chart"
            >
                <div class="dy-skeleton__line dy-skeleton__line--title" />
                <div class="dy-skeleton__line dy-skeleton__line--chart-area" />
            </div>

            <div v-else class="dy-skeleton">
                <div class="dy-skeleton__line" />
            </div>
        </template>
    </div>
</template>

<script setup>
import { computed } from "vue"

import { __ } from "@/utils/translation"

const props = defineProps({
	variant: {
		type: String,
		default: "card",
		validator: (v) =>
			["card", "text", "input", "button", "kpi", "chart"].includes(v),
	},
	count: {
		type: Number,
		default: 1,
	},
	lines: {
		type: Number,
		default: 3,
	},
	size: {
		type: String,
		default: "md",
		validator: (v) => ["sm", "md", "lg", "xl"].includes(v),
	},
})

const sizeClass = computed(() => {
	switch (props.size) {
		case "sm":
			return "dy-skeleton__line--button-sm"
		case "lg":
			return "dy-skeleton__line--button-lg"
		case "xl":
			return "dy-skeleton__line--button-xl"
		default:
			return "dy-skeleton__line--button-md"
	}
})
</script>

<style scoped>
.dy-skeleton-group {
    display: flex;
    flex-direction: column;
    gap: var(--dy-space-4, 16px);
    min-width: 0;
}

.dy-skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--dy-space-3, 12px);
    min-width: 0;
}

.dy-skeleton__line {
    background: linear-gradient(
        90deg,
        var(--dy-bg-sunken) 25%,
        var(--dy-border-soft) 50%,
        var(--dy-bg-sunken) 75%
    );
    background-size: 200% 100%;
    border-radius: var(--dy-radius-md);
    animation: dy-skeleton-shimmer 1.5s var(--dy-ease-standard) infinite;
    overflow: hidden;
}

@keyframes dy-skeleton-shimmer {
    0% {
        background-position: 200% 0;
    }
    100% {
        background-position: -200% 0;
    }
}

/* Card variant */
.dy-skeleton--card {
    padding: var(--dy-space-4, 16px);
    border: 1px solid var(--dy-border-soft);
    border-radius: var(--dy-radius-lg);
    background: var(--dy-surface);
}

.dy-skeleton--card .dy-skeleton__line--title {
    height: 16px;
    width: 60%;
    border-radius: var(--dy-radius-sm);
    margin-bottom: var(--dy-space-2, 8px);
}

.dy-skeleton--card .dy-skeleton__line--text {
    height: 12px;
    width: 100%;
    border-radius: var(--dy-radius-sm);
    margin-bottom: var(--dy-space-2, 8px);
}

.dy-skeleton--card .dy-skeleton__line--short {
    width: 40%;
}

/* Text variant */
.dy-skeleton--text .dy-skeleton__line--text {
    height: 12px;
    width: 100%;
    border-radius: var(--dy-radius-sm);
    margin-bottom: var(--dy-space-2, 8px);
}

.dy-skeleton--text .dy-skeleton__line--text--short {
    width: 45%;
}

/* Input variant */
.dy-skeleton--input .dy-skeleton__line--input {
    height: var(--dy-control-h-lg, 44px);
    width: 100%;
    border-radius: var(--dy-radius-lg);
    margin-bottom: var(--dy-space-4, 16px);
}

.dy-skeleton--input .dy-skeleton__line--input--short {
    width: 60%;
}

/* Button variant */
.dy-skeleton__line--button {
    width: 100%;
    border-radius: var(--dy-radius-lg);
}

.dy-skeleton__line--button-sm {
    height: 32px;
}

.dy-skeleton__line--button-md {
    height: 44px;
}

.dy-skeleton__line--button-lg {
    height: 52px;
}

.dy-skeleton__line--button-xl {
    height: 56px;
}

/* KPI variant */
.dy-skeleton--kpi {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--dy-space-4, 16px);
}

.dy-skeleton--kpi .dy-skeleton__line--label {
    height: 14px;
    width: 50%;
    border-radius: var(--dy-radius-sm);
    margin-bottom: var(--dy-space-1, 4px);
}

.dy-skeleton--kpi .dy-skeleton__line--value {
    height: 28px;
    width: 70%;
    border-radius: var(--dy-radius-sm);
    margin-bottom: var(--dy-space-2, 8px);
}

.dy-skeleton--kpi .dy-skeleton__line--trend {
    height: 12px;
    width: 30%;
    border-radius: var(--dy-radius-sm);
}

/* Chart variant */
.dy-skeleton--chart {
    border: 1px solid var(--dy-border-soft);
    border-radius: var(--dy-radius-lg);
    background: var(--dy-surface);
    padding: var(--dy-space-4, 16px);
}

.dy-skeleton--chart .dy-skeleton__line--title {
    height: 16px;
    width: 30%;
    border-radius: var(--dy-radius-sm);
    margin-bottom: var(--dy-space-4, 16px);
}

.dy-skeleton--chart .dy-skeleton__line--chart-area {
    height: 200px;
    width: 100%;
    border-radius: var(--dy-radius-lg);
}

@media (prefers-reduced-motion: reduce) {
    .dy-skeleton__line {
        animation: none;
        background: var(--dy-bg-sunken);
    }
}
</style>