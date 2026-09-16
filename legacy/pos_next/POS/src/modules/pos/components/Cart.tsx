// (c) 2025 المنافذ الذكية للبرمجيات
import { POSCartItem } from "../types";
import { Trash2, Plus, Minus, ShoppingCart } from "lucide-react";
import { formatCurrency, getBrandLabel } from "../utils/currency";

interface CartProps {
  items: POSCartItem[];
  discount: number;
  setDiscount: (d: number) => void;
  taxRate: number;
  subtotal: number;
  total: number;
  onUpdateQuantity: (id: string, change: number) => void;
  onRemoveItem: (id: string) => void;
  onHold: () => void;
  onCompleteSale: () => void;
}

export function Cart({ items, discount, setDiscount, taxRate, subtotal, total, onUpdateQuantity, onRemoveItem, onHold, onCompleteSale }: CartProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-blue-600" />
          السلة ({items.length} صنف)
        </h3>
        <button onClick={onHold} className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">
          {getBrandLabel("hold")}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-gray-400">السلة فارغة</div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto mb-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{item.product.name}</p>
                <p className="text-xs text-gray-400">{formatCurrency(item.unitPrice)} × {item.quantity}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => onUpdateQuantity(item.id, -1)} className="p-1 rounded hover:bg-gray-200"><Minus className="w-3 h-3" /></button>
                <span className="w-6 text-center text-sm">{item.quantity}</span>
                <button onClick={() => onUpdateQuantity(item.id, 1)} className="p-1 rounded hover:bg-gray-200"><Plus className="w-3 h-3" /></button>
                <button onClick={() => onRemoveItem(item.id)} className="p-1 rounded hover:bg-red-100 text-red-500"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t pt-3">
        <div className="flex justify-between text-sm">
          <span>المجموع الفرعي</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>الخصم</span>
          <span>
            <input
              type="number"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              className="w-20 text-right border-b px-1 py-0.5 text-sm"
              placeholder="0"
            />
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span>الضريبة ({taxRate}%)</span>
          <span>{formatCurrency((subtotal - discount) * taxRate / 100)}</span>
        </div>
        <hr />
        <div className="flex justify-between font-bold text-lg">
          <span>الإجمالي</span>
          <span className="text-blue-600">{formatCurrency(total)}</span>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={onHold}
            className="flex-1 py-2 bg-yellow-100 text-yellow-700 rounded-lg text-sm font-medium hover:bg-yellow-200"
          >
            {getBrandLabel("hold")}
          </button>
          <button
            onClick={onCompleteSale}
            className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
          >
            {getBrandLabel("submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
