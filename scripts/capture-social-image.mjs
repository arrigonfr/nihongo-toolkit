import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({
  root: fileURLToPath(new URL("../frontend", import.meta.url)),
  server: { host: "127.0.0.1", port: 0, strictPort: false }
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (route.request().resourceType() !== "image") return route.abort();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      await route.fulfill({ status: response.status, contentType: response.headers.get("content-type"), body: Buffer.from(await response.arrayBuffer()) });
    } catch { await route.abort(); }
  });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(base, { waitUntil: "networkidle", timeout: 20000 });
  await page.locator(".dashboard-link").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.locator(".dashboard-link").count() >= 15);
  assert.equal(await page.evaluate(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0)), true, "Screenshot must not contain broken images");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: fileURLToPath(new URL("../frontend/public/og-image.png", import.meta.url)) });
  console.log("Captured the homepage at 1200x630 in frontend/public/og-image.png.");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "/tmp/nihon-social-home-mobile.png" });
  await page.setViewportSize({ width: 512, height: 512 });
  await page.goto(`${base}/favicon.png`);
  await page.screenshot({ path: "/tmp/nihon-social-logo.png" });
} finally {
  await browser?.close();
  await server.close();
}