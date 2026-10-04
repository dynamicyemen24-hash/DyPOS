import { nextTick } from "vue"
import { useSessionLock } from "@/composables/useSessionLock"
import { cleanupUserSession } from "@/utils/auth"
import { session } from "@/stores/session"
import { logger } from "@/utils/logger"
import { __ } from "@/utils/translation"

export function useLoginSessionBootstrap({
	sessionReady,
	isRuntimeReady,
	emit,
	onShiftRequired,
}) {
	const { isLocked: sessionLocked } = useSessionLock()

	const log = logger.create("LoginSessionBootstrap")

	async function bootstrapAuthenticatedSession() {
		try {
			if (typeof session.bootstrap === "function") {
				await session.bootstrap()
			}

			if (typeof session.refresh === "function") {
				if (!sessionReady.value) {
					await session.refresh()
				}
			}

			sessionReady.value = true

			await nextTick()

			const shiftState = resolveShiftState()

			if (shiftState === "open") {
				emitReady()
				return
			}

			if (shiftState === "requires-opening") {
				emit("shift-opening-required")
				try {
					if (typeof onShiftRequired === "function") onShiftRequired()
				} catch {
					// Dialog opening must never break bootstrap.
				}
				return
			}

			emitReady()
		} catch (error) {
			log.error("DyPOS session bootstrap failed", error)

			emit(
				"login-error",
				__("تم تسجيل الدخول، لكن تعذر تجهيز جلسة نقطة البيع."),
			)

			emit("error", error)
		}
	}

	function resolveShiftState() {
		const shift =
			session?.shift || session?.currentShift || session?.activeShift

		if (
			shift?.isOpen === true ||
			shift?.status === "open" ||
			shift?.status === "OPEN"
		) {
			return "open"
		}

		if (
			shift?.requiresOpening === true ||
			shift?.status === "closed" ||
			shift?.status === "none"
		) {
			return "requires-opening"
		}

		return "ready"
	}

	function emitReady() {
		emit("ready", {
			authenticated: true,
			runtimeReady: isRuntimeReady.value,
		})
	}

	async function handleShiftConfirm(
		payload,
		{ shiftOpening, shiftDialogOpen },
	) {
		if (shiftOpening.value) return

		shiftOpening.value = true

		try {
			if (typeof session.openShift === "function") {
				await session.openShift(payload)
			}

			shiftDialogOpen.value = false
			emitReady()
		} catch (error) {
			log.error("DyPOS shift opening failed", error)
			throw error
		} finally {
			shiftOpening.value = false
		}
	}

	function handleShiftCancel({ shiftOpening, shiftDialogOpen }) {
		if (shiftOpening.value) return
		shiftDialogOpen.value = false
	}

	async function cleanup() {
		try {
			await cleanupUserSession?.()
		} catch (error) {
			log.warn("DyPOS session cleanup failed", error)
		}
	}

	return {
		bootstrapAuthenticatedSession,
		resolveShiftState,
		emitReady,
		handleShiftConfirm,
		handleShiftCancel,
		cleanup,
	}
}
