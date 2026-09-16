import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { activityLogs, loginAttempts } from "../db/schema";
import { eq, desc, gte } from "drizzle-orm";
import { ENV } from "../_core/env";

interface AuditEntry {
  tenantId: number;
  userId?: number;
  action: string;
  details: string;
  entityType?: string;
  entityId?: number;
  ip?: string;
}

export async function auditLog(entry: AuditEntry) {
  const db = await getDb();
  if (!db) return;

  try {
    const ip = entry.ip ?? "unknown";
    await db.insert(activityLogs).values({
      tenantId: entry.tenantId,
      userId: entry.userId ?? null,
      action: entry.action,
      details: entry.details,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      ip,
      createdAt: new Date(),
    });
  } catch (error) {
    console.warn("[Audit] Failed to log:", error);
  }
}

export async function getAuditLogs(tenantId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(activityLogs).where(eq(activityLogs.tenantId, tenantId)).orderBy(desc(activityLogs.createdAt)).limit(limit);
}

export async function getLoginAttempts(tenantId: number, username?: string) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(loginAttempts).where(eq(loginAttempts.tenantId, tenantId)).orderBy(desc(loginAttempts.createdAt));
  if (username) query = query.where(eq(loginAttempts.username, username));
  return query.limit(25);
}

export async function getComplianceReport(tenantId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const logs = await db.select({ action: activityLogs.action, count: sql<number>`count(*)::int` }).from(activityLogs).where(eq(activityLogs.tenantId, tenantId)).groupBy(activityLogs.action).orderBy(desc(sql<number>`count(*)`));

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    totalActions: logs.reduce((s, l) => s + Number(l.count), 0),
    actions: logs,
    complianceLevel: "OWASP_ASVS_L2",
  };
}

import { sql } from "drizzle-orm";
