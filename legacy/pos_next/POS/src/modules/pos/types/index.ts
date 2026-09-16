// (c) 2025 المنافذ الذكية للبرمجيات
export interface POSProduct {
  id: string;
  code: string;
  name: string;
  nameAr?: string;
  barcode: string;
  category: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  minStock: number;
  quantity: number;
  barcodeData?: string;
  status: "active" | "inactive";
  variants?: POSVariant[];
}

export interface POSVariant {
  id: string;
  name: string;
  options: VariantOption[];
  price?: number;
  sku?: string;
  inventory?: number;
}

export interface VariantOption {
  name: string;
  value: string;
}

export interface POSCustomer {
  id: string;
  code: string;
  name: string;
  nameAr?: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  balance: number;
  totalOrders: number;
  totalSpent: number;
  loyaltyPoints: number;
  tags: string[];
  createdAt: string;
}

export interface POSCartItem {
  id: string;
  productId: string;
  product: POSProduct;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  variant?: POSVariant;
}

export interface POSInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer: POSCustomer;
  items: POSCartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  change: number;
  paymentMethod: "cash" | "card" | "transfer" | "credit";
  status: "draft" | "confirmed" | "paid" | "cancelled";
  cashierId: string;
  shiftId: string;
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
}

export interface POSHoldSession {
  id: string;
  invoiceId?: string;
  cartItems: POSCartItem[];
  customerId?: string;
  cashierId: string;
  createdAt: number;
  expiresAt: number;
}

export interface POSNotification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export interface POSAnalyticsData {
  todaySales: number;
  todayTransactions: number;
  todayProductsSold: number;
  activeCustomers: number;
  revenueTrend: number[];
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  paymentMethods: Array<{ method: string; count: number; amount: number }>;
  hourlySales: Array<{ hour: number; sales: number }>;
}

export interface POSSearchResult {
  products: POSProduct[];
  customers: POSCustomer[];
  barcode: string | null;
}

export interface POSOfflineQueueItem {
  id: string;
  type: "invoice" | "payment" | "customer" | "product";
  data: unknown;
  timestamp: number;
  status: "pending" | "syncing" | "synced" | "failed";
}

export interface POSSession {
  id: string;
  cashierId: string;
  shiftId: string;
  startTime: number;
  endTime?: number;
  totalSales: number;
  totalItems: number;
  status: "active" | "closed";
  tenantId?: string;
}

export interface POSTenant {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  logo: string;
  domain?: string;
  theme: { primaryColor: string; secondaryColor: string };
  settings: Record<string, unknown>;
  status: "active" | "suspended" | "trial";
}
