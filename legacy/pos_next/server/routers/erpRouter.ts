import { z } from "zod";
import { eq, desc, and, gte, lte, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { requireTenantId } from "../_core/tenant";
import { accounts, journalEntries, transactions, branches, departments, employees, projects, tasks } from "../db/schema";

export const erpRouter = router({
  getChartOfAccounts: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    return db.select().from(accounts).where(and(eq(accounts.tenantId, tid), eq(accounts.isActive, true))).orderBy(accounts.code);
  }),

  createJournalEntry: adminProcedure
    .input(z.object({ referenceNo: z.string(), items: z.array(z.object({ accountId: z.number(), type: z.enum(["debit", "credit"]), amount: z.number() })).min(1), narration: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Database or tenant missing" });
      const tid = requireTenantId(ctx);
      const totalDebit = input.items.filter(i => i.type === "debit").reduce((s, i) => s + i.amount, 0);
      const totalCredit = input.items.filter(i => i.type === "credit").reduce((s, i) => s + i.amount, 0);
      if (totalDebit !== totalCredit) throw new TRPCError({ code: "BAD_REQUEST", message: "Debits and credits must balance" });
      const [je] = await db.insert(journalEntries).values({ tenantId: tid, referenceNo: input.referenceNo, totalAmount: totalDebit, status: "posted", createdById: ctx.user?.id, postedAt: new Date() }).returning();
      for (const item of input.items) {
        await db.insert(transactions).values({ tenantId: tid, journalEntryId: je.id, accountId: item.accountId, amount: item.amount, type: item.type as any, transactionDate: new Date(), narration: input.narration, lifecycleStatus: "posted" });
      }
      return { success: true, journalEntryId: je.id };
    }),

  getFinancialSummary: tenantProcedure
    .input(z.object({ fromDate: z.string(), toDate: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) return { revenue: 0, expenses: 0, profit: 0 };
      const tid = requireTenantId(ctx);
      const [revenue] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(transactions).where(and(eq(transactions.tenantId, tid), eq(transactions.type, "credit"), gte(transactions.transactionDate, input.fromDate), lte(transactions.transactionDate, input.toDate)));
      const [expenses] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(transactions).where(and(eq(transactions.tenantId, tid), eq(transactions.type, "debit"), gte(transactions.transactionDate, input.fromDate), lte(transactions.transactionDate, input.toDate)));
      const r = Number(revenue?.total ?? 0);
      const e = Number(expenses?.total ?? 0);
      return { revenue: r, expenses: e, profit: r - e };
    }),

  getBranches: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    return db.select().from(branches).where(eq(branches.tenantId, tid)).orderBy(desc(branches.isMain));
  }),

  createBranch: adminProcedure
    .input(z.object({ code: z.string(), name: z.string(), address: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Database or tenant missing" });
      const tid = requireTenantId(ctx);
      const [branch] = await db.insert(branches).values({ tenantId: tid, ...input }).returning();
      return branch;
    }),

  getEmployees: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    return db.select().from(employees).where(eq(employees.tenantId, tid));
  }),

  getProjects: tenantProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.tenantId) return [];
    const tid = requireTenantId(ctx);
    return db.select().from(projects).where(eq(projects.tenantId, tid));
  }),

  getTasks: tenantProcedure
    .input(z.object({ projectId: z.number().optional(), status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) return [];
      const tid = requireTenantId(ctx);
      let query = db.select().from(tasks).where(eq(tasks.tenantId, tid));
      if (input.status) query = query.where(eq(tasks.status, input.status));
      if (input.projectId) query = query.where(eq(tasks.projectId, input.projectId));
      return query;
    }),

  createTask: adminProcedure
    .input(z.object({ title: z.string(), projectId: z.number().optional(), priority: z.string().default("medium") }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || !ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Database or tenant missing" });
      const tid = requireTenantId(ctx);
      const [task] = await db.insert(tasks).values({ tenantId: tid, ...input, status: "pending" }).returning();
      return task;
    }),
});
