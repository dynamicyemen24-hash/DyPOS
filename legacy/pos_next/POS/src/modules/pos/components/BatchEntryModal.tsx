// (c) 2025 المنافذ الذكية للبرمجيات
import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface BatchEntryModalProps {
  onClose: () => void;
  onSave: () => void;
}

export function BatchEntryModal({ onClose, onSave }: BatchEntryModalProps) {
  const [rows, setRows] = useState([{ code: "", quantity: 1 }]);

  const addRow = () => setRows([...rows, { code: "", quantity: 1 }]);
  const removeRow = (idx: number) => setRows(rows.filter((_, i) => i !== idx));
  const updateRow = (idx: number, field: string, value: string) => {
    setRows(rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>إدخال جماعي</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <Input
                  placeholder="كود المنتج"
                  value={row.code}
                  onChange={(e) => updateRow(idx, "code", e.target.value)}
                  className="text-sm"
                />
                <Input
                  type="number"
                  placeholder="الكمية"
                  value={row.quantity}
                  onChange={(e) => updateRow(idx, "quantity", e.target.value)}
                  className="w-20 text-sm"
                />
                {rows.length > 1 && (
                  <button onClick={() => removeRow(idx)} className="text-red-500 hover:text-red-700">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> إضافة سطر
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={onSave}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
