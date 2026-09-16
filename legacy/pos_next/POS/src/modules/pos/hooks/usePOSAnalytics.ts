// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useMemo, useCallback } from "react";
import { POSAnalyticsData } from "../types";

export function usePOSAnalytics() {
  const [analytics, setAnalytics] = useState<POSAnalyticsData | null>(null);

  const dashboardStats = useMemo((): POSAnalyticsData | null => {
    if (!analytics) return null;
    return analytics;
  }, [analytics]);

  const updateAnalytics = useCallback((data: POSAnalyticsData | null) => {
    setAnalytics(data);
  }, []);

  const getTodaySales = useCallback(() => {
    return analytics?.todaySales || 0;
  }, [analytics]);

  const getTransactionCount = useCallback(() => {
    return analytics?.todayTransactions || 0;
  }, [analytics]);

  const getRevenueTrend = useCallback(() => {
    return analytics?.revenueTrend || [];
  }, [analytics]);

  const getTopProducts = useCallback(() => {
    return analytics?.topProducts || [];
  }, [analytics]);

  return {
    analytics,
    setAnalytics,
    dashboardStats,
    updateAnalytics,
    getTodaySales,
    getTransactionCount,
    getRevenueTrend,
    getTopProducts,
  };
}
