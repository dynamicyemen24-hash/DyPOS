// (c) 2025 المنافذ الذكية للبرمجيات
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SerialEntryModalProps {
  onClose: () => void;
  onSave: () => void;
}

export function SerialEntryModal({ onClose, onSave }: SerialEntryModalProps) {
  const [serials, setSerials] = useState([{ serial: "", productId: "" }]);

  const addSerial = () => setSerials([...serials, { serial: "", productId: "" }]);
  const removeSerial = (idx: number) => setSerials(serials.filter((_, i) => i !== idx));
  const updateSerial = (idx: number, field: string, value: string) => {
    setSerials(serials.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>إدخال بالرقم التسلسلي</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {serials.map((s, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input placeholder="الرقم التسلسلي" value={s.serial} onChange={(e) => updateSerial(idx, "serial", e.target.value)} className="text-sm flex-1" />
              <Input placeholder="كود المنتج" value={s.productId} onChange={(e) => updateSerial(idx, "productId", e.target.value)} className="text-sm w-32" />
              {serials.length > 1 && <button onClick={() => removeSerial(idx)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addSerial}><Plus className="w-4 h-4 mr-1" /> إضافة سيريال</Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={onSave}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
