/**
 * برهان إنتاجي يدوي — يعمل محليًا فقط، وليس في CI.
 *
 * يفتح نسخة الإنتاج بمتصفح جديد تمامًا ويثبت أن قاعدة IndexedDB تكتمل
 * دون خادم: اشتراك الرابط + مستخدمون + أرصدة من مفاتيح المالك، ثم دخول
 * دون اتصال. كل البيانات هنا اختبارية (‎.test.local‎) وفي ملف تعريف
 * مهمل — لا تمس أي جهاز حقيقي.
 *
 * التشغيل: node e2e/prod-royal-offline-proof.mjs
 */
import { chromium } from "playwright";

const SITE = process.env.DYPOS_PROOF_SITE || "https://dypos.smartportssoft.com";
const PROOF_USER = {
  email: "royal.proof@test.local",
  fullName: "مدير البرهان",
  password: "Proof-2026-Strong",
  role: "ADMIN",
};
const PROOF_STOCK = [
  { item_code: "PROOF-001", item_name: "صنف البرهان", qty: 7, rate: 1500 },
];

const results = [];
function check(name, cond, detail = "") {
  results.push({ name, pass: !!cond });
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) process.exitCode = 1;
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  // مفاتيح المالك تُزرع قبل أول سطر في الصفحة: أول إقلاع يبذر كل شيء.
  await context.addInitScript(
    ({ user, stock }) => {
      localStorage.setItem("dypos.first_subscriber", "royal-marib");
      localStorage.setItem("dypos.first_subscriber.users", JSON.stringify([user]));
      localStorage.setItem("dypos.first_subscriber.opening_stock", JSON.stringify(stock));
    },
    { user: PROOF_USER, stock: PROOF_STOCK },
  );
  const page = await context.newPage();

  await page.goto(`${SITE}/?subscriber=royal-marib`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(4000);

  // 1. الشركة في إعدادات IndexedDB.
  const company = await page.evaluate(async () => {
    const open = indexedDB.open("DyPOS_offline");
    const db = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
    });
    const tx = db.transaction("settings", "readonly");
    const get = (key) =>
      new Promise((res) => {
        const rq = tx.objectStore("settings").get(key);
        rq.onsuccess = () => res(rq.result?.value ?? null);
        rq.onerror = () => res(null);
      });
    const name = await get("subscriber.company_name");
    const wh = await get("subscriber.warehouse");
    db.close();
    return { name, wh };
  });
  check("company provisioned in IndexedDB", company.name?.includes("رويال"), company.name);
  check("warehouse is W-01 Marib", company.wh === "W-01", company.wh);

  // 2. الرابط نُظف بعد الاشتراك.
  check("opt-in URL cleaned", !page.url().includes("subscriber"), page.url());

  // 3. الرصيد الافتتاحي في المخزون المحلي.
  const stock = await page.evaluate(async () => {
    const open = indexedDB.open("DyPOS_offline");
    const db = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
    });
    const tx = db.transaction("stock", "readonly");
    const row = await new Promise((res) => {
      const rq = tx.objectStore("stock").get(["PROOF-001", "W-01"]);
      rq.onsuccess = () => res(rq.result ?? null);
      rq.onerror = () => res(null);
    });
    db.close();
    return row;
  });
  check("opening stock in local DB", stock?.qty === 7, `qty=${stock?.qty}`);

  // 4. الدخول دون اتصال تمامًا بالمستخدم المبذور — على نفس المستند
  // المحمل (لا تنقل يحتاج شبكة)، ثم إرسال النموذج والشبكة مقطوعة.
  await context.setOffline(true);
  await page.waitForTimeout(1000);
  const emailBox = page.locator('input[type="email"], input[name="username"]').first();
  await emailBox.waitFor({ timeout: 30000 });
  await emailBox.fill(PROOF_USER.email);
  const passBox = page.locator('input[type="password"]').first();
  await passBox.fill(PROOF_USER.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);
  const loggedIn = await page.evaluate(() => !!localStorage.getItem("dypos_user_session"));
  check("offline login works with seeded user", loggedIn);

  // 5. إعادة تحميل كاملة والشبكة مقطوعة: الجهاز المثبت يقلع من الـ SW.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  const shellAlive = await page.evaluate(() => {
    const app = document.querySelector("#app");
    return !!app && app.textContent.trim().length > 50;
  });
  check("offline reload boots app shell (installed device)", shellAlive);
  const stillLoggedIn = await page.evaluate(() => !!localStorage.getItem("dypos_user_session"));
  check("session survives offline reload", stillLoggedIn);

  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `\n❌ ${failed.length} FAILED` : "\n✅ PROOF COMPLETE — production PWA runs on full offline IndexedDB");
} finally {
  await browser.close();
}
