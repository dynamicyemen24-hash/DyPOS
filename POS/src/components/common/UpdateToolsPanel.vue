<!-- Update tools panel — always reachable, not only inside the banner.
The update banner appears only when an update is DETECTED. A device stuck
on a poisoned worker may never detect anything, so the repair tools
(manual check, auto-update switch, cache surgery) must also live where a
stranded owner looks: the login "system tools" section. Same actions, same
composable, no second implementation. -->
<script setup>
import { onBeforeUnmount, ref } from "vue"
import { useAppUpdate } from "@/composables/useAppUpdate"
import { FeatherIcon } from "dypos-ui"

const {
	autoUpdate,
	setAutoUpdate,
	checking,
	checkForUpdate,
	cacheClearing,
	clearAppCaches,
} = useAppUpdate()

const clearArmed = ref(false)
let clearTimer = null

function onClearCaches() {
	if (cacheClearing.value) return
	if (!clearArmed.value) {
		clearArmed.value = true
		if (clearTimer) window.clearTimeout(clearTimer)
		clearTimer = window.setTimeout(() => {
			clearArmed.value = false
			clearTimer = null
		}, 6000)
		return
	}
	if (clearTimer) {
		window.clearTimeout(clearTimer)
		clearTimer = null
	}
	clearArmed.value = false
	void clearAppCaches()
}

onBeforeUnmount(() => {
	if (clearTimer) window.clearTimeout(clearTimer)
})
</script>

<template>
	<div class="dy-update-tools" data-testid="update-tools">
		<button
			type="button"
			class="dy-update-tools__btn"
			data-testid="update-check"
			:disabled="checking"
			@click="checkForUpdate"
		>
			<FeatherIcon name="search" :size="15" aria-hidden="true" />
			{{ checking ? "جارٍ الفحص…" : "فحص التحديث الآن" }}
		</button>
		<label class="dy-update-tools__btn dy-update-tools__toggle">
			<input
				type="checkbox"
				data-testid="update-auto"
				:checked="autoUpdate"
				@change="setAutoUpdate($event.target.checked)"
			/>
			<span>تحديث تلقائي عند الاتصال</span>
		</label>
		<button
			type="button"
			class="dy-update-tools__btn dy-update-tools__btn--danger"
			:class="{ 'dy-update-tools__btn--armed': clearArmed }"
			data-testid="update-clear-cache"
			:disabled="cacheClearing"
			@click="onClearCaches"
		>
			<FeatherIcon name="trash-2" :size="15" aria-hidden="true" />
			{{
				cacheClearing
					? "جارٍ المسح…"
					: clearArmed
						? "تأكيد مسح الكاش؟ (المبيعات بأمان)"
						: "مسح الكاش وإعادة التحميل"
			}}
		</button>
	</div>
</template>

<style scoped>
.dy-update-tools {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.dy-update-tools__btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 36px;
	padding: 6px 12px;
	border: 1px solid var(--dy-border);
	border-radius: 8px;
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 0.78rem;
	cursor: pointer;
}
.dy-update-tools__btn:disabled {
	opacity: 0.55;
	cursor: wait;
}
.dy-update-tools__btn--armed {
	border-color: var(--dy-warning, #b45309);
}
.dy-update-tools__toggle {
	cursor: pointer;
}
.dy-update-tools__toggle input {
	width: 18px;
	height: 18px;
}
</style>
