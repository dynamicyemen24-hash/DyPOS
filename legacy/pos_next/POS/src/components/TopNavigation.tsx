// (c) 2025 المنافذ الذكية للبرمجيات
import { Package, Wifi, WifiOff } from "lucide-react";
import { useOffline } from "@/lib/offline/OfflineContext";
import { COMPANY } from "@/lib/offline/branding";

export function TopNavigation() {
  const { isOnline } = useOffline();

  return (
    <header className="bg-[#1E40AF] text-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Package className="w-8 h-8" />
        <div>
          <h1 className="font-bold text-lg">{COMPANY.name}</h1>
          <p className="text-xs text-blue-200">Smart Ports POS v2.0</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isOnline ? (
          <span className="flex items-center gap-1 text-green-300"><Wifi className="w-4 h-4" /> متصل</span>
        ) : (
          <span className="flex items-center gap-1 text-yellow-300"><WifiOff className="w-4 h-4" /> أوفلاين</span>
        )}
      </div>
    </header>
  );
}
