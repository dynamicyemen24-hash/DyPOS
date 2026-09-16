// (c) 2025 المنافذ الذكية للبرمجيات
import { Zap } from "lucide-react";
import { getBrandLabel } from "../utils/currency";

interface QuickSaleButtonProps {
  onQuickSale: () => void;
}

export function QuickSaleButton({ onQuickSale }: QuickSaleButtonProps) {
  return (
    <button
      onClick={onQuickSale}
      className="w-full flex items-center justify-center gap-2 py-3 bg-[#1E40AF] text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
    >
      <Zap className="w-5 h-5" />
      {getBrandLabel("quickSale")}
    </button>
  );
}
