import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";
import { toolPage } from "./tool-page.mjs";

const origins = [];
const api = createServer(createHandler({ origins, sentenceFallback: async () => [] }));
api.listen(0, "127.0.0.1");
await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
let vite, browser;
try {
  vite = await createVite({ root: fileURLToPath(new URL("../frontend", import.meta.url)),
    server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  origins.push(base);
  browser = await chromium.launch();
  const errors = [];
  const cases = [
    ["仮名.html", ["sessionMode"]],
    ["読み.html", ["readingDirection", "sessionMode"]],
    ["意味.html", ["meaningDirection"]],
    ["語彙.html", ["modeSelect"]],
    ["パズル.html", ["sizeSelect", "levelSelect"]],
    ["活用.html", ["setting-fontSize"]],
    ["活用練習.html", ["setting-mode"]],
    ["絵合わせ.html", ["setting-players"]],
    ["言葉探し.html", ["setting-category"]],
    ["しりとり.html", ["setting-opponent"]],
    ["言葉.html", ["colorThemeSelect"]],
    ["文解き.html", ["colorThemeSelect"]],
    ["漢字地図帳.html", ["colorThemeSelect"]]
  ];
  for (const viewport of [{ width: 390, height: 844 }, { width: 760, height: 420 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: "reduce" });
    await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    const page = toolPage(await context.newPage());
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [file, ids] of cases) {
      await page.goto(`${base}/${encodeURIComponent(file)}`);
      for (const id of ids) {
        const select = page.locator(`#${id}`);
        await select.evaluate((node) => {
          for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.matches("details")) parent.open = true;
        });
        if (await select.evaluate((node) => node.hidden)) continue;
        const values = await select.locator("option").evaluateAll((options) => options.filter((option) => !option.disabled).map((option) => option.value));
        if (!values.length) throw new Error(`${file} #${id} has no options`);
        await select.selectOption(values[0]);
        await select.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await select.tap();
        await page.waitForFunction((id) => document.getElementById(id).matches(":open"), id);
        const geometry = await select.evaluate((node) => {
          const control = node.getBoundingClientRect();
          const style = getComputedStyle(node, "::picker(select)");
          const first = node.options[0].getBoundingClientRect();
          const x = first.left - parseFloat(style.paddingLeft) - parseFloat(style.borderLeftWidth);
          const y = first.top - parseFloat(style.paddingTop) - parseFloat(style.borderTopWidth);
          const bottom = y + parseFloat(style.height), right = x + parseFloat(style.width);
          return { appearance: getComputedStyle(node).appearance,
            gap: Math.min(Math.abs(y - control.bottom), Math.abs(control.top - bottom)),
            overlaps: x < control.right && right > control.left,
            fits: x >= -1 && y >= -1 && right <= innerWidth + 1 && bottom <= innerHeight + 1,
            x, y, right, bottom, control: { top: control.top, bottom: control.bottom } };
        });
        assert.equal(geometry.appearance, "base-select");
        assert.ok(geometry.gap <= 8, `${file} #${id}: picker stays beside the select: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.overlaps && geometry.fits, `${file} #${id}: picker fits the viewport: ${JSON.stringify(geometry)}`);
        assert.equal(await page.locator("#studySettingTooltip").isVisible(), false, "Opening a select does not open help");
        if (process.env.SELECT_SCREENSHOT && file === "読み.html" && id === "readingDirection" && viewport.width === 390) {
          await page.screenshot({ path: process.env.SELECT_SCREENSHOT });
        }
        await select.locator("option:enabled").nth(1).tap();
        assert.equal(await select.inputValue(), values[1]);
        assert.equal(await select.evaluate((node) => node.matches(":open")), false);
        await select.tap();
        await page.keyboard.press("Escape");
        assert.equal(await select.inputValue(), values[1], "Escape keeps the selected value");
        assert.equal(await select.evaluate((node) => node.matches(":open")), false, "Escape closes the picker");
        await select.tap();
        await page.locator("#audioQuickToggle").tap();
        assert.equal(await select.evaluate((node) => node.matches(":open")), false, "Tapping outside closes the picker");
        if (id === "readingDirection") {
          await select.focus();
          await page.keyboard.press("Space");
          assert.equal(await select.evaluate((node) => node.matches(":open")), true, "Keyboard opens the picker");
          await page.keyboard.press("k");
          await page.keyboard.press("Enter");
          assert.equal(await select.inputValue(), values[2], "Typeahead selects Katakana");
          await select.focus();
          await page.keyboard.press("Alt+ArrowDown");
          await page.waitForFunction((id) => document.getElementById(id).matches(":open"), id);
          await page.keyboard.press("ArrowUp");
          await page.keyboard.press("Enter");
          assert.equal(await select.inputValue(), values[1], "Arrow keys select Hiragana");
          assert.equal(await select.evaluate((node) => node.matches(":open")), false, "Enter commits and closes the picker");
        }
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${file}: no mobile overflow`);
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const raw = await context.newPage(), page = toolPage(raw);
  await page.goto(`${base}/読み.html`);
  assert.notEqual(await page.locator("#readingDirection").evaluate((node) => getComputedStyle(node).appearance), "base-select", "Desktop retains its native select");
  await page.goto(base);
  await page.click("#menuButton");
  assert.deepEqual(await page.locator(".menu-group").evaluateAll((groups) => groups.map((group) => [
    group.getAttribute("aria-label"), [...group.querySelectorAll("[data-file]")].map((node) => node.dataset.file)
  ])), [
    ["Practice", ["仮名.html", "読み.html", "意味.html", "語彙.html", "活用練習.html"]],
    ["Reference", ["言葉.html", "漢字地図帳.html", "活用.html", "文解き.html", "資料.html"]],
    ["Games", ["絵合わせ.html", "言葉探し.html", "パズル.html", "しりとり.html"]]
  ]);
  for (const [file, name] of [["活用練習.html", "Katsuyō Renshuu"], ["言葉探し.html", "Kotoba Sagashi"]]) {
    await page.goto(`${base}/${encodeURIComponent(file)}`);
    assert.equal(await page.textContent(".brand-name"), name);
    assert.match(await page.evaluate(() => document.title), new RegExp(name));
    assert.match(await raw.locator("#helperFrame").getAttribute("title"), new RegExp(name));
    await page.click("#helpButton");
    assert.equal(await page.textContent("#studyHelpTitle"), `About ${name}`);
    await page.keyboard.press("Escape");
  }
  assert.deepEqual(errors, []);
  console.log("Select checks passed: anchored touch pickers, scrolling, selection, keyboard/typeahead, dismissal, desktop fallback, names and navigation.");
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}
