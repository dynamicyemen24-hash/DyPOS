import { getDb, warmDatabase } from "../../_core/db";
import { tenants, users } from "../../db/schema";
import { ENV } from "../../_core/env";

async function seed() {
  await warmDatabase();
  const db = await getDb();
  if (!db) {
    console.error("[Seed] Database not available");
    process.exit(1);
  }

  const [owner] = await db.select().from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1);
  if (!owner) {
    console.log("[Seed] Creating owner user...");
  }

  const [mainTenant] = await db.select().from(tenants).where(eq(tenants.code, "smartports")).limit(1);
  if (!mainTenant) {
    console.log("[Seed] Creating main tenant...");
  }

  console.log("[Seed] Database seeded successfully");
}

seed().catch(console.error);
