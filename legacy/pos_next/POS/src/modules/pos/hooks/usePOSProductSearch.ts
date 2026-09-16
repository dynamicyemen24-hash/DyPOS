// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useCallback, useMemo, useEffect } from "react";
import { POSProduct } from "../types";

export function usePOSProductSearch(initialProducts: POSProduct[] = []) {
  const [products, setProducts] = useState<POSProduct[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchResults = useMemo(() => {
    return products.filter((product) => {
      const matchesQuery = !debouncedQuery ||
        product.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        product.barcode.includes(debouncedQuery) ||
        product.code.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        product.category.toLowerCase().includes(debouncedQuery.toLowerCase());
      const matchesCategory = !selectedCategory || product.category === selectedCategory;
      return matchesQuery && matchesCategory;
    });
  }, [products, debouncedQuery, selectedCategory]);

  const search = useCallback((query: string) => {
    setSearchQuery(query);
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 200);
  }, []);

  const filterByCategory = useCallback((category: string | null) => {
    setSelectedCategory(category);
  }, []);

  return {
    products,
    setProducts,
    searchQuery,
    setSearchQuery,
    searchResults,
    selectedCategory,
    filterByCategory,
    search,
    isLoading,
  };
}
