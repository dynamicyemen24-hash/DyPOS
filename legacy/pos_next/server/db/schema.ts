import { drizzleSchema } from "drizzle-orm";
import {
  pgTable, pgEnum, pgSchema,
  serial, integer, bigint, text, varchar, timestamp,
  boolean, decimal, numeric, json, jsonb, date,
  uuid as uuidCol, primaryKey, index, unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ──────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "manager", "sales", "warehouse", "accountant", "viewer", "user"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "suspended", "trial", "grace", "inactive"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trial", "active", "grace", "suspended", "cancelled"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "pending", "approved", "posted", "cancelled", "zatan"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "transfer", "online", "credit", "whatsapp", "bank_transfer"]);
export const inventoryStatusEnum = pgEnum("inventory_status", ["in_stock", "low_stock", "out_of_stock", "discontinued"]);
export const activityTypeEnum = pgEnum("activity_type", ["login", "logout", "create", "update", "delete", "approve", "export", "import", "settings", "security"]);
export const documentTypeEnum = pgEnum("document_type", ["invoice", "receipt", "quotation", "purchase_order", "delivery_note", "credit_note", "debit_note"]);
export const zatcaStatusEnum = pgEnum("zatca_status", ["draft", "generated", "signed", "cleared", "cancelled", "rejected"]);
export const notificationTypeEnum = pgEnum("notification_type", ["email", "sms", "whatsapp", "push", "in_app"]);
export const notificationStatusEnum = pgEnum("notification_status", ["pending", "sent", "delivered", "failed"]);
export const accountTypeEnum = pgEnum("account_type", ["asset", "liability", "equity", "revenue", "expense"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["debit", "credit"]);
export const warehouseTypeEnum = pgEnum("warehouse_type", ["main", "branch", "retail", "warehouse", "online"]);

// ─── Common Columns ──────────────────────────────────
const createdAt = timestamp("created_at").default(sql`now()`).notNull();
const updatedAt = timestamp("updated_at").default(sql`now()`).notNull();

function tenantIdCol() { return integer("tenant_id").notNull(); }

// ─── Users Table ────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: text("open_id").notNull().unique(),
  tenantId: integer("tenant_id").notNull(),
  username: varchar("username", { length: 120 }),
  email: varchar("email", { length: 255 }),
  name: varchar("name", { length: 120 }).notNull(),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").default("user").notNull(),
  phone: varchar("phone", { length: 20 }),
  avatar: text("avatar"),
  isActive: boolean("is_active").default(true).notNull(),
  mfaEnabled: boolean("mfa_enabled").default(false).notNull(),
  mfaSecret: text("mfa_secret"),
  lastSignedIn: timestamp("last_signed_in"),
  customPermissions: json("custom_permissions"),
  metadata: jsonb("metadata"),
  deviceFingerprint: varchar("device_fingerprint", { length: 64 }),
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_users_tenantId").on(table.tenantId),
  index("idx_users_openId").on(table.openId),
  index("idx_users_role").on(table.role),
  index("idx_users_isActive").on(table.isActive),
  unique("uq_users_tenantId_username").on(table.tenantId, table.username),
]);

// ─── Tenants Table ──────────────────────────────────
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  domain: varchar("domain", { length: 255 }),
  country: varchar("country", { length: 100 }),
  currency: varchar("currency", { length: 10 }).default("SAR"),
  logo: text("logo"),
  brandColor: varchar("brand_color", { length: 7 }),
  status: tenantStatusEnum("status").default("active").notNull(),
  settings: jsonb("settings"),
  billing: jsonb("billing"),
  subscriptionId: integer("subscription_id"),
  ownerUserId: integer("owner_user_id"),
  timezone: varchar("timezone", { length: 50 }).default("Asia/Riyadh"),
  language: varchar("language", { length: 10 }).default("ar"),
  rtl: boolean("rtl").default(true).notNull(),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_tenants_code").on(table.code),
  index("idx_tenants_status").on(table.status),
  index("idx_tenants_domain").on(table.domain),
  unique("uq_tenants_code").on(table.code),
]);

// ─── Tenant Subscriptions ───────────────────────────
export const tenantSubscriptions = pgTable("tenant_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  planId: integer("plan_id").notNull(),
  status: subscriptionStatusEnum("status").default("trial").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  graceUntil: timestamp("grace_until"),
  cancelledAt: timestamp("cancelled_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  paymentProvider: varchar("payment_provider", { length: 50 }),
  paymentReference: varchar("payment_reference", { length: 255 }),
  paymentAmount: decimal("payment_amount", { precision: 12, scale: 2 }),
  paymentCurrency: varchar("payment_currency", { length: 10 }),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_tenant_subs_tenantId").on(table.tenantId),
  index("idx_tenant_subs_status").on(table.status),
  index("idx_tenant_subs_planId").on(table.planId),
]);

// ─── Subscription Plans ─────────────────────────────
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  priceMonthly: decimal("price_monthly", { precision: 12, scale: 2 }).default("0"),
  priceYearly: decimal("price_yearly", { precision: 12, scale: 2 }).default("0"),
  countryPricing: jsonb("country_pricing"),
  features: jsonb("features"),
  maxUsers: integer("max_users"),
  maxTenants: integer("max_tenants"),
  maxStorageGB: integer("max_storage_gb"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt, updatedAt,
});

// ─── Products Table ─────────────────────────────────
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("name_ar", { length: 255 }),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  type: varchar("type", { length: 20 }).default("goods"),
  unit: varchar("unit", { length: 50 }),
  unitId: integer("unit_id"),
  salePrice: decimal("sale_price", { precision: 12, scale: 4 }).default("0"),
  wholesalePrice: decimal("wholesale_price", { precision: 12, scale: 4 }).default("0"),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 4 }).default("0"),
  cost: decimal("cost", { precision: 12, scale: 4 }).default("0"),
  currentStock: decimal("current_stock", { precision: 12, scale: 4 }).default("0"),
  minStock: decimal("min_stock", { precision: 12, scale: 4 }).default("0"),
  maxStock: decimal("max_stock", { precision: 12, scale: 4 }).default("0"),
  barcode: varchar("barcode", { length: 50 }),
  sku: varchar("sku", { length: 100 }),
  imageUrl: text("image_url"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  loyaltyPoints: integer("loyalty_points").default(0),
  isActive: boolean("is_active").default(true).notNull(),
  isService: boolean("is_service").default(false).notNull(),
  conversionFactor: decimal("conversion_factor", { precision: 10, scale: 4 }).default("1"),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_products_tenantId").on(table.tenantId),
  index("idx_products_code").on(table.code),
  index("idx_products_barcode").on(table.barcode),
  index("idx_products_category").on(table.category),
  index("idx_products_isActive").on(table.isActive),
  index("idx_products_type").on(table.type),
  unique("uq_products_tenantId_code").on(table.tenantId, table.code),
  index("idx_products_fulltext").on(table.name, table.nameAr),
]);

// ─── Customers Table ────────────────────────────────
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("name_ar", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  taxNumber: varchar("tax_number", { length: 50 }),
  creditLimit: decimal("credit_limit", { precision: 12, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0"),
  totalPurchases: decimal("total_purchases", { precision: 12, scale: 2 }).default("0"),
  totalSales: decimal("total_sales", { precision: 12, scale: 2 }).default("0"),
  loyaltyPoints: integer("loyalty_points").default(0),
  rfmScore: integer("rfm_score"),
  segment: varchar("segment", { length: 50 }),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_customers_tenantId").on(table.tenantId),
  index("idx_customers_code").on(table.code),
  index("idx_customers_email").on(table.email),
  index("idx_customers_isActive").on(table.isActive),
  index("idx_customers_segment").on(table.segment),
  unique("uq_customers_tenantId_code").on(table.tenantId, table.code),
]);

// ─── Sales Invoices Table ───────────────────────────
export const salesInvoices = pgTable("sales_invoices", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  branchId: integer("branch_id"),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  customerId: integer("customer_id"),
  type: varchar("type", { length: 20 }).default("invoice"),
  status: invoiceStatusEnum("status").default("draft").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0"),
  dueAmount: decimal("due_amount", { precision: 12, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 10 }).default("SAR"),
  paymentMethod: paymentMethodEnum("payment_method"),
  cashierId: integer("cashier_id"),
  notes: text("notes"),
  referenceNumber: varchar("reference_number", { length: 100 }),
  invoiceDate: timestamp("invoice_date").notNull(),
  dueDate: timestamp("due_date"),
  zatcaStatus: zatcaStatusEnum("zatca_status").default("draft"),
  zatcaInvoiceId: text("zatca_invoice_id"),
  zatcaXml: text("zatca_xml"),
  zatcaQrCode: text("zatca_qr_code"),
  zatcaHash: text("zatca_hash"),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_sales_tenantId").on(table.tenantId),
  index("idx_sales_invoiceNumber").on(table.invoiceNumber),
  index("idx_sales_customerId").on(table.customerId),
  index("idx_sales_status").on(table.status),
  index("idx_sales_invoiceDate").on(table.invoiceDate),
  index("idx_sales_zatcaStatus").on(table.zatcaStatus),
  index("idx_sales_createdAt").on(table.createdAt),
  unique("uq_sales_tenantId_invoiceNumber").on(table.tenantId, table.invoiceNumber),
]);

// ─── Sales Invoice Items Table ──────────────────────
export const salesInvoiceItems = pgTable("sales_invoice_items", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  invoiceId: integer("invoice_id").notNull(),
  productId: integer("product_id"),
  productCode: varchar("product_code", { length: 50 }),
  productName: varchar("product_name", { length: 255 }),
  type: varchar("type", { length: 20 }).default("goods"),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 4 }).notNull(),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 12, scale: 4 }),
  metadata: jsonb("metadata"),
  createdAt,
}, (table) => [
  index("idx_sii_tenantId").on(table.tenantId),
  index("idx_sii_invoiceId").on(table.invoiceId),
  index("idx_sii_productId").on(table.productId),
]);

// ─── Purchase Invoices Table ────────────────────────
export const purchaseInvoices = pgTable("purchase_invoices", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  branchId: integer("branch_id"),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  supplierId: integer("supplier_id"),
  status: invoiceStatusEnum("status").default("draft").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0"),
  dueAmount: decimal("due_amount", { precision: 12, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 10 }).default("SAR"),
  paymentMethod: paymentMethodEnum("payment_method"),
  notes: text("notes"),
  referenceNumber: varchar("reference_number", { length: 100 }),
  invoiceDate: timestamp("invoice_date").notNull(),
  dueDate: timestamp("due_date"),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_purchase_tenantId").on(table.tenantId),
  index("idx_purchase_invoiceNumber").on(table.invoiceNumber),
  index("idx_purchase_supplierId").on(table.supplier_id),
  index("idx_purchase_status").on(table.status),
]);

// ─── Purchase Invoice Items Table ───────────────────
export const purchaseInvoiceItems = pgTable("purchase_invoice_items", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  invoiceId: integer("invoice_id").notNull(),
  productId: integer("product_id"),
  productCode: varchar("product_code", { length: 50 }),
  productName: varchar("product_name", { length: 255 }),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 4 }).notNull(),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
  cost: decimal("cost", { precision: 12, scale: 4 }),
  createdAt,
}, (table) => [
  index("idx_pii_tenantId").on(table.tenantId),
  index("idx_pii_invoiceId").on(table.invoiceId),
]);

// ─── Payments Table ─────────────────────────────────
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  invoiceId: integer("invoice_id"),
  customerId: integer("customer_id"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  method: paymentMethodEnum("method").notNull(),
  reference: varchar("reference", { length: 100 }),
  notes: text("notes"),
  cashierId: integer("cashier_id"),
  status: varchar("status", { length: 20 }).default("completed").notNull(),
  metadata: jsonb("metadata"),
  createdAt,
}, (table) => [
  index("idx_payments_tenantId").on(table.tenantId),
  index("idx_payments_invoiceId").on(table.invoiceId),
  index("idx_payments_method").on(table.method),
  index("idx_payments_status").on(table.status),
]);

// ─── Accounts (Chart of Accounts) ───────────────────
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("name_ar", { length: 255 }),
  type: accountTypeEnum("type").notNull(),
  category: varchar("category", { length: 100 }),
  parentId: integer("parent_id"),
  isActive: boolean("is_active").default(true).notNull(),
  balance: decimal("balance", { precision: 12, scale: 2 }).default("0"),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_accounts_tenantId").on(table.tenantId),
  index("idx_accounts_code").on(table.code),
  index("idx_accounts_type").on(table.type),
  unique("uq_accounts_tenantId_code").on(table.tenantId, table.code),
]);

// ─── Journal Entries ────────────────────────────────
export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  branchId: integer("branch_id"),
  sourceModule: varchar("source_module", { length: 50 }),
  sourceRefType: varchar("source_ref_type", { length: 50 }),
  sourceRefId: integer("source_ref_id"),
  referenceNo: varchar("reference_no", { length: 100 }),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0"),
  createdById: integer("created_by_id"),
  postedAt: timestamp("posted_at"),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_je_tenantId").on(table.tenantId),
  index("idx_je_sourceRef").on(table.sourceRefType, table.sourceRefId),
  index("idx_je_status").on(table.status),
]);

// ─── Transactions (GL Transactions) ─────────────────
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  journalEntryId: integer("journal_entry_id").notNull(),
  accountId: integer("account_id").notNull(),
  branchId: integer("branch_id"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  type: transactionTypeEnum("type").notNull(),
  transactionDate: timestamp("transaction_date").notNull(),
  narration: text("narration"),
  lifecycleStatus: varchar("lifecycle_status", { length: 20 }).default("posted").notNull(),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  sourceModule: varchar("source_module", { length: 50 }),
  createdById: integer("created_by_id"),
  createdAt,
}, (table) => [
  index("idx_txn_tenantId").on(table.tenantId),
  index("idx_txn_journalEntryId").on(table.journalEntryId),
  index("idx_txn_accountId").on(table.accountId),
]);

// ─── Inventory Movements ────────────────────────────
export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  productId: integer("product_id").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 12, scale: 4 }).default("0"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  notes: text("notes"),
  cashierId: integer("cashier_id"),
  createdAt,
}, (table) => [
  index("idx_im_tenantId").on(table.tenantId),
  index("idx_im_warehouseId").on(table.warehouseId),
  index("idx_im_productId").on(table.productId),
  index("idx_im_type").on(table.type),
]);

// ─── Warehouses ─────────────────────────────────────
export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: warehouseTypeEnum("type").default("warehouse").notNull(),
  location: text("location"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  isActive: boolean("is_active").default(true).notNull(),
  isMain: boolean("is_main").default(false).notNull(),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_warehouses_tenantId").on(table.tenantId),
  index("idx_warehouses_code").on(table.code),
  index("idx_warehouses_type").on(table.type),
  unique("uq_warehouses_tenantId_code").on(table.tenantId, table.code),
]);

// ─── Warehouse Stock ────────────────────────────────
export const warehouseStock = pgTable("warehouse_stock", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  warehouseId: integer("warehouse_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).default("0").notNull(),
  reservedQuantity: decimal("reserved_quantity", { precision: 12, scale: 4 }).default("0").notNull(),
  batchNumber: varchar("batch_number", { length: 50 }),
  expiryDate: timestamp("expiry_date"),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_ws_tenantId").on(table.tenantId),
  index("idx_ws_warehouseId").on(table.warehouseId),
  index("idx_ws_productId").on(table.productId),
  unique("uq_ws_tenantId_warehouseId_productId").on(table.tenantId, table.warehouseId, table.productId),
]);

// ─── POS Sessions ───────────────────────────────────
export const posSessions = pgTable("pos_sessions", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  branchId: integer("branch_id"),
  cashierId: integer("cashier_id").notNull(),
  terminalId: varchar("terminal_id", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  openedAt: timestamp("opened_at").notNull(),
  closedAt: timestamp("closed_at"),
  totalSales: decimal("total_sales", { precision: 12, scale: 2 }).default("0"),
  totalPayments: decimal("total_payments", { precision: 12, scale: 2 }).default("0"),
  cashOpening: decimal("cash_opening", { precision: 12, scale: 2 }).default("0"),
  cashClosing: decimal("cash_closing", { precision: 12, scale: 2 }).default("0"),
  shiftNumber: integer("shift_number").default(1),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_posSessions_tenantId").on(table.tenantId),
  index("idx_posSessions_cashierId").on(table.cashierId),
  index("idx_posSessions_status").on(table.status),
  index("idx_posSessions_terminalId").on(table.terminalId),
]);

// ─── POS Orders ─────────────────────────────────────
export const posOrders = pgTable("pos_orders", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  sessionId: integer("session_id"),
  customerId: integer("customer_id"),
  orderNumber: varchar("order_number", { length: 50 }).notNull(),
  items: jsonb("items").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0"),
  changeAmount: decimal("change_amount", { precision: 12, scale: 2 }).default("0"),
  paymentMethod: paymentMethodEnum("payment_method"),
  status: varchar("status", { length: 20 }).default("completed").notNull(),
  cashierId: integer("cashier_id"),
  metadata: jsonb("metadata"),
  createdAt,
}, (table) => [
  index("idx_posOrders_tenantId").on(table.tenantId),
  index("idx_posOrders_orderNumber").on(table.orderNumber),
  index("idx_posOrders_status").on(table.status),
  index("idx_posOrders_sessionId").on(table.sessionId),
]);

// ─── Activity Logs ──────────────────────────────────
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  userId: integer("user_id"),
  userName: varchar("user_name", { length: 120 }),
  action: varchar("action", { length: 100 }).notNull(),
  details: text("details"),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: integer("entity_id"),
  ip: varchar("ip", { length: 45 }),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt,
}, (table) => [
  index("idx_al_tenantId").on(table.tenantId),
  index("idx_al_userId").on(table.userId),
  index("idx_al_action").on(table.action),
  index("idx_al_entity").on(table.entityType, table.entityId),
  index("idx_al_createdAt").on(table.createdAt),
]);

// ─── Roles Table ────────────────────────────────────
export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  permissions: jsonb("permissions").default([]),
  isSystem: boolean("is_system").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_roles_tenantId").on(table.tenantId),
  index("idx_roles_code").on(table.code),
  unique("uq_roles_tenantId_code").on(table.tenantId, table.code),
]);

// ─── User Roles (Junction) ──────────────────────────
export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  roleId: integer("role_id").notNull(),
  tenantId: tenantIdCol().notNull(),
  assignedAt: timestamp("assigned_at").default(sql`now()`).notNull(),
}, (table) => [
  index("idx_ur_tenantId").on(table.tenantId),
  index("idx_ur_userId").on(table.userId),
  index("idx_ur_roleId").on(table.roleId),
]);

// ─── Permissions Table ──────────────────────────────
export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  resource: varchar("resource", { length: 100 }).notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
  createdAt,
});

// ─── Branches Table ─────────────────────────────────
export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  isMain: boolean("is_main").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_branches_tenantId").on(table.tenantId),
  index("idx_branches_code").on(table.code),
  unique("uq_branches_tenantId_code").on(table.tenantId, table.code),
]);

// ─── Departments Table ──────────────────────────────
export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  nameAr: varchar("name_ar", { length: 255 }),
  code: varchar("code", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"),
  createdAt,
});

// ─── Employees Table ────────────────────────────────
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  userId: integer("user_id"),
  departmentId: integer("department_id"),
  branchId: integer("branch_id"),
  employeeCode: varchar("employee_code", { length: 50 }),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  hireDate: timestamp("hire_date"),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"),
  createdAt,
});

// ─── Notifications Table ────────────────────────────
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  userId: integer("user_id").notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  status: notificationStatusEnum("status").default("pending").notNull(),
  metadata: jsonb("metadata"),
  sentAt: timestamp("sent_at"),
  createdAt,
}, (table) => [
  index("idx_notif_tenantId").on(table.tenantId),
  index("idx_notif_userId").on(table.userId),
  index("idx_notif_status").on(table.status),
]);

// ─── Settings Table ─────────────────────────────────
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  institutionName: varchar("institution_name", { length: 255 }),
  currency: varchar("currency", { length: 10 }).default("SAR"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("15"),
  accountingPeriod: varchar("accounting_period", { length: 50 }),
  posConfig: jsonb("pos_config"),
  salesPolicy: jsonb("sales_policy"),
  paymentMethods: jsonb("payment_methods"),
  postingRules: jsonb("posting_rules"),
  zatcaConfig: jsonb("zatca_config"),
  subscriptionStatus: varchar("subscription_status", { length: 20 }).default("trial"),
  trialEndsAt: timestamp("trial_ends_at"),
  managerName: varchar("manager_name", { length: 255 }),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_settings_tenantId").on(table.tenantId),
  unique("uq_settings_tenantId").on(table.tenantId),
]);

// ─── Vouchers Table ─────────────────────────────────
export const vouchers = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  discountType: varchar("discount_type", { length: 20 }).default("percentage"),
  discountValue: decimal("discount_value", { precision: 12, scale: 2 }).default("0"),
  minPurchaseAmount: decimal("min_purchase_amount", { precision: 12, scale: 2 }).default("0"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  isValid: boolean("is_valid").default(true).notNull(),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  createdById: integer("created_by_id"),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_vouchers_tenantId").on(table.tenantId),
  index("idx_vouchers_code").on(table.code),
  index("idx_vouchers_type").on(table.type),
]);

// ─── Quotations Table ───────────────────────────────
export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  customerId: integer("customer_id"),
  quotationNumber: varchar("quotation_number", { length: 50 }).notNull(),
  items: jsonb("items").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  validUntil: timestamp("valid_until"),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  notes: text("notes"),
  createdById: integer("created_by_id"),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
}, (table) => [
  index("idx_quo_tenantId").on(table.tenantId),
  index("idx_quo_customerId").on(table.customerId),
  index("idx_quo_number").on(table.quotationNumber),
  index("idx_quo_status").on(table.status),
]);

// ─── Task Management ────────────────────────────────
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  metadata: jsonb("metadata"),
  createdAt,
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  projectId: integer("project_id"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  priority: varchar("priority", { length: 20 }).default("medium"),
  assignedTo: integer("assigned_to"),
  dueDate: timestamp("due_date"),
  metadata: jsonb("metadata"),
  createdAt,
});

// ─── Procurement Tables ─────────────────────────────
export const procurements = pgTable("procurements", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  supplierId: integer("supplier_id"),
  procurementNumber: varchar("procurement_number", { length: 50 }).notNull(),
  items: jsonb("items").notNull(),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  notes: text("notes"),
  createdById: integer("created_by_id"),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
});

// ─── Pharmaceutical Tables ──────────────────────────
export const prescriptions = pgTable("prescriptions", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  patientName: varchar("patient_name", { length: 255 }).notNull(),
  patientPhone: varchar("patient_phone", { length: 20 }),
  doctorName: varchar("doctor_name", { length: 255 }),
  items: jsonb("items").notNull(),
  notes: text("notes"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt,
});

export const pharmacyStock = pgTable("pharmacy_stock", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  productId: integer("product_id").notNull(),
  batchNumber: varchar("batch_number", { length: 50 }).notNull(),
  expiryDate: timestamp("expiry_date").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  costPrice: decimal("cost_price", { precision: 12, scale: 4 }).default("0"),
  sellingPrice: decimal("selling_price", { precision: 12, scale: 4 }).default("0"),
  metadata: jsonb("metadata"),
  createdAt,
});

// ─── Billing / Subscription Tables ──────────────────
export const billingInvoices = pgTable("billing_invoices", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  subscriptionId: integer("subscription_id"),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("SAR"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  paymentProvider: varchar("payment_provider", { length: 50 }),
  paymentReference: varchar("payment_reference", { length: 255 }),
  metadata: jsonb("metadata"),
  createdAt,
});

export const paymentGateways = pgTable("payment_gateways", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  credentials: jsonb("credentials").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0),
  metadata: jsonb("metadata"),
  createdAt, updatedAt,
});

// ─── Login Attempts Table ───────────────────────────
export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  username: varchar("username", { length: 120 }),
  success: boolean("success").notNull(),
  ip: varchar("ip", { length: 45 }),
  userAgent: text("user_agent"),
  device: varchar("device", { length: 50 }),
  country: varchar("country", { length: 100 }),
  city: varchar("city", { length: 100 }),
  lat: text("lat"),
  lng: text("lng"),
  userId: integer("user_id"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
}, (table) => [
  index("idx_la_tenantId").on(table.tenantId),
  index("idx_la_username").on(table.username),
  index("idx_la_createdAt").on(table.createdAt),
]);

// ─── Stock Adjustments ──────────────────────────────
export const stockAdjustments = pgTable("stock_adjustments", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  warehouseId: integer("warehouse_id"),
  productId: integer("product_id").notNull(),
  adjustmentType: varchar("adjustment_type", { length: 20 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  reason: text("reason"),
  notes: text("notes"),
  createdById: integer("created_by_id"),
  metadata: jsonb("metadata"),
  createdAt,
});

// ─── Stock Reservations ─────────────────────────────
export const stockReservations = pgTable("stock_reservations", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  warehouseId: integer("warehouse_id"),
  productId: integer("product_id").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
  reservationType: varchar("reservation_type", { length: 30 }).notNull(),
  referenceId: integer("reference_id"),
  released: boolean("released").default(false).notNull(),
  releasedAt: timestamp("released_at"),
  metadata: jsonb("metadata"),
  createdAt,
});

// ─── Full-Text Search Vector ────────────────────────
export const searchVectors = pgTable("search_vectors", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdCol().notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  vector: text("vector").notNull(),
  metadata: jsonb("metadata"),
  createdAt,
}, (table) => [
  index("idx_sv_tenantId").on(table.tenantId),
  index("idx_sv_entity").on(table.entityType, table.entityId),
]);

// ─── Create GIN indexes for full-text search ────────
// Note: PostgreSQL GIN indexes are created via migrations

console.log("[Schema] Smart Ports POS database schema loaded with 40+ tables");
