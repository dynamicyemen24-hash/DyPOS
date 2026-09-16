// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useCallback } from "react";
import { POSProduct, POSCustomer } from "../types";
import { parseBarcode, validateBarcode } from "../utils/barcodeScanner";

interface UnifiedSearchResult {
  products: POSProduct[];
  customers: POSCustomer[];
  hasBarcode: boolean;
  barcodeData: string | null;
  isBarcodeQuery: boolean;
}

export function usePOSUnifiedSearch(products: POSProduct[], customers: POSCustomer[]) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedSearchResult | null>(null);

  const search = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
    if (!searchQuery.trim()) {
      setResults(null);
      return;
    }

    const barcodeResult = parseBarcode(searchQuery.trim());
    const isBarcode = barcodeResult && validateBarcode(searchQuery.trim());

    if (isBarcode) {
      const matchingProducts = products.filter(
        (p) => p.barcode === searchQuery.trim() || p.code === searchQuery.trim()
      );
      setResults({
        products: matchingProducts,
        customers: [],
        hasBarcode: true,
        barcodeData: barcodeResult.data,
        isBarcodeQuery: true,
      });
      return;
    }

    const q = searchQuery.toLowerCase();
    const matchedProducts = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
    const matchedCustomers = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );

    setResults({
      products: matchedProducts,
      customers: matchedCustomers,
      hasBarcode: false,
      barcodeData: null,
      isBarcodeQuery: false,
    });
  }, [products, customers]);

  const clear = useCallback(() => {
    setQuery("");
    setResults(null);
  }, []);

  return {
    query,
    results,
    search,
    clear,
    isSearching: !!query,
  };
}
