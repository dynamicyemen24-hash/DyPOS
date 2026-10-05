import { chromium } from "playwright";
const SITE = "https://dypos.smartportssoft.com";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  let last = -1;
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(async () => {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      const keys = await caches.keys();
      let urls = [];
      for (const k of keys) {
        try {
          const rs = await caches.open(k).then((c) => c.keys());
          urls = urls.concat(rs.map((r) => r.url));
        } catch { /* ignore */ }
      }
      return {
        controller: !!navigator.serviceWorker?.controller,
        installing: !!regs[0]?.installing,
        waiting: !!regs[0]?.waiting,
        active: !!regs[0]?.active,
        cached: urls.length,
        tail: urls.slice(-3).map((u) => u.split("/").pop()),
      };
    });
    console.log(JSON.stringify(s));
    if (s.controller) break;
    if (s.cached === last && s.cached > 0) console.log("  STALLED at", s.cached);
    last = s.cached;
  }
} finally {
  await browser.close();
}
