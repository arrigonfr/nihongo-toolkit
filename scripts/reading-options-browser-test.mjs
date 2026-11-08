import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

let vite, browser;
try {
  vite = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [], requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false })));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/kanji/batch") {
      requests.push(url.searchParams.get("reading"));
      return route.fulfill({ json: { items: [
        { id: 1, kanji: "日", jlpt: 5, meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"], categories: [], examples: [] }
      ] } });
    }
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
  const change = (id, value) => page.locator(`#${id}`).evaluate((input, value) => {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  for (const [direction, input, converted, opposite, type] of [
    ["reading-katakana", "nichi", "ニチ", "ひ", "on"],
    ["reading-hiragana", "hi", "ひ", "ニチ", "kun"],
    ["reading-any-kana", "nichi", "にち", null, "both"]
  ]) {
    await page.goto(`${base}/yomi.html`);
    await page.locator("#readingDirection").waitFor({ state: "attached" });
    assert.deepEqual(await page.locator("#readingDirection option").allTextContents(), ["On'yomi", "Kun'yomi", "Both"]);
    await change("readingDirection", direction);
    await page.click("#startSessionButton");
    await page.waitForFunction(() => !document.getElementById("answerInput").disabled);
    assert.equal(requests.at(-1), type);
    await page.check("#reviewKanjiToggle");
    await page.fill("#answerInput", "日");
    assert.equal(await page.inputValue("#answerInput"), "");
    await page.locator("#answerInput").evaluate((input) => {
      input.dispatchEvent(new CompositionEvent("compositionstart"));
      input.value = "日";
      input.dispatchEvent(new CompositionEvent("compositionend"));
    });
    assert.equal(await page.inputValue("#answerInput"), "");
    await page.locator("#answerInput").pressSequentially(input);
    assert.equal(await page.inputValue("#answerInput"), converted);
    await page.click("#checkButton");
    assert.equal(await page.textContent("#accuracyStat"), "100%");
    assert.equal(await page.locator("#nextButton").isVisible(), true);
    await page.uncheck("#reviewKanjiToggle");
    await page.waitForFunction(() => document.getElementById("questionCount").textContent === "Question 2");
    await page.check("#reviewKanjiToggle");
    await page.fill("#answerInput", direction === "reading-hiragana" ? "ヒ" : "にち");
    await page.click("#checkButton");
    assert.equal(await page.textContent("#accuracyStat"), "100%", "Either script is accepted");
    if (opposite) {
      await page.click("#nextButton");
      await page.fill("#answerInput", opposite);
      await page.click("#checkButton");
      assert.equal(await page.textContent("#accuracyStat"), "67%", "The other reading type is rejected");
    }
    await page.click("#stopSessionButton");
  }
  await page.goto(`${base}/imi.html`);
  await page.click("#startSessionButton");
  await page.waitForFunction(() => !document.getElementById("answerInput").disabled);
  await page.check("#reviewKanjiToggle");
  await page.fill("#answerInput", "day");
  await page.click("#checkButton");
  assert.equal(await page.locator("#nextButton").isVisible(), true);
  await page.uncheck("#reviewKanjiToggle");
  await page.waitForFunction(() => document.getElementById("questionCount").textContent === "Question 2");
  assert.deepEqual(errors, []);
  console.log("Reading options, API filtering, romaji, either kana script, IME clearing and live review passed.");
} finally {
  await browser?.close();
  await vite?.close();
}
