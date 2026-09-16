// (c) 2025 المنافذ الذكية للبرمجيات
import { useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { POSProduct } from "../types";

interface VariantSelectorModalProps {
  product: POSProduct;
  onClose: () => void;
  onSelect: (variant: any) => void;
}

export function VariantSelectorModal({ product, onClose, onSelect }: VariantSelectorModalProps) {
  const [selected, setSelected] = useState<string>("");
  const variants = product.variants || [];

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>اختر الخيار - {product.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {variants.map((v: any) => (
            <button key={v.id} onClick={() => setSelected(v.name)} className={`w-full p-3 rounded-lg border text-right ${selected === v.name ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
              <p className="font-medium">{v.name}</p>
              {v.price && <p className="text-sm text-green-600">{v.price} ر.س</p>}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => { if (selected) onSelect({ name: selected }); onClose(); }}><Check className="w-4 h-4 mr-1" /> تأكيد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
