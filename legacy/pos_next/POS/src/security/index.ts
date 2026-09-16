// (c) 2025 المنافذ الذكية للبرمجيات
// Security Module Exports
export {
  getHelmetSecurityHeaders,
  RateLimiter,
  globalRateLimiter,
  generateJWT,
  verifyJWT,
  getCORSConfig,
  getCORSHeader,
  getStrictCSP,
  scryptHash,
  verifyPassword,
  createZATCASecurityConfig,
  securityAuditLogger,
  type SecurityHeaders,
  type JWTPayload,
  type JWTResult,
  type CORSConfig,
  type HashResult,
  type ZATCASecurityConfig,
  type SecurityAuditEntry,
} from "./zatca-security";
