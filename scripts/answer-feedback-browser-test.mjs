import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { toRomaji } from "wanakana";

let vite, browser;
try {
  vite = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch();
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => {
      localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false }));
      Math.random = () => 0;
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/kanji/batch") return route.fulfill({ json: { items: [
        { id: 1, kanji: "日", jlpt: 5, meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"], categories: [], examples: [] }
      ] } });
      if (url.pathname === "/api/words/batch") return route.fulfill({ json: { items: Array.from({ length: 30 }, (_, id) => ({
        id, word: "猫", reading: "ねこ", meaning: "cat", level: 5, examples: [{ ja: "猫がいます。", en: "There is a cat." }]
      })) } });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { items: [] } });
      return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const position = () => page.locator("#answerInput").evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top + scrollY, height: rect.height };
    });
    const stable = async (before) => {
      const after = await position();
      assert.ok(Math.abs(after.top - before.top) < 1, `Input moved ${after.top - before.top}px at ${width}px`);
      assert.equal(after.height, before.height);
    };
    const change = (id, value) => page.locator(`#${id}`).evaluate((node, value) => {
      node.value = value; node.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    for (const tool of ["kana", "imi", "yomi"]) {
      await page.goto(`${base}/${tool}.html`);
      await page.click("#startSessionButton");
      await page.waitForFunction(() => !document.getElementById("answerInput").disabled);
      if (tool !== "kana") await page.uncheck("#reviewKanjiToggle");
      const before = await position();
      await page.fill("#answerInput", "wrong");
      await page.click("#checkButton");
      assert.equal(await page.locator("#answerInput").getAttribute("data-grade"), "incorrect");
      assert.equal(await page.locator("#incorrectCaption").isVisible(), true);
      assert.equal(await page.locator("#feedback").isVisible(), false);
      await stable(before);
      if (tool !== "kana") {
        await page.check("#reviewKanjiToggle");
        assert.equal(await page.locator("#feedback").isVisible(), true);
        await page.uncheck("#reviewKanjiToggle");
        assert.equal(await page.locator("#feedback").isVisible(), false);
      }
      await page.click("#checkButton");
      await page.waitForFunction(() => document.getElementById("answerInput").dataset.grade === undefined);
      await page.clock.runFor(1000);
      assert.equal(await page.locator("#answerInput").getAttribute("data-grade"), null);
      const correct = tool === "kana" ? toRomaji(await page.textContent("#glyph")) : tool === "imi" ? "day" : "にち";
      const next = await position();
      await page.fill("#answerInput", correct);
      await page.click("#checkButton");
      assert.equal(await page.locator("#correctCaption").isVisible(), true);
      assert.equal(await page.locator("#answerInput").getAttribute("data-grade"), "correct");
      await stable(next);
      await page.clock.runFor(750);
      await page.waitForFunction(() => document.getElementById("answerInput").dataset.grade === undefined);
      assert.equal(await page.locator("#correctCaption").isVisible(), false);
    }
    for (const [direction, badge] of [["reading-katakana", "on"], ["reading-hiragana", "kun"], ["reading-any-kana", null]]) {
      await page.goto(`${base}/yomi.html`);
      await change("readingDirection", direction);
      await page.click("#startSessionButton");
      await page.waitForFunction(() => !document.getElementById("answerInput").disabled);
      assert.equal(await page.locator(".reading-badge").count(), badge ? 1 : 2);
      if (badge) assert.equal(await page.locator(`.reading-badge-${badge}`).count(), 1);
    }
    for (const mode of ["typing-je", "cloze-je", "typing-ej", "cloze-ej"]) {
      await page.goto(`${base}/goi.html`);
      await change("modeSelect", mode);
      await page.click("#startButton");
      await page.locator("#answerInput").waitFor();
      await page.clock.runFor(1000);
      await page.uncheck("#showExampleToggle");
      await page.fill("#answerInput", "wrong");
      const before = await position();
      const neutral = await page.locator("#answerInput").evaluate((node) => getComputedStyle(node).outlineColor);
      await page.click("#checkButton");
      assert.equal(await page.locator("#feedback").isVisible(), false);
      assert.equal(await page.locator("#answerInput").getAttribute("data-grade"), "incorrect");
      await stable(before);
      await page.check("#showExampleToggle");
      assert.equal(await page.locator("#feedback").isVisible(), true);
      await page.uncheck("#showExampleToggle");
      assert.equal(await page.locator("#feedback").isVisible(), false);
      await page.click("#nextButton");
      await page.waitForFunction(() => document.getElementById("answerInput").dataset.grade === undefined);
      await page.clock.runFor(1000);
      await page.fill("#answerInput", mode.endsWith("je") ? "cat" : "neko");
      const next = await position();
      await page.click("#checkButton");
      assert.equal(await page.locator("#correctCaption").isVisible(), true, `${mode}: ${await page.textContent("#incorrectCaption")}`);
      assert.notEqual(await page.locator("#answerInput").evaluate((node) => getComputedStyle(node).outlineColor), neutral);
      await stable(next);
      await page.check("#showExampleToggle");
      await page.clock.runFor(1500);
      assert.equal(await page.locator("#correctCaption").isVisible(), true, "Review cancels pending automatic advance");
      await page.uncheck("#showExampleToggle");
      await page.clock.runFor(750);
      await page.waitForFunction(() => document.getElementById("answerInput").dataset.grade === undefined);
      assert.equal(await page.locator("#feedback").isVisible(), false);
    }
    await page.goto(`${base}/katsuyo-renshuu.html`);
    await page.evaluate(() => localStorage.setItem("nihon:conjugation-practice-v1", JSON.stringify({
      settings: { types: ["ichidan"], forms: ["te"], polarity: "affirmative", levels: [5], questions: 5 }, progress: {}
    })));
    await page.reload();
    await page.click("#startButton");
    const before = await position();
    await page.fill("#answerInput", "ちがう");
    await page.press("#answerInput", "Enter");
    await stable(before);
    await page.fill("#answerInput", "たべて");
    await page.press("#answerInput", "Enter");
    assert.equal(await page.locator("#correctCaption").isVisible(), true);
    await stable(before);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("Stable mobile/desktop feedback, reading badges, neutral inputs and live details toggles passed.");
} finally {
  await browser?.close();
  await vite?.close();
}
