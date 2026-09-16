import { eq, sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { ENV } from "./env";
import { users, tenants } from "../db/schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof neon> | null = null;
let _warmed = false;

export function getSql() {
  if (!_sql && ENV.databaseUrl) {
    _sql = neon(ENV.databaseUrl);
  }
  return _sql;
}

export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      const sql = neon(ENV.databaseUrl);
      _db = drizzle(sql);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE: قاعدة البيانات غير متاحة حالياً");
  return db;
}

export async function warmDatabase(): Promise<void> {
  if (_warmed) return;
  try {
    const db = await getDb();
    if (db) {
      await db.execute(sql`select 1`);
      _warmed = true;
    }
  } catch (error) {
    console.warn("[Database] Warm-up failed:", error);
    setTimeout(() => warmDatabase().catch(() => {}), 5000);
  }
}

export async function upsertTenant(tenantData: { id?: number; name: string; code: string; country?: string; currency?: string; domain?: string }) {
  const db = await getDb();
  if (!db) return null;
  try {
    const [row] = await db.insert(tenants).values(tenantData).onConflictDoUpdate({ target: tenants.code, set: tenantData }).returning();
    return row;
  } catch (error) {
    console.error("[Database] Failed to upsert tenant:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export { eq, sql };
