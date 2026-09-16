// (c) 2025 المنافذ الذكية للبرمجيات
import { useOffline } from "@/lib/offline/OfflineContext";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

interface OfflineBannerProps {
  isOnline: boolean;
  pendingSync: number;
}

export function OfflineBanner({ isOnline, pendingSync }: OfflineBannerProps) {
  const { isSyncing, syncNow } = useOffline();

  if (isOnline && pendingSync === 0 && !isSyncing) return null;

  return (
    <div className={`${isOnline ? "bg-green-500" : "bg-yellow-500"} text-white text-center py-1.5 text-sm font-medium transition-all`}>
      <div className="flex items-center justify-center gap-2">
        {isOnline ? (
          <Wifi className="w-4 h-4" />
        ) : (
          <WifiOff className="w-4 h-4" />
        )}
        <span>
          {isOnline ? "متصل بالإنترنت" : "وضع بدون اتصال - البيانات محفوظة محلياً"}
        </span>
        {pendingSync > 0 && (
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
            {pendingSync} {pendingSync === 1 ? "عملية بانتظار" : "عمليات بانتظار"}
          </span>
        )}
        {isSyncing && (
          <RefreshCw className="w-4 h-4 animate-spin" />
        )}
        {!isSyncing && pendingSync > 0 && isOnline && (
          <button onClick={() => syncNow()} className="bg-white/20 px-2 py-0.5 rounded-full text-xs hover:bg-white/30">
            مزامنة الآن
          </button>
        )}
      </div>
    </div>
  );
}
