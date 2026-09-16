// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useCallback } from "react";
import { useOffline } from "@/lib/offline/OfflineContext";
import { POSOfflineQueueItem } from "../types";
import { generateId } from "../utils/currency";

export function useOfflineQueue() {
  const { isOnline, syncNow } = useOffline();
  const [queue, setQueue] = useState<POSOfflineQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const addToQueue = useCallback((type: POSOfflineQueueItem["type"], data: unknown) => {
    const item: POSOfflineQueueItem = {
      id: generateId(),
      type,
      data,
      timestamp: Date.now(),
      status: "pending",
    };
    setQueue((prev) => [...prev, item]);
    return item;
  }, []);

  const syncQueue = useCallback(async () => {
    if (!isOnline || queue.length === 0) return;
    setIsSyncing(true);
    try {
      const pending = queue.filter((q) => q.status === "pending");
      pending.forEach((q) => {
        setQueue((prev) => prev.map((item) => item.id === q.id ? { ...item, status: "syncing" as const } : item));
      });
      await syncNow();
      setQueue((prev) => prev.map((item) => item.status === "syncing" ? { ...item, status: "synced" as const } : item));
    } catch {
      setQueue((prev) => prev.map((item) => item.status === "syncing" ? { ...item, status: "failed" as const } : item));
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, queue, syncNow]);

  const pendingCount = queue.filter((q) => q.status === "pending" || q.status === "syncing").length;

  return {
    queue,
    isOnline,
    isSyncing,
    pendingCount,
    addToQueue,
    syncQueue,
  };
}
