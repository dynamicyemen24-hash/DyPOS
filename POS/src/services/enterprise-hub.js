import { getServiceEndpoint, SERVICE_ENDPOINTS } from "./runtime-endpoints"

const api = () => getServiceEndpoint(SERVICE_ENDPOINTS.API).replace(/\/$/, "")

async function request(path, options = {}) {
  const response = await fetch(api() + path, {
    ...options,
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    credentials: "include",
    cache: "no-store",
  })
  const text = await response.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { error: text } }
  if (!response.ok) throw Object.assign(new Error(data?.error || "تعذر تنفيذ الطلب"), { status: response.status, data })
  return data
}

export const ENTERPRISE_PROVIDER_CATALOG = Object.freeze([
  { key:"zatca", category:"fiscal", name:"ZATCA / الفوترة الإلكترونية", icon:"file-check" },
  { key:"shopify", category:"commerce", name:"Shopify", icon:"shopping-bag" },
  { key:"woocommerce", category:"commerce", name:"WooCommerce", icon:"shopping-cart" },
  { key:"salla", category:"commerce", name:"سلة", icon:"store" },
  { key:"zid", category:"commerce", name:"زد", icon:"store" },
  { key:"whatsapp", category:"messaging", name:"WhatsApp Business", icon:"message-circle" },
  { key:"sms", category:"messaging", name:"SMS Gateway", icon:"smartphone" },
  { key:"email", category:"messaging", name:"Email Gateway", icon:"mail" },
  { key:"telegram", category:"messaging", name:"Telegram Bot", icon:"send" },
  { key:"openai", category:"ai", name:"OpenAI-compatible", icon:"cpu" },
  { key:"azure_ai", category:"ai", name:"Azure AI", icon:"cloud" },
  { key:"generic_webhook", category:"automation", name:"HTTPS Webhook", icon:"link" },
])

export async function getEnterpriseOverview() { return request("/enterprise/overview") }
export async function getEnterpriseLive() { return request("/enterprise/live") }
export async function getIntegrationCatalog() { return request("/enterprise/catalog") }
export async function getConfiguredIntegrations() { return request("/enterprise/integrations") }
export async function testEnterpriseIntegration(id) { return request(`/enterprise/integrations/${encodeURIComponent(id)}/test`, { method:"POST", body:"{}" }) }
export async function getZatcaStatus() { return request("/enterprise/zakat/status") }
export async function askEnterpriseAI(prompt) { return request("/enterprise/ai/ask", { method:"POST", body:JSON.stringify({ prompt }) }) }
export async function previewEnterpriseSync(adapter) { return request("/enterprise/sync/preview", { method:"POST", body:JSON.stringify({ adapter }) }) }
export function formatMetric(value, digits = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? new Intl.NumberFormat("ar-SA", { maximumFractionDigits:digits }).format(n) : "—"
}
