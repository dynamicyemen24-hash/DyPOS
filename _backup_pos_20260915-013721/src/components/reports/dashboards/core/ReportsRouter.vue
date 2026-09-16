<template>
	<div class="reports-router">
		<!-- Tab Navigation -->
		<div class="flex flex-wrap gap-1 border-b border-gray-200 mb-6 no-print" role="tablist" aria-label="Dashboard tabs" @keydown="handleTabKeydown">
			<button
				v-for="tab in tabs"
				:key="tab.id"
				class="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2"
				:class="
					activeTab === tab.id
						? 'text-indigo-700 bg-indigo-50 border-indigo-600'
						: 'text-gray-500 hover:text-gray-700 border-transparent hover:border-gray-300'
				"
				role="tab"
				:id="'tab-' + tab.id"
				:aria-selected="activeTab === tab.id"
				:aria-controls="'tabpanel-' + tab.id"
				:tabindex="activeTab === tab.id ? 0 : -1"
				@click="switchTab(tab.id)"
			>
				<FeatherIcon :name="tab.icon" class="w-4 h-4" />
				{{ __(tab.name) }}
				<Badge v-if="tab.badge" :label="tab.badge" theme="subtle" size="sm" />
			</button>
		</div>

		<!-- Dynamic Dashboard Component -->
		<div
			v-if="activeComponent"
			:id="'tabpanel-' + activeTab"
			role="tabpanel"
			:aria-labelledby="'tab-' + activeTab"
			class="tabpanel-content"
		>
			<Suspense>
				<template #default>
					<component
						:is="activeComponent"
						v-if="activeComponent"
						:key="activeTab"
					/>
				</template>
				<template #fallback>
					<div class="flex items-center justify-center py-20">
						<div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
					</div>
				</template>
			</Suspense>
		</div>

		<!-- Fallback Error -->
		<div v-if="loadError" class="m-4 bg-red-50 border border-red-200 rounded-lg p-6 text-center">
			<FeatherIcon name="alert-triangle" class="w-8 h-8 text-red-400 mx-auto mb-2" />
			<p class="text-red-700 font-medium">{{ __("Failed to load dashboard") }}</p>
			<p class="text-red-500 text-sm mt-1">{{ loadError }}</p>
			<Button class="mt-3" variant="solid" @click="retryLoad">
				{{ __("Retry") }}
			</Button>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted, defineAsyncComponent } from "vue"
import { Button, Badge, FeatherIcon } from "frappe-ui"
import { DASHBOARD_REGISTRY } from "../index"
import ErrorBoundary from "./ErrorBoundary.vue"

const props = defineProps({
	/** Initial dashboard ID to show */
	initialTab: { type: String, default: "" },
	/** Filter tabs by category */
	category: { type: String, default: "" },
	/** Extra tabs to append */
	extraTabs: { type: Array, default: () => [] },
})

const emit = defineEmits(["tab-changed"])

const activeTab = ref("")
const loadError = ref("")

const allTabs = computed(() => {
	const registry = DASHBOARD_REGISTRY.map((d) => ({
		id: d.id,
		name: d.name,
		icon: d.icon || "bar-chart-2",
		category: d.category,
		component: d.component,
	}))
	return [...registry, ...props.extraTabs]
})

const tabs = computed(() => {
	let list = allTabs.value
	if (props.category) {
		list = list.filter((t) => t.category === props.category)
	}
	return list
})

const activeTabDef = computed(() =>
	tabs.value.find((t) => t.id === activeTab.value),
)
const activeComponent = computed(() => {
	if (!activeTabDef.value) return null
		const loader = activeTabDef.value.component
		return defineAsyncComponent({
			loader,
			loadingComponent: null,
			errorComponent: ErrorBoundary,
			delay: 200,
			timeout: 30000,
			onError(error, retry, fail) {
				loadError.value = error?.message || "Failed to load dashboard"
				fail()
			},
		})
})

function switchTab(id) {
	activeTab.value = id
	loadError.value = ""
	emit("tab-changed", id)
}

function retryLoad() {
	loadError.value = ""
	const current = activeTab.value
	activeTab.value = ""
	setTimeout(() => {
		activeTab.value = current
	}, 50)
}

function handleTabKeydown(e) {
	const tabList = tabs.value
	const currentIndex = tabList.findIndex((t) => t.id === activeTab.value)
	let newIndex
	if (e.key === "ArrowRight") {
		newIndex = (currentIndex + 1) % tabList.length
	} else if (e.key === "ArrowLeft") {
		newIndex = (currentIndex - 1 + tabList.length) % tabList.length
	} else {
		return
	}
	e.preventDefault()
	switchTab(tabList[newIndex].id)
	const tabBtns = e.currentTarget.querySelectorAll('[role="tab"]')
	if (tabBtns[newIndex]) tabBtns[newIndex].focus()
}

onMounted(() => {
	activeTab.value = props.initialTab || tabs.value[0]?.id || ""
})
</script>

<style scoped>
@media print {
	.no-print {
		display: none !important;
	}
}
</style>
