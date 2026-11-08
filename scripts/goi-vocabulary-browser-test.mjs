import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

let vite, browser;
try {
  vite = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null } });
  await vite.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } }), errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false, furigana: false, romaji: true }));
  });
  let word, sentences = [], sentenceRequests = 0;
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/words/batch") return route.fulfill({ json: { items: Array.from({ length: 20 }, (_, id) => ({ id, level: 5, ...word })) } });
    if (url.pathname === "/api/sentences") {
      sentenceRequests++;
      assert.equal(url.searchParams.get("corpus"), "1", "Cloze requests corpus examples");
      return route.fulfill({ json: { data: sentences } });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { items: [] } });
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
  const change = (id, value) => page.locator(`#${id}`).evaluate((node, value) => {
    node.value = value; node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  const open = async () => {
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/goi.html`);
    await page.locator("#startButton").waitFor();
  };
  for (const mode of ["typing-je", "cloze-je"]) {
    word = { word: "プール", reading: "プール", meaning: "swimming pool", acceptedMeanings: ["swimming pool", "(swimming) pool", "pool (cue sport)"],
      examples: [{ ja: "プールで泳ぎます。", en: "I swim in the pool." }] };
    await open();
    await change("modeSelect", mode);
    await page.click("#startButton");
    await page.locator("#answerInput").waitFor();
    await page.check("#showExampleToggle");
    await page.fill("#answerInput", "pool");
    await page.click("#checkButton");
    assert.equal(await page.locator("#correctCaption").isVisible(), true, `${mode} accepts pool`);
    await page.click("#nextButton");
    await page.fill("#answerInput", "swimming");
    await page.click("#checkButton");
    assert.equal(await page.locator("#answerInput").getAttribute("data-grade"), "incorrect", "Substring is not a synonym");
  }
  for (const [direction, random, answer] of [["to-romaji", 0, "kakeru"], ["random", 0, "kakeru"], ["random", 0.99, "かける"], ["to-kana", 0, "かける"]]) {
    word = { word: "かける", reading: "かける", meaning: "to hang", acceptedMeanings: ["to hang"], writtenForms: ["掛ける"],
      examples: [{ ja: "服をかける。", en: "Hang clothes." }] };
    await open();
    await change("modeSelect", "typing-ej");
    assert.deepEqual(await page.locator("#kanaDirection option").allTextContents(), ["Kanji / Kana → Romaji", "Romaji → Kanji / Kana", "Randomize"]);
    await change("kanaDirection", direction);
    await page.evaluate((value) => { Math.random = () => value; }, random);
    await page.click("#startButton");
    await page.locator("#answerInput").waitFor();
    await page.check("#showExampleToggle");
    if (answer === "kakeru") {
      assert.equal(await page.locator("#word ruby rt").textContent(), "掛ける");
      assert.ok(!(await page.locator("#word").textContent()).includes("kakeru"), "Romaji toggle does not reveal the answer");
    } else assert.equal(await page.locator("#word").textContent(), "kakeru");
    await page.fill("#answerInput", answer);
    await page.click("#checkButton");
    assert.equal(await page.locator("#correctCaption").isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  word = { word: "プール", reading: "プール", meaning: "pool", examples: [
    { ja: "プールに行く。", en: "Go to the pool.", generated: true, reviewed: true }
  ] };
  await open();
  await change("modeSelect", "cloze-ej");
  await page.click("#startButton");
  await page.waitForFunction(() => document.querySelector("#status").textContent.includes("Could not load a word"));
  assert.match(await page.locator("#warning").textContent(), /No matching sourced sentences/);
  assert.equal(await page.locator("#questionContent").isVisible(), false, "No invented cloze question is shown");
  assert.equal(sentenceRequests, 5, "Sentence search is bounded");
  sentences = [{ id: 123, text: "プールで泳ぎます。", source: "Tatoeba",
    translations: [{ lang: "eng", text: "I swim in the pool." }] }];
  await open();
  await change("modeSelect", "cloze-ej");
  await page.click("#startButton");
  await page.locator("#answerInput").waitFor();
  assert.match(await page.locator("#prompt").textContent(), /___で泳ぎます/);
  assert.doesNotMatch(await page.locator("#prompt").textContent(), /Meaning clue|という意味/);
  assert.deepEqual(errors, []);
  console.log("Goi alternative meanings, kana writing hints, both direction labels and randomized directions passed.");
} finally { await browser?.close(); await vite?.close(); }
