import { chromium } from "playwright";
const SITE = "https://dypos.smartportssoft.com";
const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  cdp.on("ServiceWorker.workerVersionUpdated", (e) => {
    for (const v of e.versions) console.log("SW-VER:", v.scriptURL.split("/").pop(), v.status, v.runningStatus);
  });
  cdp.on("ServiceWorker.workerErrorReported", (e) => {
    console.log("SW-ERROR:", JSON.stringify(e).slice(0, 400));
  });
  await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(50000);
  const info = await page.evaluate(async () => {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    const keys = await caches.keys();
    let n = 0;
    for (const k of keys) {
      try { n += (await caches.open(k).then((c) => c.keys())).length; } catch { /* ignore */ }
    }
    return {
      controller: !!navigator.serviceWorker?.controller,
      installing: !!regs[0]?.installing,
      waiting: !!regs[0]?.waiting,
      active: !!regs[0]?.active,
      cacheKeys: keys,
      cached: n,
    };
  });
  console.log(JSON.stringify(info));
} finally {
  await browser.close();
}
