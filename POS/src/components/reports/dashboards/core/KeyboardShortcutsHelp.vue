<!--
  =============================================================================
  DyPOS — Keyboard Shortcuts Help Overlay
  Production Grade / RTL / Arabic Support
  =============================================================================
-->

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue"
import { FeatherIcon } from "frappe-ui"
import { useHotkeys, POS_SHORTCUT_DEFAULTS } from "@/composables/useHotkeys"

const showHelp = ref(false)

function openHelp() {
	showHelp.value = true
}

function closeHelp() {
	showHelp.value = false
}

function toggleHelp() {
	showHelp.value = !showHelp.value
}

defineExpose({ open: openHelp, close: closeHelp, toggle: toggleHelp })

const shortcuts = computed(() => {
	const catalog = []
	for (const shortcut of POS_SHORTCUT_DEFAULTS) {
		catalog.push({
			combo: shortcut.combo,
			label: shortcut.labelKey,
			category: shortcut.category,
			scope: shortcut.scope,
		})
	}
	return catalog
})

// Register Escape to close help
const hotkeys = useHotkeys("help-overlay", { priority: 100 })
hotkeys.register("Escape", {
	handler: closeHelp,
	label: "إغلاق",
})

// Allow any screen to open the overlay: window.dispatchEvent(new CustomEvent("dy:open-shortcuts"))
onMounted(() => {
	window.addEventListener("dy:open-shortcuts", openHelp)
})

onUnmounted(() => {
	window.removeEventListener("dy:open-shortcuts", openHelp)
})
</script>

<template>
	<teleport to="body">
		<transition name="dy-fade">
			<div
				v-if="showHelp"
				class="dy-shortcuts-overlay"
				role="dialog"
				aria-modal="true"
				aria-labelledby="dy-shortcuts-title"
				@click.self="closeHelp"
				@keydown.escape="closeHelp"
			>
				<div class="dy-shortcuts-overlay__panel">
					<div class="dy-shortcuts-overlay__header">
						<h2 id="dy-shortcuts-title">
							اختصارات لوحة المفاتيح
						</h2>

						<button
							type="button"
							class="dy-shortcuts-overlay__close"
							aria-label="إغلاق"
							@click="closeHelp"
						>
							<FeatherIcon name="x" :size="20" />
						</button>
					</div>

					<div class="dy-shortcuts-overlay__grid">
						<template
							v-for="category in ['system', 'navigation', 'sales', 'session']"
							:key="category"
						>
							<div class="dy-shortcuts-overlay__category">
								<h3>{{ category }}</h3>

								<div
									v-for="shortcut in shortcuts.filter(s => s.category === category)"
									:key="shortcut.combo"
									class="dy-shortcuts-overlay__item"
								>
									<kbd>{{ shortcut.combo }}</kbd>
									<span>{{ shortcut.label }}</span>
								</div>
							</div>
						</template>
					</div>

					<p class="dy-shortcuts-overlay__hint">
						اضغط Escape للإغلاق
					</p>
				</div>
			</div>
		</transition>
	</teleport>
</template>

<style scoped>
.dy-shortcuts-overlay {
	position: fixed;
	inset: 0;
	z-index: 10000;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgb(0 0 0 / 0.5);
}

.dy-shortcuts-overlay__panel {
	width: min(100%, 560px);
	max-height: 80vh;
	overflow-y: auto;

	background: var(--dy-bg);
	border-radius: var(--dy-radius-xl);
	box-shadow: 0 24px 64px rgb(0 0 0 / 0.3);
}

.dy-shortcuts-overlay__header {
	display: flex;
	align-items: center;
	justify-content: space-between;

	padding: 20px 24px;
	border-bottom: 1px solid var(--dy-border);
}

.dy-shortcuts-overlay__header h2 {
	margin: 0;
	color: var(--dy-text-strong);
	font-size: 1.2rem;
	font-weight: 800;
}

.dy-shortcuts-overlay__close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	border: 0;
	border-radius: var(--dy-radius-md);
	background: transparent;
	color: var(--dy-text-muted);
	cursor: pointer;
	transition: all 0.2s;
}

.dy-shortcuts-overlay__close:hover {
	background: var(--dy-surface);
	color: var(--dy-text-strong);
}

.dy-shortcuts-overlay__grid {
	padding: 16px 24px;
	display: flex;
	flex-direction: column;
	gap: 20px;
}

.dy-shortcuts-overlay__category h3 {
	margin: 0 0 8px;
	color: var(--dy-text-secondary);
	font-size: 0.8rem;
	font-weight: 750;
	text-transform: uppercase;
	letter-spacing: 0.05em;
}

.dy-shortcuts-overlay__item {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 6px 0;
}

.dy-shortcuts-overlay__item kbd {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 52px;
	padding: 4px 8px;

	background: var(--dy-surface);
	border: 1px solid var(--dy-border);
	border-radius: var(--dy-radius-md);

	font-family: var(--dy-font-arabic);
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--dy-text-strong);
}

.dy-shortcuts-overlay__item span {
	color: var(--dy-text);
	font-size: 0.9rem;
}

.dy-shortcuts-overlay__hint {
	margin: 0;
	padding: 12px 24px;
	text-align: center;
	color: var(--dy-text-muted);
	font-size: 0.75rem;
	border-top: 1px solid var(--dy-border);
}
</style>