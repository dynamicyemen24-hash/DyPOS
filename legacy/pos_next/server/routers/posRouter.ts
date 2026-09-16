import { z } from "zod";
import { eq, and, desc, sql, gte, lte, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { requireTenantId } from "../_core/tenant";
import { products, salesInvoices, salesInvoiceItems, posOrders, posSessions, customers, warehouseStock } from "../db/schema";
import { requirePermissions } from "../_core/trpc";

export const posRouter = router({
  createOrder: tenantProcedure
    .input(z.object({
      customerId: z.number().optional(),
      items: z.array(z.object({
        productId: z.number(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        discount: z.number().default(0),
      })),
      paymentMethod: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Database or tenant missing" });
      const tid = requireTenantId(ctx);
      const tenantDb = db.use({ schema: undefined });
      const subtotal = input.items.reduce((s, i) => s + i.quantity * i.unitPrice - i.discount, 0);
      const tax = subtotal * 0.15;
      const total = subtotal + tax;
      const orderNumber = `POS-${Date.now().toString(36).toUpperCase()}`;
      const [order] = await db.insert(posOrders).values({
        tenantId: tid, customerId: input.customerId, orderNumber,
        items: input.items, subtotal, taxAmount: tax, total,
        paidAmount: 0, paymentMethod: input.paymentMethod,
        status: "pending", cashierId: ctx.user?.id,
      }).returning();
      return { success: true, orderId: order.id, orderNumber, total };
    }),

  getOrders: tenantProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20), offset: z.number().default(0), status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) return [];
      const tid = requireTenantId(ctx);
      let query = db.select().from(posOrders).where(eq(posOrders.tenantId, tid)).orderBy(desc(posOrders.createdAt)).limit(input.limit).offset(input.offset);
      if (input.status) query = db.select().from(posOrders).where(and(eq(posOrders.tenantId, tid), eq(posOrders.status, input.status)));
      return query;
    }),

  getDashboard: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return { totalSales: 0, ordersCount: 0, revenue: 0, pendingOrders: 0 };
    const tid = requireTenantId(ctx);
    const today = new Date();
    const [sales] = await db.select({ total: sql<number>`coalesce(sum(total), 0)` }).from(posOrders).where(and(eq(posOrders.tenantId, tid), gte(posOrders.createdAt, today)));
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(posOrders).where(eq(posOrders.tenantId, tid));
    const totalSales = Number(sales?.total ?? 0);
    const ordersCount = Number(count?.count ?? 0);
    return { totalSales, ordersCount, revenue: totalSales, pendingOrders: ordersCount };
  }),

  closeSession: tenantProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Database or tenant missing" });
      const tid = requireTenantId(ctx);
      await db.update(posSessions).set({ status: "closed", closedAt: new Date() }).where(and(eq(posSessions.id, input.sessionId), eq(posSessions.tenantId, tid)));
      return { success: true };
    }),

  getActiveSessions: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    return db.select().from(posSessions).where(and(eq(posSessions.tenantId, tid), eq(posSessions.status, "active")));
  }),

  getProducts: tenantProcedure
    .input(z.object({ search: z.string().optional(), category: z.string().optional(), limit: z.number().min(1).max(100).default(50), warehouseId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) return [];
      const tid = requireTenantId(ctx);
      let query = db.select().from(products).where(eq(products.tenantId, tid)).limit(input.limit);
      if (input.search) query = db.select().from(products).where(and(eq(products.tenantId, tid), ilike(products.name, `%${input.search}%`)));
      if (input.category) query = db.select().from(products).where(and(eq(products.tenantId, tid), eq(products.category, input.category)));
      return query;
    }),

  getProduct: tenantProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) return null;
      const tid = requireTenantId(ctx);
      const [row] = await db.select().from(products).where(and(eq(products.id, input.productId), eq(products.tenantId, tid))).limit(1);
      return row ?? null;
    }),

  createProduct: tenantProcedure
    .input(z.object({ code: z.string(), name: z.string(), category: z.string().optional(), salePrice: z.number(), purchasePrice: z.number().optional(), currentStock: z.number().default(0), minStock: z.number().default(0), barcode: z.string().optional(), taxRate: z.number().default(15) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Database or tenant missing" });
      const tid = requireTenantId(ctx);
      const [product] = await db.insert(products).values({ tenantId: tid, ...input }).returning();
      return product;
    }),

  updateStock: tenantProcedure
    .input(z.object({ productId: z.number(), quantity: z.number(), type: z.string(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Database or tenant missing" });
      const tid = requireTenantId(ctx);
      const [product] = await db.select().from(products).where(and(eq(products.id, input.productId), eq(products.tenantId, tid))).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      const newStock = input.type === "add" ? product.currentStock + input.quantity : product.currentStock - input.quantity;
      await db.update(products).set({ currentStock: newStock }).where(and(eq(products.id, input.productId), eq(products.tenantId, tid)));
      await db.insert(inventoryMovements).values({ tenantId: tid, productId: input.productId, warehouseId: 1, type: input.type, quantity: input.quantity, notes: input.notes, cashierId: ctx.user?.id });
      return { success: true, newStock };
    }),
});

import { inventoryMovements } from "../db/schema";
