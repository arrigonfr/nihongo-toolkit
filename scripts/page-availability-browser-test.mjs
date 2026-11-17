import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview, resolveConfig } from "vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../frontend", import.meta.url));
const outDir = await mkdtemp(join(tmpdir(), "nihon-availability-"));
const previous = process.env.DISABLED_PAGES;
let server, browser;
try {
  process.env.DISABLED_PAGES = "";
  const enabled = await build({ root, logLevel: "error", build: { outDir } });
  const fullChunk = enabled.output.find((output) => output.type === "chunk" && Object.keys(output.modules).some((id) => id.endsWith("/src/resources.js")));
  assert.ok(fullChunk, "Normal edition must include full Shiryō");
  const normalHtml = await readFile(join(outDir, "shiryo.html"), "utf8");
  assert.match(normalHtml, /id="sheetPreview"/);
  assert.ok(!enabled.output.some((output) => output.fileName.includes("shiryo-preview")));
  assert.ok(!enabled.output.some((output) => /assets\/(?:worksheet|adjective)-.*\.png$/.test(output.fileName)));
  await writeFile(join(outDir, "stale-secret.txt"), "previous deployment");
  process.env.DISABLED_PAGES = " shiryo.html, kana ";
  await assert.rejects(resolveConfig({ root }, "serve"), /requires a production build/);
  const restricted = await build({ root, logLevel: "error", build: { outDir } });
  const restrictedHtml = await readFile(join(outDir, "shiryo.html"), "utf8");
  assert.match(restrictedHtml, /Japanese Cheatsheet Previews/);
  assert.match(restrictedHtml, /googletagmanager.com\/gtm.js/);
  assert.match(restrictedHtml, /googletagmanager.com\/gtag\/js/);
  assert.match(restrictedHtml, /googletagmanager.com\/ns.html/);
  assert.ok(restricted.output.some((output) => output.type === "chunk" && Object.keys(output.modules).some((id) => id.endsWith("/src/page-views.js"))));
  await assert.rejects(access(join(outDir, "stale-secret.txt")), { code: "ENOENT" });
  await assert.rejects(access(join(outDir, fullChunk.fileName)), { code: "ENOENT" });
  assert.ok(!restricted.output.some((output) => /\.map$|KanjiStrokeOrders.*\.ttf$/.test(output.fileName)));
  const pngs = restricted.output.filter((output) => output.fileName.endsWith(".png"));
  assert.equal(pngs.length, 10);
  for (const output of pngs) {
    const bytes = await readFile(join(outDir, output.fileName));
    assert.equal(bytes.readUInt32BE(16), 794);
    assert.equal(bytes.readUInt32BE(20), 450);
  }
  server = await preview({ root, logLevel: "error", build: { outDir }, preview: { host: "127.0.0.1", port: 0, strictPort: false } });
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const path of ["/shiryo", "/shiryo.html", "/shiryo.html#worksheet"]) {
    await page.goto(`${origin}${path}`);
    await page.locator('#sheetPicker [data-sheet="worksheet"]').waitFor();
    assert.equal(await page.locator("#sheetPicker .sheet-tab").count(), 10);
    assert.equal(await page.locator("#sheetPreview img").count(), 1);
    assert.equal(await page.locator("#sheetPreview svg, #downloadList, .worksheet-controls, .download-panel").count(), 0);
    assert.equal(await page.locator("header .navigation").count(), 1);
    assert.equal(await page.locator("header .brand").count(), 1);
    assert.equal(await page.locator("header .study-appearance").count(), 1);
    assert.equal(await page.locator('header form[action^="https://www.paypal.com/"]').count(), 1);
    assert.match(await page.locator(".study-intro-content").textContent(), /Ko-fi/);
    if (path.endsWith("#worksheet")) assert.equal(await page.locator('#sheetPicker [aria-pressed="true"]').getAttribute("data-sheet"), "worksheet");
  }
  await page.locator("#menuButton").click();
  assert.equal(await page.locator("#menuButton").getAttribute("aria-expanded"), "true");
  await page.locator("#menuButton").click();
  const oldTheme = await page.locator("html").getAttribute("data-theme");
  await page.locator("#themeButton").click();
  assert.notEqual(await page.locator("html").getAttribute("data-theme"), oldTheme);
  await page.locator(".study-palette summary").click();
  await page.locator('[data-palette="sakura"]').click();
  assert.equal(await page.locator("html").getAttribute("data-color-theme"), "sakura");
  const imageURLs = new Set();
  for (const button of await page.locator("#sheetPicker .sheet-tab").all()) {
    await button.click();
    assert.equal(await button.getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#sheetPicker [aria-pressed=true]").count(), 1);
    const image = page.locator("#sheetPreviewImage");
    await image.evaluate((image) => image.decode());
    imageURLs.add(await image.getAttribute("src"));
    assert.equal(await page.locator("#sheetPreview").getAttribute("data-sheet"), await button.getAttribute("data-sheet"));
  }
  assert.equal(imageURLs.size, 10);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.PREVIEW_SCREENSHOT) {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.locator('[data-sheet="worksheet"].sheet-tab').click();
    await page.locator("#sheetPreviewImage").evaluate((image) => image.decode());
    await page.screenshot({ path: process.env.PREVIEW_SCREENSHOT, fullPage: true });
  }
  for (const path of ["/kana", "/kana.html"]) {
    await page.goto(`${origin}${path}`);
    assert.match(await page.locator("h1").textContent(), /unavailable/);
  }
  for (const path of ["/src/resources.js", "/src/worksheet.js", "/src/worksheet-kanji.json", "/src/worksheet-strokes.json", "/src/cheatsheet-data.js", "/shiryo.html.map", `/${fullChunk.fileName}`]) {
    const response = await fetch(`${origin}${path}`);
    const text = await response.text();
    // Static hosts may return the homepage fallback instead of a 404.
    assert.ok(response.status === 404 || response.headers.get("content-type")?.includes("text/html"), path);
    assert.ok(!text.includes("mountWorksheet") && !text.includes("worksheetCharacters"), path);
  }
  assert.deepEqual(errors, []);
  console.log("Enabled/restricted build and browser checks passed.");
} finally {
  if (previous === undefined) delete process.env.DISABLED_PAGES;
  else process.env.DISABLED_PAGES = previous;
  await browser?.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
  await rm(outDir, { recursive: true, force: true });
}
