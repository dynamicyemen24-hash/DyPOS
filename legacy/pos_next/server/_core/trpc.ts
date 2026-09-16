import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import { type TrpcContext, createContext } from "./context";
import { requireTenantId, isOwner } from "./tenant";
import { checkPermission, PERMISSION_DENIED_MSG, resolveUserPermissions } from "./rbac";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
});

const requireTenant = t.procedure.use(async (opts) => {
  if (!opts.ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
  requireTenantId(opts.ctx);
  return opts.next({ ctx: { ...opts.ctx, tenantId: opts.ctx.tenantId } });
});

export const tenantProcedure = t.procedure.use(requireTenant);

export const adminProcedure = t.procedure.use(requireTenant).use(t.middleware(async (opts) => {
  if (!opts.ctx.user || (opts.ctx.user.role !== "admin" && opts.ctx.user.role !== "owner")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "هذا الإجراء متاح للمديرين فقط" });
  }
  return opts.next({ ctx: opts.ctx });
}));

export const requirePermissions = (required: string | { all: string[] } | { any: string[] }) => {
  const keys = typeof required === "string" ? [required] : "all" in required ? required.all : required.any;
  const mode = typeof required === "object" && "any" in required ? "any" : "all";
  return t.procedure.use(async (opts) => {
    if (!opts.ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
    if (opts.ctx.isSuperAdmin) return opts.next({ ctx: opts.ctx });
    const perms = await resolveUserPermissions(opts.ctx);
    const ok = mode === "any" ? keys.some(k => perms.includes(k as any)) : keys.every(k => perms.includes(k as any));
    if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: PERMISSION_DENIED_MSG });
    return opts.next({ ctx: opts.ctx });
  });
};

export const appRouter = router({
  health: router({
    check: publicProcedure.query(() => ({ status: "ok" })),
  }),
});

export type AppRouter = typeof appRouter;
export { createContext };
