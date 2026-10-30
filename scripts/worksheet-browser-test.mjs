import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";

const root = fileURLToPath(new URL("../frontend", import.meta.url));
const server = await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/資料.html#worksheet`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator(".study-header-description").textContent(), "Printable Japanese cheatsheets");
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').count(), 1);
  assert.equal(await page.locator("header").evaluate((header) => {
    const brand = header.querySelector(".brand").getBoundingClientRect();
    const appearance = header.querySelector(".study-appearance").getBoundingClientRect();
    return Math.abs(brand.top - appearance.top) < 10 && brand.right <= appearance.left;
  }), true);
  await page.setViewportSize({ width: 1280, height: 720 });
  const geometry = await page.evaluate(async () => {
    const { worksheetLayout, worksheetSVG } = await import("/src/worksheet.js");
    const layouts = ["a4", "letter", "legal"].flatMap((paper) => ["portrait", "landscape"].flatMap((orientation) => [34, 42, 50].map((size) => {
      const layout = worksheetLayout({ paper, orientation, size });
      return layout.gridWidth >= 360 * layout.scale && Math.abs(layout.columns * layout.gridWidth + (layout.columns - 1) * 8 - (layout.width - 60)) < .001;
    })));
    const svg = new DOMParser().parseFromString(worksheetSVG(["あ", "い", "う"], { font: "" }), "image/svg+xml");
    const positions = [...svg.documentElement.children].filter((node) => node.tagName === "g").map((node) => node.getAttribute("transform"));
    return { layouts, positions };
  });
  assert.ok(geometry.layouts.every(Boolean));
  assert.match(geometry.positions[0], /^translate\(30 100\)/);
  assert.match(geometry.positions[1], /^translate\([\d.]+ 100\)/);
  assert.equal(await page.locator('.worksheet-choices:first-child #sheetGrayscale').count(), 1);
  assert.equal(await page.locator('.download-panel[data-worksheet] [data-format="png"]').evaluate((button) => getComputedStyle(button).gridColumn), "auto");
  const kanaChoice = page.locator('[data-field="mode"][value="kana"]');
  await kanaChoice.focus();
  await page.keyboard.press("Space");
  assert.equal(await kanaChoice.isChecked(), false);
  await page.keyboard.press("Space");
  assert.equal(await kanaChoice.isChecked(), true);
  await page.locator('[data-field="mode"][value="kanji"]').locator("..").click();
  await page.locator('[data-field="level"][value="4"]').locator("..").click();
  assert.equal(await page.locator('[data-field="level"]:checked').count(), 2);
  assert.equal(await page.locator('[data-field="opacity"]').inputValue(), "100");
  await page.locator('[data-field="paper"]').selectOption("legal");
  assert.equal(await page.locator('#sheetPreview > svg').getAttribute("viewBox"), "0 0 816 1344");
  const result = await page.evaluate(async () => {
    const theme = document.documentElement.dataset.theme;
    const printed = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const frame = document.querySelector('iframe[title="Print handwriting worksheet"]');
        if (!frame) return;
        observer.disconnect();
        frame.contentWindow.print = () => {
          const result = { pages: frame.contentDocument.querySelectorAll("body > svg").length, theme: document.documentElement.dataset.theme, printing: document.body.dataset.printing };
          frame.contentWindow.dispatchEvent(new Event("afterprint"));
          result.cleaned = !frame.isConnected;
          resolve(result);
        };
      });
      observer.observe(document.body, { childList: true });
    });
    document.querySelector('[data-format="print"]').click();
    return { originalTheme: theme, ...await printed };
  });
  assert.ok(result.pages > 1);
  assert.equal(result.theme, result.originalTheme);
  assert.equal(result.printing, undefined);
  assert.equal(result.cleaned, true);
  await page.locator('[data-sheet="kana"]').click();
  assert.equal(await page.locator('.download-panel:not([data-worksheet]) [data-format="png"]').evaluate((button) => getComputedStyle(button).gridColumn), "auto");
  assert.equal(await page.locator('.download-panel > .sheet-grayscale #sheetGrayscale').count(), 1);
  const normalPrint = await page.evaluate(async () => {
    const originalTheme = document.documentElement.dataset.theme;
    const printed = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const frame = document.querySelector('iframe[title="Print cheatsheet"]');
        if (!frame) return;
        observer.disconnect();
        frame.contentWindow.print = () => {
          const result = { pages: frame.contentDocument.querySelectorAll("body > svg").length, theme: document.documentElement.dataset.theme, printing: document.body.dataset.printing };
          frame.contentWindow.dispatchEvent(new Event("afterprint"));
          result.cleaned = !frame.isConnected;
          resolve(result);
        };
      });
      observer.observe(document.body, { childList: true });
    });
    document.querySelector('[data-format="print"]').click();
    return { originalTheme, ...await printed };
  });
  assert.equal(normalPrint.pages, 1);
  assert.equal(normalPrint.theme, normalPrint.originalTheme);
  assert.equal(normalPrint.printing, undefined);
  assert.equal(normalPrint.cleaned, true);
  await page.locator('[data-sheet="counters"]').click();
  const pageIndicator = page.locator('[data-reference-page]');
  const pageCount = Number((await pageIndicator.textContent()).split(" / ")[1]);
  assert.ok(pageCount > 1);
  await page.locator('[data-reference-action="next"]').click();
  assert.equal(await pageIndicator.textContent(), `2 / ${pageCount}`);
  await page.locator('[data-reference="paper"]').selectOption("letter");
  await page.locator('[data-reference="orientation"]').selectOption("landscape");
  assert.equal(await page.locator('#sheetPreview > svg').getAttribute("viewBox"), "0 0 1056 816");
  for (const format of ["svg", "pdf"]) {
    const pending = page.waitForEvent("download");
    await page.locator(`[data-format="${format}"]`).click();
    const download = await pending;
    const bytes = await readFile(await download.path());
    if (format === "svg") assert.equal(Object.keys(unzipSync(bytes)).length, pageCount);
    else {
      const pdf = await PDFDocument.load(bytes);
      assert.equal(pdf.getPageCount(), pageCount);
      assert.deepEqual(pdf.getPage(0).getSize(), { width: 792, height: 612 });
    }
  }
  const referencePrint = await page.evaluate(async () => {
    const printed = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const frame = document.querySelector('iframe[title="Print cheatsheet"]');
        if (!frame) return;
        observer.disconnect();
        frame.contentWindow.print = () => {
          const result = { pages: frame.contentDocument.querySelectorAll("body > svg").length, styles: frame.contentDocument.querySelector("style").textContent };
          frame.contentWindow.dispatchEvent(new Event("afterprint"));
          resolve(result);
        };
      });
      observer.observe(document.body, { childList: true });
    });
    document.querySelector('[data-format="print"]').click();
    return printed;
  });
  assert.equal(referencePrint.pages, pageCount);
  assert.match(referencePrint.styles, /size:letter landscape/);
  for (const width of [1440, 1050, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const rows = await page.locator("#sheetPicker .sheet-tab").evaluateAll((buttons) => {
      const groups = new Map();
      for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        if (!groups.has(rect.top)) groups.set(rect.top, []);
        groups.get(rect.top).push({ left: rect.left, right: rect.right });
      }
      return [...groups.values()];
    });
    for (const row of rows) for (let index = 1; index < row.length; index++) {
      assert.ok(Math.abs(row[index].left - row[index - 1].right - 10) < 1, `${width}: inconsistent gap`);
    }
    const widths = rows.map((row) => row.at(-1).right - row[0].left);
    assert.ok(Math.max(...widths) - Math.min(...widths) < 190, `${width}: ${widths}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator("#sheetPicker").evaluate((picker) => getComputedStyle(picker).display), "flex");
  await page.locator('[data-sheet="radicals"]').click();
  assert.ok(Number((await pageIndicator.textContent()).split(" / ")[1]) > 2);
  assert.ok(await page.locator('#sheetPreview').textContent().then((text) => text.includes("さんずい")));
  await page.locator('[data-reference-action="next"]').click();
  assert.ok(await page.locator('#sheetPreview').textContent().then((text) => text.includes("けものへん")));
  console.log("Worksheet browser checks passed.");
} finally {
  await browser?.close();
  await server.close();
}