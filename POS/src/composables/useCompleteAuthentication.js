import { ref, computed } from "vue"
import { logger } from "@/utils/logger"
import { __ } from "@/utils/translation"

const log = logger.create("useCompleteAuthentication")

export function useCompleteAuthentication({
	loginRateLimiter,
	sessionReady,
	authenticationCompleted,
	sessionTimeout,
	installSessionSecurityMonitor,
	handleAuthSuccess,
	emit,
}) {
	function completeAuthentication(stage) {
		loginRateLimiter.recordSuccess()
		sessionReady.value = true
		authenticationCompleted.value = true

		sessionTimeout.start(30 * 60 * 1000)
		installSessionSecurityMonitor()

		log.info(`DyPOS authentication completed (${stage})`)
		handleAuthSuccess({ stage })

		emit("authenticated")
	}

	return {
		completeAuthentication,
	}
}

export default useCompleteAuthentication
