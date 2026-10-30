import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";
import { toolPage } from "./tool-page.mjs";

const origins = [];
const api = createServer(createHandler({ origins, sentenceFallback: async () => [] }));
api.listen(0, "127.0.0.1");
await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
let vite, browser;
const cases = [
  ["kana.html", { kanaDirection: "romaji-katakana", fontChoice: "Sawarabi Mincho", sessionMode: "questions", sessionTarget: 37, showStatsToggle: false }],
  ["imi.html", { levelSelect: "3", meaningDirection: "meaning-reverse", fontChoice: "Zen Kurenaido", sessionMode: "timed", sessionTarget: 7, showStatsToggle: false, reviewKanjiToggle: true }],
  ["yomi.html", { levelSelect: "unrated", readingDirection: "reading-katakana", fontChoice: "M PLUS Rounded 1c", sessionMode: "questions", sessionTarget: 18, showStatsToggle: true, reviewKanjiToggle: true }],
  ["goi.html", { levelSelect: "N2", modeSelect: "cloze-ej", kanaDirection: "to-kana", fontChoice: "Noto Sans JP", sessionType: "time", questionLimit: 27, timeLimit: 6, showStatsToggle: false, showExampleToggle: false }],
  ["kotoba.html", { kanjiMode: true }],
  ["fumitoki.html", { translationToggle: true }],
  ["kanji-chizucho.html", {}],
  ["katsuyo.html", { "setting-politeness": "polite", "setting-polarity": "negative", "setting-tense": "past", "setting-fontSize": "30", "setting-level": "3", "setting-category": "adjective", "setting-compact": true, "setting-examples": false, "setting-kanji": false, "setting-contrast": true }],
  ["katsuyo-renshuu.html", { "setting-mode": "reverse", "setting-questions": "20", "setting-language": "both", "setting-input": "kanji", "setting-seconds": 73, "setting-mistakes": 4, "setting-hints": "limited", "setting-hintLimit": 8, "setting-revealLimit": 6, "setting-meaning": false, "setting-type": false, "setting-repeat": false, "setting-timer": true, "setting-fontSize": "48" }],
  ["pazuru.html", { answerModeSelect: "kanji", levelSelect: "4", sizeSelect: "custom", customWordsInput: 6, fontScaleSelect: "large", checkAvailSelect: "limited", revealAvailSelect: "disabled", hintLimitInput: 7, timedMinutesInput: 9, layoutDirSelect: "rtl", inputStyleSelect: "clues", kanjiFocusToggle: true }],
  ["shiritori.html", { "setting-mode": "timed", "setting-opponent": "local", "setting-players": 3, "setting-entry": "both", "setting-level": "N4", "setting-bonus": true, "setting-reveal": true, "setting-voicing": true, "setting-hints": "disabled", "setting-timer": "60", "setting-fontSize": "large", "setting-contrast": true }],
  ["kotoba-sagashi.html", { "setting-mode": "timed", sizePreset: "custom", "setting-size": 10, "setting-overlap": false, "setting-meanings": false, "setting-seconds": 73, "setting-fontSize": 38, "setting-contrast": true, "setting-animation": false, hintType: "length" }],
  ["eawase.html", { "setting-examples": false, "setting-content": "kana", "setting-pairing": "same-katakana", "setting-grid": "custom", "setting-count": 7, "setting-mode": "moves", "setting-flips": 23, "setting-players": "2", "setting-shuffle": "all", "setting-disappear": true, "setting-learning": false, "setting-fontSize": 36, "setting-contrast": true, hintType: "reading" }]
];
const fonts = new Map([
  ["katsuyo-renshuu.html", "Sawarabi Mincho"], ["shiritori.html", "Zen Kurenaido"],
  ["kotoba-sagashi.html", "Noto Sans JP"], ["eawase.html", "M PLUS Rounded 1c"]
]);
for (const [file, values] of cases) if (fonts.has(file)) values["setting-font"] = fonts.get(file);

try {
  vite = await createVite({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  origins.push(base);
  browser = await chromium.launch();
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const raw = await context.newPage();
  const page = toolPage(raw);
  const errors = [];
  raw.on("pageerror", (error) => errors.push(error.message));
  const go = (file) => page.goto(`${base}/${encodeURIComponent(file)}`);
  const snapshot = (tab) => tab.evaluate(() => ({
    controls: Object.fromEntries([...document.querySelectorAll('select[id]:not(#colorThemeSelect):not(#manualType), input[type="checkbox"][id], input[type="number"][id]')]
      .map((node) => [node.id, node.type === "checkbox" ? node.checked : node.value])),
    lists: [...document.querySelectorAll("[data-list], [data-group]")].map((node) => [node.dataset.list || node.dataset.group, node.value, node.checked]),
    modes: [...document.querySelectorAll("#modePills button")].map((node) => [node.dataset.mode, node.getAttribute("aria-pressed")]),
    appearance: [document.documentElement.dataset.colorTheme, document.documentElement.dataset.theme,
      document.documentElement.dataset.studyAudio, document.documentElement.dataset.studyFurigana, document.documentElement.dataset.studyRomaji],
    font: document.documentElement.dataset.japaneseFont
  }));
  async function change(id, value) {
    if (id === "setting-mode" && await page.locator(`#modePills [data-mode="${value}"]`).count()) {
      await page.locator(`#modePills [data-mode="${value}"]`).click();
      return;
    }
    const control = page.locator(`#${id}`);
    await control.evaluate((node, value) => {
      if (node.type === "checkbox") node.checked = value;
      else node.value = String(value);
      node.dispatchEvent(new Event(node.type === "number" ? "input" : "change", { bubbles: true }));
      if (node.type === "number") node.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    assert.equal(await control.evaluate((node) => node.type === "checkbox" ? node.checked : node.value),
      typeof value === "boolean" ? value : String(value), `${id} accepts its preference`);
  }
  for (const [file, values] of cases) {
    await go(file);
    await page.selectOption("#colorThemeSelect", "wisteria");
    if (await page.getAttribute("html", "data-theme") !== "dark") await page.click("#themeButton");
    if (await page.getAttribute("html", "data-study-audio") !== "false") await page.click("#audioQuickToggle");
    for (const [id, pressed] of [["furiganaQuickToggle", "false"], ["romajiQuickToggle", "true"]]) {
      const toggle = page.locator(`#${id}`);
      if (await toggle.isVisible() && await toggle.getAttribute("aria-pressed") !== pressed) await toggle.click();
    }
    for (const [id, value] of Object.entries(values)) await change(id, value);
    if (file === "katsuyo.html") {
      await page.locator("#list-groups ~ .chips .chip-action:text-is(\"Clear\")").evaluate((node) => node.click());
    }
    if (file === "katsuyo-renshuu.html") {
      await page.locator("#levelSettings .chip-action:text-is(\"All\")").evaluate((node) => node.click());
      await page.locator("#formSettings .chip-action:text-is(\"Clear\")").evaluate((node) => node.click());
    }
    if (file === "eawase.html") {
      await page.locator("#setting-groups").evaluate((node) => { node.value = "voiced"; node.dispatchEvent(new Event("change", { bubbles: true })); });
    }
    if (file === "pazuru.html") await page.click('[data-mode="kanjiChallenge"]');
    const expected = await snapshot(page);
    await page.reload();
    assert.deepEqual(await snapshot(page), expected, `${file}: every control restores on reload without clicking Save`);
    const reopenedRaw = await context.newPage();
    reopenedRaw.on("pageerror", (error) => errors.push(error.message));
    const reopened = toolPage(reopenedRaw);
    await reopened.goto(`${base}/${encodeURIComponent(file)}`);
    assert.deepEqual(await snapshot(reopened), expected, `${file}: preferences survive in a new tab`);
    if (["kana.html", "imi.html", "yomi.html"].includes(file)) {
      assert.equal(await reopened.locator("#questionSection").isVisible(), false, "Restoring settings does not start a quiz");
      assert.equal(await reopened.locator("#sessionStatsContent").isVisible(), values.showStatsToggle);
    }
    await reopenedRaw.close();
  }

  await go("kotoba.html");
  await page.fill("#query", "国");
  await page.click("#searchButton");
  await page.locator("#compoundMeaning").waitFor();
  await page.uncheck("#compoundMeaning");
  await page.reload();
  assert.equal(await page.inputValue("#query"), "", "Search drafts are not preferences");
  await page.fill("#query", "国");
  await page.click("#searchButton");
  await page.locator("#compoundMeaning").waitFor();
  assert.equal(await page.locator("#compoundMeaning").isChecked(), false);
  await page.locator("#compoundList [data-search-word]").first().click();
  assert.equal(await page.locator("#kanjiMode").isChecked(), false);
  await page.reload();
  assert.equal(await page.locator("#kanjiMode").isChecked(), false, "Compound navigation saves the resulting search mode");

  await go("kana.html");
  assert.equal(await page.inputValue("#sessionTarget"), "37", "Practice settings remain isolated across Kana, Imi and Yomi");
  await page.locator("#sessionTarget").fill("");
  await change("showStatsToggle", true);
  await page.reload();
  assert.equal(await page.inputValue("#sessionTarget"), "37", "An unfinished number never replaces the last valid setting");
  await page.evaluate(() => localStorage.setItem("nihon:kana-settings-v1", JSON.stringify({
    kanaDirection: "romaji-any", fontChoice: "unknown", showStatsToggle: "false", sessionTarget: -1
  })));
  await page.reload();
  assert.equal(await page.inputValue("#kanaDirection"), "romaji-any");
  assert.equal(await page.inputValue("#fontChoice"), "Noto Sans JP");
  assert.equal(await page.inputValue("#sessionTarget"), "20");
  assert.equal(await page.locator("#showStatsToggle").isChecked(), true);
  assert.match(await page.textContent("#apiWarning"), /invalid/);
  await page.evaluate(() => localStorage.setItem("nihon:goi-settings-v1", "{"));
  await go("goi.html");
  assert.match(await page.textContent("#warning"), /could not be restored/);
  await change("modeSelect", "typing-ej");
  await page.reload();
  assert.equal(await page.inputValue("#modeSelect"), "typing-ej", "A valid change repairs malformed preference storage");

  await go("kana.html");
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "nihon:kana-settings-v1") throw new DOMException("Storage full", "QuotaExceededError");
      return write.call(this, key, value);
    };
  });
  await change("fontChoice", "Zen Kurenaido");
  assert.match(await page.textContent("#apiWarning"), /could not save/);
  await go("pazuru.html");
  await page.locator("#customWordsInput").fill("");
  await change("fontScaleSelect", "medium");
  await page.reload();
  assert.equal(await page.inputValue("#customWordsInput"), "6");
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "nihon:crossword-settings-v1") throw new DOMException("Storage full", "QuotaExceededError");
      return write.call(this, key, value);
    };
  });
  await change("fontScaleSelect", "small");
  assert.match(await page.textContent("#settingsStorageError"), /could not save/);

  const liveContext = await browser.newContext({ reducedMotion: "reduce" });
  await liveContext.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const sessionPage = toolPage(await liveContext.newPage());
  sessionPage.on("pageerror", (error) => errors.push(error.message));
  sessionPage.on("dialog", (dialog) => dialog.accept());
  const sessionGo = (file) => sessionPage.goto(`${base}/${encodeURIComponent(file)}`);
  async function toggleStudy(snapshot) {
    const before = await snapshot();
    for (const id of ["furiganaQuickToggle", "romajiQuickToggle", "audioQuickToggle"]) {
      const control = sessionPage.locator(`#${id}`);
      if (!await control.isVisible()) continue;
      const pressed = await control.getAttribute("aria-pressed");
      await control.click();
      assert.equal(await control.getAttribute("aria-pressed"), String(pressed !== "true"));
      assert.deepEqual(await snapshot(), before, `${id} preserves the question, answer and progress`);
    }
  }
  for (const [file, direction, initial, next] of [
    ["kana.html", "kanaDirection", "hiragana-romaji", "romaji-katakana"],
    ["imi.html", "meaningDirection", "meaning-forward", "meaning-reverse"],
    ["yomi.html", "readingDirection", "reading-romaji", "reading-katakana"]
  ]) {
    await sessionGo(file);
    await sessionPage.selectOption(`#${direction}`, initial, { force: true });
    await sessionPage.selectOption("#sessionMode", "questions", { force: true });
    await sessionPage.fill("#sessionTarget", "3");
    await sessionPage.click("#startSessionButton");
    await sessionPage.waitForFunction(() => !document.querySelector("#checkButton").disabled);
    await sessionPage.fill("#answerInput", "draft");
    const snapshot = () => sessionPage.evaluate(() => ["glyph", "questionCount", "answeredStat", "sessionStatus"]
      .map((id) => document.getElementById(id).textContent).concat(document.getElementById("answerInput").value));
    const before = await snapshot();
    const prompt = await sessionPage.textContent("#promptText");
    await sessionPage.click("#settingsPanel summary");
    await sessionPage.selectOption(`#${direction}`, next, { force: true });
    await sessionPage.locator("#fontChoice").evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); }, "Sawarabi Mincho");
    await sessionPage.selectOption("#sessionMode", "timed", { force: true });
    await sessionPage.fill("#sessionTarget", "2");
    await sessionPage.uncheck("#showStatsToggle");
    assert.deepEqual(await snapshot(), before, `${file}: editing next-session settings leaves the active session untouched`);
    assert.equal(await sessionPage.locator("#sessionStatsContent").isVisible(), true);
    await toggleStudy(snapshot);
    await sessionPage.click("#skipButton");
    await sessionPage.waitForFunction(() => !document.querySelector("#checkButton").disabled);
    assert.equal(await sessionPage.textContent("#promptText"), prompt, "Following questions keep the original direction");
    await sessionPage.click("#stopSessionButton");
    await sessionPage.click("#startSessionButton");
    await sessionPage.waitForFunction(() => !document.querySelector("#checkButton").disabled);
    assert.notEqual(await sessionPage.textContent("#promptText"), prompt, "The new session adopts the saved direction");
    assert.equal(await sessionPage.locator("#sessionStatsContent").isVisible(), false);
    assert.match(await sessionPage.textContent("#sessionStatus"), /remaining/);
    assert.match(await sessionPage.getAttribute("html", "style"), /Sawarabi Mincho/);
  }

  await sessionGo("goi.html");
  await sessionPage.selectOption("#modeSelect", "multiple-je", { force: true });
  await sessionPage.click("#startButton");
  await sessionPage.locator(".option").first().waitFor();
  await sessionPage.click("#settingsPanel summary");
  const choices = await sessionPage.locator(".option").allTextContents();
  await sessionPage.selectOption("#modeSelect", "typing-ej", { force: true });
  await sessionPage.selectOption("#sessionType", "questions", { force: true });
  await sessionPage.fill("#questionLimit", "2");
  assert.deepEqual(await sessionPage.locator(".option").allTextContents(), choices);
  await toggleStudy(() => sessionPage.evaluate(() => ["questionLabel", "answeredStat"].map((id) => document.getElementById(id).textContent)));
  await sessionPage.locator(".option").first().click();
  await sessionPage.locator("#nextButton").waitFor();
  assert.equal(await sessionPage.textContent("#answeredStat"), "1", "Pending typing mode does not break multiple-choice scoring");
  await sessionPage.click("#nextButton");
  await sessionPage.waitForFunction(() => document.querySelector("#questionLabel").textContent === "Question 2");
  assert.equal(await sessionPage.locator("#options").isVisible(), true);
  await sessionPage.click("#stopSessionButton");
  await sessionPage.click("#startButton");
  await sessionPage.locator("#answerInput").waitFor();
  assert.equal(await sessionPage.locator("#options").isVisible(), false);
  assert.equal(await sessionPage.textContent("#questionLabel"), "Question 1 / 2");

  await sessionGo("katsuyo-renshuu.html");
  await sessionPage.click("#startButton");
  await sessionPage.fill("#answerInput", "たべ");
  const question = await sessionPage.textContent("#questionBody");
  await sessionPage.selectOption("#setting-fontSize", "48");
  await sessionPage.locator("#setting-font").evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); }, "Sawarabi Mincho");
  assert.equal(await sessionPage.textContent("#questionBody"), question);
  assert.equal(await sessionPage.evaluate(() => document.documentElement.style.getPropertyValue("--jp-size")), "40px");
  assert.equal(await sessionPage.getAttribute("html", "data-japanese-font"), "Noto Sans JP");
  await toggleStudy(() => sessionPage.evaluate(() => [document.getElementById("questionCount").textContent, document.getElementById("answerInput").value]));
  await sessionPage.click("#endButton");
  await sessionPage.locator(".study-confirm-dialog button").last().click();
  await sessionPage.locator("#results").waitFor();
  await sessionPage.click("#restartButton");
  await sessionPage.click("#startButton");
  assert.equal(await sessionPage.evaluate(() => document.documentElement.style.getPropertyValue("--jp-size")), "48px");
  assert.match(await sessionPage.locator(".base-word [lang=ja]").first().evaluate((node) => getComputedStyle(node).fontFamily), /Sawarabi Mincho/);

  await sessionGo("pazuru.html");
  await sessionPage.click("#newPuzzleBtn");
  await sessionPage.locator("#crosswordGrid .cw-cell").first().waitFor();
  await sessionPage.locator(".cw-cell.is-active").click();
  await sessionPage.fill("#popoverAnswerInput", "あ");
  const crossword = () => sessionPage.evaluate(() => [
    [...document.querySelectorAll(".cw-cell")].map((cell) => [cell.dataset.row, cell.dataset.col, cell.dataset.char]),
    document.getElementById("progressMetric").textContent, document.getElementById("popoverAnswerInput")?.value
  ]);
  const beforeCrossword = await crossword();
  await sessionPage.locator("#settingsDrawer summary").click();
  await sessionPage.selectOption("#inputStyleSelect", "clues", { force: true });
  await sessionPage.selectOption("#fontScaleSelect", "large");
  await sessionPage.selectOption("#levelSelect", "4", { force: true });
  assert.deepEqual(await crossword(), beforeCrossword, "Crossword edits never regenerate the board or lose typed input");
  assert.equal(await sessionPage.locator("#timerMetricWrap").isVisible(), true);
  await toggleStudy(crossword);
  await sessionPage.click("#newPuzzleBtn");
  await sessionPage.waitForFunction(() => document.querySelector("#feedbackBanner").hidden);
  assert.ok(await sessionPage.locator(".cw-clue-inline-input").count() > 0);
  assert.equal(await sessionPage.getAttribute("html", "data-font-scale"), "large");
  assert.equal(await sessionPage.locator("#timerMetricWrap").isVisible(), true);

  for (const [file, start, progressId, mode, contrast] of [
    ["eawase.html", "startButton", "progressText", "timed", "setting-contrast"],
    ["kotoba-sagashi.html", "startButton", "progressText", "timed", "setting-contrast"],
    ["shiritori.html", "newGame", "chainCount", "relaxed", "setting-contrast"]
  ]) {
    await sessionGo(file);
    if (file === "eawase.html") await sessionPage.selectOption("#setting-content", "kana", { force: true });
    if (file === "shiritori.html") {
      await sessionPage.selectOption("#setting-opponent", "local");
      await sessionPage.fill("#setting-players", "1");
    }
    await sessionPage.click(`#${start}`);
    await sessionPage.waitForFunction(() => !document.getElementById("settingsPanel").open);
    const snapshot = () => sessionPage.evaluate((id) => [
      document.getElementById(id).textContent, document.getElementById("modeBadge").textContent
    ], progressId);
    const before = await snapshot();
    await sessionPage.click("#settingsPanel summary");
    if (await sessionPage.locator(`#modePills [data-mode="${mode}"]`).count()) {
      await sessionPage.locator(`#modePills [data-mode="${mode}"]`).click();
    } else await sessionPage.selectOption("#setting-mode", mode, { force: true });
    await sessionPage.locator("#setting-font").evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); }, fonts.get(file));
    await sessionPage.check(`#${contrast}`);
    assert.deepEqual(await snapshot(), before, `${file}: pending game settings preserve progress and mode`);
    assert.equal(await sessionPage.getAttribute("html", "data-contrast"), "false");
    assert.equal(await sessionPage.getAttribute("html", "data-japanese-font"), "Noto Sans JP", "Font changes wait for the next game");
    assert.equal(await sessionPage.locator('#settingsForm button[type="submit"]').count(), 0);
    await toggleStudy(snapshot);
    await sessionPage.click("#newGame");
    await sessionPage.locator(".study-confirm-dialog .study-pills button").nth(1).click();
    await sessionPage.locator(".study-confirm-dialog").waitFor({ state: "detached" });
    await sessionPage.waitForFunction(() => !document.getElementById("settingsPanel").open);
    assert.notEqual((await snapshot())[1], before[1], `${file}: the next game adopts the new mode`);
    assert.equal(await sessionPage.getAttribute("html", "data-contrast"), "true");
    assert.equal(await sessionPage.getAttribute("html", "data-japanese-font"), fonts.get(file));
    if (file === "eawase.html") await sessionPage.locator("[data-card]").first().click();
    const japanese = file === "eawase.html" ? ".memory-card .study-japanese"
      : file === "kotoba-sagashi.html" ? "#grid [data-cell]" : "#previousWord";
    assert.ok((await sessionPage.locator(japanese).first().evaluate((node) => getComputedStyle(node).fontFamily)).includes(fonts.get(file)));
  }
  await liveContext.close();
  assert.deepEqual(errors, []);
  console.log("Settings checks passed: all thirteen tools, persistence, game-session snapshots, live study controls, invalid values and storage failures.");
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}
