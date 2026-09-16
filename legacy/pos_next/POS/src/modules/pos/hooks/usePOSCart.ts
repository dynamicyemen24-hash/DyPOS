// (c) 2025 المنافذ الذكية للبرمجيات
import { useState, useCallback, useMemo } from "react";
import { POSCartItem, POSProduct } from "../types";
import { generateId } from "../utils/currency";
import { calculateSubtotal } from "../utils/currency";

export function usePOSCart() {
  const [items, setItems] = useState<POSCartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(15);

  const addItem = useCallback((product: POSProduct, quantity: number = 1, variant?: any) => {
    setItems((prev) => {
      const existing = prev.find(
        (item) => item.productId === product.id && item.variant?.id === variant?.id
      );
      if (existing) {
        return prev.map((item) =>
          item === existing ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      const newItem: POSCartItem = {
        id: generateId(),
        productId: product.id,
        product,
        quantity,
        unitPrice: variant?.price || product.salePrice,
        discount: 0,
        total: (variant?.price || product.salePrice) * quantity,
        variant,
      };
      return [...prev, newItem];
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }, []);

  const updateQuantity = useCallback((itemId: string, change: number) => {
    setItems((prev) => {
      const newItems = prev.map((item) =>
        item.id === itemId ? { ...item, quantity: Math.max(0, item.quantity + change) } : item
      ).filter((item) => item.quantity > 0);
      return newItems;
    });
  }, []);

  const updateDiscount = useCallback((itemId: string, discount: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, discount, total: item.unitPrice * item.quantity - discount } : item
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setDiscount(0);
  }, []);

  const subtotal = useMemo(() => calculateSubtotal(items.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount }))), [items]);
  const total = useMemo(() => {
    const tax = (subtotal - discount) * taxRate / 100;
    return subtotal - discount + tax;
  }, [subtotal, discount, taxRate]);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  return {
    items,
    discount,
    setDiscount,
    taxRate,
    setTaxRate,
    addItem,
    removeItem,
    updateQuantity,
    updateDiscount,
    clearCart,
    subtotal,
    total,
    itemCount,
  };
}
