import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { ENV } from "./env";
import { resolveTenantId } from "./tenant";
import { verifyAccessToken } from "./auth";
import { getDb } from "./db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: any | null;
  tenantId: number | null;
  isSuperAdmin: boolean;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: any | null = null;
  try {
    const authHeader = opts.req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const payload = await verifyAccessToken(token);
      const db = await getDb();
      if (db) {
        const rows = await db.select().from(users).where(eq(users.openId, payload.sub)).limit(1);
        if (rows.length > 0) user = rows[0];
      }
    }
  } catch { user = null; }

  const { tenantId, isSuperAdmin } = resolveTenantId(user, opts.req);
  return { req: opts.req, res: opts.res, user, tenantId, isSuperAdmin };
}
