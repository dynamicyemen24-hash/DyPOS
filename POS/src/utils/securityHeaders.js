/**
 * securityHeaders.js
 * Security hardening headers for DyPOS.
 * =============================================================================
 */
import { logger } from "@/utils/logger"

const log = logger.create("SecurityHeaders")
const SECURITY_HEADERS = {
	"Content-Security-Policy": [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
	].join("; "),
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "strict-origin-when-cross-origin",
}
