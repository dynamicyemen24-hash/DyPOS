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
				<Button
					v-if="!isOffline && failedRows.length > 0"
					:loading="syncing"
					variant="secondary"
					class="flex-shrink-0 whitespace-nowrap w-full sm:w-auto text-sm"
					@click="retryFailedRows"
				>
					{{ __("إعادة محاولة الفاشلة ({0})", [failedRows.length]) }}
				</Button>
			</div>

				<SyncRecoveryPanel
					v-if="failedRows.length > 0"
					:items="recoveryItems"
					:busy-ids="recoveryBusyIds"
					:action-errors="recoveryActionErrors"
					title="عمليات مزامنة تحتاج إلى معالجة"
					empty-message="لا توجد عمليات فاشلة"
					@retry="retryCanonicalOperation"
					@review="reviewCanonicalOperation"
				/>

			<!-- Linkage & automation — المتغيرات العامة التي يحددها المستخدم.
				ترتيب الخبير: الوضع أولًا، ثم المفتاح الرئيسي، ثم المحركات،
				ثم قطع الربط. لا شيء هنا يعمل وحده دون ضغطة أو تفعيل. -->
			<div class="border rounded-lg p-3 sm:p-4 flex flex-col gap-3">
				<div class="flex items-center justify-between gap-2">
					<h4 class="font-semibold text-gray-900 text-sm">
						{{ __("وضع الربط والأتمتة") }}
					</h4>
					<span
						class="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0"
						:class="
							linkMode === 'linked'
								? 'bg-emerald-100 text-emerald-700'
								: 'bg-gray-100 text-gray-600'
						"
					>
						{{
							linkMode === "linked" ? __("مرتبط") : __("مستقل — صفر اتصال")
						}}
					</span>
				</div>
				<p class="text-xs text-gray-600">
					{{
						linkMode === "linked"
							? __("الشبكة تعمل فقط عند طلبك، أو حسب الأتمتة أدناه.")
							: __("كل شيء يعمل على الجهاز. الربط لا يتم إلا بطلبك.")
					}}
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<Button
						v-if="linkMode !== 'linked'"
						variant="solid"
						class="text-xs"
						@click="grantLinkConsent"
					>
						{{ __("السماح بالاتصال عند الطلب") }}
					</Button>
					<Button
						variant="secondary"
						class="text-xs"
						:disabled="linkMode !== 'linked'"
						@click="toggleAutomationMaster"
					>
						{{
							autoMaster
								? __("إيقاف الأتمتة")
								: __("تفعيل المزامنة التلقائية")
						}}
					</Button>
					<button
						v-if="linkMode === 'linked'"
						type="button"
						class="text-xs text-red-600 hover:text-red-800 px-2 py-1"
						@click="unlinkDevice"
					>
						{{ __("قطع الربط") }}
					</button>
				</div>
				<div v-if="autoMaster" class="flex flex-col gap-2">
					<label
						v-for="trigger in triggerRows"
						:key="trigger.key"
						class="flex items-center justify-between gap-2 text-xs text-gray-700"
					>
						<span>{{ trigger.label }}</span>
						<span class="flex items-center gap-1">
							<select
								:value="autoModes[trigger.key]"
								class="rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-900"
								:aria-label="trigger.label"
								@change="setTrigger(trigger.key, $event.target.value)"
							>
								<option value="off">{{ __("إيقاف") }}</option>
								<option value="ask">{{ __("سؤال") }}</option>
								<option value="auto">{{ __("تلقائي") }}</option>
							</select>
							<input
								v-if="trigger.key === 'poll'"
								:value="pollSec"
								type="number"
								min="5"
								max="3600"
								class="w-16 rounded border border-gray-300 px-1.5 py-1 text-xs text-gray-900"
								:aria-label="__('الفاصل بالثواني')"
								@change="savePollInterval($event.target.value)"
							/>
						</span>
					</label>
				</div>
			</div>

			<div class="border rounded-lg p-3 sm:p-4 flex flex-col gap-3">
				<div>
					<h4 class="font-semibold text-gray-900 text-sm">
						{{ __("اتصالات الخدمات") }}
					</h4>
					<p class="mt-1 text-xs text-gray-600">
						{{ __("تُحفظ العناوين على هذا الجهاز فقط. الحفظ لا يختبر الاتصال ولا يرسل بيانات.") }}
					</p>
				</div>
				<label
					v-for="service in endpointRows"
					:key="service.key"
					class="flex flex-col gap-1 text-xs text-gray-700"
				>
					{{ service.label }}
					<input
						v-model="endpointDrafts[service.key]"
						type="url"
						inputmode="url"
						autocomplete="url"
						maxlength="256"
						class="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 ltr:text-left"
						:placeholder="endpointPlaceholder(service.key)"
					/>
				</label>
				<p class="text-[11px] text-gray-500">
					{{ __("رابط API مثال: https://server.example/api. اترك الحقل فارغًا لاستخدام إعداد البناء.") }}
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<Button variant="subtle" class="text-sm" @click="saveEndpoints">
						{{ __("حفظ العناوين") }}
					</Button>
					<Button
						variant="secondary"
						class="text-sm"
						:loading="endpointTestBusy"
						@click="testApiEndpoint"
					>
						{{ __("اختبار API الآن") }}
					</Button>
				</div>
				<p v-if="endpointMessage" class="text-xs" :class="endpointMessageClass">
					{{ endpointMessage }}
				</p>
				<p class="text-[11px] text-gray-500">
					{{ __("تغيير عنوان خدمة يلغي ربطها المحفوظ ويطلب موافقة جديدة؛ اختبار API اتصال لمرة واحدة بطلبك.") }}
				</p>
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
							placeholder="https://pos.example.com"
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
				<div v-else-if="pending.length === 0 && !pendingError" class="text-center py-8">
					<p class="text-gray-500 text-sm">
						{{ __("لا فواتير معلقة لهذه الوجهة") }}
					</p>
				</div>
				<div v-else-if="pendingError" class="text-center py-8">
					<p class="text-sm text-red-600">
						{{ __("تعذّر قراءة الفواتير المعلقة — لم يتم تأكيد أن الطابور فارغ") }}
					</p>
					<p class="text-xs text-gray-500 mt-1">{{ pendingError }}</p>
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
								v-if="invoice.source === 'canonical'"
								class="text-[10px] px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full"
							>
								{{
									invoice.queueStatus === "failed"
										? __("تحتاج مراجعة")
										: invoice.queueStatus === "syncing"
											? __("تُزامَن")
											: __("معلقة")
								}}
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
								{{ invoice.data?.invoiceNo || formatDate(invoice.timestamp) }}
							</span>
						</div>
					</div>
				</div>

				<p v-if="syncError" class="text-xs text-red-600">{{ syncError }}</p>
				<p v-if="syncNote" class="text-xs text-emerald-700">{{ syncNote }}</p>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { Button, Dialog } from "dypos-ui"
import { SyncRecoveryPanel } from "@/components/work"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"

import { usePOSSyncStore } from "@/stores/posSync"
import { getOfflineInvoices } from "@/utils/offline/sync"
import OfflineStore from "@/services/offline-store"
import db from "@/services/db"
import { authState } from "@/services/sync-auth"
import { runSyncCycleSilently, getSyncStatus } from "@/services/sync-manager"
import { getEffectiveToken } from "@/services/sync-auth"
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
import { __ } from "@/utils/translation"
import {
	AUTO_MODES,
	AUTO_TRIGGERS,
	LINK_MODES,
	LINK_REASONS,
	getAutomation,
	getLinkMode,
	isLinkEnabled,
	setAutomationMaster,
	setLinkMode,
	setPollIntervalSec,
	setTriggerMode,
} from "@/services/link-consent"
import {
	getServiceEndpoint,
	getServiceEndpointOverride,
	SERVICE_ENDPOINTS,
	setServiceEndpoint,
	subscribeRuntimeEndpoints,
	validateServiceEndpoint,
} from "@/services/runtime-endpoints"

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
const pendingError = ref("")
const syncNote = ref("")
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

/** Dead-lettered canonical rows visible in the list (need manual retry). */
const failedRows = computed(() =>
	pending.value.filter(
		(row) => row.source === "canonical" && row.queueStatus === "failed",
	),
)

const recoveryBusyIds = ref([])
const recoveryActionErrors = ref({})
const recoveryItems = computed(() =>
	failedRows.value.map((row) => {
		const needsReview = /ناقص الحقول|بيانات .* ناقصة|LOCAL_VALIDATION_FAILED|MISSING_REQUIRED_DATA/i.test(String(row.lastError || ""))
		return {
			...row,
			status: "FAILED",
			error: row.lastError || "تعذّرت مزامنة العملية.",
			recovery: {
				title: "تعذّرت مزامنة العملية",
				message: row.lastError || "تحقق من سبب الفشل ثم أعد المحاولة.",
				retryable: !needsReview,
				nextAction: needsReview ? "REVIEW" : "RETRY",
			},
		}
	})
)

async function retryCanonicalOperation(context) {
	const rawId = Number(String(context?.id || "").replace("sync-", ""))
	if (!Number.isSafeInteger(rawId) || rawId <= 0) return
	const key = String(context.id)
	if (recoveryBusyIds.value.includes(key)) return
	const activeTenant = authState.tenantId == null ? "" : String(authState.tenantId)
	if (!activeTenant) {
		recoveryActionErrors.value = { ...recoveryActionErrors.value, [key]: "سجّل الدخول وتأكد من هوية المشترك قبل إعادة المحاولة." }
		return
	}
	recoveryBusyIds.value = [...recoveryBusyIds.value, key]
	try {
		const stored = await db.syncQueue.get(rawId)
		if (!stored || String(stored.tenantId || "") !== activeTenant || stored.status !== "failed") {
			throw new Error("لم تعد العملية متاحة لهذا المشترك؛ حدّث القائمة.")
		}
		const reopened = await OfflineStore.retryFailed(rawId)
		if (!reopened) throw new Error("تعذّر إعادة فتح العملية الفاشلة.")
		await runSyncCycleSilently()
		const updated = await db.syncQueue.get(rawId)
		if (updated?.status === "failed") throw new Error(updated.lastError || "ما زالت العملية فاشلة؛ راجع تفاصيلها.")
		const nextErrors = { ...recoveryActionErrors.value }
		delete nextErrors[key]
		recoveryActionErrors.value = nextErrors
		await loadPending()
	} catch (error) {
		recoveryActionErrors.value = { ...recoveryActionErrors.value, [key]: String(error?.message || error).slice(0, 240) }
		await loadPending()
	} finally {
		recoveryBusyIds.value = recoveryBusyIds.value.filter((id) => id !== key)
	}
}

function reviewCanonicalOperation(context) {
	const key = String(context?.id || "")
	recoveryActionErrors.value = {
		...recoveryActionErrors.value,
		[key]: context?.recovery?.message || context?.item?.lastError || "هذه العملية تحتاج مراجعة بياناتها قبل إعادة المحاولة.",
	}
}


async function retryFailedRows() {
	if (posSync.isOffline || syncing.value || failedRows.value.length === 0)
		return
	syncing.value = true
	syncError.value = ""
	try {
		let reopened = 0
		for (const row of failedRows.value) {
			const id = Number(String(row.id).replace("sync-", ""))
			if (Number.isFinite(id)) {
				try {
					if (await OfflineStore.retryFailed(id)) reopened += 1
				} catch {
					/* one bad row never blocks the rest */
				}
			}
		}
		await loadPending()
		syncNote.value =
			reopened > 0
				? __("أُعيد فتح {0} عملية للمحاولة", [reopened])
				: __("تعذّرت إعادة الفتح — راجع السجل")
	} catch (error) {
		syncError.value = String(error?.message || error).slice(0, 200)
	} finally {
		syncing.value = false
	}
}

const activeDest = computed(
	() => destinations.value.find((d) => d.id === activeId.value) || null,
)

const TRIGGER_ROWS = [
	{ key: AUTO_TRIGGERS.ON_RECONNECT, label: "عند عودة الشبكة" },
	{ key: AUTO_TRIGGERS.POLL, label: "دورية كل" },
	{ key: AUTO_TRIGGERS.INITIAL_PULL, label: "السحب الأولي للكتالوج" },
	{ key: AUTO_TRIGGERS.PUSH_IMMEDIATE, label: "الدفع الفوري عند البيع" },
	{ key: AUTO_TRIGGERS.STREAM, label: "إعادة اتصال التدفق اللحظي" },
]

const linkMode = ref(LINK_MODES.STANDALONE)
const autoMaster = ref(false)
const autoModes = ref({})
const pollSec = ref(0)
const triggerRows = TRIGGER_ROWS
const ENDPOINT_ROWS = [
	{ key: SERVICE_ENDPOINTS.API, label: "عنوان API الأساسي (يشمل /api)" },
	{ key: SERVICE_ENDPOINTS.PLATFORM, label: "منصة المصادقة (أصل الموقع)" },
	{
		key: SERVICE_ENDPOINTS.SOCKET,
		label: "Socket.IO prefix (يضاف مسار الموقع)",
	},
]
const endpointRows = ENDPOINT_ROWS
const endpointDrafts = ref({})
const endpointMessage = ref("")
const endpointMessageClass = ref("text-gray-600")
const endpointTestBusy = ref(false)

function loadLinkage() {
	linkMode.value = getLinkMode()
	const auto = getAutomation()
	autoMaster.value = auto.mode === AUTO_MODES.AUTO
	autoModes.value = {
		[AUTO_TRIGGERS.ON_RECONNECT]: auto[AUTO_TRIGGERS.ON_RECONNECT],
		[AUTO_TRIGGERS.POLL]: auto[AUTO_TRIGGERS.POLL],
		[AUTO_TRIGGERS.INITIAL_PULL]: auto[AUTO_TRIGGERS.INITIAL_PULL],
		[AUTO_TRIGGERS.PUSH_IMMEDIATE]: auto[AUTO_TRIGGERS.PUSH_IMMEDIATE],
		[AUTO_TRIGGERS.STREAM]: auto[AUTO_TRIGGERS.STREAM],
	}
	pollSec.value = auto.pollIntervalSec || 0
}

function loadEndpointDrafts() {
	endpointDrafts.value = Object.fromEntries(
		ENDPOINT_ROWS.map(({ key }) => [key, getServiceEndpointOverride(key)]),
	)
}

function endpointPlaceholder(service) {
	const effective = getServiceEndpoint(service)
	if (effective) return effective
	if (service === SERVICE_ENDPOINTS.PLATFORM) return "https://platform.example"
	if (service === SERVICE_ENDPOINTS.SOCKET)
		return "https://realtime.example/socket.io"
	return "/api"
}

function grantLinkConsent() {
	setLinkMode(LINK_MODES.LINKED, LINK_REASONS.EXPLICIT_CONNECT)
	loadLinkage()
}

function saveEndpoints() {
	for (const { key } of ENDPOINT_ROWS) {
		const check = validateServiceEndpoint(key, endpointDrafts.value[key])
		if (!check.ok) {
			endpointMessageClass.value = "text-red-600"
			endpointMessage.value = check.error
			return
		}
	}
	const changed = []
	let persisted = true
	for (const { key } of ENDPOINT_ROWS) {
		const result = setServiceEndpoint(key, endpointDrafts.value[key])
		if (!result.ok) {
			endpointMessageClass.value = "text-red-600"
			endpointMessage.value = result.error
			return
		}
		if (result.changed) changed.push(key)
		persisted = persisted && result.persisted
	}
	loadEndpointDrafts()
	loadLinkage()
	endpointMessageClass.value = !persisted
		? "text-amber-700"
		: changed.length
			? "text-amber-700"
			: "text-emerald-700"
	endpointMessage.value = !persisted
		? __("تعذر حفظ بعض العناوين بشكل دائم؛ ستنتهي عند إغلاق التطبيق.")
		: changed.length
			? __("حُفظت العناوين محليًا. وافق على الربط مجددًا قبل استخدام الخدمات.")
			: __("العناوين دون تغيير؛ لم يُجرَ أي اتصال.")
}

async function testApiEndpoint() {
	const endpoint = getServiceEndpoint(SERVICE_ENDPOINTS.API).replace(/\/+$/, "")
	endpointTestBusy.value = true
	endpointMessage.value = ""
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), 8000)
	try {
		const response = await fetch(`${endpoint}/health`, {
			method: "GET",
			cache: "no-store",
			credentials: "omit",
			signal: controller.signal,
		})
		endpointMessageClass.value = response.ok
			? "text-emerald-700"
			: "text-red-600"
		endpointMessage.value = response.ok
			? __("استجاب خادم API برمز {0}", [response.status])
			: __("استجاب خادم API برمز {0}", [response.status])
	} catch (error) {
		endpointMessageClass.value = "text-red-600"
		endpointMessage.value = String(error?.message || error).slice(0, 180)
	} finally {
		clearTimeout(timeout)
		endpointTestBusy.value = false
	}
}

function toggleAutomationMaster() {
	const next = setAutomationMaster(!autoMaster.value)
	autoMaster.value = next.mode === AUTO_MODES.AUTO
	loadLinkage()
}

function setTrigger(key, mode) {
	setTriggerMode(key, mode)
	loadLinkage()
}

function savePollInterval(value) {
	setPollIntervalSec(value)
	loadLinkage()
}

function unlinkDevice() {
	setLinkMode(LINK_MODES.STANDALONE, LINK_REASONS.REVOKED)
	loadLinkage()
	refresh()
}

const statusLine = computed(() => {
	if (isOffline.value) {
		return __("البيع مستمر محليًا — ستُزامَن عند طلبك من هنا")
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
	// الرسائل الافتراضية عربية أولًا: لا سلاسل إنجليزية ظاهرة للمستخدم.
	if (diffInSeconds < 60) return __("الآن")
	if (diffInSeconds < 3600)
		return __("منذ {0} دقيقة", [Math.floor(diffInSeconds / 60)])
	if (diffInSeconds < 86400)
		return __("منذ {0} ساعة", [Math.floor(diffInSeconds / 3600)])
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
	loadLinkage()
	await loadPending()
}

async function loadPending() {
	loading.value = true
	syncError.value = ""
	pendingError.value = ""
	try {
		// طابوران حيان: القديم (invoice_queue — وجهات الفروع) والأساسي
		// (syncQueue — مبيعات نقطة البيع عبر session.submitSale). عرض
		// أحدهما وحده كان يُظهر "لا فواتير معلقة" وطابور الآخر مليء.
		//
		// الفشل يُبلَّغ ولا يُحوَّل إلى قائمة فارغة: قراءة طابور فاشلة ليست
		// "لا فواتير معلقة"، فمن لا يقرأ الطابور يرى رسالة الخطأ لا صفرًا واثقًا.
		const [legacy, canonical] = await Promise.all([
			getOfflineInvoices(activeId.value === LOCAL_ID ? null : activeId.value),
			OfflineStore.openOperations(),
		])
		const mapped = (canonical || [])
			.filter((row) => row && row.status !== "synced")
			.map((row) => {
				const payload = row.payload || {}
				const customer =
					payload.customer?.name ||
					payload.customerName ||
					(typeof payload.customer === "string" ? payload.customer : null) ||
					__("Walk-in Customer")
				return {
					id: `sync-${row.id}`,
					timestamp: row.createdAt
						? new Date(row.createdAt).getTime()
						: Date.now(),
					data: {
						customer,
						total: payload.total ?? null,
						invoiceNo: row.entityId,
					},
					retry_count: row.attemptCount || 0,
					source: "canonical",
					queueStatus: row.status,
					entityType: row.entityType,
					lastError: row.lastError || "",
					payload: row.payload,
					tenantId: row.tenantId,
				}
			})
		pending.value = [...(legacy || []), ...mapped].sort(
			(a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0),
		)
	} catch (error) {
		pending.value = []
		// حالة القراءة تُعرض كخطأ، ولا تُعرض كـ"لا فواتير معلقة": الطابور غير
		// المقروء ليس طابورًا فارغًا.
		pendingError.value = String(error?.message || error).slice(0, 200)
		syncError.value = pendingError.value
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
	syncNote.value = ""
	try {
		// 1) الطابور الأساسي (مبيعات نقطة البيع): دورة المنصة — فقط
		// بربط ممنوح ورمز صالح. بدونهما تبقى الصفوف محفوظة محليًا
		// ويُقال ذلك صراحة بدل نجاحٍ وهمي.
		let canonicalPushed = 0
		let canonicalAttempted = false
		if (isLinkEnabled() && getEffectiveToken()) {
			canonicalAttempted = true
			try {
				const cycle = await runSyncCycleSilently()
				canonicalPushed = Number(cycle?.pushed ?? 0)
			} catch (error) {
				syncError.value = String(error?.message || error).slice(0, 200)
			}
		}
		// 2) طابور الوجهات (الفروع/السحابة عبر REST) — كالسابق.
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
		if (canonicalAttempted && canonicalPushed > 0 && !syncError.value) {
			syncNote.value = __("دُفعت {0} عملية معلقة للمنصة", [canonicalPushed])
		}
		await loadPending()
		// صدق الختام: مبيعات محلية باقية دون ربط تُذكر، لا تُخفى.
		const remaining = pending.value.filter((row) => row.source === "canonical")
		if (remaining.length > 0 && !isLinkEnabled()) {
			syncNote.value = __(
				"المبيعات محفوظة على الجهاز ({0}) — تُدفع عند الربط بالمنصة",
				[remaining.length],
			)
		}
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
	loadEndpointDrafts()
	if (show.value) refresh()
})

const unsubscribeEndpoints = subscribeRuntimeEndpoints(({ externalChange }) => {
	if (!externalChange) return
	loadEndpointDrafts()
	loadLinkage()
})
onUnmounted(unsubscribeEndpoints)
</script>
