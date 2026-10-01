<template>
	<section class="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5" aria-labelledby="industry-profile-title">
		<div class="mb-4 flex items-start justify-between gap-4">
			<div>
				<h3 id="industry-profile-title" class="text-base font-bold text-slate-900">بيئة تشغيل المنشأة</h3>
				<p class="mt-1 text-xs leading-5 text-slate-600">اختر نشاطك ليقترح DyPOS القدرات المناسبة تلقائيًا، ويمكن تغيير ذلك لاحقًا.</p>
			</div>
			<span class="rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-700">{{ enabledCount }} قدرة</span>
		</div>

		<div class="mb-4 flex flex-col gap-2 sm:flex-row">
			<input
				v-model="activityText"
				class="min-h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-indigo-200 focus:ring-2"
				placeholder="اكتب وصف نشاطك للحصول على توصية ذكية..."
				aria-label="وصف نشاط المنشأة"
				@input="store.suggest(activityText)"
			>
			<button
				v-if="activityText"
				type="button"
				class="min-h-10 rounded-lg bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-700"
				@click="applyRecommendation"
			>
				تطبيق التوصية
			</button>
		</div>
		<div v-if="store.recommendations.length" class="mb-4 flex flex-wrap gap-2">
			<button
				v-for="recommendation in store.recommendations"
				:key="recommendation.id"
				type="button"
				class="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
				@click="store.setIndustry(recommendation.id)"
			>
				{{ recommendation.name }}
			</button>
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
			<button
				v-for="entry in profiles"
				:key="entry.id"
				type="button"
				class="rounded-lg border bg-white p-3 text-start transition"
				:class="store.industryIds.includes(entry.id) ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300'"
				:aria-pressed="store.industryIds.includes(entry.id)"
				@click="toggleIndustry(entry.id)"
			>
				<strong class="block text-sm text-slate-900">{{ entry.name }}</strong>
				<span class="mt-1 block text-xs leading-5 text-slate-500">{{ entry.description }}</span>
			</button>
		</div>

		<p class="mt-4 text-xs text-slate-600">
			القدرات المفعّلة:
			<strong class="text-indigo-700">{{ capabilityNames.join("، ") }}</strong>
		</p>
	</section>
</template>

<script setup>
import { computed } from "vue"
import { ref } from "vue"
import { CAPABILITY_LABELS, INDUSTRY_PROFILES } from "@/config/industryProfiles"
import { useIndustryProfileStore } from "@/stores/industryProfile"

const profiles = INDUSTRY_PROFILES
const store = useIndustryProfileStore()
const activityText = ref("")
const enabledCount = computed(() => store.capabilities.length)
const capabilityNames = computed(() =>
	store.capabilities.map(
		(capability) => CAPABILITY_LABELS[capability] || capability,
	),
)

function toggleIndustry(id) {
	const selected = store.industryIds.includes(id)
	const next = selected
		? store.industryIds.filter((entry) => entry !== id)
		: [...store.industryIds, id]
	store.setIndustries(next)
}

function applyRecommendation() {
	const recommendation = store.recommendations[0]
	if (recommendation) store.setIndustry(recommendation.id)
}
</script>
