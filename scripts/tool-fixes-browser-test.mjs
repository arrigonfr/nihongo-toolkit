import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer as createVite, preview } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";

const root = fileURLToPath(new URL("../frontend", import.meta.url));
const origins = [];
const api = createServer(createHandler({ origins, sentenceFallback: async () => [] }));
api.listen(0, "127.0.0.1");
await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
let vite, built, browser;
try {
  vite = await createVite({ root, server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  origins.push(base);
  browser = await chromium.launch();
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  const frame = page.frameLocator("#helperFrame");
  async function select(file) {
    await page.click("#menuButton");
    await page.locator(`[data-file="${file}"]`).click();
    await page.waitForFunction((file) => decodeURIComponent(document.querySelector("#helperFrame").contentWindow.location.pathname).endsWith(`/${file}`), file);
    await frame.locator("#colorThemeSelect").waitFor();
  }
  async function checkMenuDismissal(tab, content = tab, touch = false) {
    const menu = tab.locator("#helperMenu"), button = tab.locator("#menuButton");
    const activate = (locator) => touch ? locator.tap() : locator.click();
    await activate(menu.locator("h2").first());
    assert.equal(await menu.isVisible(), true, "Interacting inside the menu keeps it open");
    await content.locator("body").evaluate((body) => {
      window.__outsideMenuInteraction = false;
      body.addEventListener("pointerdown", (event) => {
        window.__outsideMenuInteraction = true;
        event.stopPropagation();
      }, { once: true });
    });
    if (touch) await tab.touchscreen.tap(6, 180);
    else await tab.mouse.click(6, 180);
    await menu.waitFor({ state: "hidden" });
    assert.equal(await button.getAttribute("aria-expanded"), "false");
    assert.equal(await button.getAttribute("aria-label"), "Open helper menu");
    assert.equal(await content.locator("body").evaluate(() => window.__outsideMenuInteraction), true,
      "Outside interactions reach the tool even when they stop bubbling");
    await activate(button);
    assert.equal(await menu.isVisible(), true);
    await activate(button);
    assert.equal(await menu.isVisible(), false, "The menu button still toggles the menu");
    await activate(button);
    await tab.keyboard.press("Escape");
    assert.equal(await menu.isVisible(), false);
    assert.equal(await button.evaluate((node) => document.activeElement === node), true);
  }

  await page.evaluate(() => localStorage.setItem("kotoba-history-v1", JSON.stringify([
    { query: "A long search without spaces ".repeat(15), kanji: false },
    { query: "漢".repeat(100), kanji: true }
  ])));
  await select("言葉.html");
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await frame.locator(".history-panel").evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      return panel.scrollWidth <= panel.clientWidth && [...panel.querySelectorAll(".history-item")].every((item) => {
        const box = item.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right;
      });
    }), true, `Recent searches fit at ${width}px`);
    assert.equal(await frame.locator("html").evaluate((node) => node.scrollWidth <= innerWidth), true);
  }
  let wordRequests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/words") wordRequests++; });
  await frame.locator("#query").fill("Kana: Whatever the question is, ".repeat(8));
  await frame.locator("#searchButton").click();
  assert.match(await frame.locator("#results").textContent(), /Search is too long.*100 characters/);
  assert.equal(wordRequests, 0, "Oversized queries never reach the API");
  await frame.locator("#query").fill("a".repeat(100));
  await frame.locator("#searchButton").click();
  await frame.locator("#results .empty-state").waitFor();
  assert.equal(wordRequests, 1, "The full 100-character limit is accepted");
  await page.route("**/api/words?**", (route) => route.fulfill({ status: 400, json: { error: "Please use a shorter dictionary query." } }));
  await frame.locator("#query").fill("invalid");
  await frame.locator("#searchButton").click();
  await frame.locator(".error-state").waitFor();
  assert.match(await frame.locator(".error-state").textContent(), /Check your search.*shorter dictionary query/);
  await page.unroute("**/api/words?**");

  await page.setViewportSize({ width: 1280, height: 900 });
  await select("語彙.html");
  await frame.locator("#startButton").click();
  await frame.locator(".option").first().waitFor();
  const firstOptions = await frame.locator(".option").evaluateAll((buttons) => buttons.map((button) => button.dataset.meaning));
  await frame.locator("#showButton").click();
  assert.match(await frame.locator("#nextButton").textContent(), /Enter \/ N/);
  await page.keyboard.press("n");
  await frame.locator("#questionLabel").filter({ hasText: "Question 2" }).waitFor();
  const secondOptions = await frame.locator(".option").evaluateAll((buttons) => buttons.map((button) => button.dataset.meaning));
  assert.ok(secondOptions.filter((meaning) => firstOptions.includes(meaning)).length <= 1);
  await frame.locator("#showButton").click();
  await frame.locator("#helpButton").click();
  await page.keyboard.press("n");
  assert.match(await frame.locator("#questionLabel").textContent(), /Question 2/);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await frame.locator("#questionLabel").filter({ hasText: "Question 3" }).waitFor();
  await frame.locator("#showButton").click();
  await page.setViewportSize({ width: 375, height: 900 });
  assert.equal(await frame.locator("#nextButton .quiz-shortcut").isVisible(), false);

  await select("活用.html");
  assert.equal(await frame.locator("#setting-romaji, #setting-furigana, #setting-audio").count(), 0);
  const urlBefore = page.url();
  await frame.getByRole("link", { name: /Put the patterns into practice/ }).click();
  await frame.locator("#startButton").waitFor();
  assert.equal(await page.locator("#helperFrame").getAttribute("src"), "活用練習.html");
  assert.equal(page.url(), urlBefore, "Ordinary tool links leave the address bar unchanged");
  await frame.getByRole("link", { name: /Explore the conjugation reference/ }).click();
  await frame.locator("#wordInput").waitFor();
  const newTabEvent = context.waitForEvent("page");
  await frame.getByRole("link", { name: /Put the patterns into practice/ }).click({ modifiers: ["ControlOrMeta"] });
  const tab = await newTabEvent;
  await tab.locator("#startButton").waitFor();
  assert.equal(await tab.locator("#helperFrame").count(), 0);
  assert.equal(decodeURIComponent(new URL(tab.url()).pathname), "/活用練習.html");
  assert.equal(await tab.locator("#menuButton").isVisible(), true);
  await tab.close();

  await select("パズル.html");
  await frame.locator("#settingsDrawer summary").click();
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const selector of [".cw-switch", ".cw-reset-setting"]) {
      const sizes = await frame.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
        const { width, height } = node.getBoundingClientRect();
        return { width, height };
      }));
      assert.ok(sizes.every((size) => size.width >= 200 && size.height >= 48));
    }
    assert.equal(await frame.locator("html").evaluate((node) => node.scrollWidth <= innerWidth), true);
  }
  await page.evaluate(() => localStorage.setItem("nihon:word-search-v1", JSON.stringify({
    settings: { directions: "forward", count: 5 },
    progress: { known: [], review: [], recent: ["retained"], days: [], completed: 3, daily: null }
  })));
  await select("言葉探し.html");
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem("nihon:word-search-v1")));
  assert.equal(migrated.settings.directions, "all");
  assert.equal(migrated.directionDefaultsVersion, 1);
  assert.equal(migrated.progress.completed, 3);
  assert.deepEqual(migrated.progress.recent, ["retained"]);
  await select("絵合わせ.html");
  assert.equal(await frame.locator("#settingsDialog, #settingsButton, #setting-appearance").count(), 0);
  assert.equal(await frame.locator("#settingsPanel").evaluate((panel) => panel.open && panel.previousElementSibling.classList.contains("intro")), true);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await frame.locator("html").evaluate((node) => node.scrollWidth <= innerWidth), true);
  }
  await frame.locator("#setting-content").selectOption("kana", { force: true });
  assert.equal(await frame.locator('#settingsForm button[type="submit"]').count(), 0);
  assert.equal(await frame.locator("#settingsPanel").evaluate((panel) => panel.open), true);
  await frame.locator("#newGame").click();
  await frame.locator("[data-card]").first().waitFor();
  assert.equal(await frame.locator("[data-card]").count(), 12);

  const files = (await readdir(root)).filter((file) => file.endsWith(".html") && !["index.html", "data-sources.html", "文字.html"].includes(file));
  built = await preview({ root, preview: { host: "127.0.0.1", port: 0, strictPort: false } });
  const builtBase = `http://127.0.0.1:${built.httpServer.address().port}`;
  for (const origin of [base, builtBase]) {
    const navigationContext = await browser.newContext();
    await navigationContext.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    const navigationPage = await navigationContext.newPage();
    navigationPage.on("pageerror", (error) => errors.push(error.message));
    for (const file of files) {
      const response = await navigationPage.goto(`${origin}/${encodeURIComponent(file)}`);
      assert.equal(response.status(), 200);
      await navigationPage.locator("#colorThemeSelect").waitFor();
      assert.equal(decodeURIComponent(new URL(navigationPage.url()).pathname), `/${file}`);
      assert.equal(await navigationPage.locator("#helperFrame").count(), 0);
      assert.equal(await navigationPage.locator('link[rel="canonical"]').getAttribute("href"), new URL(file, "https://nihongo-toolkit.workers.dev/").href);
      for (const width of [375, 1280]) {
        await navigationPage.setViewportSize({ width, height: 900 });
        assert.equal(await navigationPage.locator("#menuButton").isVisible(), true);
        await navigationPage.click("#menuButton");
        assert.equal(await navigationPage.locator("#helperMenu").isVisible(), true);
        assert.equal(await navigationPage.locator("#helperMenu a[href]").count(), 14);
        assert.equal(await navigationPage.locator('.helper-link[aria-current="page"]').getAttribute("data-file"), file);
        assert.equal(await navigationPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await checkMenuDismissal(navigationPage);
      }
    }
    await navigationPage.click("#menuButton");
    await navigationPage.locator('.helper-link[data-file="仮名.html"]').click();
    await navigationPage.waitForURL(`${origin}/${encodeURIComponent("仮名.html")}`);
    await navigationPage.reload();
    await navigationPage.locator("#colorThemeSelect").waitFor();
    await navigationPage.goBack();
    assert.equal(decodeURIComponent(new URL(navigationPage.url()).pathname), `/${files.at(-1)}`);
    const sitemap = await (await navigationPage.request.get(`${origin}/sitemap.xml`)).text();
    const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => decodeURIComponent(new URL(match[1]).pathname));
    assert.deepEqual(locations.sort(), ["/", "/data-sources.html", ...files.map((file) => `/${file}`)].sort());
    assert.match(await (await navigationPage.request.get(`${origin}/robots.txt`)).text(), /Sitemap: https:\/\/nihongo-toolkit.workers.dev\/sitemap.xml/);
    await navigationPage.goto(`${origin}/index.html`);
    await navigationPage.waitForURL(`${origin}/`);
    await navigationPage.frameLocator("#helperFrame").locator("#colorThemeSelect").waitFor();
    assert.equal(await navigationPage.frameLocator("#helperFrame").locator(".navigation").isVisible(), false);
    const embedded = navigationPage.frameLocator("#helperFrame");
    for (const file of files) {
      await navigationPage.click("#menuButton");
      await navigationPage.locator(`.helper-link[data-file="${file}"]`).click();
      await navigationPage.waitForFunction((name) => decodeURIComponent(document.querySelector("#helperFrame").contentWindow.location.pathname).endsWith(`/${name}`), file);
      await embedded.locator("#colorThemeSelect").waitFor();
      for (const width of [375, 1280]) {
        await navigationPage.setViewportSize({ width, height: 900 });
        await navigationPage.click("#menuButton");
        await checkMenuDismissal(navigationPage, embedded);
      }
    }
    const source = await (await navigationPage.request.get(`${origin}/${encodeURIComponent(files[0])}`)).text();
    assert.match(source, /<a class="helper-link"[^>]*href=/);
    assert.doesNotMatch(source, /window\.location\.replace/);
    await navigationContext.close();

    const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 900 } });
    await touchContext.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    const touch = await touchContext.newPage();
    touch.on("pageerror", (error) => errors.push(error.message));
    await touch.goto(`${origin}/${encodeURIComponent("しりとり.html")}`);
    await touch.locator("#colorThemeSelect").waitFor();
    await touch.locator("#menuButton").tap();
    await checkMenuDismissal(touch, touch, true);
    await touch.goto(origin);
    const touchFrame = touch.frameLocator("#helperFrame");
    await touchFrame.locator("#colorThemeSelect").waitFor();
    await touch.locator("#menuButton").tap();
    await checkMenuDismissal(touch, touchFrame, true);
    await touchContext.close();
  }
  assert.deepEqual(errors, []);
  console.log("Tool fixes passed: long searches, history sizing, quiz shortcuts, settings, discoverable tool pages, navigation, sitemap and robots in dev and production.");
} finally {
  await browser?.close();
  await vite?.close();
  if (built) await new Promise((resolve) => built.httpServer.close(resolve));
  await new Promise((resolve) => api.close(resolve));
}
