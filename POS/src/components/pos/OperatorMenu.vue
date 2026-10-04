<template>
	<!--
		قائمة المشغّل — تُفتح من رقاقة اسم الكاشير في رأس شاشة البيع.

		لماذا قائمة: الزر يحمل أيقونة قائمة هابطة ومؤشّر «انقر»، فالكاشير
		يتوقّع قائمة، وقبل هذا الإصلاح لم يكن يحدث شيء إطلاقًا. الزر الميت
		أسوأ من الزر الغائب — يُعلّم المستخدم أن الشاشة تكذب.

		كل إجراء هنا وجهةٌ موجودة ومُختبَرة في مكان آخر؛ القائمة لا تخترع مسارًا.
	-->
	<Dialog v-model="show" :options="{ title: __('حسابي'), size: 'sm' }">
		<template #body-content>
			<div class="flex flex-col gap-3">
				<div
					class="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
				>
					<div
						class="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white"
						aria-hidden="true"
					>
						{{ initials }}
					</div>
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold text-gray-900">{{ userName }}</p>
						<p class="text-xs text-gray-600">{{ roleLabel }}</p>
					</div>
				</div>

				<div class="flex flex-col gap-2">
					<Button
						v-for="item in items"
						:key="item.key"
						variant="secondary"
						size="sm"
						class="w-full justify-start"
						@click="run(item.key)"
					>
						{{ item.label }}
					</Button>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { computed } from "vue"
import { Button, Dialog } from "dypos-ui"
import { sessionRole, sessionUser } from "@/data/session"
import { __ } from "@/utils/translation"

/**
 * تسميات الأدوار — من القيم التي يقبلها الخادم فعلًا (`ALLOWED_ROLES` في
 * routes/auth.js). قيمة غير معروفة تُعرض كما هي بدل أن تُختلق لها تسمية.
 */
const ROLE_LABELS = {
	ADMIN: "مدير النظام",
	MANAGER: "مدير فرع",
	CASHIER: "كاشير",
}

/** كل إجراء هنا وجهة موجودة بالفعل في التطبيق. */
const items = [
	{ key: "work", label: "شاشات العمل" },
	{ key: "settlements", label: "تسويات الوردية" },
	{ key: "settings", label: "الإعدادات" },
	{ key: "logout", label: "إنهاء الجلسة" },
]

const props = defineProps({
	open: { type: Boolean, default: false },
})
const emit = defineEmits(["close", "action"])

const show = computed({
	get: () => props.open,
	set: (value) => {
		if (!value) emit("close")
	},
})

const userName = computed(() => sessionUser() || "")

const initials = computed(() => {
	const name = userName.value.trim()
	if (!name) return "؟"
	// اسم محلّي أو بريد: أول حرفين من أول كلمتين، وإلا أول حرفين من الاسم.
	const parts = name.split(/[\s@._-]+/).filter(Boolean)
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
	return name.slice(0, 2).toUpperCase()
})

const roleLabel = computed(() => {
	const role = sessionRole()
	return ROLE_LABELS[role] || role || "—"
})

function run(key) {
	emit("action", key)
}
</script>
