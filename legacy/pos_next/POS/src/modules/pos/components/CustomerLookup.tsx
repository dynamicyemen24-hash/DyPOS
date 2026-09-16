// (c) 2025 المنافذ الذكية للبرمجيات
import { useState } from "react";
import { POSCustomer } from "../types";
import { Search, User } from "lucide-react";

interface CustomerLookupProps {
  customers: POSCustomer[];
  selectedCustomer: POSCustomer | null;
  onSelectCustomer: (customer: POSCustomer | null) => void;
  onSearch: (query: string) => POSCustomer[];
}

export function CustomerLookup({ customers, selectedCustomer, onSelectCustomer, onSearch }: CustomerLookupProps) {
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onSearch(e.target.value);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
        <User className="w-5 h-5 text-blue-600" />
        العميل
      </h3>

      <div className="relative mb-3">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={handleSearch}
          placeholder="بحث عن العميل..."
          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-right"
        />
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {selectedCustomer && (
          <div
            onClick={() => { setQuery(""); onSelectCustomer(null); }}
            className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
              {selectedCustomer.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{selectedCustomer.name}</p>
              <p className="text-xs text-gray-400">{selectedCustomer.phone}</p>
            </div>
          </div>
        )}

        {query && customers
          .filter((c) => c.name.includes(query) || c.phone.includes(query))
          .map((customer) => (
            <div
              key={customer.id}
              onClick={() => { setQuery(customer.name); onSelectCustomer(customer); }}
              className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
            >
              <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center text-xs font-bold">
                {customer.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{customer.name}</p>
                <p className="text-xs text-gray-400">{customer.phone}</p>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
