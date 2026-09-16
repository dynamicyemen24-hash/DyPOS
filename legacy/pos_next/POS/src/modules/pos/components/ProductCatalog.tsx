// (c) 2025 المنافذ الذكية للبرمجيات
import { POSProduct } from "../types";
import { Search, Package } from "lucide-react";

interface ProductCatalogProps {
  products: POSProduct[];
  onProductClick: (product: POSProduct) => void;
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
}

export function ProductCatalog({ products, onProductClick, selectedCategory, onCategoryChange }: ProductCatalogProps) {
  const categories = ["all", ...new Set(products.map((p) => p.category))];

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-800">كATALOG المنتجات ({products.length})</h3>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="بحث في المنتجات..."
            className="pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-64"
          />
        </div>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat === "all" ? null : cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedCategory === (cat === "all" ? null : cat)
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cat === "all" ? "الكل" : cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 max-h-96 overflow-y-auto">
        {products.length === 0 ? (
          <div className="col-span-3 flex items-center justify-center py-12 text-gray-400">
            <div className="text-center">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>لا توجد منتجات</p>
            </div>
          </div>
        ) : (
          products.map((product) => (
            <button
              key={product.id}
              onClick={() => onProductClick(product)}
              className="pos-item-card text-right"
            >
              <div className="bg-gray-100 rounded-lg p-3 mb-2">
                <Package className="w-8 h-8 mx-auto text-gray-400" />
              </div>
              <p className="pos-item-name font-medium text-xs">{product.name}</p>
              <p className="pos-item-price text-sm font-bold">{product.salePrice} ر.س</p>
              <p className="text-xs text-gray-400 mt-1">المخزون: {product.quantity}</p>
              <div className="mt-2">
                <span className={`px-2 py-0.5 rounded-full text-xs ${product.quantity < 5 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                  {product.quantity < 5 ? "مخزون منخفض" : "متوفر"}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
