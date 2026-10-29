import assert from "node:assert/strict";
import { toolPage, acceptStudyDialogs } from "./tool-page.mjs";
import { createServer as httpServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer as viteServer } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";
import { DEFAULT_RULES, READING_ENDING_RULE, kana, kanjiChain, parseRules, validateWord } from "../backend/src/shiritori-rules.js";

const api = httpServer(createHandler({ origins: ["http://127.0.0.1:5181"], sentenceFallback: async () => [], wordFallback: async () => [] }));
api.listen(0, "127.0.0.1"); await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
let vite, browser;
try {
  vite = await viteServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 5181, strictPort: true } });
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = toolPage(await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1280, height: 1000 } }));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await acceptStudyDialogs(page);
  await page.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false, furigana: true, romaji: false })));
  const go = () => page.goto("http://127.0.0.1:5181/しりとり.html");
  await go();
  await page.click("#helpButton");
  assert.equal(await page.locator("#helpDialog").isVisible(), true);
  assert.ok((await page.locator("#helpDialog").textContent()).includes(READING_ENDING_RULE));
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#helpDialog").isVisible(), false);
  assert.equal(await page.locator("#settingsDialog, #settingsButton").count(), 0);
  assert.equal(await page.locator("#setting-furigana, #setting-romaji, #setting-audio, #setting-appearance").count(), 0);
  assert.equal(await page.locator("header #furiganaQuickToggle, header #romajiQuickToggle, header #audioQuickToggle, header #themeButton, header #colorThemeSelect").count(), 5);
  assert.equal(await page.locator("#settingsPanel").evaluate((panel) => panel.open), true);
  assert.equal(await page.locator(".intro + #settingsPanel + .toolbar").count(), 1);
  assert.equal(await page.locator("#modeNote").count(), 0);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    const cards = await page.locator("#modePills button").evaluateAll((nodes) => nodes.map((node) => {
      const bounds = node.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
        described: node.dataset.settingDescription.length > 20 };
    }));
    assert.ok(cards.every((card) => card.left >= 0 && card.right <= width && card.described), "Each mode has a tooltip and fits the viewport");
    for (let i = 1; i < cards.length; i++) assert.ok(
      cards[i].left >= cards[i - 1].right || cards[i].top >= cards[i - 1].bottom,
      `Mode highlights do not overlap at ${width}px`);
  }
  await page.locator("#settingsPanel > summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#settingsForm").isVisible(), false);
  await page.keyboard.press("Space");
  await page.waitForSelector("#settingsForm:visible");
  await page.selectOption("#setting-opponent", "local");
  await page.fill("#setting-players", "3");
  await page.selectOption("#setting-level", "N5", { force: true });
  assert.equal(await page.locator("#settingsForm [type=submit]").count(), 0);
  assert.equal(await page.locator("#setting-level").inputValue(), "N5");
  await page.click("#newGame");
  await page.waitForFunction(() => !document.querySelector("#wordInput").disabled || !document.querySelector("#results").hidden);
  assert.equal(await page.locator("#results").isVisible(), false, "Real dictionary should provide a playable opening");
  assert.equal(await page.locator("#settingsPanel").evaluate((panel) => panel.open), false, "Starting a game collapses settings");
  await page.click("#settingsPanel > summary");
  assert.equal(await page.locator("#gameSettings").evaluate((node) => node.disabled), false, "Next-game settings remain editable");
  await page.click("#settingsPanel > summary");
  await page.click("#revealButton");
  await page.waitForFunction(() => !document.querySelector("#hintPanel").hidden && !document.querySelector("#playWord").disabled);
  await page.click("#playWord");
  await page.waitForFunction(() => document.querySelector("#chainCount").textContent === "2 words");
  await page.waitForFunction(() => !document.querySelector("#wordInput").disabled || !document.querySelector("#results").hidden);
  assert.match(await page.locator("#turnLabel").textContent(), /Player 2/);
  await page.click("#stopGame");
  assert.equal(await page.locator("#gameSettings").evaluate((node) => node.disabled), false, "Ending the round unlocks settings without needing a dialog");

  const sample = (reading, spelling, meaning, level = 5) => ({
    id: `test-${reading}`, word: spelling, reading, meaning, partOfSpeech: "noun",
    level, source: "Test fixture", examples: [{ japanese: `${spelling}です。`, english: `It is ${meaning}.`, id: 123, license: "CC BY 2.0 FR" }]
  });
  const words = [
    sample("りんご", "林檎", "apple"), sample("ごりら", "ゴリラ", "gorilla"),
    sample("らっぱ", "ラッパ", "trumpet"), sample("ぱん", "パン", "bread"),
    sample("ぱんだ", "パンダ", "panda"), sample("だいり", "代理", "representation"),
    sample("りす", "栗鼠", "squirrel"), sample("すいか", "西瓜", "watermelon"),
    sample("かめ", "亀", "turtle"), sample("めだか", "目高", "killifish"),
    sample("ねこ", "猫", "cat"), sample("でんしゃ", "電車", "train"),
    sample("がっこう", "学校", "school"), sample("こうてい", "校庭", "schoolyard"),
    sample("にわし", "庭師", "gardener"), sample("してい", "師弟", "teacher and pupil"),
    sample("ごがく", "語学", "language study"), sample("くるま", "車", "car"),
    sample("ごしゃ", "御社", "your company"),
    sample("ごーる", "ゴール", "goal"), sample("るびー", "ルビー", "ruby"),
    sample("びーる", "ビール", "beer"), sample("るり", "瑠璃", "lapis lazuli"),
    sample("こーひー", "珈琲", "coffee"), sample("こうもん", "校門", "school gate")
  ];
  let failLookup = false;
  let delayLookup = false;
  let lookups = 0;
  await page.route("**/api/shiritori/words?**", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const query = params.get("q");
    if (query) lookups++;
    if (query && failLookup) return route.fulfill({ status: 502, json: { error: "Fallback unavailable. Retry." } });
    if (query && delayLookup) await new Promise((resolve) => setTimeout(resolve, 1000));
    const rules = parseRules(JSON.parse(params.get("rules")));
    const used = JSON.parse(params.get("used") || "[]");
    const start = params.get("prev") ? JSON.parse(params.get("prev")) : null;
    const items = query ? words.filter((w) => w.word === query || kana(w.reading) === kana(query))
      : !start ? [kanjiChain(rules) ? words[12] : words[0]]
      : words.filter((w) => {
        const result = validateWord(w, start, used.map((id) => ({ id, word: "", reading: "" })), rules);
        return result.ok && !result.terminal;
      });
    return route.fulfill({ json: { items } });
  });
  async function reset(overrides = {}) {
    await page.evaluate((value) => localStorage.setItem("nihon:shiritori-settings-v1", JSON.stringify(value)), {
      ...DEFAULT_RULES, opponent: "local", players: 3, appearance: "light", fontSize: "normal", contrast: false,
      ...overrides
    });
    await go();
    await page.click("#newGame");
    await page.waitForFunction(() => !document.querySelector("#wordInput").disabled || !document.querySelector("#results").hidden);
  }
  async function play(text) {
    await page.fill("#wordInput", text);
    await page.click("#playWord");
    await page.waitForFunction(() => !document.querySelector("#wordInput").disabled || !document.querySelector("#results").hidden);
  }
  await reset({ entry: "kana" });
  assert.ok((await page.locator("#ruleSummary").textContent()).includes(READING_ENDING_RULE));
  assert.ok((await page.locator("#entryNote").textContent()).includes(READING_ENDING_RULE));
  const beforeRejected = lookups;
  for (const text of ["ごん", "ゴン", "ｺﾞﾝ", "ごを", "ゴヲ", "ｺﾞｦ", "ごー", "ゴー", "ｺﾞｰ"]) {
    await play(text);
    assert.ok((await page.locator("#feedback").textContent()).includes(READING_ENDING_RULE), text);
    assert.equal(await page.locator("#chainCount").textContent(), "1 words");
    assert.equal(await page.locator("#results").isVisible(), false, "Classic Kana lets the player retry");
    assert.match(await page.locator("#scores").textContent(), /Player 1\s*0/);
  }
  assert.equal(lookups, beforeRejected, "Forbidden endings are explained before a dictionary request");
  await page.click("#settingsPanel > summary");
  await page.selectOption("#setting-entry", "both");
  assert.ok((await page.locator("#ruleSummary").textContent()).includes(READING_ENDING_RULE), "Rule edits wait for the next game");
  await page.click("#settingsPanel > summary");
  await play("ごーる");
  assert.equal(await page.locator("#chainCount").textContent(), "2 words", "An internal long vowel is allowed");
  await page.click("#revealButton");
  await page.waitForFunction(() => !document.querySelector("#playWord").disabled);
  assert.equal(await page.inputValue("#wordInput"), "るり", "Reveal excludes a final long vowel even after next-game settings change");
  await page.click("#playWord");
  await page.waitForFunction(() => document.querySelector("#chainCount").textContent === "3 words");

  await reset({ entry: "both" });
  assert.ok(!(await page.locator("#entryNote").textContent()).includes(READING_ENDING_RULE));
  await play("ごーる"); await play("るびー");
  assert.equal(await page.locator("#chainCount").textContent(), "3 words", "Both still allows a final long vowel");
  assert.equal(await page.locator("#startOptions li:first-child span").textContent(), "びー");
  await reset({ entry: "kana", opponent: "computer" });
  await play("ごーる");
  await page.waitForFunction(() => document.querySelector("#chainCount").textContent === "3 words" && !document.querySelector("#wordInput").disabled);
  assert.equal(await page.locator(".chain-word").last().textContent(), "るり", "Computer moves obey the Kana ending rule");
  await reset({ entry: "kana", mode: "sudden" });
  await play("コーヒー");
  assert.ok((await page.locator("#results").textContent()).includes(READING_ENDING_RULE));
  assert.match(await page.locator("#results").textContent(), /Player 1 loses/);

  for (const settings of [{ entry: "kanji" }, { mode: "kanji" }]) {
    await reset(settings);
    assert.ok((await page.locator("#ruleSummary").textContent()).includes(READING_ENDING_RULE));
    assert.ok((await page.locator("#entryNote").textContent()).includes(READING_ENDING_RULE));
    for (const text of ["珈琲", "校門"]) {
      const before = lookups;
      await play(text);
      assert.equal(lookups, before + 1, "Typed kanji is checked against its dictionary reading");
      assert.ok((await page.locator("#feedback").textContent()).includes(READING_ENDING_RULE));
      assert.equal(await page.locator("#chainCount").textContent(), "1 words");
      assert.equal(await page.locator("#results").isVisible(), false);
    }
    const before = lookups;
    for (const text of ["こうもん", "コーヒー", "ｺｰﾋｰ", "かを", "カヲ"]) {
      await play(text);
      assert.ok((await page.locator("#feedback").textContent()).includes(READING_ENDING_RULE));
    }
    assert.equal(lookups, before, "Typed readings with forbidden endings are rejected before lookup");
    await page.click("#revealButton");
    await page.waitForFunction(() => !document.querySelector("#playWord").disabled);
    assert.equal(await page.inputValue("#wordInput"), "校庭", "Kanji reveals exclude forbidden readings");
    await page.click("#playWord");
    await page.waitForFunction(() => document.querySelector("#chainCount").textContent === "2 words");
  }

  await reset();
  assert.equal(await page.locator("#startOptions li:first-child span").textContent(), "ご");
  await page.locator("#wordInput").pressSequentially("gorira");
  assert.equal(await page.inputValue("#wordInput"), "ごりら", "Latin keyboard converts as you type");
  await page.click("#playWord");
  await page.waitForFunction(() => !document.querySelector("#wordInput").disabled);
  assert.equal(await page.locator("#startOptions li:first-child span").textContent(), "ら");
  assert.match(await page.locator("#scores").textContent(), /Player 1\s*10/);
  await play("らっぱ");
  assert.match(await page.locator("#turnLabel").textContent(), /Player 3/);
  await page.fill("#wordInput", "パン");
  await page.click("#playWord");
  assert.match(await page.locator("#feedback").textContent(), /Words ending in ん \/ ン are not accepted/);
  assert.equal(await page.locator("#results").isVisible(), false);
  await page.click("#playWord");
  assert.equal(await page.locator("#chainCount").textContent(), "3 words", "Rejected endings never enter the chain");
  assert.equal(await page.locator("#results").isVisible(), false, "Repeated invalid entries do not turn into accepted losing words");
  await page.click("#stopGame");
  assert.match(await page.locator("#results").textContent(), /New Word Discovery/);
  await page.click("#saveWord");
  await page.click("#reviewButton");
  assert.match(await page.locator("#reviewBody").textContent(), /trumpet/);
  await page.keyboard.press("Escape");
  await page.click("#settingsPanel > summary");
  const downloadPromise = page.waitForEvent("download");
  await page.click("#exportReview");
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^shiritori-review-/);
  await page.setInputFiles("#reviewFile", { name: "review.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ version: 1, words: [words[10]] })) });
  await page.waitForFunction(() => document.querySelector("#settingsError").textContent.startsWith("Imported"));
  await page.click("#romajiQuickToggle");
  await page.click("#furiganaQuickToggle");
  await page.click("#audioQuickToggle");
  assert.equal(await page.locator("html").getAttribute("data-study-audio"), "true");
  await page.click("#audioQuickToggle");
  assert.equal(await page.locator("html").getAttribute("data-study-romaji"), "true");
  assert.equal(await page.locator("html").getAttribute("data-study-furigana"), "false");
  assert.equal(await page.locator("html").getAttribute("data-study-audio"), "false");

  await reset({ mode: "sudden" });
  await play("ねこ");
  assert.match(await page.locator("#results").textContent(), /invalid connection/);
  await reset();
  await play("ごりら"); await play("らっぱ"); await play("ぱんだ"); await play("だいり");
  await play("りんご");
  assert.match(await page.locator("#feedback").textContent(), /word already used/);
  assert.equal(await page.locator("#chainCount").textContent(), "5 words");
  await reset({ entry: "kanji" });
  await page.fill("#wordInput", "こうてい");
  await page.click("#playWord");
  await page.waitForSelector("[data-choice]");
  assert.equal(await page.locator("#chainCount").textContent(), "1 words");
  await page.click("[data-choice='0']");
  assert.match(await page.locator("#feedback").textContent(), /校庭/);
  await page.waitForFunction(() => document.querySelector("#chainCount").textContent === "2 words" && !document.querySelector("#wordInput").disabled);
  assert.equal(await page.locator("#startOptions li:first-child span").textContent(), "庭");
  await page.click("[data-kanji='庭']");
  await page.waitForFunction(() => document.querySelector("#kanjiBody").textContent.includes("On’yomi"));
  assert.match(await page.locator("#kanjiBody").textContent(), /Kun’yomi|Example words/);
  await page.keyboard.press("Escape");
  await reset({ mode: "kanji" });
  assert.equal(await page.locator("#startOptions li:first-child span").textContent(), "校");
  await play("校庭");
  assert.equal(await page.locator("#startOptions li:first-child span").textContent(), "庭");
  await reset();
  await play("御社");
  assert.match(await page.locator("#results").textContent(), /no available continuation/);
  assert.match(await page.locator("#startOptions li:first-child span").textContent(), /ゃ/);
  await reset({ mode: "relaxed" });
  await play("ごりら"); await play("らっぱ"); await play("ぱん");
  assert.equal(await page.locator("#results").isVisible(), false, "Relaxed retries forbidden endings");
  assert.match(await page.locator("#feedback").textContent(), /ん \/ ン/);
  await play("ねこ");
  assert.match(await page.locator("#results").textContent(), /invalid connection/);

  await reset({ hints: "limited", hintLimit: 1, reveal: false });
  await page.click("#hintButton");
  await page.waitForFunction(() => !document.querySelector("#hintPanel").hidden);
  assert.equal(await page.locator("#hintButton").isDisabled(), true);
  assert.equal(await page.locator("#revealButton").isDisabled(), true);
  await play("ごりら");
  assert.equal(await page.locator("#hintButton").isDisabled(), false, "Next player has a separate hint budget");
  await reset({ opponent: "computer" });
  await play("ごりら");
  await page.waitForFunction(() => document.querySelector("#chainCount").textContent === "3 words" && !document.querySelector("#wordInput").disabled);
  assert.equal(await page.locator("#startOptions li:first-child span").textContent(), "ぱ");
  assert.match(await page.locator("#scores").textContent(), /Computer\s*10/);

  await reset({ mode: "sudden" });
  failLookup = true;
  await play("ねこ");
  assert.equal(await page.locator("#results").isVisible(), false, "Provider failure must not count as an invalid word");
  assert.match(await page.locator("#feedback").textContent(), /Fallback unavailable/);
  failLookup = false;
  await reset({ mode: "timed", timer: 10 });
  await page.clock.install();
  delayLookup = true;
  await page.fill("#wordInput", "ごりら");
  await page.click("#playWord");
  await page.clock.fastForward(11_000);
  await page.waitForSelector("#results:visible");
  assert.match(await page.locator("#results").textContent(), /time ran out/);
  await page.waitForTimeout(1200);
  assert.equal(await page.locator("#chainCount").textContent(), "1 words", "Late lookup must not append after timeout");
  delayLookup = false;
  await page.clock.resume();

  await reset({ mode: "beginner" });
  assert.equal(await page.locator("html").getAttribute("data-study-furigana"), "true");
  await page.waitForSelector("#hintPanel:visible");
  assert.match(await page.locator("#hintPanel").textContent(), /Beginner hint/);
  await reset({ mode: "daily" });
  assert.equal(await page.locator("#hintButton").isDisabled(), true);
  assert.equal(await page.locator("#revealButton").isDisabled(), true);
  assert.match(await page.locator("#turnLabel").textContent(), /0\/10/);
  await page.click("#stopGame");
  await reset({ mode: "daily" });
  assert.match(await page.locator("#feedback").textContent(), /today’s ranked attempt has already been used/);

  await page.click("#settingsPanel > summary");
  assert.equal(await page.locator("#gameSettings").evaluate((node) => node.disabled), false);
  await page.selectOption("#setting-fontSize", "larger");
  await page.check("#setting-contrast");
  if (await page.locator("html").getAttribute("data-theme") !== "dark") await page.click("#themeButton");
  await page.selectOption("#colorThemeSelect", "ocean");
  assert.equal(await page.locator("html").getAttribute("data-contrast"), "false", "Accessibility edits wait for the next game");
  await page.click("#newGame");
  await page.waitForFunction(() => !document.querySelector("#wordInput").disabled || !document.querySelector("#results").hidden);
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No overflow at ${width}px`);
  }
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  assert.equal(await page.locator("html").getAttribute("data-color-theme"), "ocean", "Saving game settings preserves top-bar appearance");
  assert.equal(await page.locator("html").getAttribute("data-contrast"), "true");
  assert.deepEqual(errors, []);
  console.log("Shiritori browser checks passed: live dictionary, conversion, local/computer turns, terminal rules, assistance, learning, progress, timers, daily settings and responsive layouts.");
} finally {
  await browser?.close();
  await vite?.close();
  api.close(); await once(api, "close");
}
