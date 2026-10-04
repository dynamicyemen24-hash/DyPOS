/**
 * useSalePrint — كل مسارات الطباعة الخاصة بعملية بيع واحدة.
 *
 * لماذا composable بدل بقائه في الصفحة: الطباعة لها ثلاثة مداخل (إيصال ما
 * بعد البيع، إعادة طباعة آخر فاتورة، وطباعة يدوية)، وكلها تنتهي بسقوط
 * متدرّج واحد: طابور الطباعة ← طباعة مباشرة ← نافذة الطباعة. هذا التسلسل
 * هو ما يضمن ألّا يقف الكاشير عاجزًا، وهو بالضبط ما لا ينبغي أن يتكرر
 * في ثلاث نسخ داخل صفحة من ستة آلاف سطر.
 *
 * الاستخراج يقلّل `POSSale.vue` — أكبر دين تقني في المستودع — ويعطي
 * السلوك اختباراته، بدل أن يبقى دوال لا يركّبها أحد.
 */
import { logger } from "@/utils/logger"

const log = logger.create("SalePrint")

/**
 * @param {Object} deps
 * @param {import("vue").Ref<Object|null>} deps.completedSale آخر عملية بيع مكتملة
 * @param {import("vue").Ref<string|null>} deps.lastSaleInvoiceId معرّف آخر فاتورة
 * @param {() => Object} deps.getPrintSettings قارئ إعدادات الطباعة (لا لقطة)
 * @param {(message: string, type?: string) => void} deps.notify إشعار للمستخدم
 * @param {() => void} [deps.fallbackPrint] بديل نافذة الطباعة (للاختبار)
 * @returns {{ printReceipt: Function, handlePrintInvoice: Function, printLastInvoice: Function }}
 */
export function createSalePrint({
	completedSale,
	lastSaleInvoiceId,
	getPrintSettings,
	notify,
	fallbackPrint = () => window.print(),
}) {
	/**
	 * الطباعة اليدوية: الطابور أولًا، ثم الطباعة المباشرة، ولا يُسقط
	 * إيقاف الدفع ولا البيع مهما فشل.
	 *
	 * @param {Object|string} invoice
	 * @returns {Promise<void>}
	 */
	async function handlePrintInvoice(invoice) {
		const invoiceName =
			typeof invoice === "string"
				? invoice
				: invoice?.name || invoice?.offline_id
		if (!invoiceName) return

		try {
			const { printInvoiceByName, isLocalOnlyInvoiceName } = await import(
				"@/utils/printInvoice"
			)
			let invoiceData = null
			if (isLocalOnlyInvoiceName(invoiceName)) {
				const { hydrateLocalOnlyInvoice } = await import("@/utils/printInvoice")
				invoiceData = await hydrateLocalOnlyInvoice({ name: invoiceName })
			}

			const { submitPrintJob } = await import("@/print/index")
			const settings = getPrintSettings()
			const job = await submitPrintJob({
				docType: "invoice",
				docId: invoiceName,
				title: invoiceName,
				payload: invoiceData || null,
				formId: settings?.print_format || "",
				requestedBy: invoice?.requestedBy,
				posProfile: settings?.pos_profile || null,
			})
			log.info?.("Invoice queued for print", { spoolNo: job?.spoolNo })
		} catch (error) {
			log.warn?.("Spool unavailable; direct print fallback", error?.message)
			try {
				const { printInvoiceByName } = await import("@/utils/printInvoice")
				await printInvoiceByName(invoiceName)
			} catch (printError) {
				log.error?.("Direct print failed", printError?.message)
			}
		}
	}

	/**
	 * إيصال ما بعد البيع: ينتظر الطابور (25 ثانية) ثم يسقط متدرّجًا.
	 * @returns {Promise<void>}
	 */
	async function printReceipt() {
		const sale = completedSale.value
		const invoiceId = sale?.invoice_id || sale?.offline_id || sale?.name
		if (!invoiceId) {
			fallbackPrint()
			return
		}

		try {
			const { submitAndWait } = await import("@/print/index")
			const job = await submitAndWait(
				{
					docType: "invoice",
					docId: invoiceId,
					title: `Invoice ${invoiceId}`,
					payload: null,
					formId: getPrintSettings()?.print_format || "",
					requestedBy: null,
					posProfile: getPrintSettings()?.pos_profile || null,
				},
				{ timeoutMs: 25000 },
			)
			if (job?.status === "COMPLETED") return
			throw new Error(job?.lastError || "Receipt did not print")
		} catch (error) {
			// الطابور غير متاح أو فشل — لا نُحجب الكاشير أبدًا، ويبقى سلوك
			// طباعة المتصفح مسارًا احتياطيًا آمنًا.
			log.warn?.("Receipt spool print failed; browser fallback", error?.message)
			try {
				const { printInvoiceByName } = await import("@/utils/printInvoice")
				await printInvoiceByName(
					invoiceId,
					getPrintSettings()?.print_format || null,
				)
			} catch {
				fallbackPrint()
			}
		}
	}

	/** إعادة طباعة آخر فاتورة (idempotent؛ الطابور يزيل تكرار الضغط السريع). */
	async function printLastInvoice() {
		const invoiceId = lastSaleInvoiceId.value
		if (!invoiceId) {
			notify("لا توجد فاتورة سابقة للطباعة", "info")
			return
		}
		await handlePrintInvoice(invoiceId)
	}

	return { printReceipt, handlePrintInvoice, printLastInvoice }
}
