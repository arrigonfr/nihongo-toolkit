import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createServer as createVite } from "vite";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

const origins = [];
const api = createServer((await import("../backend/src/app.js")).createHandler({ origins, sentenceFallback: async () => [], wordFallback: async () => [] }));
api.listen(0, "127.0.0.1");
await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
let vite, browser;
try {
  vite = await createVite({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  origins.push(base);
  browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  assert.equal(await page.locator(".dashboard-link").count(), 14);
  assert.equal(await page.locator("#helperFrame").count(), 0);
  assert.equal(await page.locator('.dashboard .study-support img[alt="PayPal"]').count(), 1);
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true, "Dashboard fits a mobile viewport");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.dashboard-link[data-file="kana.html"]').click();
  await page.waitForURL(`${base}/kana.html`);
  assert.equal(await page.locator('.dashboard-back[href="./"]').count(), 1);
  await page.locator("#colorThemeSelect").selectOption("sakura");
  assert.equal(await page.locator(".navigation").evaluate((node) => getComputedStyle(node).getPropertyValue("--surface").trim()), await page.locator("html").evaluate((node) => getComputedStyle(node).getPropertyValue("--card").trim()));
  await page.goto(`${base}/${encodeURIComponent("仮名.html")}`);
  await page.waitForURL(`${base}/kana.html`);
  const html = await (await page.request.get(`${base}/kana.html`)).text();
  assert.equal((html.match(/gtm\.js\?id=/g) || []).length, 1);
  assert.match(html, /<body[^>]*>\s*<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-T7N85X93"/);
  assert.match(await (await page.request.get(base)).text(), /name="google-site-verification"/);
  for (const file of ["index.html", "kana.html", "yomi.html", "imi.html", "goi.html", "katsuyo-renshuu.html", "kotoba.html", "kanji-chizucho.html", "katsuyo.html", "fumitoki.html", "shiryo.html", "eawase.html", "kotoba-sagashi.html", "pazuru.html", "shiritori.html", "data-sources.html"]) {
    const source = await (await page.request.get(`${base}/${file}`)).text();
    assert.equal((source.match(/gtm\.js\?id=/g) || []).length, 1, `${file} has one GTM script`);
    assert.match(source, /<body[^>]*>\s*<noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-T7N85X93"/);
  }
  await page.goto(`${base}/data-sources.html`);
  await page.locator('.support-slot img[alt="PayPal"]').waitFor();
  await page.goto(`${base}/eawase.html`);
  assert.equal(await page.locator(".game-export-open").count(), 0);
  await page.goto(`${base}/kotoba.html`);
  await page.locator("#query").fill("iku");
  assert.equal(await page.locator("#query").inputValue(), "いく");
  await page.locator("#searchButton").click();
  await page.locator('.word-button[data-search-word="行く"]').first().waitFor();
  const hiddenSolution = await page.evaluate(async () => {
    const { gameSVG } = await import("/src/game-export.js");
    const model = { title: "Test", grid: [[{ answer: "秘密" }]], lines: [{ text: "Clue", answer: "秘密" }] };
    return [gameSVG(model), gameSVG(model, { answers: true })];
  });
  assert.doesNotMatch(hiddenSolution[0], /秘密/);
  assert.match(hiddenSolution[1], /秘密/);
  const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 900 } });
  await touchContext.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const touch = await touchContext.newPage();
  await touch.goto(`${base}/shiritori.html`);
  await touch.locator("#menuButton").tap();
  await touch.touchscreen.tap(20, 10);
  assert.equal(await touch.locator("#helperMenu").isVisible(), false);
  await touchContext.close();

  for (const [file, start, ready] of [
    ["pazuru.html", "#newPuzzleBtn", "#crosswordGrid .cw-cell:not(.block)"],
    ["kotoba-sagashi.html", "#newGame", "#grid [data-cell]"]
  ]) {
    await page.goto(`${base}/${file}`);
    await page.click(start);
    await page.locator(ready).first().waitFor({ timeout: 30000 });
    const theme = await page.locator("html").getAttribute("data-theme");
    await page.locator(".game-export-open").click();
    const dialog = page.locator(".game-export-dialog");
    assert.equal(await dialog.isVisible(), true, file);
    const blank = await dialog.locator("img").getAttribute("src");
    await dialog.locator('[data-option="answers"]').check();
    const answer = await dialog.locator("img").getAttribute("src");
    assert.notEqual(answer, blank, `${file} produces a different answer key`);
    await dialog.locator('[data-option="theme"]').click();
    assert.equal(await dialog.locator('[data-option="theme"]').getAttribute("data-mode"), "dark");
    await dialog.locator('[data-option="grayscale"]').check();
    const beforeFont = await dialog.locator("img").getAttribute("src");
    await dialog.locator('[data-option="fontScale"]').fill("120");
    assert.notEqual(await dialog.locator("img").getAttribute("src"), beforeFont);
    if (file === "pazuru.html") {
      const source = decodeURIComponent(await dialog.locator("img").getAttribute("src"));
      assert.match(source, />Across<.*>Down</);
    }
    await dialog.locator('[data-option="zoom"]').fill("70");
    assert.match(decodeURIComponent(await dialog.locator("img").getAttribute("src")), /scale\(0\.7\)/);
    assert.equal(await dialog.locator("img").evaluate(async (image) => {
      await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = 200; canvas.height = 280;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels.some((value, index) => index % 4 !== 3 && Math.abs(value - pixels[index % 4]) > 25);
    }), true, `${file} preview contains drawn content`);
    assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
    await page.setViewportSize({ width: 375, height: 900 });
    assert.equal(await dialog.evaluate((node) => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }), true);
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const format of file === "kotoba-sagashi.html" ? ["svg", "html", "png", "pdf"] : ["svg"]) {
      const event = page.waitForEvent("download");
      await dialog.locator(`[data-format="${format}"]`).click();
      const download = await event;
      const data = await readFile(await download.path());
      assert.ok(data.length > 100, `${file} ${format} has content`);
      if (format === "pdf") assert.equal((await PDFDocument.load(data)).getPageCount(), 1);
      if (format === "png") assert.equal(data.subarray(1, 4).toString(), "PNG");
      if (format === "svg") assert.match(data.toString(), /viewBox="0 0 794 1123"/);
    }
    if (file === "kotoba-sagashi.html") {
      const printed = page.evaluate(() => new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          const frame = document.querySelector('iframe[title="Print game export"]');
          if (!frame) return;
          observer.disconnect();
          frame.contentWindow.print = () => {
            const count = frame.contentDocument.querySelectorAll("svg").length;
            frame.contentWindow.dispatchEvent(new Event("afterprint"));
            resolve({ count, removed: !frame.isConnected });
          };
        });
        observer.observe(document.body, { childList: true });
      }));
      await dialog.locator('[data-format="print"]').click();
      assert.deepEqual(await printed, { count: 1, removed: true });
      assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
    }
    await dialog.locator('button[aria-label="Close"]').click();
  }
  assert.deepEqual(errors, []);
  console.log("Game export, dashboard, routes and tag checks passed.");
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}