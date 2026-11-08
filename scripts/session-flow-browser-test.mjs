import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";

const origins = [];
const api = createServer(createHandler({ origins, sentenceFallback: async () => [], wordFallback: async () => [] }));
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
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false })));
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [file, settings, start, play, end, results] of [
    ["kana", "#settingsPanel", "#startSessionButton", "#questionSection", "#stopSessionButton", "#sessionResults"],
    ["imi", "#settingsPanel", "#startSessionButton", "#questionSection", "#stopSessionButton", "#sessionResults"],
    ["yomi", "#settingsPanel", "#startSessionButton", "#questionSection", "#stopSessionButton", "#sessionResults"],
    ["goi", "#settingsPanel", "#startButton", "#questionContent", "#stopSessionButton", "#resultsPanel"],
    ["kanji-kuizu", "#settings", "#start", "#game", "#stop", "#results"],
    ["eawase", "#settingsPanel", "#startButton", ".board-panel", "#endButton", "#results"],
    ["kotoba-sagashi", "#settingsPanel", "#startButton", ".board-card", "#endButton", "#results"],
    ["pazuru", ".cw-top-card", "#newPuzzleBtn", "#cwWorkspace", "#endPuzzleBtn", "#puzzleResults"],
    ["shiritori", "#settingsPanel", "#newGame", "section[aria-label='Current turn']", "#stopGame", "#results"]
  ]) {
    await page.goto(`${base}/${file}.html`);
    await page.locator("#audioQuickToggle").waitFor();
    assert.equal(await page.locator(settings).isVisible(), true, `${file} settings visible`);
    assert.equal(await page.locator(play).isVisible(), false, `${file} play hidden`);
    assert.equal(await page.locator(start).isVisible(), true, `${file} start visible`);
    if (["goi", "kanji-kuizu", "eawase", "pazuru", "shiritori"].includes(file)) {
      assert.equal(await page.locator(`.session-setup > .start-line ${start}`).count(), 1);
      const details = page.locator(`${settings} details, details${settings}`).first();
      await details.evaluate((node) => { node.open = false; });
      assert.equal(await page.locator(start).isVisible(), true, `${file} start survives collapsed settings`);
      await details.evaluate((node) => { node.open = true; });
      assert.equal(await page.locator(".session-setup > .start-line").evaluate((node) => getComputedStyle(node).justifyContent), "flex-end");
      await page.setViewportSize({ width: 360, height: 900 });
      await page.locator(start).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/nihon-${file}-settings-footer.png` });
    }
    if (["goi", "kana", "imi", "yomi"].includes(file)) assert.equal(await page.locator("#startError").isVisible(), false, `${file} initial error hidden`);
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      if (["goi", "kotoba-sagashi", "shiritori"].includes(file)) {
        assert.equal(await page.locator("#settingsPanel > summary").evaluate((node) => getComputedStyle(node).paddingLeft), "20px", `${file} settings heading inset at ${width}`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${file} overflow at ${width}`);
      for (const button of await page.locator(".study-toolbar > button").all()) {
        if (await button.isVisible()) assert.ok(await button.evaluate((node) => node.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1), `${file} toolbar text fits`);
      }
    }
    if (file === "goi") {
      assert.equal(await page.locator("#settingsPanel #sessionType").count(), 1);
      assert.equal(await page.locator("#questionLabel").isVisible(), false);
      assert.equal(await page.locator(".quiz-panel").evaluate((node) => getComputedStyle(node).overflowY), "visible");
    }
    if (file === "kanji-kuizu") {
      assert.equal(await page.locator("#seconds").isDisabled(), true);
      await page.locator("#mode").evaluate((node) => { node.value = "daily"; node.dispatchEvent(new Event("change", { bubbles: true })); });
      assert.equal(await page.locator("#count").isDisabled(), true);
      assert.equal(await page.locator("#levelSelect").isDisabled(), true);
      await page.locator("#mode").evaluate((node) => { node.value = "practice"; node.dispatchEvent(new Event("change", { bubbles: true })); });
    }
    await page.click(start);
    await page.locator(play).waitFor();
    await page.waitForFunction(() => !document.querySelector(".request-loading-panel"));
    assert.equal(await page.locator(settings).isVisible(), false, `${file} settings hidden in play`);
    assert.equal(await page.locator(start).isVisible(), false, `${file} start hidden in play`);
    if (file === "kanji-kuizu") {
      await page.locator('#choices button[data-choice="0"]').click();
      await page.click("#check");
      assert.equal(await page.locator("#choices .correct, #choices .wrong").count(), 1);
      assert.ok(await page.locator('#choices .missed[aria-pressed="false"]').count() >= 1);
      assert.equal(await page.locator('#choices .correct[aria-pressed="false"], #choices .wrong[aria-pressed="false"]').count(), 0);
      assert.match(await page.locator("#choices .missed").first().textContent(), /Correct, not selected/);
      await page.setViewportSize({ width: 360, height: 900 });
      await page.locator("#choices").scrollIntoViewIfNeeded();
      await page.screenshot({ path: "/tmp/nihon-kuizu-answer-feedback.png" });
    }
    if (file === "pazuru") {
      await page.click("#revealPuzzleBtn");
    } else await page.click(end);
    const confirmation = page.locator(".study-confirm-dialog[open]");
    if (await confirmation.count()) await confirmation.locator("button").last().click();
    await page.locator(results).waitFor();
    if (["eawase", "shiritori"].includes(file)) assert.equal(await page.locator(".sidebar").isVisible(), true, `${file} sidebar retained`);
    if (file === "pazuru") {
      assert.equal(await page.locator("#studyInspector").isVisible(), true);
      assert.equal(await page.locator("#puzzleResults [data-play-again]").getAttribute("class"), "cw-btn primary");
      assert.equal(await page.locator(".cw-review-word").count(), await page.locator(".cw-clue-item").count());
      assert.ok(await page.locator(".cw-review-word.unanswered").count() > 1);
      assert.equal(await page.locator("#completedKanjiCard").count(), 0);
      for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator("#studyInspector").scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `/tmp/nihon-pazuru-review-${width}.png` });
      }
    }
    assert.equal(await page.locator(`${results} .replay-actions`).evaluate((node) => getComputedStyle(node).justifyContent), "flex-end");
    assert.equal(await page.locator(play).isVisible(), false, `${file} play hidden at results`);
    assert.equal(await page.locator(settings).isVisible(), false, `${file} settings hidden at results`);
    await page.locator(`${results} [data-play-again]`).click();
    assert.equal(await page.locator(settings).isVisible(), true, `${file} replay returns to setup`);
    assert.equal(await page.locator(results).isVisible(), false);
    console.log(`${file}: setup, play, results, replay and responsive layout passed`);
  }
  await page.goto(`${base}/katsuyo-renshuu.html`);
  const reset = page.locator("#settingsPanel > [data-reset-slot] .reset-defaults-button");
  await reset.waitFor();
  assert.notEqual(await reset.evaluate((node) => getComputedStyle(node).borderTopWidth), "0px");
  assert.equal(await page.locator("#settingsPanel #practiceDisplay").count(), 1);
  await page.locator("#settingsPanel > summary").click();
  assert.equal(await reset.isVisible(), false);
  assert.equal(await page.locator("#practiceDisplay").isVisible(), false);
  await page.locator("#settingsPanel > summary").click();
  assert.equal(await reset.isVisible(), true);
  await reset.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/nihon-renshuu-reset.png" });
  await page.goto(`${base}/index.html`);
  await page.click("#menuButton");
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const link of await page.locator("#helperMenu .helper-link").all()) {
      assert.ok(await link.evaluate((node) => {
        const name = node.querySelector(".helper-name").getBoundingClientRect();
        const description = node.querySelector(".helper-description").getBoundingClientRect();
        return description.top - name.bottom <= 6;
      }), `Compact menu text at ${width}`);
    }
    await page.screenshot({ path: `/tmp/nihon-menu-${width}.png` });
  }
  await page.goto(`${base}/katsuyo.html`);
  let conjugations = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/conjugator") conjugations++; });
  await page.fill("#wordInput", "食べる");
  await page.waitForTimeout(600);
  assert.equal(conjugations, 0, "Katsuyo does not search while typing");
  await page.press("#wordInput", "Enter");
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes("食べる"));
  await page.waitForFunction(() => !document.querySelector(".request-loading-panel"));
  assert.equal(conjugations, 1, "Enter starts the lookup");
  await page.fill("#wordInput", "書く");
  await page.click('#searchForm button[type="submit"]');
  await page.waitForFunction(() => document.querySelector("#result").textContent.includes("書く"));
  assert.equal(conjugations, 2, "Search starts the next lookup");
  await page.goto(`${base}/kotoba.html`);
  let words = 0, sentences = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/words") words++;
    if (path === "/api/sentences") sentences++;
  });
  await page.fill("#query", "neko");
  await page.waitForTimeout(600);
  assert.equal(words, 0);
  await page.press("#query", "Enter");
  await page.locator(".result-card").first().waitFor();
  await page.locator(".request-loading-panel").waitFor({ state: "hidden" });
  assert.equal(words, 1);
  assert.equal(sentences, 0);
  await page.locator(".sentence-next").first().click();
  assert.equal(sentences, 1);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/nihon-mobile-header.png" });
  await page.goto(base);
  await page.locator(".dashboard-link > .helper-icon").first().waitFor();
  assert.equal(await page.locator(".dashboard-link .helper-description").first().isVisible(), true);
  await page.screenshot({ path: "/tmp/nihon-mobile-dashboard.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "/tmp/nihon-desktop-dashboard.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Explicit dictionary search and on-demand examples passed; screenshots saved in /tmp/nihon-*.png");
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}