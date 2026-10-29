import assert from "node:assert/strict";
import { toolPage } from "./tool-page.mjs";
import { createServer as httpServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer as viteServer } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";

const api = httpServer(createHandler({
  origins: ["http://127.0.0.1:5179"], compression: true,
  sentenceFallback: async () => [],
  translateSentence: async () => "German is not an easy language."
}));
api.listen(0, "127.0.0.1");
await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
let vite;
let browser;
try {
  vite = await viteServer({
    root: fileURLToPath(new URL("../frontend", import.meta.url)),
    server: { host: "127.0.0.1", port: 5179, strictPort: true }
  });
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = toolPage(await browser.newPage({ reducedMotion: "reduce" }));
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    if (["fetch", "xhr"].includes(route.request().resourceType())) errors.push(`External API request: ${url}`);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/")) requests.push(request.url());
  });
  const go = (file) => page.goto(`http://127.0.0.1:5179/${encodeURIComponent(file)}`);
  const beginPractice = async (file) => {
    await go(file);
    assert.equal(await page.locator("#startSessionButton").isVisible(), true);
    assert.equal(await page.locator("#stopSessionButton").isVisible(), false);
    assert.equal(await page.locator("#questionSection").isVisible(), false);
    assert.equal(await page.locator("#largeToggle").count(), 0);
    await page.click("#startSessionButton");
    assert.equal(await page.locator("#settingsPanel").evaluate((node) => node.open), false);
    assert.equal(await page.locator("#questionSection").isVisible(), true);
    if (file !== "仮名.html") {
      assert.equal(await page.locator("#settingsPanel #reviewKanjiToggle").count(), 0);
      assert.equal(await page.locator("#reviewKanjiToggle").isVisible(), true);
      await page.check("#reviewKanjiToggle");
      await page.uncheck("#reviewKanjiToggle");
    }
    await page.click("#settingsPanel summary");
  };
  await go("語彙.html");
  await page.selectOption("#levelSelect", "N5", { force: true });
  await page.click("#startButton");
  await page.waitForFunction(() => document.querySelector("#questionLabel").textContent === "Question 1");
  assert.equal(await page.locator("#meta").evaluate((node) => node.previousElementSibling.id), "word");
  assert.equal(await page.locator("#word > .study-romaji").count(), 1);
  assert.equal(await page.locator("#word [data-study-speak], #restartButton").count(), 0);
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.locator(".option-key:visible").count(), 0);
  assert.equal(await page.locator(".quiz-shortcut:visible").count(), 0);
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.equal(await page.locator("#settingsPanel").evaluate((node) => node.open), false);
  assert.equal(await page.locator("#settingsPanel #showExampleToggle").count(), 0);
  assert.equal(await page.locator("label.switch-option.review-option #showExampleToggle").isVisible(), true);
  for (let number = 2; number <= 60; number++) {
    await page.click("#skipButton");
    await page.waitForFunction((n) => document.querySelector("#questionLabel").textContent === `Question ${n}`, number);
  }
  assert.equal(requests.filter((url) => url.includes("/words/batch")).length, 1, "60 Goi questions share a broad 100-word batch");
  assert.equal(await page.locator("#levelBadge").textContent(), "N5");
  await page.click("#settingsPanel summary");
  await page.selectOption("#levelSelect", "N1", { force: true });
  await page.click("#skipButton");
  assert.equal(await page.locator("#levelBadge").textContent(), "N5", "Level edits wait for the next quiz");
  await page.click("#stopSessionButton");
  await page.click("#startButton");
  await page.waitForFunction(() => document.querySelector("#levelBadge").textContent === "N1");
  assert.equal(requests.filter((url) => url.includes("/words/batch")).length, 2);
  await page.click("#showButton");
  await page.waitForSelector("#feedback .feedback-section");
  assert.equal(await page.locator("#nextButton").evaluate((node) =>
    Boolean(node.compareDocumentPosition(document.querySelector("#feedback")) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
  assert.equal(await page.locator("#example").isVisible(), false, "Examples should not be duplicated outside feedback");
  assert.equal(await page.locator("#sessionStats #sessionType").count(), 1);
  await page.uncheck("#showStatsToggle");
  await page.click("#stopSessionButton");
  await page.waitForSelector("#resultsPanel");
  assert.equal(await page.locator("#questionContent").isVisible(), false);
  assert.equal(await page.locator("#settingsPanel").evaluate((node) => node.open), true);
  assert.ok((await page.locator("#resultsSummary").textContent()).includes("Session stopped."));
  assert.equal(await page.locator("#startButton").isVisible(), true);

  const beforeKana = requests.filter((url) => url.includes("/kanji/batch")).length;
  await beginPractice("仮名.html");
  assert.equal(await page.locator("#levelSelect, #reviewKanjiToggle, #setHiragana, #setKatakana").count(), 0);
  await page.evaluate(() => { Math.random = () => 0; });
  await page.click("#skipButton");
  assert.equal(await page.locator("#typeTag").textContent(), "hiragana → romaji");
  await page.evaluate(() => { Math.random = () => 0.99; });
  await page.click("#skipButton");
  assert.equal(await page.locator("#typeTag").textContent(), "katakana → romaji");
  await page.click("#stopSessionButton");
  await page.waitForSelector("#sessionResults");
  assert.equal(await page.locator("#questionSection").isVisible(), false);
  assert.equal(await page.locator("#settingsPanel").evaluate((node) => node.open), true);
  await page.click("#startSessionButton");
  assert.equal(await page.locator("#stopSessionButton").isVisible(), true);
  assert.equal(requests.filter((url) => url.includes("/kanji/batch")).length, beforeKana);
  await page.setViewportSize({ width: 375, height: 480 });
  await page.evaluate(() => { Math.random = () => 0; });
  await page.click("#skipButton");
  assert.ok((await page.locator("#sessionStats").boundingBox()).height <= 300, "Mobile stats should remain compact");
  assert.equal((await page.locator(".kana-feedback-slot").boundingBox()).height, 36);
  await page.fill("#answerInput", "wrong");
  await page.locator("#glyph").evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
  const position = () => page.evaluate(() => ({
    term: document.querySelector("#glyph").getBoundingClientRect().top + scrollY,
    scroll: scrollY
  }));
  const beforeWrong = await position();
  await page.press("#answerInput", "Enter");
  assert.match(await page.locator("#feedback").textContent(), /^Answer: .+ · Enter to continue$/);
  assert.deepEqual(await position(), beforeWrong, "Wrong feedback must not shift the term or scroll position");
  const feedbackBounds = await page.locator("#feedback").boundingBox();
  const glyphBounds = await page.locator("#glyph").boundingBox();
  assert.ok(feedbackBounds.y >= 0 && feedbackBounds.y + feedbackBounds.height <= glyphBounds.y);
  await page.press("#answerInput", "Enter");
  assert.equal(await page.locator("#feedback").isVisible(), false);
  assert.deepEqual(await position(), beforeWrong, "Clearing feedback must preserve the reserved space");
  await page.click("#showButton");
  const expectedKana = (await page.locator("#promptText").textContent()).replace("Answer: ", "");
  assert.equal(await page.locator("#feedback").isVisible(), false);
  await page.click("#skipButton");
  await page.fill("#answerInput", expectedKana);
  await page.press("#answerInput", "Enter");
  assert.equal(await page.locator("#feedback").isVisible(), false, "Correct Kana answers need no feedback banner");
  await page.setViewportSize({ width: 1280, height: 720 });

  await go("仮名.html");
  await page.evaluate(() => {
    Math.random = () => 0;
    window.spokenJapanese = [];
    speechSynthesis.speak = (utterance) => window.spokenJapanese.push(utterance.text);
  });
  await page.click("#startSessionButton");
  await page.click("#settingsPanel summary");
  const directions = [
    ["hiragana-romaji", "あ", "hiragana", "a"],
    ["katakana-romaji", "ア", "katakana", "a"],
    ["to-romaji", "あ", "hiragana", "a"],
    ["romaji-hiragana", "a", "hiragana", "あ"],
    ["romaji-katakana", "a", "katakana", "ア"],
    ["to-kana", "a", "hiragana", "あ"],
    ["romaji-any", "a", null, "ア"]
  ];
  const glyphHeight = (await page.locator("#glyph").boundingBox()).height;
  async function restartPractice() {
    await page.click("#stopSessionButton");
    await page.click("#startSessionButton");
    await page.waitForFunction(() => !document.querySelector("#checkButton").disabled);
    await page.click("#settingsPanel summary");
  }
  for (const [direction, term, script, answer] of directions) {
    await page.selectOption("#kanaDirection", direction, { force: true });
    await restartPractice();
    assert.equal(await page.locator("#glyph").textContent(), term);
    assert.equal((await page.locator("#glyph").boundingBox()).height, glyphHeight);
    assert.equal(await page.locator("#typeTag").isVisible(), script !== null);
    if (script) assert.equal(await page.locator("#typeTag").textContent(), direction.endsWith("romaji") ? `${script} → romaji` : script);
    assert.equal(await page.locator("#promptAudio button").count(), 0);
    await page.fill("#answerInput", answer);
    await page.click("#checkButton");
    assert.equal(await page.locator("#feedback").getAttribute("class"), "feedback correct", direction);
  }
  assert.equal((await page.evaluate(() => window.spokenJapanese)).length, directions.length);
  for (const invalid of ["xa", "a!", "a/", "a a", "あ"]) {
    await page.selectOption("#kanaDirection", "hiragana-romaji", { force: true });
    await restartPractice();
    await page.click("#skipButton");
    await page.fill("#answerInput", invalid);
    await page.click("#checkButton");
    assert.equal(await page.locator("#feedback").getAttribute("class"), "feedback incorrect", invalid);
  }
  for (const [direction, wrongScript] of [["romaji-hiragana", "ア"], ["romaji-katakana", "あ"]]) {
    await page.selectOption("#kanaDirection", direction, { force: true });
    await restartPractice();
    await page.fill("#answerInput", wrongScript);
    await page.click("#checkButton");
    assert.equal(await page.locator("#feedback").getAttribute("class"), "feedback incorrect");
  }
  const samples = await page.evaluate(() => {
    const result = [];
    for (const direction of ["romaji-hiragana", "romaji-katakana", "hiragana-romaji", "katakana-romaji"]) {
      const select = document.querySelector("#kanaDirection");
      select.value = direction;
      select.dispatchEvent(new Event("change"));
      document.querySelector("#stopSessionButton").click();
      document.querySelector("#startSessionButton").click();
      for (let i = 0; i < 250; i++) {
        Math.random = () => i / 250;
        document.querySelector("#skipButton").click();
        result.push([direction, document.querySelector("#glyph").textContent]);
      }
    }
    return result;
  });
  for (const [direction, term] of samples) {
    if (direction.startsWith("romaji-")) assert.match(term, /^(?:[aeioun]|[kstnhmyrwgzdbpf][aeiou]|sh[aiuo]|ch[aiuo]|tsu|[kgnhmrbp]y[auo]|j[aiuo])$/);
    else assert.match(term, direction.startsWith("hiragana") ? /^[ぁ-ゖ]+$/u : /^[ァ-ヶ]+$/u);
    assert.doesNotMatch(term, /^[xl]/);
    assert.ok(!["ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "っ", "ゃ", "ゅ", "ょ", "ァ", "ッ", "ヵ", "ヶ"].includes(term));
  }

  await beginPractice("意味.html");
  await page.waitForFunction(() => document.querySelector("#typeTag").textContent.startsWith("kanji"));
  assert.equal(await page.locator("#settingsPanel").evaluate((element) => Boolean(element.closest(".quiz-card"))), true);
  assert.equal(await page.locator("#sessionStats #sessionMode").count(), 1);
  assert.equal(await page.locator("#settingsPanel #sessionMode, #setKanjiMeaning").count(), 0);
  for (let i = 0; i < 59; i++) {
    const previous = await page.locator("#questionCount").textContent();
    await page.click("#skipButton");
    await page.waitForFunction((old) => {
      const label = document.querySelector("#questionCount").textContent;
      return label.startsWith("Question ") && label !== old;
    }, previous);
  }
  assert.equal(requests.filter((url) => url.includes("/kanji/batch")).length, 2, "Imi should consume buffered batches");
  await page.click("#showButton");
  for (const title of ["Meanings", "On-yomi", "Kun-yomi", "Strokes", "JLPT"]) {
    assert.equal(await page.locator("#feedback dt", { hasText: title }).count(), 1);
  }
  const daily = await (await fetch(`${process.env.VITE_API_BASE_URL}/api/kanji/${encodeURIComponent("日")}`)).json();
  const mojiBatch = "**/api/kanji/batch?*";
  await page.route(mojiBatch, (route) => route.fulfill({
    status: 200, contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:5179" },
    body: JSON.stringify({ items: Array.from({ length: 40 }, (_, i) => ({ ...daily, id: i })) })
  }));
  await go("意味.html");
  await page.check("#reviewKanjiToggle");
  await page.click("#startSessionButton");
  await page.waitForFunction(() => document.querySelector("#glyph").textContent === "日");
  await page.fill("#answerInput", "incorrect-answer");
  await page.click("#checkButton");
  await page.waitForSelector("#feedback.incorrect .example-word-list");
  assert.equal(await page.locator(".prompt [data-study-speak]").count(), 0);
  assert.equal(await page.locator("#feedback dt", { hasText: "Meanings" }).count(), 1);
  await page.click("#nextButton");
  await page.fill("#answerInput", "day");
  await page.click("#checkButton");
  await page.waitForSelector("#feedback.correct .example-word-list");
  assert.equal(await page.locator("#feedback dt", { hasText: "Meanings" }).count(), 1);
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.unroute(mojiBatch);

  for (const file of ["意味.html", "読み.html"]) {
    await beginPractice(file);
    for (const level of ["5", "4", "3", "2", "1", "unrated"]) {
      await page.selectOption("#levelSelect", level, { force: true });
      await restartPractice();
      const label = level === "unrated" ? "Non-JLPT" : `N${level}`;
      await page.waitForFunction((expected) => document.querySelector("#typeTag").textContent.endsWith(expected), label);
      assert.ok(requests.some((url) => url.includes("/kanji/batch") && new URL(url).searchParams.get("level") === level));
    }
    await page.selectOption("#levelSelect", "all", { force: true });
    await page.waitForFunction(() => !document.querySelector("#checkButton").disabled);
    await page.selectOption("#sessionMode", "questions", { force: true });
    await page.fill("#sessionTarget", "4");
    await page.click("#stopSessionButton");
    await page.click("#startSessionButton");
    await page.waitForFunction(() => !document.querySelector("#checkButton").disabled);
    await page.uncheck("#showStatsToggle");
    await page.click("#stopSessionButton");
    await page.waitForSelector("#sessionResults");
    assert.ok((await page.locator("#sessionResults").textContent()).includes("Session stopped."));
    assert.equal(await page.locator("#questionSection").isVisible(), false);
    assert.equal(await page.locator("#settingsPanel").evaluate((node) => node.open), true);
    assert.equal(await page.locator("#stopSessionButton").isVisible(), false);
    await page.selectOption("#sessionMode", "timed", { force: true });
    await page.click("#startSessionButton");
    await page.click("#stopSessionButton");
    await page.waitForSelector("#sessionResults");
    assert.equal(await page.locator("#answerInput").isDisabled(), true);
  }

  await go("読み.html");
  await page.selectOption("#readingDirection", "reading-hiragana", { force: true });
  await page.check("#reviewKanjiToggle");
  await page.click("#startSessionButton");
  await page.waitForFunction(() => !document.querySelector("#checkButton").disabled);
  assert.ok((await page.locator("#typeTag").textContent()).includes("reading"));
  await page.click("#showButton");
  assert.ok((await page.locator("#feedback").textContent()).includes("On-yomi"));

  await go("語彙.html");
  await page.selectOption("#sessionType", "questions", { force: true });
  await page.fill("#questionLimit", "4");
  await page.click("#startButton");
  await page.waitForFunction(() => !document.querySelector("#skipButton").disabled);
  await page.click("#stopSessionButton");
  assert.ok((await page.locator("#resultsSummary").textContent()).includes("Session stopped."));
  assert.ok(!(await page.locator("#resultsSummary").textContent()).includes("completed all"));
  await page.selectOption("#sessionType", "time", { force: true });
  await page.click("#startButton");
  await page.click("#stopSessionButton");
  await page.waitForSelector("#resultsPanel");

  for (const file of ["意味.html", "読み.html", "語彙.html"]) {
    const vocabulary = file === "語彙.html";
    const pattern = vocabulary ? "**/api/words/batch?*" : mojiBatch;
    const resultSelector = vocabulary ? "#resultsPanel" : "#sessionResults";
    const startSelector = vocabulary ? "#startButton" : "#startSessionButton";
    const requested = Promise.withResolvers();
    const release = Promise.withResolvers();
    await page.route(pattern, async (route) => {
      requested.resolve();
      await release.promise;
      await route.continue();
    });
    await go(file);
    await page.click(startSelector);
    await requested.promise;
    await page.click("#stopSessionButton");
    await page.waitForSelector(resultSelector);
    const result = await page.locator(resultSelector).textContent();
    const response = page.waitForResponse((res) => res.url().includes(vocabulary ? "/words/batch" : "/kanji/batch"));
    release.resolve();
    await response;
    assert.equal(await page.locator(resultSelector).textContent(), result, "Late responses must not replace stopped results");
    await page.waitForFunction((selector) => !document.querySelector(selector).disabled, startSelector);
    await page.click(startSelector);
    await page.waitForFunction(() => !document.querySelector("#checkButton").disabled);
    assert.equal(await page.locator(resultSelector).isVisible(), false);
    await page.unroute(pattern);
  }

  await go("index.html");
  assert.equal(await page.title(), "日本道具 · NihonTools");

  await go("漢字地図帳.html");
  await page.fill("#query", "日");
  await page.click("#searchButton");
  await page.waitForSelector("#strokeOrderButton");
  await page.click("#strokeOrderButton");
  await page.waitForSelector(".hero-strokes path");
  assert.ok(await page.locator(".compound").count() > 0);
  assert.ok(await page.locator(".example-word-list li").count() > 0);
  assert.ok(await page.locator("#kanjiSentences .sentence-item").count() > 0);
  for (const reading of ["ニチ", "ジツ"]) assert.ok((await page.locator(".detail-grid").textContent()).includes(reading));
  await page.fill("#query", "本");
  await page.click("#searchButton");
  await page.waitForFunction(() => document.querySelector(".hero-kanji-character")?.textContent === "本");
  const honDetail = await page.locator(".detail-grid").textContent();
  assert.match(honDetail, /木.*き・きへん.*tree \/ wood.*Radical #75/);
  assert.match(honDetail, /丨.*ぼう.*vertical stroke.*Nelson #2/);
  assert.match(honDetail, /Components · 構成要素/);
  await page.fill("#query", "生");
  await page.click("#searchButton");
  await page.waitForFunction(() => document.querySelector(".hero-kanji-character")?.textContent === "生");
  const detail = await page.locator(".detail-grid").textContent();
  for (const reading of ["セイ", "ショウ", "い.きる", "う.まれる", "む.す", "-う"]) assert.ok(detail.includes(reading), reading);
  await page.fill("#query", "N5");
  await page.click("#searchButton");
  await page.waitForSelector(".result-card");
  assert.equal(await page.locator(".result-card").count(), 84);

  await go("言葉.html");
  assert.equal(await page.locator("#exportButton").count(), 0);
  await page.check("#kanjiMode");
  await page.fill("#query", "water");
  await page.click("#searchButton");
  const noKanjiMsg = await page.locator(".empty-state").textContent();
  assert.match(noKanjiMsg, /No kanji found in your search/);
  assert.doesNotMatch(noKanjiMsg, /VITE_API_BASE_URL|backend|database/i);
  await page.fill("#query", "本");
  await page.click("#searchButton");
  await page.waitForSelector("#compoundList");
  assert.match(await page.locator("#kanjiRadicals").textContent(), /木.*き・きへん.*tree \/ wood.*Radical #75/);
  assert.match(await page.locator("#kanjiRadicals").textContent(), /丨.*ぼう.*vertical stroke.*Nelson #2/);
  assert.match(await page.locator("#kanjiComponents").textContent(), /木.*tree \/ wood/);
  assert.match(await page.locator("#kanjiComponents").textContent(), /丨.*vertical stroke/);
  const compoundReadings = await page.locator("#compoundList rt").allTextContents();
  assert.ok(compoundReadings.some((reading) => reading.includes("もと")), "本 compounds must include a moto reading");
  assert.ok(compoundReadings.some((reading) => reading.includes("ほん")));
  assert.ok(compoundReadings.some((reading) => reading.includes("ぽん")));
  assert.equal(await page.locator("#compoundList .history-mode").count(), 0, "No separate kana line");
  assert.equal(await page.locator("#compoundMeaning").isChecked(), true);
  assert.ok(await page.locator(".compound-examples .sentence-item").count() > 0);
  assert.ok(await page.locator(".compound-examples ruby").count() > 0);
  assert.ok(await page.locator(".compound-examples .example-empty").count() > 0);
  await page.waitForFunction(() => !document.querySelector("#results").textContent.includes("Looking for example sentences"));
  const sentenceText = await page.locator(".compound-examples .sentence-item").first().textContent();
  assert.ok(/[A-Za-z]/.test(await page.locator(".compound-examples .sentence-item > div:nth-child(2)").first().textContent()));
  const beforeOptions = requests.length;
  await page.uncheck("#compoundMeaning");
  assert.equal(await page.locator(".compound-meaning:visible").count(), 0);
  assert.equal(await page.locator(".compound-examples .sentence-item").first().textContent(), sentenceText);
  assert.equal(await page.locator(".compound-examples .sentence-item").first().isVisible(), true);
  await page.click("#romajiQuickToggle");
  assert.ok((await page.locator("#compoundList .study-romaji:visible").allTextContents()).some((value) => value.includes("moto")));
  await page.click("#furiganaQuickToggle");
  assert.equal(await page.locator("#compoundList rt:visible").count(), 0);
  assert.equal(requests.length, beforeOptions, "Display toggles should use loaded data");
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await page.check("#kanjiMode");
  await page.fill("#query", "本");
  await page.click("#searchButton");
  await page.waitForSelector("#compoundList");
  assert.equal(await page.locator("#furiganaQuickToggle").getAttribute("aria-pressed"), "false");
  assert.equal(await page.locator("#romajiQuickToggle").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("#compoundMeaning").isChecked(), false);
  await page.check("#compoundMeaning");
  assert.ok(await page.locator(".compound-meaning:visible").count() > 0);
  await page.click("#furiganaQuickToggle");
  await page.fill("#query", "日");
  await page.click("#searchButton");
  await page.waitForFunction(() => document.querySelector(".kanji-glyph")?.textContent === "日");
  assert.ok((await page.locator("#compoundList rt").allTextContents()).includes("きじつ"));
  assert.ok((await page.locator("#compoundList rt").allTextContents()).includes("きにち"));

  await go("言葉.html");
  await page.uncheck("#kanjiMode");
  await page.fill("#query", "日本");
  await page.click("#searchButton");
  await page.waitForSelector(".result-card");
  assert.ok((await page.locator(".result-card").first().textContent()).includes("日本"));
  await page.waitForSelector(".result-card .sentence-item");

  await go("文解き.html");
  assert.equal(await page.locator("#exportButton").count(), 0);
  assert.equal(await page.locator("#importButton").count(), 0);
  assert.doesNotMatch(await page.locator("body").textContent(), /SQLite|Node\.js/i);
  await page.fill("#sourceText", "ドイツ語はやさしい言語ではありません。");
  await page.click("#parseButton");
  await page.waitForFunction(() => document.querySelectorAll("#parsedText button").length === 7);
  assert.deepEqual(
    await page.locator("#parsedText button").evaluateAll((buttons) => buttons.map((button) => {
      const copy = button.cloneNode(true);
      copy.querySelectorAll("rt, .study-romaji").forEach((node) => node.remove());
      return copy.textContent;
    })),
    ["ドイツ語", "は", "やさしい", "言語", "で", "は", "ありません"]
  );
  assert.deepEqual(
    await page.locator("#parsedText .token.punctuation").allTextContents(),
    ["。"]
  );
  await page.check("#translationToggle");
  await page.waitForFunction(() => document.querySelector("#translationText")?.textContent.includes("German is not an easy language."));
  await page.locator("#parsedText button", { hasText: "ドイツ語" }).click();
  await page.waitForFunction(() => document.querySelector("#detailContent")?.textContent.includes("German (language)"));
  await page.locator("#parsedText button", { hasText: "やさしい" }).click();
  await page.waitForFunction(() => document.querySelector("#detailContent")?.textContent.includes("easy"));

  await page.fill("#sourceText", "日本");
  await page.click("#parseButton");
  await page.locator("#parsedText button").first().click();
  await page.waitForFunction(() => document.querySelector("#detailContent").textContent.includes("Japan"));
  await page.waitForSelector("#detailContent .sentence-item");

  const wordsRoute = "**/api/words?*";
  const analyzeRoute = "**/api/analyze?*";
  const sentencesRoute = "**/api/sentences?*";
  await page.route(wordsRoute, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    for (const item of payload.data) item.examples = [];
    await route.fulfill({ response, json: payload });
  });
  await page.route(analyzeRoute, async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    for (const token of payload.tokens || []) {
      if (token.result) token.result.examples = [];
      for (const item of token.results || []) item.examples = [];
    }
    await route.fulfill({ response, json: payload });
  });
  await page.route(sentencesRoute, (route) => route.fulfill({
    status: 200, contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:5179" },
    body: JSON.stringify({ data: [{ id: 123, text: "日本の例文です。", owner: "test-author",
      license: "CC BY 2.0 FR", translations: [{ id: 456, lang: "eng", text: "A fallback example.", owner: "test-translator" }] }] })
  }));
  await go("文解き.html");
  await page.fill("#sourceText", "日本");
  await page.click("#parseButton");
  await page.locator("#parsedText button").first().click();
  await page.waitForFunction(() => document.querySelector("#detailContent").textContent.includes("A fallback example."));
  assert.ok((await page.locator("#detailContent").textContent()).includes("test-translator"));
  await go("言葉.html");
  await page.evaluate(() => localStorage.clear());
  await go("言葉.html");
  await page.fill("#query", "日本");
  await page.click("#searchButton");
  await page.waitForFunction(() => document.querySelector(".result-card")?.textContent.includes("A fallback example."));
  await page.unroute(wordsRoute);
  await page.unroute(analyzeRoute);
  await page.unroute(sentencesRoute);

  await go("語彙.html");
  const blocked = "**/api/words/batch?*";
  await page.route(blocked, (route) => route.fulfill({
    status: 503,
    headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:5179", "Content-Type": "application/json" },
    body: JSON.stringify({ error: "Test outage" })
  }));
  await page.click("#startButton");
  await page.waitForFunction(() => document.querySelector("#warning").textContent.includes("Test outage"));
  await page.unroute(blocked);
  await page.click("#startButton");
  await page.waitForFunction(() => document.querySelector("#questionLabel").textContent === "Question 1");

  await go("index.html");
  await page.click("#menuButton");
  assert.equal(await page.locator(".helper-link").count(), 14);
  for (const item of await page.locator(".helper-link").all()) {
    const description = await item.locator(".helper-description").textContent();
    assert.match(description, /^\(.+\)$/);
    assert.ok(description.slice(1, -1).split(/\s+/).length <= 6);
    assert.equal(await item.locator(".helper-icon").count(), 1);
    assert.equal(await item.evaluate((node) => getComputedStyle(node).textAlign), "center");
  }
  await page.click('[data-file="しりとり.html"]');
  await page.frameLocator("#helperFrame").locator("#newGame").waitFor();
  await page.click("#menuButton");
  await page.click('[data-file="語彙.html"]');
  await page.frameLocator("#helperFrame").locator("#startButton").waitFor();

  await go("パズル.html");
  await page.click("#newPuzzleBtn");
  await page.waitForSelector("#crosswordGrid .cw-cell:not(.block)");
  assert.equal(await page.locator(".cw-clue-item.active .cw-clue-selected").isVisible(), true);
  assert.equal(await page.locator(".cw-clue-item.active .cw-clue-unanswered").isVisible(), true);
  assert.ok(await page.locator("#acrossClueList .cw-clue-item").count() >= 1);
  assert.ok(await page.locator("#downClueList .cw-clue-item").count() >= 1);
  assert.equal(await page.locator("#appearanceSelect").count(), 0, "Appearance select should be removed from settings");
  assert.equal(await page.locator("#furiganaToggle").count(), 0, "Furigana toggle should be removed from settings");
  assert.equal(await page.locator("#romajiToggle").count(), 0, "Romaji toggle should be removed from settings");
  assert.equal(await page.locator("#audioToggle").count(), 0, "Audio toggle should be removed from settings");
  assert.equal(await page.locator('.cw-mode-pill[data-mode="mistakeReview"]').count(), 0, "Mistake Review mode should be removed");
  assert.equal(await page.locator("#practiceMistakesBtn").count(), 0, "Practice Mistake Review button should be removed");
  assert.equal(await page.locator("#resetProgressBtn").textContent(), "Reset stats", "Reset button should be named Reset stats");

  // 1. Default input style is "popup" ("Clue popup"): clicking a grid square opens the popup with textbox + Reveal square/word buttons
  const firstActiveCell = page.locator("#crosswordGrid .cw-cell.is-active");
  await firstActiveCell.click();
  await page.waitForSelector("#gridCluePopover:not([hidden])");
  assert.ok((await page.locator("#gridCluePopover").textContent()).includes("Clue:"));
  assert.ok((await page.locator("#gridCluePopover").textContent()).includes("Length:"));
  assert.equal(await page.locator("#popoverAnswerInput").inputValue(), "", "Popover input must not be prefilled");
  assert.equal(await page.locator('#gridCluePopover [data-popover-action="revealSquare"]').count(), 1, "Reveal square button in popup");
  assert.equal(await page.locator('#gridCluePopover [data-popover-action="revealWord"]').count(), 1, "Reveal word button in popup");
  assert.equal(await page.locator(".cw-clue-inline-input").count(), 0, "Clue list textboxes hidden in Clue popup mode");
  assert.equal(await page.locator('#gridCluePopover [data-popover-action="save"], #gridCluePopover [data-popover-action="clear"], #checkWordBtn').count(), 0);
  assert.equal(await page.locator('#gridCluePopover [data-popover-action="close"]').count(), 1);
  assert.equal(await page.locator('#gridCluePopover [data-popover-action="check"]').count(), 1);
  assert.equal(await page.locator("#flipDirBtn").isVisible(), await page.locator(".cw-cell.is-active").evaluate((node) => node.classList.contains("is-intersecting")));

  // Submitting a too-short answer in the popover shows 'Answer not long enough'
  await page.fill("#popoverAnswerInput", "あ");
  await page.press("#popoverAnswerInput", "Enter");
  assert.equal(await page.locator("#popoverErrorMsg").textContent(), "Answer not long enough");

  // 2. Switch to "In-square" ("cell") input style: square-by-square auto-advance + popup without textbox, with Reveal square/word buttons
  await page.click("#settingsDrawer summary");
  await page.selectOption("#inputStyleSelect", "cell", { force: true });
  assert.equal(await page.locator("#popoverAnswerInput").count(), 1, "Input-style changes do not replace the active puzzle");
  async function newCrossword() {
    await page.click("#newPuzzleBtn");
    await page.waitForFunction(() => document.querySelector("#feedbackBanner").hidden);
    await page.waitForSelector("#crosswordGrid .cw-cell:not(.block)");
  }
  await newCrossword();
  await page.locator("#crosswordGrid .cw-cell.is-active").click();
  await page.waitForSelector("#gridCluePopover:not([hidden])");
  assert.equal(await page.locator("#popoverAnswerInput").count(), 0, "No textbox in popup during In-square mode");
  assert.equal(await page.locator('#gridCluePopover [data-popover-action="revealSquare"]').count(), 1);
  assert.equal(await page.locator('#gridCluePopover [data-popover-action="revealWord"]').count(), 1);

  const startCoord = await page.evaluate(() => {
    const el = document.querySelector("#crosswordGrid .cw-cell.is-active");
    return `${el.dataset.row},${el.dataset.col}`;
  });
  await page.locator("#crosswordGrid .cw-cell.is-active .cw-cell-input").fill("あ");
  const nextCoord = await page.evaluate(() => {
    const el = document.querySelector("#crosswordGrid .cw-cell.is-active");
    return `${el.dataset.row},${el.dataset.col}`;
  });
  assert.notEqual(nextCoord, startCoord, "Filling a square in In-square mode must automatically focus the next empty square");

  // 3. Switch to "Clue list textboxes" ("clues") input style: clicking cell does NOT open popup; clue items have textbox + Reveal square/word buttons
  await page.selectOption("#inputStyleSelect", "clues", { force: true });
  await newCrossword();
  assert.equal(await page.locator("#gridCluePopover").isVisible(), false, "Popup must be hidden in Clue list textboxes mode");
  await page.locator("#crosswordGrid .cw-cell.is-active").click();
  assert.equal(await page.locator("#gridCluePopover").isVisible(), false, "Clicking a cell must not trigger popup in Clue list textboxes mode");
  assert.ok(await page.locator(".cw-clue-inline-input").count() >= 2, "Each clue item should have an inline text input");
  assert.ok(await page.locator("[data-clue-reveal-sq-id]").count() >= 2, "Each clue item should have Reveal square button");
  assert.ok(await page.locator("[data-clue-reveal-word-id]").count() >= 2, "Each clue item should have Reveal word button");
  assert.ok(await page.locator("[data-clue-check-id]").count() >= 2);
  assert.equal(await page.locator("[data-clue-save-id], [data-clue-clear-id]").count(), 0);
  assert.equal(await page.locator(".cw-clue-item.active .cw-clue-inline-input").inputValue(), "", "Textboxes must not prefill grid letters");

  for (const inputStyle of ["clues", "popup", "cell"]) {
    if (inputStyle !== "clues") {
      await page.selectOption("#inputStyleSelect", inputStyle, { force: true });
      await newCrossword();
    }
    const intersectionCell = await page.locator(".cw-cell:not(.block)").evaluateAll((nodes) => {
      const coords = new Set(nodes.map((node) => `${node.dataset.row},${node.dataset.col}`));
      const node = nodes.find((node) => {
        const row = Number(node.dataset.row), col = Number(node.dataset.col);
        return (coords.has(`${row - 1},${col}`) || coords.has(`${row + 1},${col}`))
          && (coords.has(`${row},${col - 1}`) || coords.has(`${row},${col + 1}`));
      });
      return { row: node.dataset.row, col: node.dataset.col };
    });
    await page.locator(`.cw-cell[data-row="${intersectionCell.row}"][data-col="${intersectionCell.col}"]`).click();
    const crossing = await page.locator(".cw-cell.in-active-word.is-intersecting").first().evaluate((node) =>
      ({ row: node.dataset.row, col: node.dataset.col }));
    await page.locator(inputStyle === "clues" ? ".cw-clue-item.active [data-clue-reveal-word-id]" : '[data-popover-action="revealWord"]').click();
    await page.waitForSelector("#completedWordCard");
    assert.ok(await page.locator(".cw-clue-item.completed .cw-clue-solved:visible").count() > 0);
    assert.equal(await page.locator(".cw-clue-item.completed .cw-clue-unanswered").count(), 0);
    assert.ok((await page.locator("#completedWordCard").textContent()).includes("Definition:"));
    const sharedCell = page.locator(`.cw-cell[data-row="${crossing.row}"][data-col="${crossing.col}"]`);
    const protectedCharacter = await sharedCell.getAttribute("data-char");
    await sharedCell.click();
    if (inputStyle === "cell") {
      await sharedCell.press("Backspace");
    } else {
      const crossingInput = page.locator(inputStyle === "clues" ? ".cw-clue-item.active .cw-clue-inline-input" : "#popoverAnswerInput");
      if (!await crossingInput.count()) await page.click("#flipDirBtn");
      assert.equal(await crossingInput.inputValue(), "", "Crossing solved words must not prefill the textbox");
      await crossingInput.fill("あいう");
      await crossingInput.selectText();
      await crossingInput.press("Backspace");
    }
    assert.equal(await sharedCell.getAttribute("data-char"), protectedCharacter, `${inputStyle}: deleting a crossing answer preserves solved characters`);
  }

  // Switch back to Clue popup mode and verify Reveal word in popup
  await page.selectOption("#inputStyleSelect", "popup", { force: true });
  await page.selectOption("#levelSelect", "5-4", { force: true });
  await page.selectOption("#answerModeSelect", "kanji", { force: true });
  await newCrossword();
  await page.waitForFunction(() => document.querySelector("#statWordsRevealed")?.textContent === "0");
  assert.equal(await page.locator("#statWordsRevealed").textContent(), "0", "Stats should reset each time a new crossword starts");
  await page.waitForSelector("#crosswordGrid .cw-cell:not(.block)");
  await page.locator("#crosswordGrid .cw-cell.is-active").click();
  await page.waitForSelector("#gridCluePopover:not([hidden])");
  await page.click('#gridCluePopover [data-popover-action="revealWord"]');
  await page.waitForSelector("#completedWordCard");
  assert.equal(await page.locator("#statWordsRevealed").textContent(), "1", "Stats track current crossword words revealed");

  // 4. Verify Sudden Death mode immediately ends the round when a wrong answer is saved in the popup
  await page.click('.cw-mode-pill[data-mode="suddenDeath"]');
  await newCrossword();
  await page.waitForSelector("#crosswordGrid .cw-cell:not(.block)");
  await page.locator("#crosswordGrid .cw-cell.is-active").click();
  await page.waitForSelector("#gridCluePopover:not([hidden])");
  const sdLen = await page.evaluate(() => {
    const label = document.querySelector(".cw-popover-length-label")?.textContent || "";
    const m = label.match(/Length:\s*(\d+)/);
    return m ? Number(m[1]) : 2;
  });
  await page.fill("#popoverAnswerInput", "ゐ".repeat(sdLen));
  await page.press("#popoverAnswerInput", "Enter");
  await page.waitForSelector("#feedbackBanner:not([hidden])");
  assert.match(await page.locator("#feedbackBanner").textContent(), /Sudden Death/i);
  assert.equal(await page.locator("#revealPuzzleBtn").isDisabled(), true, "Round should end immediately in Sudden Death mode");
  await page.evaluate(() => localStorage.setItem("nihon:last-helper", "文字.html"));
  await go("index.html");
  await page.frameLocator("#helperFrame").locator("#kanaDirection").waitFor({ state: "attached" });
  assert.equal(await page.evaluate(() => localStorage.getItem("nihon:last-helper")), "仮名.html");
  await go("文字.html");
  await page.waitForURL(/%E4%BB%AE%E5%90%8D\.html/);
  await page.waitForSelector("#startSessionButton");
  await page.selectOption("#sessionMode", "questions", { force: true });
  await page.fill("#sessionTarget", "1");
  await page.click("#startSessionButton");
  await page.click("#skipButton");
  await page.waitForSelector("#sessionResults");
  assert.ok((await page.locator("#sessionResults").textContent()).includes("Question goal reached."));
  await page.clock.install();
  await page.selectOption("#sessionMode", "timed", { force: true });
  await page.fill("#sessionTarget", "1");
  await page.click("#startSessionButton");
  await page.clock.fastForward(60001);
  await page.waitForSelector("#sessionResults");
  assert.ok((await page.locator("#sessionResults").textContent()).includes("Time is up."));
  for (const file of ["仮名.html", "意味.html", "読み.html", "語彙.html", "index.html"]) {
    await page.setViewportSize({ width: 375, height: 812 });
    await go(file);
    if (["仮名.html", "意味.html", "読み.html"].includes(file)) {
      assert.equal(await page.locator("#questionSection").isVisible(), false);
      await page.selectOption("#sessionMode", "free", { force: true });
      await page.click("#startSessionButton");
      assert.equal(await page.locator("#settingsPanel").evaluate((node) => node.open), false);
      assert.ok((await page.locator("#sessionStats").boundingBox()).height <= 300, "Free-practice stats stay compact on mobile");
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${file} must fit mobile width`);
  }
  const tools = ["仮名.html", "意味.html", "読み.html", "語彙.html", "言葉.html", "文解き.html", "漢字地図帳.html", "パズル.html"];
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    for (const file of tools) {
      await go(file);
      await page.waitForSelector(".study-toolbar");
      assert.equal(await page.locator('.study-support form[action="https://www.paypal.com/ncp/payment/BGUN4RBRVZKKJ"]').count(), 1);
      assert.equal(await page.locator(".study-support button").isVisible(), true, `${file} ${width}`);
      assert.equal(await page.locator("#audioQuickToggle").count(), 1);
      for (const id of ["furiganaQuickToggle", "romajiQuickToggle"]) {
        assert.equal(await page.locator(`#${id}`).isVisible(), file !== "仮名.html");
      }
      assert.equal(await page.locator("#compoundFurigana, #compoundRomaji, #furiganaToggle, #readingButton").count(), 0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth ? [] :
        [...document.querySelectorAll("body *")].filter((node) => node.getBoundingClientRect().right > innerWidth)
          .slice(0, 12).map((node) => `${node.tagName}.${node.className}: ${node.getBoundingClientRect().width}`));
      assert.deepEqual(overflow, [], `${file} fits ${width}px`);
      const before = await page.locator("#audioQuickToggle").getAttribute("aria-pressed");
      await page.click("#audioQuickToggle");
      assert.equal(await page.locator("#audioQuickToggle").getAttribute("aria-pressed"), String(before !== "true"));
      await page.click("#audioQuickToggle");
      const theme = page.locator(".study-theme");
      const icon = await theme.getAttribute("data-icon");
      assert.ok(["☼", "☾"].includes(icon));
      await theme.click();
      await page.waitForFunction((previous) => document.querySelector(".study-theme").dataset.icon !== previous, icon);
      assert.equal(await theme.evaluate((button) => getComputedStyle(button, "::after").content), `"${icon === "☼" ? "☾" : "☼"}"`);
      const bounds = await page.locator(".study-toolbar").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    }
  }
  await go("言葉.html");
  const preference = await page.locator("#romajiQuickToggle").getAttribute("aria-pressed");
  await page.click("#romajiQuickToggle");
  await go("文解き.html");
  assert.equal(await page.locator("#romajiQuickToggle").getAttribute("aria-pressed"), String(preference !== "true"));
  await page.fill("#sourceText", "食べました。");
  await page.click("#parseButton");
  await page.waitForSelector("#sentenceSpeech button");
  assert.equal(await page.locator("#parsedText rt").textContent(), "た");
  await page.locator("#parsedText button").first().click();
  assert.equal(await page.locator("#parsedText rt").textContent(), "た", "Lookup must not replace an inflected surface reading with its lemma reading");
  await page.evaluate(() => {
    window.spokenJapanese = [];
    speechSynthesis.speak = (utterance) => window.spokenJapanese.push([utterance.text, utterance.lang]);
  });
  if (await page.locator("#audioQuickToggle").getAttribute("aria-pressed") !== "true") await page.click("#audioQuickToggle");
  await page.click("#sentenceSpeech button");
  assert.deepEqual(await page.evaluate(() => window.spokenJapanese), [["食べました。", "ja-JP"]]);
  await page.click("#audioQuickToggle");
  assert.equal(await page.locator("#sentenceSpeech button").isVisible(), false);
  await page.route("**/api/analyze?*", (route) => route.fulfill({
    status: 503, contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:5179" },
    body: JSON.stringify({ error: "Unavailable" })
  }));
  await page.fill("#sourceText", "猫がいます。");
  await page.click("#parseButton");
  await page.waitForFunction(() => document.querySelector("#status").classList.contains("error"));
  assert.equal(await page.locator("#parsedText button").count(), 0, "Analysis failures must not show guessed splits");
  await page.unroute("**/api/analyze?*");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    await go("index.html");
    for (const file of tools) {
      await page.click("#menuButton");
      await page.click(`[data-file="${file}"]`);
      const frame = page.frameLocator("#helperFrame");
      await frame.locator(".study-toolbar").waitFor();
      await page.waitForTimeout(400);
      const menu = await page.locator("#menuButton").boundingBox();
      for (const selector of [".study-toolbar", ".study-theme", ".brand, .cw-brand"]) {
        const target = await frame.locator(selector).boundingBox();
        assert.ok(menu.x + menu.width <= target.x || target.x + target.width <= menu.x
          || menu.y + menu.height <= target.y || target.y + target.height <= menu.y,
        `${file}: navigation must not overlap ${selector} at ${width}px`);
      }
    }
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("Browser checks passed: split tools, batching, JLPT isolation, stop/restart, late responses, session completion, examples, navigation, mobile layout, and outage recovery.");
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}
