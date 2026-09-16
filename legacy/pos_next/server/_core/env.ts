function requireEnv(name: string, value: string | undefined, minLength = 1): string {
  const v = value ?? "";
  if (process.env.NODE_ENV === "production" && v.length < minLength) {
    throw new Error(`[ENV] ${name} is missing or too short (need >=${minLength} chars) — refusing to start in production`);
  }
  return v;
}

export const ENV = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: requireEnv("DATABASE_URL", process.env.DATABASE_URL),
  jwtSecret: requireEnv("JWT_SECRET", process.env.JWT_SECRET, 32),
  jwtAlgorithm: (process.env.JWT_ALGORITHM as "HS256" | "HS512") ?? "HS256",
  jwtExpiry: parseInt(process.env.JWT_EXPIRY ?? "2592000", 10),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  ownerPassword: process.env.OWNER_PASSWORD ?? "",
  port: parseInt(process.env.PORT ?? "3000", 10),
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10),
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "no-reply@smartports.com",
  zatcaMode: process.env.ZATCA_MODE ?? "sandbox",
  zatcaApiUrl: process.env.ZATCA_API_URL ?? "https://api.zatca.gov.sa/e-invoicing/phase2/",
  zatcaCertificatePath: process.env.ZATCA_CERTIFICATE_PATH ?? "./certs/zatca.p12",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  sentryEnvironment: process.env.SENTRY_ENVIRONMENT ?? "development",
  isProduction: process.env.NODE_ENV === "production",
} as const;

if (ENV.isProduction) {
  if (!ENV.databaseUrl) console.warn("[ENV] DATABASE_URL not set — health checks degraded");
  if (!ENV.smtpHost || !ENV.smtpUser || !ENV.smtpPass) console.warn("[ENV] SMTP not configured — emails logged to console only");
  if (!ENV.sentryDsn) console.warn("[ENV] SENTRY_DSN not set — error tracking disabled");
}
