import assert from "node:assert/strict";
import { toolPage } from "./tool-page.mjs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

process.env.VITE_API_BASE_URL = "http://127.0.0.1:5199";
let vite, browser;
try {
  vite = await createServer({
    root: fileURLToPath(new URL("../frontend", import.meta.url)),
    server: { host: "127.0.0.1", port: 5197, strictPort: false }
  });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(() => { Math.random = () => 0; });
  await context.route("**/*", (route) => {
    if (route.request().url().includes("/api/kanji/")) {
      if (route.request().url().includes("/words")) return route.fulfill({ json: { items: [{
        japanese: [{ word: "食事", reading: "しょくじ" }], senses: [{ english_definitions: ["meal"] }]
      }] } });
      return route.fulfill({ json: { meanings: ["eat"], on_readings: ["ショク"], kun_readings: ["た.べる"] } });
    }
    return new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
  const page = toolPage(await context.newPage());
  const errors = [];
  const writtenText = (selector) => page.locator(selector).evaluate((element) => {
    const copy = element.cloneNode(true);
    copy.querySelectorAll("rt, .study-romaji, .base-reading").forEach((node) => node.remove());
    return copy.textContent;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const url = `${base}/活用練習.html`;
  const storageKey = "nihon:conjugation-practice-v1";
  async function configure(settings) {
    await page.goto(url);
    await page.evaluate(({ key, settings }) => {
      localStorage.setItem(key, JSON.stringify({ settings, progress: {}, days: [], completed: 0 }));
    }, { key: storageKey, settings: { types: ["ichidan"], forms: ["te"], levels: [5], questions: 5, language: "both", ...settings } });
    await page.reload();
  }
  async function answer(text) {
    await page.fill("#answerInput", text);
    await page.press("#answerInput", "Enter");
  }
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  async function endSession() {
    await page.click("#endButton");
    await page.locator(".study-confirm-dialog button").last().click();
    await page.locator("#results").waitFor();
  }
  async function assertDisplayFirst(activeSection) {
    assert.equal(await page.locator("#practiceDisplay").isVisible(), true);
    assert.deepEqual(await page.locator("#practiceDisplay").evaluate((panel) =>
      [...panel.parentElement.children].map((element) => element.id)), ["practiceDisplay", "setup", "practice", "results"]);
    assert.equal(await page.locator(`#${activeSection}`).isVisible(), true);
    assert.ok(await page.locator("#practiceDisplay").evaluate((panel, active) =>
      panel.getBoundingClientRect().bottom <= document.getElementById(active).getBoundingClientRect().top, activeSection),
    `Display controls stay above ${activeSection}`);
  }

  await configure({ mode: "classic", questions: 5, script: "both", kanji: false });
  assert.equal(await page.locator("#setting-script").count(), 0, "Shared Furigana replaces the local display override");
  assert.equal(await page.locator("#displayPanel, #setting-appearance, #setting-furigana, #setting-romaji, #setting-audio, #setting-kanji").count(), 0);
  assert.equal(await page.locator("#practiceDisplay select").count(), 2);
  await assertDisplayFirst("setup");
  await page.click("#settingsPanel > summary");
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.locator("#formSettings").evaluate((fieldset) => {
      const last = fieldset.lastElementChild.getBoundingClientRect();
      const bounds = fieldset.getBoundingClientRect();
      return fieldset.scrollHeight <= fieldset.clientHeight + 1 && last.bottom <= bounds.bottom && last.right <= bounds.right;
    }), `All conjugation forms fit without an inner scrollbar at ${width}px`);
  }
  await page.click("#startButton");
  await assertDisplayFirst("practice");
  assert.equal(await page.textContent("#answerLabel"), "答え · Your answer");
  assert.match(await page.textContent(".requested-form"), /て形.*Te-form/);
  await page.fill("#answerInput", "たべ");
  await page.click("#furiganaQuickToggle");
  assert.equal(await writtenText(".base-word").then((text) => text.includes("食")), true, "Furigana does not replace the written word");
  await page.selectOption("#setting-fontSize", "48");
  assert.equal(await page.inputValue("#answerInput"), "たべ", "Display changes preserve the answer in progress");
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--jp-size")), "40px");
  assert.equal(await page.textContent("#questionCount"), "Question 1 / 5");
  await page.click("#furiganaQuickToggle");
  await page.fill("#answerInput", "");
  assert.ok(await page.locator(".base-word").evaluate((element) => element.getBoundingClientRect().top >= 0), "Starting keeps the base word visible above the focused answer");
  assert.equal(await page.locator(".base-word").innerText().then((s) => s.includes("食")), true);
  assert.equal(await page.locator("#feedback").isVisible(), false);
  assert.equal(await page.locator("#ruleCard").isVisible(), false);
  await page.press("#answerInput", "Enter");
  assert.match(await page.textContent("#answerNotice"), /Enter an answer/);
  await page.locator("#answerInput").pressSequentially("tabete");
  assert.equal(await page.inputValue("#answerInput"), "たべて");
  await page.press("#answerInput", "Enter");
  assert.equal(await page.getAttribute("#feedback", "data-grade"), "correct");
  assert.match(await writtenText("#feedback .solution"), /食べて/);
  assert.ok(await page.locator("#feedback .solution").evaluate((solution) =>
    solution.querySelector(".base-reading").getBoundingClientRect().top >= solution.querySelector(".study-japanese").getBoundingClientRect().bottom),
  "Solution kana is beneath the written answer");
  assert.match(await page.textContent("#feedback"), /rice/);
  assert.equal(await page.locator("#ruleCard").isVisible(), true);
  await page.locator('#feedback [data-kanji="食"]').first().click();
  await page.waitForFunction(() => document.getElementById("kanjiContent").textContent.includes("On’yomi"));
  assert.match(await page.textContent("#kanjiContent"), /ショク/);
  assert.match(await page.textContent("#kanjiContent"), /meal/);
  await page.locator("#kanjiDialog button").last().click();
  await page.click("#nextButton");
  await answer("みで");
  assert.equal(await page.getAttribute("#feedback", "data-grade"), "near");
  assert.equal(await page.locator("#feedback .solution").count(), 0, "Check must not auto-reveal");
  assert.equal(await page.locator("#answerInput").isDisabled(), false);
  assert.equal(await page.locator("#checkButton").isDisabled(), false);
  assert.equal(await page.inputValue("#answerInput"), "みで");
  assert.equal(await page.locator("#feedback").evaluate((feedback) => feedback === document.activeElement), true);
  await answer("ちがう");
  assert.equal(await page.getAttribute("#feedback", "data-grade"), "incorrect");
  assert.equal(await page.locator("#answerInput").isDisabled(), false);
  await answer("みて");
  assert.equal(await page.getAttribute("#feedback", "data-grade"), "correct");
  assert.equal(await page.locator("#answerInput").isDisabled(), true);
  assert.equal(Object.values((await saved()).progress).reduce((n, r) => n + r.attempts, 0), 2, "Retry cannot add attempts");
  await endSession();
  await assertDisplayFirst("results");
  assert.match(await page.textContent("#resultContent"), /2 answers recorded/);
  assert.match(await page.textContent("#resultContent"), /50%/);
  await page.click("#restartButton");
  await assertDisplayFirst("setup");
  await page.click("#startButton");
  await assertDisplayFirst("practice");
  await endSession();
  await assertDisplayFirst("results");
  await page.reload();
  await assertDisplayFirst("setup");
  assert.match(await page.textContent("#lifetime"), /50%/);

  await configure({ hints: "limited", reveals: "limited", assistanceLimit: 1 });
  await page.click("#startButton");
  await page.click("#hintButton");
  assert.equal(await page.locator("#hintButton").isDisabled(), true);
  assert.match(await page.textContent("#hintText"), /Ru-verbs/);
  await answer("たべて");
  await page.click("#nextButton");
  await page.click("#revealButton");
  assert.match(await writtenText("#feedback .solution"), /見て/);
  await page.click("#nextButton");
  assert.equal(await page.locator("#revealButton").isDisabled(), true);
  assert.equal(await page.locator("#hintButton").isDisabled(), true);
  await endSession();
  assert.match(await page.textContent("#resultContent"), /0%/);

  await configure({ hints: "disabled", reveals: "disabled" });
  await page.click("#startButton");
  assert.equal(await page.locator("#hintButton").isDisabled(), true);
  assert.equal(await page.locator("#revealButton").isDisabled(), true);
  await answer("ちがう");
  assert.equal(await page.locator("#feedback .solution").count(), 0);

  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await configure({});
    await page.click("#startButton");
    for (const [text, grade] of [["たべで", "near"], ["ちがう", "incorrect"]]) {
      await answer(text);
      assert.equal(await page.getAttribute("#feedback", "data-grade"), grade);
      assert.equal(await page.locator("#answerInput").isDisabled(), false);
      const feedbackPosition = await page.locator("#feedback").evaluate((feedback) => {
        const rect = feedback.getBoundingClientRect();
        return { focused: document.activeElement === feedback, top: rect.top, bottom: rect.bottom, height: innerHeight };
      });
      assert.ok(feedbackPosition.focused && feedbackPosition.top >= -1 && feedbackPosition.bottom <= feedbackPosition.height + 1,
        `${width}px: ${grade} feedback receives focus and scrolls into view: ${JSON.stringify(feedbackPosition)}`);
      assert.equal(await page.inputValue("#answerInput"), text);
    }
    await answer("たべて");
    assert.equal(await page.getAttribute("#feedback", "data-grade"), "correct");
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const [random, prompt] of [[0, "name"], [0.5, "description"], [0.99, "sentence"]]) {
    await configure({ prompt: "mixed" });
    assert.equal(await page.inputValue("#setting-prompt"), "mixed");
    await page.evaluate((value) => { Math.random = () => value; }, random);
    await page.click("#startButton");
    assert.equal(await page.getAttribute(".requested-form", "data-prompt"), prompt);
    const requested = await page.textContent(".requested-form");
    await page.click("#hintButton");
    await page.click("#furiganaQuickToggle");
    assert.equal(await page.textContent(".requested-form"), requested, "Hints and display changes preserve the chosen Mixed prompt");
    assert.equal((await saved()).settings.prompt, "mixed");
    await page.reload();
    assert.equal(await page.inputValue("#setting-prompt"), "mixed");
  }
  await configure({ types: ["na-adjective"], forms: ["negative"], politeness: "polite", fontSize: 64 });
  await page.click("#startButton");
  assert.match(await page.textContent(".requested-register"), /Politeness.*丁寧体 · polite/);
  await answer("しずかじゃないです");
  assert.equal(await page.getAttribute("#feedback", "data-grade"), "correct");
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.locator("#feedback .solution").evaluate((solution) =>
      solution.querySelector(".base-reading").getBoundingClientRect().top >= solution.querySelector(".study-japanese").getBoundingClientRect().bottom),
    `Long solution reading stays below the answer at ${width}px`);
  }

  for (const [mode, text] of [["sentence", /＿＿＿/], ["reverse", /辞書形/], ["comparison", /何形/]]) {
    await configure({ mode, levels: mode === "comparison" ? [4] : [5], forms: mode === "comparison" ? ["potential"] : ["te"] });
    await page.click("#startButton");
    assert.match(await page.textContent("#questionBody"), text);
    assert.match(await page.textContent(".requested-form"), mode === "reverse" ? /What is the base word/ : mode === "comparison" ? /Which form is this/ : /Te-form/);
    if (mode === "comparison") {
      const options = await page.locator("[data-answer]").evaluateAll((nodes) => nodes.map((node) => node.dataset.answer));
      assert.equal(options.length, 5, "Choice answers are capped at five");
      await page.click(`[data-answer="${options.find((value) => !["potential", "passive"].includes(value))}"]`);
      await page.click("#checkButton");
      assert.equal(await page.getAttribute("#feedback", "data-grade"), "incorrect");
      assert.equal(await page.locator("#answerChoice").isDisabled(), false);
      assert.equal(await page.locator("#checkButton").isDisabled(), false);
      await page.click(`[data-answer="${options.includes("passive") ? "passive" : "potential"}"]`);
      await page.click("#checkButton");
      assert.equal(await page.getAttribute("#feedback", "data-grade"), "correct", "Ambiguous form accepts both analyses");
    } else {
      await answer(mode === "reverse" ? "たべる" : "たべて");
      assert.equal(await page.getAttribute("#feedback", "data-grade"), "correct");
    }
    for (const language of ["ja", "en", "both"]) {
      await configure({ language, prompt: "description", forms: ["pastNegative"], politeness: "polite" });
      await page.click("#startButton");
      assert.equal(await page.textContent("#answerLabel"), language === "ja" ? "答え" : language === "en" ? "Your answer" : "答え · Your answer");
      const prompt = await page.textContent(".requested-form");
      assert.equal(prompt.includes("Say something did not happen"), language !== "ja");
      assert.equal(prompt.includes("過去にしなかった"), language !== "en");
      assert.equal(prompt.includes("polite"), language !== "ja");
    }
  }
  for (const task of ["form", "polarity", "tense", "politeness"]) {
    await configure({ mode: "reverse", reverseTask: task });
    await page.click("#startButton");
    await page.click(`[data-answer="${{ form: "te", polarity: "affirmative", tense: "neutral", politeness: "neutral" }[task]}"]`);
    await page.click("#checkButton");
    assert.equal(await page.getAttribute("#feedback", "data-grade"), "correct");
  }
  await configure({ mode: "daily" });
  await page.click("#startButton");
  const dailyAnswers = ["たべて", "みて", "たべて", "みて", "たべて"];
  for (const [index, reading] of dailyAnswers.entries()) {
    await answer(reading);
    if (index === 4) assert.equal((await saved()).days.length, 1, "The fifth answer saves the streak before Next");
    await page.click("#nextButton");
  }
  assert.equal(await page.locator("#results").isVisible(), true);
  assert.equal(await page.textContent("#streak"), "1");
  assert.equal((await saved()).days.length, 1);
  assert.equal((await saved()).completed, 1);

  for (const mode of ["sudden", "marathon"]) {
    await configure({ mode, mistakes: 1 });
    await page.click("#startButton"); await answer("ちがう");
    assert.equal(await page.locator("#retryButton").isVisible(), false);
    assert.equal(await page.locator("#answerInput").isDisabled(), true);
    assert.equal(await page.locator("#checkButton").isDisabled(), true);
    assert.match(await page.textContent("#nextButton"), /results/);
    await page.click("#nextButton");
    assert.equal(await page.locator("#results").isVisible(), true);
  }

  await configure({ mode: "timed", seconds: 10 });
  await page.clock.install();
  await page.click("#startButton");
  await page.clock.fastForward(11000);
  assert.equal(await page.locator("#results").isVisible(), true);
  assert.equal(await page.textContent("#resultsTitle"), "Time is up");
  assert.match(await page.textContent("#resultContent"), /0:10/);

  await configure({ mode: "mixed" });
  await page.click("#startButton");
  assert.match(await page.textContent("#startError"), /previously practiced/);
  assert.equal(await page.locator("#setup").isVisible(), true);
  await configure({});
  await page.click('#levelSettings .chip-action:text-is("Clear")');
  await page.click("#startButton");
  assert.match(await page.textContent("#startError"), /Choose at least one JLPT level/);
  await page.click('#levelSettings .chip-action:text-is("All")');
  await page.click("#settingsPanel > summary");
  await page.click('#typeSettings .chip-action:text-is("All")');
  await page.click('#formSettings .chip-action:text-is("All")');
  await page.evaluate(([sel, value]) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); }, ["#setting-politeness", "polite"]);
  await page.evaluate(([sel, value]) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); }, ["#setting-polarity", "negative"]);
  await page.evaluate(([sel, value]) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); }, ["#setting-tense", "past"]);
  if (await page.getAttribute("html", "data-theme") !== "dark") await page.click("#themeButton");
  await page.selectOption("#setting-fontSize", "64");
  if (await page.getAttribute("#romajiQuickToggle", "aria-pressed") !== "true") await page.click("#romajiQuickToggle");
  await page.reload();
  assert.equal(await page.getAttribute("html", "data-theme"), "dark");
  assert.equal(await page.inputValue("#setting-politeness"), "polite");
  assert.equal(await page.inputValue("#setting-fontSize"), "64");
  await page.click("#startButton");
  await answer("たべませんでした");
  assert.equal(await page.getAttribute("#feedback", "data-grade"), "correct");
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No overflow at ${width}px`);
  }
  await endSession();
  await page.click("#resetButton");
  await page.locator(".study-confirm-dialog button").last().click();
  await page.locator(".study-confirm-dialog").waitFor({ state: "detached" });
  assert.deepEqual((await saved()).progress, {});
  assert.equal((await saved()).settings.fontSize, 64, "Reset must preserve settings");

  await page.goto(base);
  await page.click("#menuButton");
  await page.click('[data-file="活用練習.html"]');
  assert.equal(await page.getAttribute("#helperFrame", "src"), "活用練習.html");
  await page.frameLocator("#helperFrame").locator("#startButton").waitFor();
  assert.deepEqual(errors, []);
  console.log("Conjugation practice browser checks passed: typing, grading, no auto-reveal, retry scoring, assistance limits, kanji, every recognition task, daily streak, sudden death, marathon, timer, filters, persistence, mobile, reset and launcher.");
} finally {
  await browser?.close();
  await vite?.close();
}
