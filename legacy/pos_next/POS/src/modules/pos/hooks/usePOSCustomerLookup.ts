// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useCallback, useMemo } from "react";
import { POSCustomer } from "../types";

export function usePOSCustomerLookup(initialCustomers: POSCustomer[] = []) {
  const [customers, setCustomers] = useState<POSCustomer[]>(initialCustomers);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<POSCustomer | null>(null);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const lookup = useCallback((query: string): POSCustomer[] => {
    setSearchQuery(query);
    if (!query) return [];
    const q = query.toLowerCase();
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [customers]);

  const selectCustomer = useCallback((customer: POSCustomer | null) => {
    setSelectedCustomer(customer);
    setSearchQuery(customer?.name || "");
  }, []);

  return {
    customers,
    setCustomers,
    searchQuery,
    setSearchQuery,
    filteredCustomers,
    selectedCustomer,
    selectCustomer,
    lookup,
  };
}
