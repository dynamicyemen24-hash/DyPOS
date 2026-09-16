// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useMemo, useCallback } from "react";
import { POSProduct } from "../types";

export function usePOSRecommendations(cartItems: Array<{ productId: string; quantity: number }> = []) {
  const [recommendations, setRecommendations] = useState<POSProduct[]>([]);

  const getRecommendations = useMemo(() => {
    if (cartItems.length === 0) return [];
    const cartProductIds = new Set(cartItems.map((c) => c.productId));
    return recommendations.filter((r) => !cartProductIds.has(r.id));
  }, [recommendations, cartItems]);

  const setRecommendationsFromProducts = useCallback((allProducts: POSProduct[], cartItemCount: number) => {
    const sorted = [...allProducts]
      .filter((p) => p.status === "active")
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(0, 10 - cartItemCount));
    setRecommendations(sorted);
  }, []);

  return {
    recommendations,
    getRecommendations,
    setRecommendationsFromProducts,
  };
}
