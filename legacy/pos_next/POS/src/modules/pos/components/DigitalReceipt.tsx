// (c) 2025 المنافذ الذكية للبرمجيات
import { POSCartItem, POSCustomer } from "../types";
import { formatCurrency, formatDate, getBrandLabel, COMPANY } from "../utils/currency";
import { Printer, ShoppingBag, X } from "lucide-react";

interface DigitalReceiptProps {
  items: POSCartItem[];
  subtotal: number;
  discount: number;
  total: number;
  taxRate: number;
  customer: POSCustomer | null;
  onPrint: () => void;
  onNewSale: () => void;
}

export function DigitalReceipt({ items, subtotal, discount, total, taxRate, customer, onPrint, onNewSale }: DigitalReceiptProps) {
  const tax = (subtotal - discount) * taxRate / 100;

  return (
    <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm border p-6" dir="rtl">
      <div className="text-center mb-6">
        <div className="bg-blue-600 text-white w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-3 text-2xl font-bold">
          SP
        </div>
        <h2 className="text-xl font-bold text-gray-800">فاتورة المبيعات</h2>
        <p className="text-sm text-gray-500">{COMPANY.name} - المنافذ الذكية للبرمجيات</p>
        <p className="text-xs text-gray-400 mt-1">{formatDate(new Date())} - #{Math.random().toString(36).slice(2, 8).toUpperCase()}</p>
      </div>

      {customer && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm"><span className="text-gray-500">العميل:</span> {customer.name}</p>
          <p className="text-sm"><span className="text-gray-500">الهاتف:</span> {customer.phone}</p>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between items-center py-2 border-b">
            <div>
              <p className="font-medium text-sm">{item.product.name}</p>
              <p className="text-xs text-gray-400">{item.quantity} × {formatCurrency(item.unitPrice)}</p>
            </div>
            <p className="font-bold text-sm">{formatCurrency(item.total)}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1 mb-4">
        <div className="flex justify-between text-sm"><span>المجموع الفرعي</span><span>{formatCurrency(subtotal)}</span></div>
        <div className="flex justify-between text-sm"><span>الخصم</span><span>-{formatCurrency(discount)}</span></div>
        <div className="flex justify-between text-sm"><span>الضريبة ({taxRate}%)</span><span>{formatCurrency(tax)}</span></div>
        <hr />
        <div className="flex justify-between font-bold text-xl text-blue-600"><span>الإجمالي</span><span>{formatCurrency(total)}</span></div>
      </div>

      <div className="flex gap-3 mb-6">
        <button onClick={onPrint} className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
          <Printer className="w-5 h-5" /> طباعة
        </button>
        <button onClick={onNewSale} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">
          {getBrandLabel("invoice")} جديدة
        </button>
      </div>

      <p className="text-center text-xs text-gray-400">
        شكراً لتعاملكم مع {COMPANY.name}
      </p>
    </div>
  );
}
