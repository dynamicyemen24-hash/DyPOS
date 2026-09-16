<template>
	<header
		class="dypos-header"
		dir="rtl"
		role="banner"
		:aria-label="labels.header"
	>
		<div class="dypos-header__main">
			<!-- الهوية -->
			<div class="dypos-header__identity">
				<button
					v-if="showMenuButton"
					type="button"
					class="dypos-header__icon-button"
					:aria-label="labels.menu"
					:title="labels.menu"
					@click="emit('menu-clicked')"
				>
					<FeatherIcon
						name="menu"
						class="h-5 w-5"
						aria-hidden="true"
					/>
				</button>

				<div class="dypos-header__brand">
					<div
						class="dypos-header__brand-mark"
						aria-hidden="true"
					>
						<FeatherIcon
							name="shopping-bag"
							class="h-[19px] w-[19px]"
						/>
					</div>

					<div class="dypos-header__brand-content">
						<div class="dypos-header__title">
							{{ title }}
						</div>

						<div
							v-if="subtitle"
							class="dypos-header__subtitle"
						>
							{{ subtitle }}
						</div>
					</div>
				</div>
			</div>

			<!-- سياق التشغيل -->
			<div class="dypos-header__operation">
				<!-- نقطة البيع / الفرع -->
				<div
					v-if="locationLabel"
					class="dypos-header__context-item"
				>
					<div
						class="dypos-header__context-icon"
						aria-hidden="true"
					>
						<FeatherIcon
							name="map-pin"
							class="h-3.5 w-3.5"
						/>
					</div>

					<div class="dypos-header__context-content">
						<span class="dypos-header__context-caption">
							{{ labels.location }}
						</span>

						<span class="dypos-header__context-value">
							{{ locationLabel }}
						</span>
					</div>
				</div>

				<div
					v-if="locationLabel && showShift"
					class="dypos-header__divider"
					aria-hidden="true"
				/>

				<!-- الوردية -->
				<button
					v-if="showShift"
					type="button"
					class="dypos-header__shift"
					:class="shiftButtonClass"
					:aria-label="shiftAccessibleLabel"
					:title="shiftAccessibleLabel"
					@click="emit('shift-clicked')"
				>
					<span
						class="dypos-header__shift-indicator"
						:class="shiftIndicatorClass"
						aria-hidden="true"
					/>

					<span class="dypos-header__shift-content">
						<span class="dypos-header__shift-caption">
							{{ shiftStatusLabel }}
						</span>

						<span
							v-if="shiftName"
							class="dypos-header__shift-name"
						>
							{{ shiftName }}
						</span>
					</span>

					<FeatherIcon
						name="chevron-down"
						class="h-3.5 w-3.5 text-gray-400"
						aria-hidden="true"
					/>
				</button>
			</div>

			<!-- حالة النظام والإجراءات -->
			<div class="dypos-header__actions">
				<!-- حالة الاتصال -->
				<button
					v-if="showConnectionStatus"
					type="button"
					class="dypos-header__connection"
					:class="connectionClass"
					:aria-label="connectionText"
					:title="connectionText"
					@click="emit('connection-clicked')"
				>
					<span
						class="dypos-header__connection-indicator"
						:class="connectionIndicatorClass"
						aria-hidden="true"
					/>

					<span class="dypos-header__connection-text">
						{{ connectionText }}
					</span>
				</button>

				<!-- المبيعات المعلقة -->
				<button
					v-if="showHeldSales"
					type="button"
					class="dypos-header__action"
					:aria-label="heldSalesAccessibleLabel"
					:title="heldSalesAccessibleLabel"
					@click="emit('held-sales-clicked')"
				>
					<FeatherIcon
						name="pause-circle"
						class="h-[18px] w-[18px]"
						aria-hidden="true"
					/>

					<span
						v-if="heldSalesCount > 0"
						class="dypos-header__count"
						aria-hidden="true"
					>
						{{ displayHeldSalesCount }}
					</span>
				</button>

				<!-- الإشعارات -->
				<button
					v-if="showNotifications"
					type="button"
					class="dypos-header__action"
					:aria-label="notificationAccessibleLabel"
					:title="notificationAccessibleLabel"
					@click="emit('notifications-clicked')"
				>
					<FeatherIcon
						name="bell"
						class="h-[18px] w-[18px]"
						aria-hidden="true"
					/>

					<span
						v-if="notificationCount > 0"
						class="dypos-header__count"
						aria-hidden="true"
					>
						{{ displayNotificationCount }}
					</span>
				</button>

				<!-- الإجراءات الإضافية -->
				<slot name="actions" />

				<!-- فاصل -->
				<div
					v-if="hasSecondaryActions"
					class="dypos-header__actions-divider"
					aria-hidden="true"
				/>

				<!-- الكاشير -->
				<button
					v-if="showCashier"
					type="button"
					class="dypos-header__cashier"
					:aria-label="cashierAccessibleLabel"
					:title="cashierAccessibleLabel"
					@click="emit('cashier-clicked')"
				>
					<div
						class="dypos-header__cashier-avatar"
						aria-hidden="true"
					>
						{{ cashierInitials }}
					</div>

					<div class="dypos-header__cashier-info">
						<span
							class="dypos-header__cashier-caption"
						>
							{{ labels.cashier }}
						</span>

						<span class="dypos-header__cashier-name">
							{{ cashierName || labels.cashier }}
						</span>
					</div>

					<FeatherIcon
						name="chevron-down"
						class="h-3.5 w-3.5 text-gray-400"
						aria-hidden="true"
					/>
				</button>

				<!-- الإعدادات -->
				<button
					v-if="showSettings"
					type="button"
					class="dypos-header__action"
					:aria-label="labels.settings"
					:title="labels.settings"
					@click="emit('settings-clicked')"
				>
					<FeatherIcon
						name="settings"
						class="h-[18px] w-[18px]"
						aria-hidden="true"
					/>
				</button>

				<!-- إنهاء الجلسة -->
				<button
					v-if="showCloseButton"
					type="button"
					class="
						dypos-header__action
						dypos-header__action--danger
					"
					:aria-label="labels.endSession"
					:title="labels.endSession"
					:disabled="busy"
					@click="emit('close-clicked')"
				>
					<FeatherIcon
						name="log-out"
						class="h-[18px] w-[18px]"
						aria-hidden="true"
					/>
				</button>
			</div>
		</div>

		<!-- شريط الحالة التشغيلي -->
		<Transition
			enter-active-class="transition-all duration-200 ease-out"
			enter-from-class="opacity-0 -translate-y-1"
			enter-to-class="opacity-100 translate-y-0"
			leave-active-class="transition-all duration-150 ease-in"
			leave-from-class="opacity-100 translate-y-0"
			leave-to-class="opacity-0 -translate-y-1"
		>
			<div
				v-if="showStatusBar && statusMessage"
				class="dypos-header__status-bar"
				:class="statusBarClass"
				role="status"
				aria-live="polite"
			>
				<div class="dypos-header__status-content">
					<FeatherIcon
						:name="statusIcon"
						class="h-4 w-4 shrink-0"
						aria-hidden="true"
					/>

					<span>{{ statusMessage }}</span>
				</div>

				<button
					v-if="dismissibleStatus"
					type="button"
					class="dypos-header__status-close"
					aria-label="إخفاء الرسالة"
					title="إخفاء الرسالة"
					@click="emit('status-dismissed')"
				>
					<FeatherIcon
						name="x"
						class="h-3.5 w-3.5"
						aria-hidden="true"
					/>
				</button>
			</div>
		</Transition>
	</header>
</template>

<script setup>
import { computed, useSlots } from "vue"
import { FeatherIcon } from "frappe-ui"

const props = defineProps({
	title: {
		type: String,
		default: "نقطة البيع",
	},

	subtitle: {
		type: String,
		default: "",
	},

	locationLabel: {
		type: String,
		default: "",
	},

	cashierName: {
		type: String,
		default: "",
	},

	shiftName: {
		type: String,
		default: "",
	},

	shiftStatus: {
		type: String,
		default: "open",
		validator: (value) => ["open", "closed", "pending"].includes(value),
	},

	connectionStatus: {
		type: String,
		default: "online",
		validator: (value) => ["online", "offline", "syncing"].includes(value),
	},

	heldSalesCount: {
		type: Number,
		default: 0,
	},

	notificationCount: {
		type: Number,
		default: 0,
	},

	showMenuButton: {
		type: Boolean,
		default: true,
	},

	showShift: {
		type: Boolean,
		default: true,
	},

	showCashier: {
		type: Boolean,
		default: true,
	},

	showConnectionStatus: {
		type: Boolean,
		default: true,
	},

	showHeldSales: {
		type: Boolean,
		default: true,
	},

	showNotifications: {
		type: Boolean,
		default: false,
	},

	showSettings: {
		type: Boolean,
		default: true,
	},

	showCloseButton: {
		type: Boolean,
		default: true,
	},

	showStatusBar: {
		type: Boolean,
		default: false,
	},

	statusMessage: {
		type: String,
		default: "",
	},

	statusType: {
		type: String,
		default: "info",
		validator: (value) =>
			["info", "success", "warning", "error"].includes(value),
	},

	dismissibleStatus: {
		type: Boolean,
		default: false,
	},

	busy: {
		type: Boolean,
		default: false,
	},
})

const emit = defineEmits([
	"menu-clicked",
	"shift-clicked",
	"connection-clicked",
	"held-sales-clicked",
	"notifications-clicked",
	"cashier-clicked",
	"settings-clicked",
	"close-clicked",
	"status-dismissed",
])

const slots = useSlots()

const labels = Object.freeze({
	header: "رأس نقطة البيع",
	menu: "فتح قائمة نقطة البيع",
	location: "نقطة البيع",
	cashier: "الكاشير",
	settings: "الإعدادات",
	endSession: "إنهاء الجلسة",
})

const shiftStatusLabel = computed(() => {
	switch (props.shiftStatus) {
		case "open":
			return "الوردية مفتوحة"

		case "pending":
			return "الوردية قيد التجهيز"

		case "closed":
			return "الوردية مغلقة"

		default:
			return "حالة الوردية"
	}
})

const shiftAccessibleLabel = computed(() => {
	if (props.shiftName) {
		return `${shiftStatusLabel.value}: ${props.shiftName}`
	}

	return shiftStatusLabel.value
})

const shiftButtonClass = computed(() => {
	switch (props.shiftStatus) {
		case "open":
			return "dypos-header__shift--open"

		case "pending":
			return "dypos-header__shift--pending"

		default:
			return "dypos-header__shift--closed"
	}
})

const shiftIndicatorClass = computed(() => {
	switch (props.shiftStatus) {
		case "open":
			return "dypos-header__shift-indicator--open"

		case "pending":
			return "dypos-header__shift-indicator--pending"

		default:
			return "dypos-header__shift-indicator--closed"
	}
})

const connectionText = computed(() => {
	switch (props.connectionStatus) {
		case "online":
			return "متصل"

		case "syncing":
			return "جارٍ المزامنة"

		case "offline":
			return "غير متصل"

		default:
			return "حالة الاتصال"
	}
})

const connectionClass = computed(() => {
	switch (props.connectionStatus) {
		case "online":
			return "dypos-header__connection--online"

		case "syncing":
			return "dypos-header__connection--syncing"

		default:
			return "dypos-header__connection--offline"
	}
})

const connectionIndicatorClass = computed(() => {
	switch (props.connectionStatus) {
		case "online":
			return "dypos-header__connection-indicator--online"

		case "syncing":
			return "dypos-header__connection-indicator--syncing"

		default:
			return "dypos-header__connection-indicator--offline"
	}
})

const cashierInitials = computed(() => {
	const name = props.cashierName?.trim()

	if (!name) {
		return "ك"
	}

	const words = name.split(/\s+/).filter(Boolean).slice(0, 2)

	return words
		.map((word) => word.charAt(0))
		.join("")
		.toUpperCase()
})

const heldSalesAccessibleLabel = computed(() => {
	if (props.heldSalesCount > 0) {
		return `${props.heldSalesCount} مبيعات معلقة`
	}

	return "المبيعات المعلقة"
})

const notificationAccessibleLabel = computed(() => {
	if (props.notificationCount > 0) {
		return `${props.notificationCount} إشعارات`
	}

	return "الإشعارات"
})

const cashierAccessibleLabel = computed(() => {
	if (props.cashierName) {
		return `حساب الكاشير: ${props.cashierName}`
	}

	return "حساب الكاشير"
})

const displayHeldSalesCount = computed(() => {
	return props.heldSalesCount > 99 ? "99+" : String(props.heldSalesCount)
})

const displayNotificationCount = computed(() => {
	return props.notificationCount > 99 ? "99+" : String(props.notificationCount)
})

const hasSecondaryActions = computed(() => {
	return Boolean(slots.actions) || props.showSettings || props.showCloseButton
})

const statusBarClass = computed(() => {
	return `dypos-header__status-bar--${props.statusType}`
})

const statusIcon = computed(() => {
	switch (props.statusType) {
		case "success":
			return "check-circle"

		case "warning":
			return "alert-triangle"

		case "error":
			return "alert-circle"

		default:
			return "info"
	}
})
</script>

<style scoped>
.dypos-header {
	position: relative;
	z-index: 30;
	width: 100%;
	background: #ffffff;
	border-bottom: 1px solid rgb(226 232 240);
}

.dypos-header__main {
	display: grid;
	grid-template-columns: minmax(220px, 1fr) auto minmax(220px, 1fr);
	align-items: center;
	min-height: 70px;
	gap: 20px;
	padding: 10px 20px;
}

.dypos-header__identity {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.dypos-header__icon-button,
.dypos-header__action {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	width: 40px;
	height: 40px;
	border: 0;
	border-radius: 12px;
	background: transparent;
	color: rgb(71 85 105);
	outline: none;
	transition:
		background-color 140ms ease,
		color 140ms ease,
		transform 140ms ease;
}

.dypos-header__icon-button:hover,
.dypos-header__action:hover {
	background: rgb(248 250 252);
	color: rgb(15 23 42);
}

.dypos-header__icon-button:active,
.dypos-header__action:active {
	transform: scale(0.96);
}

.dypos-header__icon-button:focus-visible,
.dypos-header__action:focus-visible,
.dypos-header__shift:focus-visible,
.dypos-header__connection:focus-visible,
.dypos-header__cashier:focus-visible,
.dypos-header__status-close:focus-visible {
	outline: 2px solid rgb(5 150 105);
	outline-offset: 2px;
}

.dypos-header__brand {
	display: flex;
	align-items: center;
	gap: 11px;
	min-width: 0;
}

.dypos-header__brand-mark {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	flex-shrink: 0;
	border-radius: 12px;
	background: rgb(236 253 245);
	color: rgb(4 120 87);
}

.dypos-header__brand-content {
	min-width: 0;
}

.dypos-header__title {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: rgb(15 23 42);
	font-size: 15px;
	font-weight: 750;
	line-height: 20px;
}

.dypos-header__subtitle {
	margin-top: 1px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: rgb(100 116 139);
	font-size: 11px;
	line-height: 16px;
}

.dypos-header__operation {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 14px;
	min-width: 0;
}

.dypos-header__context-item {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.dypos-header__context-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	flex-shrink: 0;
	border-radius: 9px;
	background: rgb(248 250 252);
	color: rgb(100 116 139);
}

.dypos-header__context-content {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.dypos-header__context-caption,
.dypos-header__shift-caption,
.dypos-header__cashier-caption {
	color: rgb(148 163 184);
	font-size: 10px;
	font-weight: 500;
	line-height: 14px;
}

.dypos-header__context-value {
	max-width: 150px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: rgb(51 65 85);
	font-size: 12px;
	font-weight: 650;
	line-height: 16px;
}

.dypos-header__divider,
.dypos-header__actions-divider {
	width: 1px;
	height: 26px;
	background: rgb(226 232 240);
}

.dypos-header__shift {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 130px;
	padding: 7px 9px;
	border: 0;
	border-radius: 11px;
	background: transparent;
	text-align: start;
	outline: none;
	transition: background-color 140ms ease;
}

.dypos-header__shift:hover {
	background: rgb(248 250 252);
}

.dypos-header__shift-indicator {
	width: 7px;
	height: 7px;
	flex-shrink: 0;
	border-radius: 9999px;
}

.dypos-header__shift-indicator--open {
	background: rgb(16 185 129);
	box-shadow: 0 0 0 3px rgb(236 253 245);
}

.dypos-header__shift-indicator--pending {
	background: rgb(245 158 11);
	box-shadow: 0 0 0 3px rgb(255 251 235);
}

.dypos-header__shift-indicator--closed {
	background: rgb(148 163 184);
	box-shadow: 0 0 0 3px rgb(248 250 252);
}

.dypos-header__shift-content {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
}

.dypos-header__shift-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: rgb(51 65 85);
	font-size: 11px;
	font-weight: 650;
	line-height: 15px;
}

.dypos-header__shift--open
	.dypos-header__shift-caption {
	color: rgb(5 150 105);
}

.dypos-header__shift--pending
	.dypos-header__shift-caption {
	color: rgb(180 83 9);
}

.dypos-header__shift--closed
	.dypos-header__shift-caption {
	color: rgb(100 116 139);
}

.dypos-header__actions {
	display: flex;
	align-items: center;
	justify-content: flex-start;
	gap: 3px;
	min-width: 0;
}

.dypos-header__connection {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	height: 34px;
	padding: 0 10px;
	border: 0;
	border-radius: 10px;
	outline: none;
	font-size: 11px;
	font-weight: 650;
	white-space: nowrap;
	transition:
		background-color 140ms ease,
		color 140ms ease;
}

.dypos-header__connection--online {
	background: rgb(240 253 244);
	color: rgb(21 128 61);
}

.dypos-header__connection--syncing {
	background: rgb(255 251 235);
	color: rgb(161 98 7);
}

.dypos-header__connection--offline {
	background: rgb(254 242 242);
	color: rgb(185 28 28);
}

.dypos-header__connection-indicator {
	width: 6px;
	height: 6px;
	flex-shrink: 0;
	border-radius: 9999px;
}

.dypos-header__connection-indicator--online {
	background: rgb(34 197 94);
}

.dypos-header__connection-indicator--syncing {
	background: rgb(245 158 11);
	animation: dypos-header-pulse 1.4s ease-in-out infinite;
}

.dypos-header__connection-indicator--offline {
	background: rgb(239 68 68);
}

.dypos-header__cashier {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	padding: 4px 7px 4px 5px;
	border: 0;
	border-radius: 11px;
	background: transparent;
	outline: none;
	text-align: start;
	transition: background-color 140ms ease;
}

.dypos-header__cashier:hover {
	background: rgb(248 250 252);
}

.dypos-header__cashier-avatar {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	flex-shrink: 0;
	border-radius: 10px;
	background: rgb(241 245 249);
	color: rgb(51 65 85);
	font-size: 11px;
	font-weight: 750;
}

.dypos-header__cashier-info {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.dypos-header__cashier-name {
	max-width: 105px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: rgb(51 65 85);
	font-size: 11px;
	font-weight: 650;
	line-height: 15px;
}

.dypos-header__count {
	position: absolute;
	top: 3px;
	end: 2px;
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 15px;
	height: 15px;
	padding: 0 3px;
	border: 2px solid #ffffff;
	border-radius: 9999px;
	background: rgb(5 150 105);
	color: #ffffff;
	font-size: 8px;
	font-weight: 800;
	line-height: 1;
}

.dypos-header__action {
	position: relative;
}

.dypos-header__action--danger:hover {
	background: rgb(254 242 242);
	color: rgb(185 28 28);
}

.dypos-header__action:disabled {
	cursor: not-allowed;
	opacity: 0.45;
}

.dypos-header__actions-divider {
	margin-inline: 4px;
}

.dypos-header__status-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	min-height: 36px;
	padding: 0 20px;
	border-top: 1px solid rgb(241 245 249);
	font-size: 11px;
	font-weight: 600;
}

.dypos-header__status-content {
	display: flex;
	align-items: center;
	gap: 8px;
}

.dypos-header__status-bar--info {
	background: rgb(239 246 255);
	color: rgb(30 64 175);
}

.dypos-header__status-bar--success {
	background: rgb(240 253 244);
	color: rgb(21 128 61);
}

.dypos-header__status-bar--warning {
	background: rgb(255 251 235);
	color: rgb(146 64 14);
}

.dypos-header__status-bar--error {
	background: rgb(254 242 242);
	color: rgb(185 28 28);
}

.dypos-header__status-close {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 8px;
	outline: none;
	transition: background-color 140ms ease;
}

.dypos-header__status-close:hover {
	background: rgb(255 255 255 / 0.6);
}

@keyframes dypos-header-pulse {
	0%,
	100% {
		opacity: 1;
	}

	50% {
		opacity: 0.4;
	}
}

@media (max-width: 1180px) {
	.dypos-header__main {
		grid-template-columns: minmax(190px, 1fr) auto minmax(190px, 1fr);
		gap: 12px;
		padding-inline: 14px;
	}

	.dypos-header__context-value {
		max-width: 110px;
	}

	.dypos-header__cashier-name {
		max-width: 80px;
	}
}

@media (max-width: 980px) {
	.dypos-header__operation {
		display: none;
	}

	.dypos-header__main {
		grid-template-columns: minmax(0, 1fr) auto;
	}
}

@media (max-width: 680px) {
	.dypos-header__main {
		min-height: 60px;
		padding: 8px 10px;
		gap: 8px;
	}

	.dypos-header__brand-mark {
		width: 36px;
		height: 36px;
	}

	.dypos-header__title {
		font-size: 14px;
	}

	.dypos-header__subtitle {
		display: none;
	}

	.dypos-header__connection {
		width: 34px;
		padding: 0;
		justify-content: center;
	}

	.dypos-header__connection-text {
		display: none;
	}

	.dypos-header__cashier-info,
	.dypos-header__cashier > svg {
		display: none;
	}

	.dypos-header__cashier {
		padding: 3px;
	}

	.dypos-header__action,
	.dypos-header__icon-button {
		width: 38px;
		height: 38px;
	}

	.dypos-header__actions-divider {
		display: none;
	}

	.dypos-header__status-bar {
		padding-inline: 12px;
	}
}

@media (max-width: 430px) {
	.dypos-header__main {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.dypos-header__identity {
		gap: 6px;
	}

	.dypos-header__brand {
		gap: 8px;
	}

	.dypos-header__brand-mark {
		display: none;
	}

	.dypos-header__actions {
		gap: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.dypos-header__icon-button,
	.dypos-header__action,
	.dypos-header__shift,
	.dypos-header__connection,
	.dypos-header__cashier {
		transition: none;
	}

	.dypos-header__connection-indicator--syncing {
		animation: none;
	}
}
</style>