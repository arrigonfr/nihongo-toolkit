import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer as viteServer } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";

const origins = [];
const api = createServer(createHandler({ origins, sentenceFallback: async () => [], wordFallback: async () => [] }));
api.listen(0, "127.0.0.1");
await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
let vite, browser;
try {
  vite = await viteServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  origins.push(base);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false, furigana: true, romaji: false })));
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/kanji/batch") return route.fulfill({ json: { items: [
      { id: 1, kanji: "日", jlpt: 5, meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"], categories: [], examples: [] }
    ] } });
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => { errors.push(`Unexpected native dialog: ${dialog.message()}`); await dialog.dismiss(); });
  const go = async (name) => {
    await page.goto(`${base}/${encodeURIComponent(name)}.html`);
    await page.locator("#colorThemeSelect").waitFor();
  };
  const change = async (id, value) => page.locator(`#${id}`).evaluate((input, value) => {
    if (input.type === "checkbox") input.checked = value;
    else input.value = String(value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  const allDetails = () => page.evaluate(() => document.querySelectorAll("details").forEach((details) => { details.open = true; }));
  const pages = ["仮名", "意味", "読み", "語彙", "活用", "活用練習", "言葉探し", "パズル", "しりとり", "絵合わせ", "文解き", "言葉", "漢字地図帳"];
  for (const name of pages) {
    await go(name); await allDetails();
    assert.ok(await page.locator('#colorThemeSelect option[value="sumi"]').count(), name);
    for (const font of await page.locator("#fontChoice, #setting-font").all()) {
      assert.equal(await font.locator("..").locator(".font-chip").count(), 4, `${name}: all font choices`);
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width && rect.right > innerWidth + 1 && getComputedStyle(node).position !== "fixed";
      }).map((node) => `${node.tagName}#${node.id}.${node.className}`).slice(0, 12));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal overflow at ${width}: ${overflow}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await go("パズル");
  assert.equal(await page.locator(".cw-cell").count(), 0, "Crosswords wait for explicit start");
  assert.ok(await page.locator("#newPuzzleBtn").evaluate((button) => button.getBoundingClientRect().top >= document.getElementById("settingsDrawer").getBoundingClientRect().bottom));
  await page.click("#newPuzzleBtn");
  await page.locator(".cw-cell").first().waitFor();
  assert.equal(await page.locator("#resetProgressBtn").isEnabled(), true);

  await go("仮名");
  await page.locator('#kanaDirection + .direction-chips .chip-option[data-value="romaji-katakana"]').click();
  await page.reload();
  assert.equal(await page.locator('#kanaDirection + .direction-chips .chip-option[data-value="romaji-katakana"] input').isChecked(), true);

  await go("読み");
  await change("readingDirection", "reading-katakana");
  await page.click("#startSessionButton");
  await page.waitForFunction(() => !document.getElementById("answerInput").disabled);
  await page.locator("#answerInput").pressSequentially("nichi");
  assert.equal(await page.inputValue("#answerInput"), "ニチ");
  await page.click("#checkButton");
  assert.equal(await page.textContent("#accuracyStat"), "100%");
  await go("読み");
  await change("readingDirection", "reading-any-kana");
  await page.click("#startSessionButton");
  await page.waitForFunction(() => !document.getElementById("answerInput").disabled);
  await page.locator("#answerInput").pressSequentially("hi");
  assert.equal(await page.inputValue("#answerInput"), "ひ");

  await go("意味");
  await change("meaningDirection", "meaning-reverse");
  await page.click("#startSessionButton");
  await page.waitForFunction(() => !document.getElementById("answerInput").disabled);
  await page.fill("#answerInput", "hi");
  await page.click("#checkButton");
  await page.locator("#answerCandidates button").first().waitFor();
  assert.ok((await page.locator("#answerCandidates button").allTextContents()).every((text) => /^\p{Script=Han}$/u.test(text)));
  assert.equal(await page.textContent("#answeredStat"), "0", "Choosing candidates does not score a guess");
  await page.locator("#answerCandidates button").filter({ hasText: /^日$/ }).click();
  assert.equal(await page.textContent("#accuracyStat"), "100%");

  await go("活用練習");
  assert.equal(await page.locator("#setting-script").count(), 0);
  assert.equal(await page.locator("#setting-questions option").count(), 20);
  await allDetails();
  assert.equal(await page.locator('#formSettings .chip-option input[value="potential"]').isEnabled(), true);
  assert.equal(await page.locator('#formSettings .chip-option input[value="potential"]').isChecked(), false);
  await page.locator('#levelSettings .chip-option:has(input[value="4"]) .chip-label').click();
  assert.equal(await page.locator('#formSettings .chip-option input[value="potential"]').isChecked(), true);
  await change("setting-language", "en");
  await page.click("#startButton");
  assert.match(await page.textContent(".requested-form"), /Politeness/);
  await page.click("#checkButton");
  assert.match(await page.textContent("#answerNotice"), /Enter an answer/);
  await page.click("#endButton");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.locator("#practice").isVisible(), true);
  await page.click("#endButton");
  await page.getByRole("button", { name: "Save & continue", exact: true }).click();
  await page.locator("#results").waitFor();
  assert.match(await page.textContent("#missedWords"), /Saved unfinished/);
  await page.reload();
  assert.match(await page.textContent("#missedWords"), /Saved unfinished/);
  await change("setting-mode", "weak");
  await page.click("#startButton");
  assert.equal(await page.locator("#practice").isVisible(), true);
  await page.click("#endButton"); await page.getByRole("button", { name: "Discard & continue" }).click();
  await page.click("#restartButton");
  await change("setting-mode", "reverse");
  await allDetails(); await change("setting-reverseTask", "polarity");
  await page.click("#startButton");
  assert.equal(await page.locator("#answerOptions button").count(), 2);
  await page.keyboard.press("2");
  assert.equal(await page.locator("#answerOptions button").nth(1).getAttribute("aria-pressed"), "true");
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.keyboard.press("1");
  assert.equal(await page.locator("#answerOptions button").nth(1).getAttribute("aria-pressed"), "true", "Mobile shortcuts inactive");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await go("言葉探し");
  await change("sizePreset", "20");
  await change("setting-list", "japaneseClue");
  await page.click("#newGame");
  await page.locator("#grid [data-cell]").first().waitFor();
  assert.equal(await page.locator("#grid [data-cell]").count(), 400);
  assert.match(await page.textContent("#listNote"), /Category clues/);
  await page.click("#endButton");
  await page.mouse.click(5, 5);
  await page.locator(".study-confirm-dialog").waitFor({ state: "detached" });
  assert.equal(await page.locator(".study-confirm-dialog").count(), 0, "Backdrop dismisses modal");
  await page.click("#endButton");
  await page.getByRole("button", { name: "Discard & continue" }).click();
  await page.locator("#results").waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("nihon:word-search-v1")).progress.review.length), 0);

  await go("しりとり"); await allDetails();
  assert.equal(await page.locator(".mode-notes").count(), 0);
  assert.equal(await page.locator("#setting-players").isDisabled(), true);
  await change("setting-opponent", "local");
  assert.equal(await page.locator("#setting-players").isEnabled(), true);
  await page.locator('[data-mode="daily"]').click();
  assert.equal(await page.locator("#setting-level + .study-levels input").first().isDisabled(), true);
  await page.locator('[data-mode="classic"]').click();
  assert.equal(await page.locator("#setting-level + .study-levels input").first().isEnabled(), true);

  await go("意味");
  const group = page.locator("#levelSelect + .study-levels");
  await group.locator("[data-level-clear]").click();
  await group.locator('input[value="5"]').check();
  await group.locator('input[value="3"]').check();
  await page.reload();
  assert.equal(await page.inputValue("#levelSelect"), "5,3");
  assert.equal(await group.locator('input[value="4"]').isChecked(), false);
  await page.selectOption("#colorThemeSelect", "sumi");
  await page.click("#themeButton");
  assert.equal(await page.getAttribute("html", "data-color-theme"), "sumi");
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page").trim()), "#08090c");

  assert.deepEqual(errors, []);
  console.log("Study improvements: all pages, mobile layouts, deferred puzzles, inputs, review dialogs and settings passed.");
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}
