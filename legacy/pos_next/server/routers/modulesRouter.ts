import { z } from "zod";
import { router, tenantProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { requireTenantId } from "../_core/tenant";

export const modulesRouter = router({
  getModules: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    return [
      { id: "pos", name: "نقاط البيع", enabled: true },
      { id: "erp", name: "ERP", enabled: true },
      { id: "billing", name: "الفوترة", enabled: true },
      { id: "pharmacy", name: "الصيدلية", enabled: false },
      { id: "accounting", name: "المحاسبة", enabled: true },
      { id: "inventory", name: "المخزون", enabled: true },
      { id: "webstore", name: "المتجر الإلكتروني", enabled: false },
      { id: "ai", name: "الذكاء الاصطناعي", enabled: true },
      { id: "reports", name: "التقارير", enabled: true },
    ];
  }),

  toggleModule: tenantProcedure
    .input(z.object({ moduleId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Database or tenant missing" });
      const tid = requireTenantId(ctx);
      return { success: true, moduleId: input.moduleId, enabled: input.enabled };
    }),
});
