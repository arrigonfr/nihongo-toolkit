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
    if (route.request().url().includes("/api/conjugation-practice")) return route.fulfill({ json: { source: "test dictionary", entries: [
      ["食べる", "たべる", "ichidan", "v1"], ["見る", "みる", "ichidan", "v1"],
      ["起きる", "おきる", "ichidan", "v1"], ["寝る", "ねる", "ichidan", "v1"],
      ["教える", "おしえる", "ichidan", "v1"], ["静か", "しずか", "na-adjective", "adj-na"]
    ].map(([word, reading, type, tag], i) => ({ id: `test:${i}`, word, reading, type, tag, level: i === 4 ? 4 : 5, meanings: ["test dictionary gloss"] })) } });
    if (route.request().url().includes("/api/kanji/")) {
      if (route.request().url().includes("/words")) return route.fulfill({ json: { items: [{
        japanese: [{ word: "食事", reading: "しょくじ" }], senses: [{ english_definitions: ["meal"] }]
      }] } });
      return route.fulfill({ json: { meanings: ["eat"], on_readings: ["ショク"], kun_readings: ["た.べる"] } });
    }
    return new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
  const page = toolPage(await context.newPage());
  const click = page.click.bind(page);
  page.click = async (selector, ...args) => {
    await click(selector, ...args);
    if (selector === "#startButton") await page.waitForFunction(() =>
      !document.querySelector("#practice").hidden || /Could not start|Choose at least|No questions/.test(document.querySelector("#startError").textContent));
  };
  const errors = [];
  const writtenText = (selector) => page.locator(selector).evaluate((element) => {
    const copy = element.cloneNode(true);
    copy.querySelectorAll("rt, .study-romaji, .base-reading").forEach((node) => node.remove());
    return copy.textContent;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const url = `${base}/katsuyo-renshuu.html`;
  const storageKey = "nihon:conjugation-practice-v1";
  async function configure(settings) {
    await page.goto(url);
    await page.evaluate(({ key, settings }) => {
      localStorage.setItem(key, JSON.stringify({ settings, progress: {}, days: [], completed: 0 }));
    }, { key: storageKey, settings: { types: ["ichidan"], forms: ["te"], polarity: "affirmative", levels: [5], questions: 5, language: "both", ...settings } });
    await page.reload();
  }
  async function answer(text) {
    await page.fill("#answerInput", text);
    await page.press("#answerInput", "Enter");
  }

  await configure({ forms: ["basic", "te"], polarity: "both", tense: "both", politeness: "both" });
  assert.match(await page.locator("#formSettings").textContent(), /Basic predicate/);
  assert.doesNotMatch(await page.locator("#formSettings").textContent(), /Non-past affirmative|Past negative|Ta-form|Nai-form/);
  await page.click('#levelSettings .chip-action:text-is("All")');
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).settings.forms, storageKey), ["basic", "te"]);
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  async function endSession() {
    await page.click("#endButton");
    await page.locator(".study-confirm-dialog button").last().click();
    await page.locator("#results").waitFor();
  }
  async function assertDisplayFirst(activeSection) {
    assert.equal(await page.locator("#practiceDisplay").isVisible(), activeSection === "setup");
    assert.equal(await page.locator("#setup #practiceDisplay > legend").textContent(), "Accessibility");
    assert.equal(await page.locator(`#${activeSection}`).isVisible(), true);
  }

  await configure({ mode: "classic", questions: 5, script: "both", kanji: false });
  assert.equal(await page.locator("#setting-script").count(), 0, "Shared Furigana replaces the local display override");
  assert.equal(await page.locator("#displayPanel, #setting-appearance, #setting-furigana, #setting-romaji, #setting-audio, #setting-kanji").count(), 0);
  assert.equal(await page.locator("#practiceDisplay select").count(), 2);
  await assertDisplayFirst("setup");
  await page.locator("#settingsPanel").evaluate((panel) => { panel.open = true; });
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
  assert.equal(await page.locator("#setting-fontSize").isVisible(), false);
  assert.equal(await page.inputValue("#answerInput"), "たべ", "Display changes preserve the answer in progress");
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--jp-size")), "40px");
  assert.equal(await page.textContent("#questionCount"), "Question 1 / 4");
  assert.match(await page.textContent("#notice"), /Only 4 distinct questions/);
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
  assert.equal(await page.getAttribute("#answerInput", "data-grade"), "correct");
  assert.equal(await page.locator("#feedback").isVisible(), false);
  assert.equal(await page.locator("#ruleCard").isVisible(), false);
  assert.equal(await page.textContent("#checkButton"), "Next question");
  await page.locator('#questionBody [data-kanji="食"]').first().click();
  await page.waitForFunction(() => document.getElementById("kanjiContent").textContent.includes("On’yomi"));
  assert.match(await page.textContent("#kanjiContent"), /ショク/);
  assert.match(await page.textContent("#kanjiContent"), /meal/);
  await page.locator("#kanjiDialog button").last().click();
  await page.click("#checkButton");
  await answer("みで");
  assert.equal(await page.getAttribute("#answerInput", "data-grade"), "near");
  assert.equal(await page.locator("#feedback .solution").count(), 0, "Check must not auto-reveal");
  assert.equal(await page.locator("#answerInput").isDisabled(), false);
  assert.equal(await page.locator("#checkButton").isDisabled(), false);
  assert.equal(await page.inputValue("#answerInput"), "みで");
  assert.equal(await page.locator("#answerInput").evaluate((input) => input === document.activeElement), true);
  assert.match(await page.textContent("#answerNotice"), /Check/);
  await answer("ちがう");
  assert.equal(await page.getAttribute("#answerInput", "data-grade"), "incorrect");
  assert.equal(await page.locator("#answerInput").isDisabled(), false);
  await answer("みて");
  assert.equal(await page.getAttribute("#answerInput", "data-grade"), "correct");
  assert.equal(await page.locator("#answerInput").evaluate((input) => input.readOnly && !input.disabled), true);
  assert.equal(Object.values((await saved()).progress).reduce((n, r) => n + r.attempts, 0), 2, "Retry cannot add attempts");
  await endSession();
  await assertDisplayFirst("results");
  assert.match(await page.textContent("#resultContent"), /2 questions counted/);
  assert.match(await page.textContent("#resultContent"), /50%/);
  await page.click("#restartButton");
  await assertDisplayFirst("setup");
  const previousWords = (await saved()).previousSessionWords;
  assert.ok(previousWords.length > 0, "The completed session's words are saved for the next quiz");
  await page.click("#startButton");
  await assertDisplayFirst("practice");
  assert.equal(previousWords.includes(await writtenText(".base-word")), false, "The next balanced quiz starts with a different word");
  await answer("ちがう");
  await page.click("#revealButton");
  await page.click("#checkButton");
  await page.click("#revealButton");
  await page.click("#checkButton");
  assert.equal(await page.textContent("#questionCount"), "Question 3 / 4", "Reviews wait until all primary questions have been asked");
  assert.equal(await page.locator("#sessionProgress").evaluate((progress) => progress.value), 2);
  await endSession();
  await assertDisplayFirst("results");
  await page.reload();
  await assertDisplayFirst("setup");
  assert.match(await page.textContent("#lifetime"), /25%/);

  await configure({ hints: "limited", reveals: "limited", assistanceLimit: 1 });
  await page.click("#startButton");
  await page.click("#hintButton");
  assert.equal(await page.locator("#hintButton").isDisabled(), true);
  assert.match(await page.textContent("#hintText"), /Ru-verbs/);
  await answer("たべて");
  await page.click("#checkButton");
  await page.click("#revealButton");
  assert.match(await page.textContent("#answerNotice"), /見て/);
  await page.click("#checkButton");
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
      assert.equal(await page.getAttribute("#answerInput", "data-grade"), grade);
      assert.equal(await page.locator("#answerInput").isDisabled(), false);
      const feedbackPosition = await page.locator("#answerNotice").evaluate((feedback) => {
        const rect = feedback.getBoundingClientRect();
        return { focused: document.activeElement.id === "answerInput", top: rect.top, bottom: rect.bottom, height: innerHeight };
      });
      assert.ok(feedbackPosition.focused && feedbackPosition.top >= -1 && feedbackPosition.bottom <= feedbackPosition.height + 1,
        `${width}px: ${grade} feedback receives focus and scrolls into view: ${JSON.stringify(feedbackPosition)}`);
      assert.equal(await page.inputValue("#answerInput"), text);
    }
    await answer("たべて");
    assert.equal(await page.getAttribute("#answerInput", "data-grade"), "correct");
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const [random, prompt] of [[0, "name"], [0.5, "description"], [0.99, "description"]]) {
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
  await configure({ types: ["na-adjective"], forms: ["basic"], polarity: "negative", tense: "non-past", politeness: "polite", fontSize: 64 });
  await page.click("#startButton");
  assert.match(await page.textContent(".requested-register"), /Politeness.*丁寧体 · polite/);
  await answer("しずかじゃないです");
  assert.equal(await page.getAttribute("#answerInput", "data-grade"), "correct");
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator("#feedback").isVisible(), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Long answers fit at ${width}px`);
  }

  await configure({ mode: "sentence", prompt: "sentence", fontSize: 48 });
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key));
    saved.progress["test:preserved|te"] = { attempts: 1, correct: 1, wrong: 0, last: 1 };
    saved.completed = 2;
    localStorage.setItem(key, JSON.stringify(saved));
  }, storageKey);
  await page.reload();
  assert.equal(await page.locator('#setting-mode option[value="sentence"], #setting-prompt option[value="sentence"]').count(), 0);
  assert.equal(await page.inputValue("#setting-mode"), "classic");
  assert.equal(await page.inputValue("#setting-prompt"), "name");
  assert.equal(await page.inputValue("#setting-fontSize"), "48");
  await page.click("#startButton");
  assert.equal(await page.locator("#practice").isVisible(), true);
  await answer("たべて");
  assert.equal(await page.getAttribute("#answerInput", "data-grade"), "correct");
  assert.equal((await saved()).settings.mode, "classic");
  assert.equal((await saved()).settings.prompt, "name");
  assert.equal((await saved()).progress["test:preserved|te"].correct, 1);
  assert.equal((await saved()).completed, 2);
  for (const [mode, text] of [["reverse", /辞書形/], ["comparison", /何形/]]) {
    await configure({ mode, levels: mode === "comparison" ? [4] : [5], forms: mode === "comparison" ? ["potential"] : ["te"] });
    await page.click("#startButton");
    assert.match(await page.textContent("#questionBody"), text);
    assert.match(await page.textContent(".requested-form"), mode === "reverse" ? /What is the base word/ : mode === "comparison" ? /Which form is this/ : /Te-form/);
    if (mode === "comparison") {
      const options = await page.locator("[data-answer]").evaluateAll((nodes) => nodes.map((node) => node.dataset.answer));
      assert.equal(options.length, 5, "Choice answers are capped at five");
      await page.click(`[data-answer="${options.find((value) => !["potential", "passive"].includes(value))}"]`);
      await page.click("#checkButton");
      assert.equal(await page.getAttribute("#answerOptions", "data-grade"), "incorrect");
      assert.equal(await page.locator("#answerChoice").isDisabled(), false);
      assert.equal(await page.locator("#checkButton").isDisabled(), false);
      await page.click(`[data-answer="${options.includes("passive") ? "passive" : "potential"}"]`);
      await page.click("#checkButton");
      assert.equal(await page.getAttribute("#answerOptions", "data-grade"), "correct", "Ambiguous form accepts both analyses");
    } else {
      await answer(mode === "reverse" ? "たべる" : "たべて");
      assert.equal(await page.getAttribute("#answerInput", "data-grade"), "correct");
    }
    for (const language of ["ja", "en", "both"]) {
      await configure({ language, prompt: "description", forms: ["basic"], polarity: "negative", tense: "past", politeness: "polite" });
      await page.click("#startButton");
      assert.equal(await page.textContent("#answerLabel"), "答え · Your answer");
      const prompt = await page.textContent(".requested-form");
      assert.equal(prompt.includes("State an action or condition"), true);
      assert.equal(prompt.includes("指定された時制"), true);
      assert.equal(prompt.includes("polite"), true);
    }
  }
  for (const task of ["form", "polarity", "tense", "politeness"]) {
    await configure({ mode: "reverse", reverseTask: task });
    await page.click("#startButton");
    await page.click(`[data-answer="${{ form: "te", polarity: "affirmative", tense: "neutral", politeness: "neutral" }[task]}"]`);
    await page.click("#checkButton");
    assert.equal(await page.getAttribute("#answerOptions", "data-grade"), "correct");
  }
  await configure({ mode: "quick", levels: [5, 4, 3, 2, 1], repeat: false });
  await page.click("#startButton");
  for (let index = 0; index < 10; index++) {
    await page.click("#revealButton");
    if (index === 4) assert.equal("days" in await saved(), false);
    await page.click("#checkButton");
  }
  assert.equal(await page.locator("#results").isVisible(), true);
  assert.equal(await page.locator("#streak").count(), 0);
  assert.equal("days" in await saved(), false);
  assert.equal((await saved()).completed, 1);

  for (const mode of ["sudden", "marathon"]) {
    await configure({ mode, mistakes: 1 });
    await page.click("#startButton"); await answer("ちがう");
    assert.equal(await page.locator("#retryButton").isVisible(), false);
    assert.equal(await page.locator("#answerInput").isDisabled(), true);
    assert.equal(await page.locator("#checkButton").isDisabled(), false);
    assert.match(await page.textContent("#checkButton"), /results/);
    await page.click("#checkButton");
    assert.equal(await page.locator("#results").isVisible(), true);
  }

  await configure({ questions: 2 });
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(await page.locator("#setting-input, #setting-language, #setting-priority, #setting-repeat, #setting-examples").count(), 0);
  for (const [left, right] of [["setting-prompt", "setting-reverseTask"], ["setting-font", "setting-fontSize"]]) {
    assert.ok(await page.evaluate(([left, right]) => {
      const field = (id) => document.getElementById(id).closest(".chips-field, label, .plain-field");
      return field(left).getBoundingClientRect().right <= field(right).getBoundingClientRect().left;
    }, [left, right]), `${left} is beside ${right} on desktop`);
  }
  assert.equal(await page.locator("#displaySettings .font-picker").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length), 4);
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.locator("#displaySettings .font-picker").evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(" ").length), 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.click("#startButton");
  assert.equal(await page.locator(".session-bar #setting-autoAdvance").count(), 1);
  await page.check("#setting-autoAdvance");
  await answer("たべて");
  assert.equal(await page.textContent("#questionCount"), "Question 1 / 2");
  assert.equal(await page.locator("#correctCaption").isVisible(), true);
  assert.equal(await page.textContent("#answerNotice"), "");
  await page.locator("#answerInput").press("Backspace");
  assert.equal(await page.inputValue("#answerInput"), "たべて", "Graded answers cannot be deleted into a stuck state");
  await page.clock.runFor(500);
  await page.uncheck("#setting-autoAdvance");
  await page.clock.runFor(1000);
  assert.equal(await page.textContent("#questionCount"), "Question 1 / 2");
  assert.equal(await page.locator("#correctCaption").isVisible(), true, "Manual feedback persists");
  await page.check("#setting-autoAdvance");
  await page.uncheck("#setting-autoAdvance");
  await page.check("#setting-autoAdvance");
  await page.clock.runFor(749);
  assert.equal(await page.textContent("#questionCount"), "Question 1 / 2");
  await page.clock.runFor(1);
  assert.equal(await page.textContent("#questionCount"), "Question 2 / 2");
  assert.equal(await page.locator("#correctCaption").isVisible(), false);
  await page.clock.runFor(1000);
  assert.equal(await page.textContent("#questionCount"), "Question 2 / 2", "No duplicate timer progression");
  await page.uncheck("#setting-autoAdvance");
  await answer("ちがう");
  assert.equal(await page.locator("#answerNotice").evaluate((notice) =>
    notice.getBoundingClientRect().bottom <= document.getElementById("answerInput").getBoundingClientRect().top
    && parseFloat(getComputedStyle(notice).fontSize) <= 12), true);
  await answer("みて");
  assert.equal(await page.textContent("#questionCount"), "Question 2 / 2");
  assert.equal(await page.textContent("#checkButton"), "Next question");
  await page.check("#setting-autoAdvance");
  await page.locator("#answerInput").press("Enter");
  // The earlier miss is repeated after the two primary questions.
  await answer("みて");
  await page.clock.runFor(750);
  assert.equal(await page.locator("#results").isVisible(), true);
  await page.clock.runFor(2000);
  assert.equal(await page.locator("#results").isVisible(), true);

  await configure({ mode: "timed", seconds: 10 });
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
  await page.locator("#settingsPanel").evaluate((panel) => { panel.open = true; });
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
  assert.equal(await page.getAttribute("#answerInput", "data-grade"), "correct");
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

  await configure({});
  await page.route("**/api/conjugation-practice?*", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
  await page.click("#startButton");
  assert.match(await page.textContent("#startError"), /source is unavailable/);
  assert.equal(await page.locator("#practice").isVisible(), false);
  await page.unroute("**/api/conjugation-practice?*");
  await page.route("**/api/conjugation-practice?*", (route) => route.fulfill({ json: { entries: [] } }));
  await page.click("#startButton");
  assert.match(await page.textContent("#startError"), /No dictionary-backed/);
  await page.unroute("**/api/conjugation-practice?*");
  await page.click("#startButton");
  assert.equal(await page.locator("#practice").isVisible(), true, "Source recovery retries without a substitute bank");

  await page.goto(base);
  await page.click("#menuButton");
  await page.click('#helperMenu [data-file="katsuyo-renshuu.html"]');
  await page.waitForURL(`${base}/katsuyo-renshuu.html`);
  await page.locator("#startButton").waitFor();
  assert.deepEqual(errors, []);
  console.log("Conjugation practice browser checks passed: typing, grading, no auto-reveal, retry scoring, assistance limits, kanji, every recognition task, quick practice, sudden death, marathon, timer, filters, persistence, mobile, reset and launcher.");
} finally {
  await browser?.close();
  await vite?.close();
}
