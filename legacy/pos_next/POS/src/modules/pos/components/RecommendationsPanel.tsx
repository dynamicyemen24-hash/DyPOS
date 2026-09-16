// (c) 2025 المنافذ الذكية للبرمجيات
import { POSProduct } from "../types";
import { Sparkles } from "lucide-react";

interface RecommendationsPanelProps {
  recommendations: POSProduct[];
  onAddItem: (product: POSProduct, quantity?: number, variant?: any) => void;
}

export function RecommendationsPanel({ recommendations, onAddItem }: RecommendationsPanelProps) {
  if (recommendations.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-yellow-500" />
        توصيات
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {recommendations.map((product) => (
          <button
            key={product.id}
            onClick={() => onAddItem(product)}
            className="flex-shrink-0 w-28 p-2 bg-gray-50 rounded-lg border hover:border-blue-300 transition-colors text-center"
          >
            <div className="w-12 h-12 bg-gray-200 rounded-full mx-auto mb-1 flex items-center justify-center">
              <span className="text-lg">📦</span>
            </div>
            <p className="text-xs font-medium truncate">{product.name}</p>
            <p className="text-xs font-bold text-green-600">{product.salePrice} ر.س</p>
          </button>
        ))}
      </div>
    </div>
  );
}
