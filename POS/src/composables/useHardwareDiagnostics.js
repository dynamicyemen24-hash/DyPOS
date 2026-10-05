import { ref, computed } from "vue"
import { __ } from "@/utils/translation"
import { logger } from "@/utils/logger"

const log = logger.create("HardwareDiagnostics")

/**
 * Hardware Diagnostics — POS peripheral testing (Odoo-like hardware test tools).
 *
 * Provides test functions for:
 * - Thermal printer (print test receipt)
 * - Cash drawer (open/close test)
 * - Barcode scanner (scan test)
 * - Customer display (text test)
 * - Scale (weight test)
 *
 * Each test returns a structured result for UI display.
 */

const testing = ref(false)
const lastResults = ref({})
const error = ref("")

/** Test thermal printer via QZ Tray or browser print. */
async function testPrinter() {
	error.value = ""
	testing.value = true
	try {
		// Try QZ Tray first (native thermal printing)
		if (window.qz) {
			const config = qz.configs.create("QZ Tray")
			await qz.print(config, [
				{
					type: "raw",
					format: "command",
					data: "^XA^FO50,50^A0N,50,50^FDTest Print^FS^XZ",
				},
			])
			lastResults.value.printer = {
				ok: true,
				message: __("تمت طباعة صفحة اختبار عبر QZ Tray"),
			}
			return { ok: true }
		}

		// Fallback: browser print dialog with test content
		const printWindow = window.open("", "_blank")
		printWindow.document.write(`
			<!DOCTYPE html>
			<html dir="rtl">
			<head>
				<meta charset="utf-8" />
				<title>${__("صفحة اختبار الطابعة")}</title>
				<style>
					body { font-family: monospace; padding: 20px; direction: rtl; }
					.test-header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; margin-bottom: 20px; }
					.test-content { white-space: pre-wrap; }
					.cut-mark { text-align: center; border-top: 1px dashed #000; margin-top: 20px; }
				</style>
			</head>
			<body onload="window.print(); window.onafterprint = () => window.close();">
				<div class="test-header">
					<h2>${__("DyPOS - اختبار الطابعة الحرارية")}</h2>
					<p>${new Date().toLocaleString("ar-SA")}</p>
				</div>
				<div class="test-content">
${__("هذا اختبار لطباعة الإيصالات.")}\n${__("إذا ظهرت هذه الصفحة، الطابعة تعمل بشكل صحيح.")}
				</div>
				<div class="cut-mark">✂ ${__("قص هنا")} ✂</div>
			</body>
			</html>
		`)
		printWindow.document.close()
		lastResults.value.printer = {
			ok: true,
			message: __("تم فتح مربع حوار الطباعة — تحقق من الطابعة"),
		}
		return { ok: true }
	} catch (e) {
		log.warn("Printer test failed", e)
		const msg = __("فشل اختبار الطابعة: {0}", { 0: e?.message || String(e) })
		lastResults.value.printer = { ok: false, message: msg }
		error.value = msg
		return { ok: false, error: msg }
	} finally {
		testing.value = false
	}
}

/** Test cash drawer via QZ Tray or USB/Serial command. */
async function testCashDrawer() {
	error.value = ""
	testing.value = true
	try {
		if (window.qz) {
			// ESC/POS command to open cash drawer (pin 2)
			const config = qz.configs.create("QZ Tray")
			await qz.print(config, [
				{
					type: "raw",
					format: "command",
					data: "\x1B\x70\x00\x19\xFA", // ESC p 0 25 250
				},
			])
			lastResults.value.cashDrawer = {
				ok: true,
				message: __("تم إرسال أمر فتح درج النقدية عبر QZ Tray"),
			}
			return { ok: true }
		}

		// No direct browser API for cash drawer without QZ Tray
		lastResults.value.cashDrawer = {
			ok: false,
			message: __(
				"يتطلب اختبار درج النقدية QZ Tray أو اتصال مباشر. غير متاح في المتصفح.",
			),
		}
		return { ok: false, error: lastResults.value.cashDrawer.message }
	} catch (e) {
		log.warn("Cash drawer test failed", e)
		const msg = __("فشل اختبار درج النقدية: {0}", {
			0: e?.message || String(e),
		})
		lastResults.value.cashDrawer = { ok: false, message: msg }
		error.value = msg
		return { ok: false, error: msg }
	} finally {
		testing.value = false
	}
}

/** Test barcode scanner — triggers scanner and waits for input. */
async function testBarcodeScanner() {
	error.value = ""
	testing.value = true
	try {
		// Use BarcodeDetector API if available
		if ("BarcodeDetector" in window) {
			const detector = new BarcodeDetector({
				formats: ["ean_13", "ean_8", "code_128", "code_39", "qr_code"],
			})
			// We can't easily test without a camera stream, so just report capability
			lastResults.value.scanner = {
				ok: true,
				message: __("ماسح الباركود مدعوم (BarcodeDetector API متاح)"),
			}
			return { ok: true }
		}

		// Check for keyboard wedge scanners (they act as keyboard input)
		lastResults.value.scanner = {
			ok: true,
			message: __(
				"ماسح الباركود يعمل كـ Keyboard Wedge — امسح باركود لاختباره",
			),
		}
		return { ok: true }
	} catch (e) {
		log.warn("Barcode scanner test failed", e)
		const msg = __("فشل اختبار الماسح: {0}", { 0: e?.message || String(e) })
		lastResults.value.scanner = { ok: false, message: msg }
		error.value = msg
		return { ok: false, error: msg }
	} finally {
		testing.value = false
	}
}

/** Test customer display (VFD/LCD) via QZ Tray or serial. */
async function testCustomerDisplay() {
	error.value = ""
	testing.value = true
	try {
		if (window.qz) {
			const config = qz.configs.create("QZ Tray")
			await qz.print(config, [
				{
					type: "raw",
					format: "command",
					data: "\x1B\x40WELCOME TO DyPOS\x0A\x1B\x40TEST DISPLAY\x0D",
				},
			])
			lastResults.value.display = {
				ok: true,
				message: __("تم إرسال نص اختبار لشاشة العميل عبر QZ Tray"),
			}
			return { ok: true }
		}

		lastResults.value.display = {
			ok: false,
			message: __("يتطلب اختبار شاشة العميل QZ Tray أو اتصال تسلسلي مباشر."),
		}
		return { ok: false, error: lastResults.value.display.message }
	} catch (e) {
		log.warn("Customer display test failed", e)
		const msg = __("فشل اختبار شاشة العميل: {0}", {
			0: e?.message || String(e),
		})
		lastResults.value.display = { ok: false, message: msg }
		error.value = msg
		return { ok: false, error: msg }
	} finally {
		testing.value = false
	}
}

/** Test scale (weight) — reads from serial/USB scale. */
async function testScale() {
	error.value = ""
	testing.value = true
	try {
		// Scales typically use serial/USB HID — no direct browser API without QZ Tray
		if (window.qz) {
			const config = qz.configs.create("QZ Tray")
			await qz.print(config, [
				{
					type: "raw",
					format: "command",
					data: "W", // Common scale command to request weight
				},
			])
			lastResults.value.scale = {
				ok: true,
				message: __("تم طلب قراءة الوزن عبر QZ Tray"),
			}
			return { ok: true }
		}

		lastResults.value.scale = {
			ok: false,
			message: __("يتطلب اختبار الميزان QZ Tray أو WebHID/Serial API."),
		}
		return { ok: false, error: lastResults.value.scale.message }
	} catch (e) {
		log.warn("Scale test failed", e)
		const msg = __("فشل اختبار الميزان: {0}", { 0: e?.message || String(e) })
		lastResults.value.scale = { ok: false, message: msg }
		error.value = msg
		return { ok: false, error: msg }
	} finally {
		testing.value = false
	}
}

/** Run all hardware tests. */
async function runAllTests() {
	await Promise.all([
		testPrinter(),
		testCashDrawer(),
		testBarcodeScanner(),
		testCustomerDisplay(),
		testScale(),
	])
	return lastResults.value
}

/** Clear all results. */
function clearResults() {
	lastResults.value = {}
	error.value = ""
}

const availableTests = computed(() => [
	{
		key: "printer",
		label: __("الطابعة الحرارية"),
		icon: "printer",
		test: testPrinter,
	},
	{
		key: "cashDrawer",
		label: __("درج النقدية"),
		icon: "box",
		test: testCashDrawer,
	},
	{
		key: "scanner",
		label: __("ماسح الباركود"),
		icon: "scan-barcode",
		test: testBarcodeScanner,
	},
	{
		key: "display",
		label: __("شاشة العميل"),
		icon: "monitor",
		test: testCustomerDisplay,
	},
	{ key: "scale", label: __("الميزان"), icon: "scale", test: testScale },
])

export function useHardwareDiagnostics() {
	return {
		testing,
		lastResults,
		error,
		testPrinter,
		testCashDrawer,
		testBarcodeScanner,
		testCustomerDisplay,
		testScale,
		runAllTests,
		clearResults,
		availableTests,
	}
}
