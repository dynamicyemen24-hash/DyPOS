// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useCallback, useRef, useEffect } from "react";
import { scanBarcodeFromCamera } from "@/modules/pos/utils/barcodeScanner";
import { X, Camera, Upload } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualInput, setManualInput] = useState("");

  const startCameraScan = useCallback(async () => {
    setIsScanning(true);
    try {
      const result = await scanBarcodeFromCamera();
      if (result) {
        setScanResult(result.rawValue);
        onScan(result.rawValue);
      }
    } catch (err) {
      console.error("Scan error:", err);
    } finally {
      setIsScanning(false);
    }
  }, [onScan]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { scanBarcodeFromFile } = await import("@/modules/pos/utils/barcodeScanner");
      const result = await scanBarcodeFromFile(file);
      if (result) {
        setScanResult(result.rawValue);
        onScan(result.rawValue);
      }
    } catch (err) {
      console.error("File scan error:", err);
    }
  }, [onScan]);

  const handleManualSubmit = useCallback(() => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
    }
  }, [manualInput, onScan]);

  return (
    <div className="bg-white rounded-xl p-6 max-w-lg mx-auto shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-800">مسح الباركود</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            onClick={startCameraScan}
            disabled={isScanning}
            className="flex-1 flex items-center justify-center gap-2 p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Camera className="w-5 h-5" />
            {isScanning ? "جاري المسح..." : "مسح الكاميرا"}
          </button>
          <label className="flex-1 flex items-center justify-center gap-2 p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer">
            <Upload className="w-5 h-5" />
            رفع صورة
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300" /></div>
          <div className="relative flex justify-center"><span className="bg-white px-4 text-gray-400 text-sm">أو أدخل الباركود يدوياً</span></div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="أدخل رقم الباركود..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-right"
            onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
          />
          <button
            onClick={handleManualSubmit}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900"
          >
            إدخال
          </button>
        </div>

        {scanResult && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm font-medium">تم المسح: {scanResult}</p>
          </div>
        )}
      </div>
    </div>
  );
}
