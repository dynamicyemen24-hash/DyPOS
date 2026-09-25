<!--
	DyPOS Sync Center — runtime destination sync screen.

	The device always works offline against its local store. When the
	operator must push sales elsewhere (another branch, the cloud), they
	pick the DESTINATION here at runtime — no build-time URL, no redeploy —
	then sync. The built-in "الخادم الحالي" keeps the legacy same-origin
	path byte-identical.
-->
<template>
	<Dialog
		v-model="show"
		:options="{ title: __('مركز المزامنة'), size: 'xl' }"
	>
		<template #body-content>
			<div class="flex flex-col gap-4">
				<!-- Status header -->
				<div
					class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 rounded-lg border"
					:class="
						isOffline
							? 'bg-gray-50 border-gray-200'
							: 'bg-emerald-50 border-emerald-200'
					"
				>
					<div class="min-w-0">
						<h3 class="font-semibold text-gray-900 text-sm sm:text-base">
							{{
								isOffline
									? __("غير متصل — يعمل محليًا")
									: __("{0} فاتورة معلقة", [pending.length])
							}}
						</h3>
						<p class="text-xs sm:text-sm text-gray-600 truncate">
							{{ statusLine }}
						</p>
					</div>
					<Button
						v-if="!isOffline && pending.length > 0"
						:loading="syncing"
						variant="solid"
						class="flex-shrink-0 whitespace-nowrap w-full sm:w-auto text-sm"
						@click="syncNow"
					>
						{{ __("مزامنة الآن") }}
					</Button>
				</div>

				<!-- Destinations -->
				<div>
					<div class="flex items-center justify-between mb-2">
						<h4 class="font-semibold text-gray-900 text-sm">
							{{ __("وجهة المزامنة") }}
						</h4>
						<button
							type="button"
							class="text-xs text-indigo-600 hover:text-indigo-800"
							@click="openForm(null)"
						>
							{{ __("+ وجهة جديدة") }}
						</button>
					</div>
					<div class="flex flex-col gap-2">
						<button
							v-for="dest in destinations"
							:key="dest.id"
							type="button"
							class="flex items-center justify-between gap-2 border rounded-lg p-3 text-start transition-colors"
							:class="
								dest.id === activeId
									? 'border-indigo-500 bg-indigo-50'
									: 'border-gray-200 hover:bg-gray-50'
							"
							@click="selectDestination(dest.id)"
						>
							<div class="min-w-0">
								<div class="flex items-center gap-2">
									<span
										class="w-2 h-2 rounded-full flex-shrink-0"
										:class="destDot(dest.id)"
									/>
									<span class="font-medium text-gray-900 text-sm truncate">
										{{ dest.name }}
									</span>
									<span
										class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0"
									>
										{{ kindLabel(dest.kind) }}
									</span>
								</div>
								<p class="text-xs text-gray-500 truncate mt-0.5">
									{{ destLine(dest) }}
								</p>
							</div>
							<span
								v-if="dest.id !== LOCAL_ID"
								role="button"
								tabindex="0"
								class="text-xs text-gray-500 hover:text-indigo-700 flex-shrink-0"
								@click.stop="openForm(dest)"
								@keydown.enter.stop="openForm(dest)"
							>
								{{ __("تعديل") }}
							</span>
						</button>
					</div>
				</div>

				<!-- Destination form -->
				<div
					v-if="formVisible"
					class="border border-indigo-200 rounded-lg p-3 sm:p-4 bg-indigo-50/50 flex flex-col gap-3"
				>
					<h4 class="font-semibold text-gray-900 text-sm">
						{{ editingId ? __("تعديل الوجهة") : __("وجهة جديدة") }}
					</h4>
					<label class="flex flex-col gap-1 text-xs text-gray-600">
						{{ __("الاسم") }}
						<input
							v-model="form.name"
							type="text"
							maxlength="60"
							class="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
							:placeholder="__('مثال: فرع العليا')"
						/>
					</label>
					<div class="grid grid-cols-2 gap-3">
						<label class="flex flex-col gap-1 text-xs text-gray-600">
							{{ __("النوع") }}
							<select
								v-model="form.kind"
								class="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
							>
								<option value="branch">{{ __("فرع") }}</option>
								<option value="cloud">{{ __("سحابة") }}</option>
							</select>
						</label>
						<label class="flex flex-col gap-1 text-xs text-gray-600">
							{{ __("المستخدم (للدخول)") }}
							<input
								v-model="form.username"
								type="text"
								maxlength="128"
								autocomplete="off"
								class="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
							/>
						</label>
					</div>
					<label class="flex flex-col gap-1 text-xs text-gray-600">
						{{ __("الرابط (http(s)://host[:port])") }}
						<input
							v-model="form.baseUrl"
							type="text"
							inputmode="url"
							maxlength="256"
							autocomplete="off"
							class="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 ltr:text-left"
							placeholder="http://192.168.1.20:3001"
						/>
					</label>
					<label class="flex flex-col gap-1 text-xs text-gray-600">
						{{ __("كلمة المرور (للاختبار والدخول فقط — لا تُحفظ)") }}
						<input
							v-model="form.password"
							type="password"
							autocomplete="new-password"
							class="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
						/>
					</label>
					<p v-if="formError" class="text-xs text-red-600">{{ formError }}</p>
					<p v-if="formNotice" class="text-xs text-emerald-700">
						{{ formNotice }}
					</p>
					<div class="flex flex-wrap gap-2">
						<Button
							variant="solid"
							class="text-sm"
							:loading="testing"
							@click="testDestination"
						>
							{{ __("اختبار الاتصال") }}
						</Button>
						<Button variant="subtle" class="text-sm" @click="saveForm">
							{{ __("حفظ") }}
						</Button>
						<Button
							v-if="editingId"
							variant="subtle"
							class="text-sm !text-red-600"
							@click="removeDestination"
						>
							{{ __("حذف") }}
						</Button>
						<Button variant="ghost" class="text-sm" @click="closeForm">
							{{ __("إلغاء") }}
						</Button>
					</div>
				</div>

				<!-- Pending list for the selected destination -->
				<div v-if="loading" class="flex items-center justify-center py-8">
					<div
						class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"
					/>
				</div>
				<div v-else-if="pending.length === 0" class="text-center py-8">
					<p class="text-gray-500 text-sm">
						{{ __("لا فواتير معلقة لهذه الوجهة") }}
					</p>
				</div>
				<div v-else class="flex flex-col gap-2 max-h-72 overflow-y-auto">
					<div
						v-for="invoice in pending"
						:key="invoice.id"
						class="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
					>
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-semibold text-gray-900 text-sm truncate">
								{{ invoice.data?.customer || __("Walk-in Customer") }}
							</span>
							<span
								v-if="invoice.retry_count > 0"
								class="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded-full"
							>
								{{ __("{0} failed", [invoice.retry_count]) }}
							</span>
							<span
								v-for="badge in syncedElsewhere(invoice)"
								:key="badge"
								class="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full"
							>
								{{ badge }}
							</span>
							<span class="ms-auto text-xs text-gray-500">
								{{ formatDate(invoice.timestamp) }}
							</span>
						</div>
					</div>
				</div>

				<p v-if="syncError" class="text-xs text-red-600">{{ syncError }}</p>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { Button, Dialog } from "frappe-ui"
import { computed, onMounted, ref, watch } from "vue"

import { usePOSSyncStore } from "@/stores/posSync"
import { getOfflineInvoices } from "@/utils/offline/sync"
import {
	LOCAL_DESTINATION_ID,
	deleteDestination,
	getActiveDestinationId,
	getDestinationState,
	getDestinationToken,
	listDestinations,
	saveDestination,
	setActiveDestinationId,
} from "@/services/sync-destinations"
import { loginDestination, pingDestination } from "@/services/sync-remote"

const props = defineProps({
	modelValue: Boolean,
})
const emit = defineEmits(["update:modelValue"])

const posSync = usePOSSyncStore()

const show = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})

const LOCAL_ID = LOCAL_DESTINATION_ID
const destinations = ref([])
const activeId = ref(LOCAL_DESTINATION_ID)
const pending = ref([])
const loading = ref(false)
const syncing = ref(false)
const syncError = ref("")
const formVisible = ref(false)
const editingId = ref(null)
const testing = ref(false)
const formError = ref("")
const formNotice = ref("")
const form = ref({
	name: "",
	kind: "branch",
	baseUrl: "",
	username: "",
	password: "",
})

const isOffline = computed(() => posSync.isOffline)

const activeDest = computed(
	() => destinations.value.find((d) => d.id === activeId.value) || null,
)

const statusLine = computed(() => {
	if (isOffline.value) {
		return __("البيع مستمر محليًا — ستُزامَن عند عودة الشبكة")
	}
	const st = getDestinationState(activeId.value)
	if (st.lastError) return st.lastError
	if (st.lastSyncAt) {
		return __("آخر مزامنة: {0}", [formatDate(Date.parse(st.lastSyncAt))])
	}
	return activeDest.value?.baseUrl || __("الخادم الحالي")
})

function kindLabel(kind) {
	return kind === "cloud"
		? __("سحابة")
		: kind === "branch"
			? __("فرع")
			: __("محلي")
}

function destDot(id) {
	const st = getDestinationState(id)
	if (st.lastError) return "bg-red-500"
	if (st.lastSyncAt) return "bg-emerald-500"
	return "bg-gray-300"
}

function destLine(dest) {
	if (!dest || dest.kind === LOCAL_DESTINATION_ID || dest.id === LOCAL_ID) {
		return __("نفس الخادم — المسار الحالي")
	}
	const st = getDestinationState(dest.id)
	const base = dest.baseUrl || ""
	if (st.lastError) return st.lastError
	if (st.lastSyncAt) {
		return `${base} • ${__("آخر مزامنة: {0}", [formatDate(Date.parse(st.lastSyncAt))])}`
	}
	return base
}

function formatDate(timestamp) {
	const date = new Date(Number(timestamp) || Date.now())
	const now = new Date()
	const diffInSeconds = Math.floor((now - date) / 1000)
	if (diffInSeconds < 60) return __("Just now")
	if (diffInSeconds < 3600)
		return __("{0} minutes ago", [Math.floor(diffInSeconds / 60)])
	if (diffInSeconds < 86400)
		return __("{0} hours ago", [Math.floor(diffInSeconds / 3600)])
	return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
}

function syncedElsewhere(invoice) {
	const map = invoice.syncedTo || {}
	return Object.entries(map)
		.filter(([id]) => id !== activeId.value && id !== LOCAL_ID)
		.map(([id]) => {
			const d = destinations.value.find((x) => x.id === id)
			return `✓ ${d ? d.name : id}`
		})
}

async function refresh() {
	destinations.value = listDestinations()
	activeId.value = getActiveDestinationId()
	await loadPending()
}

async function loadPending() {
	loading.value = true
	syncError.value = ""
	try {
		pending.value = await getOfflineInvoices(
			activeId.value === LOCAL_ID ? null : activeId.value,
		)
	} catch (error) {
		pending.value = []
		syncError.value = String(error?.message || error).slice(0, 200)
	} finally {
		loading.value = false
	}
}

async function selectDestination(id) {
	setActiveDestinationId(id)
	activeId.value = getActiveDestinationId()
	closeForm()
	await loadPending()
}

function openForm(dest) {
	editingId.value = dest?.id || null
	form.value = {
		name: dest?.name || "",
		kind: dest?.kind === "cloud" ? "cloud" : "branch",
		baseUrl: dest?.baseUrl || "",
		username: dest?.username || "",
		password: "",
	}
	formError.value = ""
	formNotice.value = ""
	formVisible.value = true
}

function closeForm() {
	formVisible.value = false
	editingId.value = null
	formError.value = ""
	formNotice.value = ""
	form.value = {
		name: "",
		kind: "branch",
		baseUrl: "",
		username: "",
		password: "",
	}
}

async function testDestination() {
	formError.value = ""
	formNotice.value = ""
	testing.value = true
	try {
		const draft = {
			id: editingId.value,
			name: form.value.name.trim() || "test",
			kind: form.value.kind,
			baseUrl: form.value.baseUrl,
			username: form.value.username,
		}
		// Validate via a throwaway save shape (not persisted).
		const { normalizeBaseUrl, validateDestination } = await import(
			"@/services/sync-destinations"
		)
		const check = validateDestination(draft)
		if (!check.ok) {
			formError.value = check.errors[0]
			return
		}
		const probe = {
			id: editingId.value || "probe",
			name: draft.name,
			kind: draft.kind,
			baseUrl: normalizeBaseUrl(draft.baseUrl, draft.kind),
		}
		const ping = await pingDestination(probe)
		if (!ping.ok) {
			formError.value = ping.message
			return
		}
		if (form.value.username.trim() && form.value.password) {
			const login = await loginDestination(
				probe,
				form.value.username.trim(),
				form.value.password,
			)
			if (!login.ok) {
				formError.value = login.message
				return
			}
			formNotice.value = __("متصل — وتم حفظ رمز الدخول")
			// Persist the token against the real id when editing.
			if (editingId.value) {
				const { setDestinationToken } = await import(
					"@/services/sync-destinations"
				)
				setDestinationToken(editingId.value, login.token)
			}
		} else {
			formNotice.value = __("الوجهة ترد — أدخل بيانات الدخول للحفظ الكامل")
		}
	} finally {
		testing.value = false
		form.value.password = ""
	}
}

function saveForm() {
	formError.value = ""
	const res = saveDestination({
		id: editingId.value,
		name: form.value.name,
		kind: form.value.kind,
		baseUrl: form.value.baseUrl,
		username: form.value.username,
	})
	if (!res.ok) {
		formError.value = res.errors[0]
		return
	}
	closeForm()
	refresh()
}

function removeDestination() {
	if (!editingId.value) return
	deleteDestination(editingId.value)
	closeForm()
	refresh()
}

async function syncNow() {
	if (posSync.isOffline || syncing.value) return
	syncing.value = true
	syncError.value = ""
	try {
		const dest =
			activeId.value === LOCAL_ID
				? null
				: destinations.value.find((d) => d.id === activeId.value) || null
		const { getDestinationToken } = await import("@/services/sync-destinations")
		const result = await posSync.syncPendingTo(
			dest,
			dest ? getDestinationToken(dest.id) : null,
		)
		if (result && result.failed > 0 && result.errors?.length) {
			const first = result.errors[0]?.error
			syncError.value = String(first?.message || first || "").slice(0, 200)
			if (first?.needsLogin) {
				syncError.value = `${syncError.value} — ${__("سجّل الدخول من الأعلى")}`
			}
		}
		await loadPending()
	} catch (error) {
		syncError.value = String(error?.message || error).slice(0, 200)
	} finally {
		syncing.value = false
	}
}

watch(show, async (visible) => {
	if (visible) await refresh()
})

// A dialog mounted already-open (initial v-model true) never triggers the
// watcher above — load explicitly so the screen is never an empty shell.
onMounted(() => {
	if (show.value) refresh()
})
</script>
