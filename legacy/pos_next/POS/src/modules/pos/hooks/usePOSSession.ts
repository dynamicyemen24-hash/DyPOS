// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useCallback, useEffect } from "react";
import { POSSession } from "../types";
import { generateId } from "../utils/currency";

export function usePOSSession() {
  const [session, setSession] = useState<POSSession | null>(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("sp_pos_session");
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  });

  useEffect(() => {
    if (session) {
      sessionStorage.setItem("sp_pos_session", JSON.stringify(session));
    } else {
      sessionStorage.removeItem("sp_pos_session");
    }
  }, [session]);

  const startSession = useCallback((cashierId: string, tenantId?: string): POSSession => {
    const newSession: POSSession = {
      id: generateId(),
      cashierId,
      shiftId: generateId(),
      startTime: Date.now(),
      totalSales: 0,
      totalItems: 0,
      status: "active",
      tenantId,
    };
    setSession(newSession);
    return newSession;
  }, []);

  const endSession = useCallback(() => {
    setSession((prev) => {
      if (prev) {
        const ended = { ...prev, endTime: Date.now(), status: "closed" as const };
        return ended;
      }
      return null;
    });
  }, []);

  const updateSales = useCallback((amount: number, itemsCount: number) => {
    setSession((prev) => prev ? { ...prev, totalSales: prev.totalSales + amount, totalItems: prev.totalItems + itemsCount } : null);
  }, []);

  const isActive = session?.status === "active";

  return {
    session,
    isActive,
    startSession,
    endSession,
    updateSales,
  };
}
