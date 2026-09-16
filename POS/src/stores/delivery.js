/**
 * Store Operations Store — منظومة التوصيل والسائقين والوسطاء وطلبات العملاء.
 *
 * أوفلاين أولًا: كل مستند يُحفظ محليًا في Dexie ثم يُدفع لقائمة المزامنة
 * عبر pushLocalChange (نفس مسار الفواتير)، فلا يفقد الكاشير أي عملية
 * عند انقطاع الشبكة.
 *
 * المنطق النقي (الحالات والعمولات) في utils/deliveryFlow.js.
 */

import { defineStore } from "pinia"
import { computed, ref } from "vue"

import db from "@/services/db"
import { nextOfflineInvoiceNumber } from "@/services/offline-numbering"
import { pushLocalChange } from "@/services/sync-manager"
import { logger } from "@/utils/logger"
import {
	DELIVERY_STATUS,
	calcDeliveryTotal,
	calcIntermediaryCommission,
	isDriverAvailable,
	transitionDeliveryOrder,
} from "@/utils/deliveryFlow"

const log = logger.create("StoreOps")

export const DRIVER_STATUS = Object.freeze({
	AVAILABLE: "available",
	BUSY: "busy",
	OFFLINE: "offline",
})

export const REQUEST_STATUS = Object.freeze({
	NEW: "new",
	ACCEPTED: "accepted",
	CONVERTED: "converted",
	CANCELLED: "cancelled",
})

export const REQUEST_SOURCE = Object.freeze({
	KIOSK: "kiosk",
	PHONE: "phone",
	COUNTER: "counter",
	WHATSAPP: "whatsapp",
})

export const useStoreOpsStore = defineStore("storeOps", () => {
	// ===== STATE =====
	const drivers = ref([])
	const intermediaries = ref([])
	const deliveryOrders = ref([])
	const customerRequests = ref([])
	const isLoaded = ref(false)

	// ===== LOAD =====
	async function loadAll() {
		try {
			const [d, i, o, r] = await Promise.all([
				db.drivers.toArray(),
				db.intermediaries.toArray(),
				db.deliveryOrders.toArray(),
				db.customerRequests.toArray(),
			])
			drivers.value = d
			intermediaries.value = i
			deliveryOrders.value = o
			customerRequests.value = r
			isLoaded.value = true
		} catch (error) {
			log.error("Failed to load store operations data", error)
		}
	}

	// ===== DRIVERS =====
	async function saveDriver(data) {
		const id = data.id ?? `DRV-${Date.now()}`
		const driver = {
			code: data.code || id,
			name: data.name,
			phone: data.phone || "",
			vehicleType: data.vehicleType || "دراجة نارية",
			vehicleNo: data.vehicleNo || "",
			status: data.status || DRIVER_STATUS.AVAILABLE,
			rating: data.rating ?? 5,
			deliveriesCount: data.deliveriesCount ?? 0,
			id,
			updatedAt: new Date().toISOString(),
			syncStatus: "pending",
		}

		await db.drivers.put(driver)
		await pushLocalChange(
			"driver",
			String(id),
			data.id ? "update" : "create",
			driver,
		)
		await loadAll()
		return driver
	}

	async function deleteDriver(id) {
		await db.drivers.delete(id)
		await pushLocalChange("driver", String(id), "delete", {})
		await loadAll()
	}

	const availableDrivers = computed(() =>
		drivers.value.filter((driver) => isDriverAvailable(driver)),
	)

	// ===== INTERMEDIARIES =====
	async function saveIntermediary(data) {
		const id = data.id ?? `INT-${Date.now()}`
		const intermediary = {
			code: data.code || id,
			name: data.name,
			phone: data.phone || "",
			commissionRate: Number(data.commissionRate) || 0,
			status: data.status || "active",
			totalCommission: data.totalCommission ?? 0,
			salesCount: data.salesCount ?? 0,
			id,
			updatedAt: new Date().toISOString(),
			syncStatus: "pending",
		}

		await db.intermediaries.put(intermediary)
		await pushLocalChange(
			"intermediary",
			String(id),
			data.id ? "update" : "create",
			intermediary,
		)
		await loadAll()
		return intermediary
	}

	async function deleteIntermediary(id) {
		await db.intermediaries.delete(id)
		await pushLocalChange("intermediary", String(id), "delete", {})
		await loadAll()
	}

	function commissionFor(amount, intermediaryId, opts = {}) {
		const intermediary = intermediaries.value.find(
			(row) => String(row.id) === String(intermediaryId),
		)
		const rate = intermediary?.commissionRate ?? 0
		return calcIntermediaryCommission(amount, rate, opts)
	}

	// ===== DELIVERY ORDERS =====
	async function createDeliveryOrder(data) {
		if (!data.customerName || !data.phone || !data.address) {
			throw new Error("اسم العميل والهاتف والعنوان مطلوبة لطلب التوصيل")
		}

		const numbering = await nextOfflineInvoiceNumber({
			branch: "BR",
			terminal: "T1",
			kind: "offlineDeliverySeq",
			prefix: "DLV",
		})

		const total = calcDeliveryTotal({
			invoiceTotal: data.invoiceTotal,
			deliveryFee: data.deliveryFee,
			deliveryDiscount: data.deliveryDiscount,
		})

		const commission = data.intermediaryId
			? commissionFor(data.invoiceTotal, data.intermediaryId)
			: { commission: 0, rate: 0, appliedCap: null }

		const order = {
			orderNo: numbering.invoiceNumber,
			invoiceId: data.invoiceId || null,
			customerId: data.customerId || null,
			customerName: data.customerName,
			phone: data.phone,
			address: data.address,
			area: data.area || "",
			items: data.items || [],
			invoiceTotal: Number(data.invoiceTotal) || 0,
			deliveryFee: Number(data.deliveryFee) || 0,
			deliveryDiscount: Number(data.deliveryDiscount) || 0,
			total,
			driverId: data.driverId || null,
			intermediaryId: data.intermediaryId || null,
			intermediaryCommission: commission.commission,
			priority: data.priority || "normal",
			status: DELIVERY_STATUS.PENDING,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			syncStatus: "pending",
		}

		await db.deliveryOrders.put(order)
		await pushLocalChange("deliveryOrder", order.orderNo, "create", order)

		// إسناد فوري إن وُجد سائق
		if (order.driverId) {
			await transition(order, DELIVERY_STATUS.ASSIGNED, {
				driverId: order.driverId,
			})
		}

		await loadAll()
		return order
	}

	async function transition(order, to, extra = {}) {
		const outcome = transitionDeliveryOrder(order, to, extra)
		if (!outcome.ok) return outcome

		const updated = { ...order, ...outcome.patch }
		await db.deliveryOrders.put(updated)
		await pushLocalChange("deliveryOrder", String(order.orderNo), "update", {
			status: to,
			...outcome.patch,
		})

		// تحديث حالة السائق (مشغول أثناء التوصيل — متاح بعد التسليم/الإلغاء)
		const driverId = updated.driverId ?? order.driverId
		if (driverId) {
			const driverStatus =
				to === DELIVERY_STATUS.OUT_FOR_DELIVERY
					? DRIVER_STATUS.BUSY
					: to === DELIVERY_STATUS.DELIVERED || to === DELIVERY_STATUS.CANCELLED
						? DRIVER_STATUS.AVAILABLE
						: null
			if (driverStatus) {
				const driver = drivers.value.find(
					(row) => String(row.id) === String(driverId),
				)
				if (driver) {
					await saveDriver({
						...driver,
						status: driverStatus,
						deliveriesCount:
							to === DELIVERY_STATUS.DELIVERED
								? (driver.deliveriesCount || 0) + 1
								: driver.deliveriesCount,
					})
				}
			}
		}

		await loadAll()
		return { ok: true }
	}

	const assignDriver = (order, driverId) =>
		transition(order, DELIVERY_STATUS.ASSIGNED, { driverId })
	const dispatchOrder = (order) =>
		transition(order, DELIVERY_STATUS.OUT_FOR_DELIVERY)
	const deliverOrder = (order) => transition(order, DELIVERY_STATUS.DELIVERED)
	const cancelOrder = (order) => transition(order, DELIVERY_STATUS.CANCELLED)

	const activeDeliveryOrders = computed(() =>
		deliveryOrders.value
			.filter(
				(order) =>
					order.status !== DELIVERY_STATUS.DELIVERED &&
					order.status !== DELIVERY_STATUS.CANCELLED,
			)
			.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
	)

	// ===== CUSTOMER REQUESTS =====
	async function createCustomerRequest(data) {
		if (!Array.isArray(data.items) || data.items.length === 0) {
			throw new Error("الطلب فارغ — لا توجد أصناف")
		}

		const numbering = await nextOfflineInvoiceNumber({
			branch: "BR",
			terminal: "T1",
			kind: "offlineRequestSeq",
			prefix: "REQ",
		})

		const request = {
			requestNo: numbering.invoiceNumber,
			items: data.items,
			total: Number(data.total) || 0,
			customerId: data.customerId || null,
			customerName: data.customerName || "",
			phone: data.phone || "",
			note: data.note || "",
			source: data.source || REQUEST_SOURCE.KIOSK,
			status: REQUEST_STATUS.NEW,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			syncStatus: "pending",
		}

		await db.customerRequests.put(request)
		await pushLocalChange(
			"customerRequest",
			request.requestNo,
			"create",
			request,
		)
		await loadAll()
		return request
	}

	async function updateRequestStatus(request, status) {
		const updated = {
			...request,
			status,
			updatedAt: new Date().toISOString(),
		}
		await db.customerRequests.put(updated)
		await pushLocalChange(
			"customerRequest",
			String(request.requestNo),
			"update",
			{
				status,
			},
		)
		await loadAll()
		return updated
	}

	const acceptRequest = (request) =>
		updateRequestStatus(request, REQUEST_STATUS.ACCEPTED)
	const convertRequest = (request) =>
		updateRequestStatus(request, REQUEST_STATUS.CONVERTED)
	const cancelRequest = (request) =>
		updateRequestStatus(request, REQUEST_STATUS.CANCELLED)

	const newRequests = computed(() =>
		customerRequests.value
			.filter((request) => request.status === REQUEST_STATUS.NEW)
			.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
	)

	return {
		// state
		drivers,
		intermediaries,
		deliveryOrders,
		customerRequests,
		isLoaded,

		// computed
		availableDrivers,
		activeDeliveryOrders,
		newRequests,

		// actions
		loadAll,
		saveDriver,
		deleteDriver,
		saveIntermediary,
		deleteIntermediary,
		commissionFor,
		createDeliveryOrder,
		assignDriver,
		dispatchOrder,
		deliverOrder,
		cancelOrder,
		createCustomerRequest,
		acceptRequest,
		convertRequest,
		cancelRequest,
	}
})

export default useStoreOpsStore
