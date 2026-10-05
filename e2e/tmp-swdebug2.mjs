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
    console.log("SW-ERROR:", JSON.stringify(e).slice(0, 500));
  });
  await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(45000);
  const info = await page.evaluate(async () => {
    const swText = await fetch("/sw.js?v=probe", { cache: "no-store" }).then((r) => r.text()).catch(() => "");
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    const keys = await caches.keys();
    return {
      swWorkbox: (swText.match(/workbox-[a-f0-9]+/) || ["?"])[0],
      swLen: swText.length,
      controller: !!navigator.serviceWorker?.controller,
      regActive: !!regs[0]?.active,
      cacheKeys: keys,
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await browser.close();
}
