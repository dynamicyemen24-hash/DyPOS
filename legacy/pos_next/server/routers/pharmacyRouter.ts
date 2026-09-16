import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { requireTenantId } from "../_core/tenant";
import { prescriptions, pharmacyStock } from "../db/schema";

export const pharmacyRouter = router({
  getPrescriptions: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    return db.select().from(prescriptions).where(eq(prescriptions.tenantId, tid)).orderBy(desc(prescriptions.createdAt));
  }),

  createPrescription: tenantProcedure
    .input(z.object({ patientName: z.string(), patientPhone: z.string().optional(), doctorName: z.string(), items: z.array(z.object({ productId: z.number(), quantity: z.number(), dosage: z.string() })) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Database or tenant missing" });
      const tid = requireTenantId(ctx);
      const [prescription] = await db.insert(prescriptions).values({ tenantId: tid, ...input }).returning();
      return prescription;
    }),

  getPharmacyStock: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    return db.select().from(pharmacyStock).where(eq(pharmacyStock.tenantId, tid));
  }),

  getExpiredProducts: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    const today = new Date();
    return db.select().from(pharmacyStock).where(and(eq(pharmacyStock.tenantId, tid), lte(pharmacyStock.expiryDate, today)));
  }),
});

import { and, lte } from "drizzle-orm";
