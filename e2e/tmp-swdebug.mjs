import { chromium } from "playwright";
const SITE = "https://dypos.smartportssoft.com";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (m) => {
    const t = m.text();
    if (/workbox|precach|sw/i.test(t)) console.log("[page]", t.slice(0, 160));
  });
  await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(async () => {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      const keys = await caches.keys();
      let n = 0;
      for (const k of keys) {
        try { n += (await caches.open(k).then((c) => c.keys())).length; } catch { /* ignore */ }
      }
      return {
        t: Math.round(performance.now() / 1000),
        controller: !!navigator.serviceWorker?.controller,
        installing: !!regs[0]?.installing,
        waiting: !!regs[0]?.waiting,
        active: !!regs[0]?.active,
        caches: keys,
        cached: n,
      };
    });
    console.log(JSON.stringify(s));
    if (s.controller && s.cached > 50) break;
  }
} finally {
  await browser.close();
}
