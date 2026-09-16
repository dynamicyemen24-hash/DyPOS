import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, publicProcedure, ownerProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { requireTenantId } from "../_core/tenant";
import { tenantSubscriptions, subscriptionPlans, billingInvoices, paymentGateways } from "../db/schema";

export const billingRouter = router({
  getPlans: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(subscriptionPlans.sortOrder);
  }),

  getSubscription: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return null;
    const tid = requireTenantId(ctx);
    const [sub] = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tid)).orderBy(desc(tenantSubscriptions.id)).limit(1);
    return sub ?? null;
  }),

  subscribe: tenantProcedure
    .input(z.object({ planId: z.number(), paymentMethod: z.string(), countryCode: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Database or tenant missing" });
      const tid = requireTenantId(ctx);
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, input.planId)).limit(1);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });
      const countryPricing = typeof plan.countryPricing === "string" ? JSON.parse(plan.countryPricing) : plan.countryPricing;
      const pricing = countryPricing?.find((p: any) => p.countryCode?.toUpperCase() === input.countryCode.toUpperCase());
      const amount = pricing?.priceMonthly ?? plan.priceMonthly;
      const today = new Date();
      const trialDays = 14;
      const trialEndsAt = new Date(today.getTime() + trialDays * 86400000);
      const [sub] = await db.insert(tenantSubscriptions).values({
        tenantId: tid, planId: input.planId, status: "trial",
        periodStart: today, periodEnd: trialEndsAt, trialEndsAt,
        paymentProvider: input.paymentMethod,
      }).returning();
      await db.insert(billingInvoices).values({
        tenantId: tid, subscriptionId: sub.id, invoiceNumber: `BILL-${sub.id}`,
        amount: Number(amount), currency: "SAR", status: "pending",
      });
      return { subscription: sub, amount, trialEndsAt };
    }),

  processPayment: ownerProcedure
    .input(z.object({ subscriptionId: z.number(), amount: z.number(), provider: z.string(), reference: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "BAD_REQUEST", message: "Database missing" });
      const [sub] = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.id, input.subscriptionId)).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });
      const status = input.amount >= sub.planId ? "active" : "grace";
      const periodEnd = new Date(Date.now() + 30 * 86400000);
      await db.update(tenantSubscriptions).set({ status, periodEnd, paymentProvider: input.provider, paymentReference: input.reference }).where(eq(tenantSubscriptions.id, input.subscriptionId));
      await db.update(billingInvoices).set({ status: "paid" }).where(eq(billingInvoices.subscriptionId, input.subscriptionId));
      return { success: true, status };
    }),

  getPaymentGateways: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    return db.select().from(paymentGateways).where(eq(paymentGateways.tenantId, tid)).orderBy(paymentGateways.sortOrder);
  }),

  getBillingHistory: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    return db.select().from(billingInvoices).where(eq(billingInvoices.tenantId, tid)).orderBy(desc(billingInvoices.createdAt));
  }),
});
