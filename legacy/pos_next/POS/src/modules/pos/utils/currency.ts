// (c) 2025 المنافذ الذكية للبرمجيات
import { formatCurrency as _formatCurrency, formatNumber, formatDate, formatDateTime, getBrandLabel, COMPANY, BRAND_COLORS } from "@/lib/offline/branding";

export { formatNumber, formatDate, formatDateTime, getBrandLabel, COMPANY, BRAND_COLORS };
export { _formatCurrency as formatCurrency };

export function formatPrice(amount: number, currency = COMPANY.currency): string {
  return _formatCurrency(amount, currency);
}

export function calculateSubtotal(items: Array<{ quantity: number; unitPrice: number; discount?: number }>): number {
  return items.reduce((sum, item) => {
    const discount = item.discount || 0;
    return sum + item.unitPrice * item.quantity - discount;
  }, 0);
}

export function calculateTax(subtotal: number, taxRate: number = 15): number {
  return (subtotal * taxRate) / 100;
}

export function calculateTotal(subtotal: number, discount: number, taxRate: number = 15): number {
  const tax = calculateTax(subtotal - discount, taxRate);
  return subtotal - discount + tax;
}

export function calculateChange(total: number, paid: number): number {
  return Math.max(0, paid - total);
}

export function generateInvoiceNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${dateStr}-${rand}`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getCurrencySymbol(currency = COMPANY.currency): string {
  const symbols: Record<string, string> = {
    SAR: "ر.س", USD: "$", AED: "د.إ", EUR: "€", EGP: "ج.م",
  };
  return symbols[currency] || currency;
}
