// (c) 2025 المنافذ الذكية للبرمجيات
import { Search, Barcode } from "lucide-react";
import { POSSearchResult } from "../types";

interface UnifiedSearchBarProps {
  query: string;
  onSearch: (query: string) => void;
  onBarcodeClick: () => void;
  results: POSSearchResult | null;
}

export function UnifiedSearchBar({ query, onSearch, onBarcodeClick, results }: UnifiedSearchBarProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-3">
      <div className="relative flex items-center">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" value={query} onChange={(e) => onSearch(e.target.value)} placeholder="بحث في المنتجات والعملاء أو مسح الباركود..." className="w-full pr-12 pl-4 py-3 border border-gray-300 rounded-xl text-right text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        <button onClick={onBarcodeClick} className="absolute left-3 p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200" title="مسح الباركود"><Barcode className="w-5 h-5" /></button>
      </div>
      {results && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {results.products.length > 0 && <div className="text-xs text-gray-400 font-medium mb-1">المنتجات ({results.products.length})</div>}
          {results.products.slice(0, 5).map((product) => (
            <div key={product.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
              <span className="font-medium">{product.name}</span>
              <span className="text-xs text-gray-400">{product.barcode}</span>
              <span className="text-xs font-bold text-green-600 mr-auto">{product.salePrice} ر.س</span>
            </div>
          ))}
          {results.customers.length > 0 && (
            <>
              <div className="text-xs text-gray-400 font-medium mb-1 mt-2">العملاء ({results.customers.length})</div>
              {results.customers.slice(0, 3).map((c) => (
                <div key={c.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-gray-400">{c.phone}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
