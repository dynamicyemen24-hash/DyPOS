<template>
  <nav v-if="totalPages > 1" class="flex items-center justify-between gap-2 py-3" :aria-label="__('Pagination')">
    <button
      type="button"
      class="dy-btn dy-btn-ghost dy-btn-sm"
      :disabled="currentPage <= 1"
      :aria-label="__('Previous page')"
      @click="goTo(currentPage - 1)"
    >
      <FeatherIcon name="chevron-left" class="w-4 h-4" />
    </button>

    <div class="flex items-center gap-1" role="group">
      <button
        v-for="page in visiblePages"
        :key="page"
        type="button"
        class="min-w-[32px] h-8 px-2 rounded-md text-sm font-medium"
        :class="page === currentPage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'"
        :aria-current="page === currentPage ? 'page' : undefined"
        :aria-label="__('Page') + ' ' + page"
        @click="goTo(page)"
      >
        {{ page }}
      </button>
    </div>

    <button
      type="button"
      class="dy-btn dy-btn-ghost dy-btn-sm"
      :disabled="currentPage >= totalPages"
      :aria-label="__('Next page')"
      @click="goTo(currentPage + 1)"
    >
      <FeatherIcon name="chevron-right" class="w-4 h-4" />
    </button>
  </nav>
</template>

<script setup>
import { computed } from "vue"
import { FeatherIcon } from "frappe-ui"

const props = defineProps({
	currentPage: { type: Number, required: true, default: 1 },
	totalPages: { type: Number, required: true, default: 1 },
})

const emit = defineEmits(["page-change"])

const visiblePages = computed(() => {
	const total = props.totalPages
	const current = props.currentPage
	const delta = 2
	const start = Math.max(1, current - delta)
	const end = Math.min(total, current + delta)
	const pages = []
	for (let i = start; i <= end; i++) pages.push(i)
	return pages
})

function goTo(page) {
	if (page < 1 || page > props.totalPages || page === props.currentPage) return
	emit("page-change", page)
}
</script>
