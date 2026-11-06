import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.spokenQuestions = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, "speechSynthesis", { value: {
      getVoices: () => [], cancel: () => {}, speak: (utterance) => window.spokenQuestions.push(utterance.text)
    } });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const characters = ["木", "本", "日", "白", "目", "自", "人", "入", "大", "犬", "力", "刀"];
  const pool = characters.map((kanji, index) => ({ kanji, jlpt: 5, meanings: [`meaning ${index}`], on_readings: [index < 6 ? "コウ" : "セイ", `カ${"アイウエオキクケコサシス"[index]}`], kun_readings: [`た${"あいうえおかきくけこさし"[index]}`], examples: [{ word: `${kanji}語`, reading: "ご", meanings: [`example ${index}`] }] }));
  await page.route("**/api/kanji/batch?**", (route) => route.fulfill({ json: { items: pool } }));
  await page.route("**/api/kanji?**", (route) => route.fulfill({ json: { items: pool } }));
  let bulkCalls = 0;
  await page.route("**/api/kanji/bulk?**", (route) => {
    bulkCalls++;
    const characters = new URL(route.request().url()).searchParams.getAll("character");
    return route.fulfill({ json: { items: characters.map((character) => pool.find((item) => item.kanji === character)) } });
  });
  await page.route(/\/api\/kanji\/[^/?]+$/, (route) => route.fulfill({ json: pool.find((item) => item.kanji === decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-1))) }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/kanji-imposters.html`);
  assert.match(await page.locator(".brand-name").textContent(), /Kanji Kuizu/);
  await page.locator("#settings > summary").click();
  const collapsed = await page.evaluate(() => ({ bodyHeight: document.body.getBoundingClientRect().height, viewportHeight: window.innerHeight, panelHeight: document.querySelector("#settings").getBoundingClientRect().height, summaryHeight: document.querySelector("#settings > summary").getBoundingClientRect().height }));
  assert.ok(collapsed.bodyHeight >= collapsed.viewportHeight);
  assert.ok(collapsed.panelHeight <= collapsed.summaryHeight + 3);
  await page.locator("#settings > summary").click();
  assert.equal(await page.locator("#variants option").filter({ hasText: /Meaning/ }).count(), 0);
  for (const id of ["mode", "count", "seconds", "fontSize", "hintMode", "hintLimit", "revealMode", "revealLimit"]) {
    const control = page.locator(`#${id}`);
    assert.ok(await control.getAttribute("aria-labelledby"), `${id} has an accessible label`);
    const label = await control.getAttribute("aria-labelledby");
    assert.equal(await page.locator(`#${label}[data-study-help], #${label} [data-study-help]`).count(), 0, `${id} has no tooltip`);
  }
  await page.waitForFunction(() => document.querySelector('label[for="variants"] [data-study-help]'));
  assert.match(await page.locator('label[for="variants"] [data-study-help]').getAttribute("data-study-help"), /identify readings.*kanji.*reading/i);
  assert.match(await page.locator('label[for="readingPrompt"] [data-study-help]').getAttribute("data-study-help"), /How do you want your questions to be\?/);
  assert.deepEqual(await page.locator("#settingsForm > fieldset > legend").allTextContents(), ["Session", "Questions", "Display and feedback", "Help during play"]);
  assert.equal(await page.locator("#customWrap").isVisible(), false);
  await page.locator("#count").selectOption("custom");
  assert.equal(await page.locator("#customWrap").isVisible(), true);
  await page.locator("#count").selectOption("10");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `settings overflow at ${width}px`);
    const layout = await page.evaluate(() => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const level = box('label[for="levelSelect"]');
      const variantBox = box('label[for="variants"]');
      const prompt = box('label[for="readingPrompt"]'), size = box("#fontSizeLabel"), details = box('label:has(#details)');
      return { questionsSideBySide: Math.abs(level.top - variantBox.top) < 70 && variantBox.left > level.right,
        displaySideBySide: Math.abs(prompt.top - size.top) < 10 && size.left > prompt.right && details.left > size.right,
        questionsStacked: variantBox.top > level.bottom, displayStacked: size.top > prompt.bottom && details.top > size.bottom };
    });
    if (width === 1280) {
      assert.equal(layout.questionsSideBySide, true, JSON.stringify(layout));
      assert.equal(layout.displaySideBySide, true);
    } else {
      assert.equal(layout.questionsStacked, true);
      assert.equal(layout.displayStacked, true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#start").click();
  await page.locator("#game").waitFor({ state: "visible" });
  assert.equal(await page.locator("#choices button").count(), 5);
  const prompt = await page.locator("#prompt").textContent();
  const isKanji = characters.includes(prompt);
  const correct = await page.locator("#choices button").evaluateAll((buttons, { pool, prompt, isKanji }) => {
    const normalize = (text) => text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
    const readings = (item) => [...item.on_readings, ...item.kun_readings].map(normalize);
    return buttons.map((button, index) => ({ index, value: button.textContent })).filter(({ value }) => isKanji ? readings(pool.find((item) => item.kanji === prompt)).includes(value) : readings(pool.find((item) => item.kanji === value)).includes(prompt)).map(({ index }) => index);
  }, { pool, prompt, isKanji });
  assert.ok(correct.length >= 2 && correct.length < 5);
  await page.locator(`#choices button[data-choice="${correct[0]}"]`).click();
  assert.equal(await page.locator("#next").isVisible(), false);
  await page.locator("#check").click();
  assert.match(await page.locator("#feedback").textContent(), /Not quite/);
  assert.equal(await page.locator("#choices .correct").count(), correct.length);
  await page.locator("#next").click();
  await page.locator("#hint").click();
  assert.equal(await page.locator("#choices .removed").count(), 1);
  await page.locator("#reveal").click();
  assert.ok(await page.locator("#choices .correct").count() >= 2);
  await page.locator("#stop").click();
  assert.match(await page.locator("#results").textContent(), /Mistakes: 2/);
  assert.ok((await page.locator("#reviewList").textContent()).includes("(") );
  for (const variant of ["kanji-reading", "reading-kanji"]) {
    await page.locator("#variants").evaluate((select, value) => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); }, variant);
    await page.locator("#start").click();
    await page.waitForFunction(() => !document.querySelector("#start").disabled || !document.querySelector("#game").hidden);
    assert.equal(await page.locator("#error").textContent(), "", variant);
    await page.locator("#game").waitFor({ state: "visible" });
    const currentPrompt = await page.locator("#prompt").textContent();
    const valid = await page.locator("#choices button").evaluateAll((buttons, { pool, currentPrompt, variant }) => {
      const normalize = (text) => text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
      const readings = (item) => [...item.on_readings, ...item.kun_readings].map(normalize);
      return buttons.map((button, index) => ({ index, value: button.textContent })).filter(({ value }) => variant === "kanji-reading" ? readings(pool.find((item) => item.kanji === currentPrompt)).includes(value) : readings(pool.find((item) => item.kanji === value)).includes(currentPrompt)).map(({ index }) => index);
    }, { pool, currentPrompt, variant });
    assert.ok(valid.length >= 2 && valid.length < 5);
    for (const index of valid.slice(0, -1)) await page.locator(`#choices button[data-choice="${index}"]`).click();
    await page.locator("#check").click();
    assert.match(await page.locator("#feedback").textContent(), /Not quite/, "All correct choices are required");
    if (variant === "reading-kanji") {
      const choices = await page.locator("#choices button").allTextContents();
      const items = page.locator("#feedback [data-feedback-kanji]");
      assert.equal(await items.count(), 5);
      for (const [index, kanji] of choices.entries()) {
        const fixture = pool.find((item) => item.kanji === kanji);
        assert.equal(await items.nth(index).getAttribute("data-feedback-kanji"), kanji);
        const text = await items.nth(index).textContent();
        assert.ok(text.includes(fixture.meanings[0]) && text.includes(fixture.on_readings[1]) && text.includes(fixture.kun_readings[0]) && text.includes(fixture.examples[0].meanings[0]));
      }
    } else {
      assert.equal(await page.locator("#feedback [data-feedback-kanji]").count(), 1);
    }
    await page.locator("#next").click();
    const currentPrompt2 = await page.locator("#prompt").textContent();
    const valid2 = await page.locator("#choices button").evaluateAll((buttons, { pool, currentPrompt2, variant }) => {
      const normalize = (text) => text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
      const readings = (item) => [...item.on_readings, ...item.kun_readings].map(normalize);
      return buttons.map((button, index) => ({ index, value: button.textContent })).filter(({ value }) => variant === "kanji-reading" ? readings(pool.find((item) => item.kanji === currentPrompt2)).includes(value) : readings(pool.find((item) => item.kanji === value)).includes(currentPrompt2)).map(({ index }) => index);
    }, { pool, currentPrompt2, variant });
    for (const index of valid2) await page.locator(`#choices button[data-choice="${index}"]`).click();
    const wrong = [0, 1, 2, 3, 4].find((index) => !valid2.includes(index));
    await page.locator(`#choices button[data-choice="${wrong}"]`).click();
    await page.locator("#check").click();
    assert.match(await page.locator("#feedback").textContent(), /Not quite/);
    assert.equal(await page.locator("#choices .wrong").count(), 1);
    await page.locator("#next").click();
    const nextPrompt = await page.locator("#prompt").textContent();
    const nextValid = await page.locator("#choices button").evaluateAll((buttons, { pool, nextPrompt, variant }) => {
      const normalize = (text) => text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
      const readings = (item) => [...item.on_readings, ...item.kun_readings].map(normalize);
      return buttons.map((button, index) => ({ index, value: button.textContent })).filter(({ value }) => variant === "kanji-reading" ? readings(pool.find((item) => item.kanji === nextPrompt)).includes(value) : readings(pool.find((item) => item.kanji === value)).includes(nextPrompt)).map(({ index }) => index);
    }, { pool, nextPrompt, variant });
    for (const index of nextValid) await page.locator(`#choices button[data-choice="${index}"]`).click();
    await page.locator("#check").click();
    assert.match(await page.locator("#feedback").textContent(), /Correct/);
    await page.locator("#stop").click();
    assert.match(await page.locator("#results").textContent(), /Correct: 1/);
  }
  await page.locator("#details").uncheck();
  await page.locator("#start").click();
  await page.locator("#game").waitFor({ state: "visible" });
  await page.locator("#reveal").click();
  assert.equal(await page.locator("#feedback [data-feedback-kanji]").count(), 0, "Details remain hidden when disabled");
  await page.locator("#stop").click();
  await page.locator("#details").check();
  await page.locator("#variants").evaluate((select) => { select.value = "reading-kanji"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.locator("#readingPrompt").selectOption("audio");
  if (await page.locator("#audioQuickToggle").getAttribute("aria-pressed") !== "true") await page.locator("#audioQuickToggle").click();
  await page.evaluate(() => { window.spokenQuestions = []; });
  await page.locator("#start").click();
  await page.locator("#game").waitFor({ state: "visible" });
  const firstAudio = await page.locator("#promptAudio button").getAttribute("data-study-speak");
  assert.deepEqual(await page.evaluate(() => window.spokenQuestions), [firstAudio], "The first question plays automatically");
  assert.equal(await page.locator("#prompt").textContent(), "");
  assert.match(await page.locator("#promptAudio button").textContent(), /^Replay/);
  await page.locator("#promptAudio button").click();
  assert.deepEqual(await page.evaluate(() => window.spokenQuestions), [firstAudio, firstAudio], "Replay repeats the prompt");
  await page.locator("#hint").click();
  assert.equal((await page.evaluate(() => window.spokenQuestions)).length, 2, "Hint rendering does not replay the prompt");
  await page.locator("#reveal").click();
  await page.locator("#next").click();
  const secondAudio = await page.locator("#promptAudio button").getAttribute("data-study-speak");
  assert.deepEqual(await page.evaluate(() => window.spokenQuestions), [firstAudio, firstAudio, secondAudio], "The next question plays automatically");
  await page.locator("#stop").click();
  await page.locator("#readingPrompt").selectOption("text");
  await page.locator("#mode").evaluate((select) => { select.value = "daily"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  const dailySets = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator("#start").click();
    await page.locator("#game").waitFor({ state: "visible" });
    const questions = [];
    for (let index = 0; index < 3; index++) {
      questions.push([await page.locator("#prompt").textContent(), await page.locator("#choices button").allTextContents()]);
      await page.locator("#reveal").click();
      await page.locator("#next").click();
    }
    dailySets.push(questions);
    await page.locator("#stop").click();
  }
  assert.deepEqual(dailySets[0], dailySets[1]);
  assert.equal(bulkCalls, 2, "one bulk detail request per daily startup");
  assert.deepEqual(errors, []);
  console.log("Kanji Imposters browser checks passed.");
} finally {
  await browser?.close();
  await server.close();
}