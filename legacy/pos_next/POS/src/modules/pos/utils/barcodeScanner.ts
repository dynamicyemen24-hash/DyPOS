// (c) 2025 المنافذ الذكية للبرمجيات
/**
 * Barcode Scanner utilities for Smart Ports POS.
 * Supports BarcodeDetector API and manual input fallback.
 */

interface BarcodeScanResult {
  rawValue: string;
  format: string;
  confidence: number;
  timestamp: number;
}

interface ScannerConfig {
  formats?: string[];
  multiple?: boolean;
  frequency?: number;
}

let detectorInstance: any = null;

async function getDetector(): Promise<any | null> {
  if (detectorInstance) return detectorInstance;
  if (!("BarcodeDetector" in window)) return null;
  try {
    const detector = new (window as any).BarcodeDetector({
      formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "pdf417", "data_matrix", "aztec"],
    });
    detectorInstance = detector;
    return detector;
  } catch {
    return null;
  }
}

export async function scanBarcodeFromCamera(_config?: ScannerConfig): Promise<BarcodeScanResult | null> {
  const detector = await getDetector();
  if (!detector) return null;

  const video = document.createElement("video");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    await video.play();

    const barcodes = await detector.detect(video);
    (stream as MediaStream).getTracks().forEach((t) => t.stop());

    if (barcodes && barcodes.length > 0) {
      const barcode = barcodes[0];
      return {
        rawValue: barcode.rawValue,
        format: barcode.format,
        confidence: barcode.cornerPoints?.length ? 1 : 0,
        timestamp: Date.now(),
      };
    }
    return null;
  } catch {
    (video.srcObject as MediaStream)?.getTracks().forEach((t) => t.stop());
    return null;
  }
}

export async function scanBarcodeFromFile(file: File): Promise<BarcodeScanResult | null> {
  const detector = await getDetector();
  if (!detector) return null;

  try {
    const imageBitmap = await createImageBitmap(file);
    const barcodes = await detector.detect(imageBitmap);
    if (barcodes && barcodes.length > 0) {
      const barcode = barcodes[0];
      return {
        rawValue: barcode.rawValue,
        format: barcode.format,
        confidence: barcode.cornerPoints?.length ? 1 : 0,
        timestamp: Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function parseBarcode(rawValue: string): { type: string; data: string } | null {
  if (!rawValue) return null;
  if (rawValue.length === 13 && /^\d{13}$/.test(rawValue)) {
    return { type: "ean_13", data: rawValue };
  }
  if (rawValue.length === 8 && /^\d{8}$/.test(rawValue)) {
    return { type: "ean_8", data: rawValue };
  }
  if (rawValue.length === 12 && /^\d{12}$/.test(rawValue)) {
    return { type: "upc_a", data: rawValue };
  }
  if (rawValue.includes(" ") && rawValue.length >= 8) {
    return { type: "code_128", data: rawValue };
  }
  if (rawValue.startsWith("http")) {
    return { type: "qr_code", data: rawValue };
  }
  return { type: "unknown", data: rawValue };
}

export function validateBarcode(value: string): boolean {
  if (!value || value.length < 2) return false;
  const cleaned = value.replace(/[-\s]/g, "");
  return /^[0-9a-zA-Z]+$/.test(cleaned) && cleaned.length >= 2;
}

export function formatBarcodeForDisplay(value: string): string {
  return value.toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}
