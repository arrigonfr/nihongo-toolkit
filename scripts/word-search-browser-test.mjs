import assert from "node:assert/strict";
import { toolPage, acceptStudyDialogs } from "./tool-page.mjs";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createServer as viteServer } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";

const origins = [];
const api = createServer(createHandler({ origins, compression: true, sentenceFallback: async () => [] }));
api.listen(0, "127.0.0.1");
await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
let vite, browser;
try {
  vite = await viteServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 5194, strictPort: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  origins.push(base);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false, furigana: true, romaji: false })));
  await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = toolPage(await context.newPage());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await acceptStudyDialogs(page);
  const url = `${base}/言葉探し.html`;
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("nihon:word-search-v1")));
  const cell = (index) => page.locator(`[data-cell="${index}"]`);
  async function configure(values) {
    if (!await page.locator("#settingsPanel").evaluate((panel) => panel.open)) await page.click("#settingsPanel summary");
    for (const [key, value] of Object.entries(values)) {
      const input = page.locator(`#setting-${key}`);
      const tag = await input.evaluate((element) => element.tagName);
      if (tag === "SELECT") await input.selectOption(String(value), { force: true });
      else if (typeof value === "boolean") await input.setChecked(value);
      else await input.fill(String(value));
    }
    assert.equal(await page.locator('#settingsForm button[type="submit"]').count(), 0);
    assert.equal(await page.locator("#settingsPanel").evaluate((panel) => panel.open), true, "Autosaving leaves the inline panel open");
  }
  async function start() {
    await page.click("#newGame");
    await page.locator(".study-confirm-dialog").waitFor({ state: "detached" });
    await page.waitForFunction(() => !document.getElementById("newGame").disabled);
    assert.equal(await page.getAttribute("#notice", "data-error"), "false", await page.textContent("#notice"));
    assert.equal(await page.locator("#settingsPanel").evaluate((panel) => panel.open), false, "Starting collapses settings");
  }
  async function solutions(directions = allDirections) {
    return page.evaluate((directions) => {
      const grid = [...document.querySelectorAll("[data-cell]")].map((cell) => cell.textContent);
      const size = Math.sqrt(grid.length);
      return [...document.querySelectorAll("#wordList li:not(.is-found) .study-japanese")].map((label) => {
        const copy = label.cloneNode(true); copy.querySelectorAll("rt").forEach((node) => node.remove());
        const word = copy.textContent, chars = [...word];
        for (let start = 0; start < grid.length; start++) for (const [dr, dc] of directions) {
          const row = Math.floor(start / size), col = start % size;
          const cells = chars.map((_, i) => (row + dr * i) * size + col + dc * i);
          if (chars.every((char, i) => row + dr * i >= 0 && row + dr * i < size && col + dc * i >= 0 && col + dc * i < size && grid[cells[i]] === char)) {
            return { word, cells };
          }
        }
        throw new Error(`No selectable path for ${word}`);
      });
    }, directions);
  }
  async function tapPath(path) {
    await cell(path[0]).click();
    await cell(path.at(-1)).click();
  }
  async function solveAll(directions) {
    for (const entry of await solutions(directions)) await tapPath(entry.cells);
    assert.equal(await page.locator("#results").isVisible(), true);
  }
  const allDirections = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  await page.goto(url);
  assert.equal(await page.locator("#settingsDialog, #settingsButton").count(), 0);
  assert.equal(await page.locator("#settingsPanel").evaluate((panel) => panel.open && panel.previousElementSibling.classList.contains("intro")), true);
  await page.locator("#settingsPanel summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#settingsPanel").evaluate((panel) => panel.open), false);
  await page.keyboard.press("Space");
  assert.equal(await page.locator("#settingsPanel").evaluate((panel) => panel.open), true);
  assert.equal(await page.locator("[data-cell]").count(), 0);
  await page.click("#startButton");
  await page.waitForSelector("[data-cell]");
  assert.equal(await page.locator("#settingsPanel").evaluate((panel) => panel.open), false);
  assert.equal(await page.locator("[data-cell]").count(), 100);
  assert.equal(await page.locator("#wordList li").count(), 8);
  const first = await solutions();
  await tapPath(first[0].cells);
  assert.match(await page.textContent("#progressText"), /1 of 8/);
  assert.match(await page.textContent("#wordDetails"), /In context/);
  assert.equal(await page.locator("#wordDetails .detail-reading").count(), 1);
  await page.waitForFunction(() => !document.getElementById("wordExamples").textContent.includes("Looking for"));
  const dragEntry = first.slice(1).find((entry) => entry.cells.length > 1);
  const drag = dragEntry.cells;
  await page.locator("#grid").scrollIntoViewIfNeeded();
  const startBox = await cell(drag[0]).boundingBox(), endBox = await cell(drag.at(-1)).boundingBox();
  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2, { steps: 10 });
  await page.mouse.up();
  assert.match(await page.textContent("#progressText"), /2 of 8/, await page.textContent("#selectionStatus"));
  const keyboard = first.slice(1).find((entry) => entry !== dragEntry).cells;
  const gridSize = Math.sqrt(await page.locator("[data-cell]").count());
  await cell(keyboard[0]).focus();
  await page.keyboard.press("Enter");
  for (let i = 1; i < keyboard.length; i++) {
    const rowDelta = Math.floor(keyboard[i] / gridSize) - Math.floor(keyboard[i - 1] / gridSize);
    const columnDelta = keyboard[i] % gridSize - keyboard[i - 1] % gridSize;
    if (rowDelta) await page.keyboard.press(rowDelta > 0 ? "ArrowDown" : "ArrowUp");
    if (columnDelta) await page.keyboard.press(columnDelta > 0 ? "ArrowRight" : "ArrowLeft");
  }
  await page.keyboard.press("Space");
  assert.match(await page.textContent("#progressText"), /3 of 8/);
  await tapPath([0, 12]);
  assert.match(await page.textContent("#selectionStatus"), /straight/);
  for (let i = 0; i < 5; i++) await page.click("#hintButton");
  assert.equal(await page.locator("#hintButton").isDisabled(), true);
  await page.click("#revealButton"); await page.click("#revealButton");
  assert.equal(await page.locator("#revealButton").isDisabled(), true);
  assert.equal((await saved()).progress.review.length, 2);
  await solveAll();
  assert.match(await page.textContent("#results"), /Revealed|Accuracy|New discoveries/);
  assert.equal((await saved()).progress.completed, 1);
  const prior = new Set((await saved()).progress.recent);
  await start();
  assert.ok((await saved()).progress.recent.slice(-8).every((key) => !prior.has(key)), "No repeats when fresh vocabulary exists");
  if (process.env.WORD_SEARCH_SCREENSHOT) await page.screenshot({ path: process.env.WORD_SEARCH_SCREENSHOT, fullPage: true });

  await configure({ mode: "daily" });
  await start();
  const daily = (await saved()).progress.daily;
  assert.equal(daily.puzzle.entries.length, 8);
  await tapPath(daily.puzzle.entries[0].cells);
  await page.reload(); await start();
  assert.deepEqual((await saved()).progress.daily.puzzle.grid, daily.puzzle.grid);
  assert.match(await page.textContent("#progressText"), /1 of 8/);
  assert.equal(await page.locator("#revealButton").isDisabled(), true);
  await solveAll(allDirections);
  assert.equal((await saved()).progress.days.length, 1);
  await page.reload(); await start();
  assert.equal(await page.locator("#results").isVisible(), true);
  assert.equal((await saved()).progress.days.length, 1);

  await configure({ mode: "memory" }); await start();
  assert.equal(await page.locator("#wordList li").count(), 0);
  await page.click("#hintButton");
  assert.match(await page.textContent("#selectionStatus"), /Hint/);
  await page.click("#revealButton");
  assert.equal(await page.locator("#wordList li").count(), 1);
  await configure({ mode: "clue" }); await start();
  assert.equal(await page.locator("#wordList .study-japanese").count(), 0);

  await configure({ mode: "sudden", mistakes: 1 }); await start();
  await tapPath([0, 12]);
  assert.match(await page.textContent("#results"), /No lives remaining/);
  assert.equal(await page.locator("#hintButton").isDisabled(), true);
  const stoppedCount = await page.textContent("#progressText");
  await cell(0).dispatchEvent("click", { detail: 0 });
  await cell(1).dispatchEvent("click", { detail: 0 });
  assert.equal(await page.textContent("#progressText"), stoppedCount);

  await page.clock.install();
  await configure({ mode: "timed", seconds: 10 }); await start();
  await page.clock.fastForward(11_000);
  assert.match(await page.textContent("#results"), /Time is up/);

  await configure({ mode: "marathon", rounds: 2, timer: false }); await start();
  await solveAll();
  await page.click("#nextRound");
  await page.waitForFunction(() => document.querySelectorAll("[data-cell]").length === 121);
  assert.match(await page.textContent("#modeBadge"), /Round 2 \/ 2/);
  assert.equal(await page.locator("#wordList li").count(), 10);
  await solveAll();
  assert.match(await page.textContent("#results"), /Marathon complete/);

  await configure({ mode: "kanji" }); await start();
  for (const entry of await solutions()) assert.match(entry.word, /\p{Script=Han}/u);
  await tapPath((await solutions())[0].cells);
  await page.locator("[data-kanji]").first().click();
  await page.waitForFunction(() => document.getElementById("kanjiContent").textContent.includes("On’yomi"));
  assert.match(await page.textContent("#kanjiContent"), /Kun’yomi|Example words/);
  await page.locator("#kanjiDialog [data-close]").click();
  await configure({ mode: "review", category: "all" }); await start();
  assert.equal(await page.locator("#wordList li").count(), 8);

  await page.click("#reviewButton");
  const downloading = page.waitForEvent("download");
  await page.click("#exportReview");
  const download = await downloading;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(exported.tool, "nihon-word-search");
  assert.ok(exported.words.length > 0);
  await page.locator("#reviewFile").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"version":2}') });
  await page.waitForFunction(() => document.getElementById("reviewNotice").textContent.includes("Import failed"));
  assert.match(await page.textContent("#reviewNotice"), /Import failed/);
  await page.locator("#reviewFile").setInputFiles({ name: "review.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await page.waitForFunction(() => document.getElementById("reviewNotice").textContent.includes("Imported"));
  await page.locator("#reviewDialog [data-close]").click();

  await configure({ mode: "quick", list: "japanese" }); await start();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator("[data-cell]").count(), 64);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Mobile page does not overflow horizontally");
  await configure({ fontSize: 40, contrast: true });
  assert.equal(await page.getAttribute("html", "data-contrast"), "false", "Display settings wait for a new puzzle");
  await start();
  assert.equal(await page.locator("#setting-furigana, #setting-romaji, #setting-audio, #setting-appearance").count(), 0);
  if (await page.getAttribute("html", "data-theme") !== "dark") await page.click("#themeButton");
  await page.click("#romajiQuickToggle");
  assert.equal(await page.getAttribute("html", "data-theme"), "dark");
  assert.equal(await page.getAttribute("html", "data-contrast"), "true");
  assert.equal(await cell(0).evaluate((element) => getComputedStyle(element).fontSize), "40px");
  assert.equal((await page.locator("#wordList .study-romaji:visible").count()) > 0, true);

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await touchContext.addInitScript(() => localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false })));
  await touchContext.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const touchBrowserPage = await touchContext.newPage();
  const touchPage = toolPage(touchBrowserPage);
  touchPage.on("pageerror", (error) => errors.push(error.message));
  await touchPage.goto(url);
  await touchPage.selectOption("#setting-mode", "daily", { force: true });
  await touchPage.click("#startButton"); await touchPage.waitForSelector("[data-cell]");
  const touchDaily = await touchPage.evaluate(() => JSON.parse(localStorage.getItem("nihon:word-search-v1")).progress.daily);
  assert.deepEqual(touchDaily.puzzle.grid, daily.puzzle.grid, "Daily grid matches in a fresh browser");
  const path = touchDaily.puzzle.entries[0].cells;
  await touchPage.locator(`[data-cell="${path[0]}"]`).tap();
  await touchPage.locator(`[data-cell="${path.at(-1)}"]`).tap();
  assert.match(await touchPage.textContent("#progressText"), /1 of 8/);
  await touchPage.setViewportSize({ width: 600, height: 1100 });
  await touchPage.locator("#grid").scrollIntoViewIfNeeded();
  const touchDrag = touchDaily.puzzle.entries.slice(1).find((entry) => entry.cells.length > 1).cells;
  const touchStart = await touchPage.locator(`[data-cell="${touchDrag[0]}"]`).boundingBox();
  const touchEnd = await touchPage.locator(`[data-cell="${touchDrag.at(-1)}"]`).boundingBox();
  const cdp = await touchContext.newCDPSession(touchBrowserPage);
  const from = { x: touchStart.x + touchStart.width / 2, y: touchStart.y + touchStart.height / 2 };
  const to = { x: touchEnd.x + touchEnd.width / 2, y: touchEnd.y + touchEnd.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let step = 1; step <= 10; step++) await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10 }]
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.match(await touchPage.textContent("#progressText"), /2 of 8/, "Native touch drag selects a word");
  await touchContext.close();

  if (!await page.locator("#settingsPanel").evaluate((panel) => panel.open)) await page.click("#settingsPanel summary");
  await page.selectOption("#setting-mode", "classic", { force: true });
  await page.selectOption("#setting-level", "1", { force: true });
  await page.route("**/api/word-search/vocabulary?level=1", (route) => route.fulfill({ status: 503, json: { error: "Vocabulary is temporarily unavailable." } }));
  await page.click("#newGame");
  await page.locator(".study-confirm-dialog").waitFor({ state: "detached" });
  await page.waitForFunction(() => !document.getElementById("newGame").disabled);
  assert.match(await page.textContent("#toolbarError"), /unavailable/);
  assert.equal(await page.locator("#settingsPanel").evaluate((panel) => panel.open), true, "Failed generation leaves settings open");
  await page.goto(`${base}/index.html`);
  await page.click("#menuButton");
  assert.equal(await page.locator(".helper-link").count(), 14);
  await page.click('[data-file="言葉探し.html"]');
  await page.frameLocator("#helperFrame").locator("#startButton").waitFor();
  assert.deepEqual(errors, []);
  console.log("Word Search browser checks passed: pointer, keyboard, touch, modes, daily persistence, notebook, and display.");
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}
