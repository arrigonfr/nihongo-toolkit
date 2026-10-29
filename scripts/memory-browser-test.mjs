import assert from "node:assert/strict";
import { toolPage, acceptStudyDialogs } from "./tool-page.mjs";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer as viteServer } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";
import { toHiragana } from "../frontend/src/memory-engine.js";

const origins = [];
const api = createServer(createHandler({ origins, sentenceFallback: async () => [] }));
api.listen(0, "127.0.0.1");
await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
let vite, browser;
try {
  vite = await viteServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 5197, strictPort: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  origins.push(base);
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    if (!localStorage.getItem("nihon:study-controls-v1")) localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false, furigana: false, romaji: false }));
    window.__spoken = [];
    speechSynthesis.speak = (utterance) => window.__spoken.push(utterance.text);
    speechSynthesis.cancel = () => {};
  });
  await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = toolPage(await context.newPage());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await acceptStudyDialogs(page);
  const url = `${base}/絵合わせ.html`;
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("nihon:memory-v1")));
  const card = (id) => page.locator(`[data-card="${id}"]`);
  async function confirmedClick(selector) {
    await page.click(selector);
    await page.locator(".study-confirm-dialog").waitFor({ state: "detached" });
  }
  async function configure(values) {
    if (!await page.locator("#settingsPanel").evaluate((panel) => panel.open)) await page.click("#settingsPanel summary");
    for (const [key, value] of Object.entries(values)) {
      const input = page.locator(`#setting-${key}`);
      const tag = await input.evaluate((element) => element.tagName);
      if (tag === "SELECT") await input.selectOption(String(value), { force: true });
      else if (typeof value === "boolean") await input.setChecked(value);
      else await input.fill(String(value));
    }
    assert.equal(await page.locator('#settingsForm button[type="submit"]').count(), 0);
    assert.equal(await page.locator("#settingsPanel").evaluate((element) => element.open), true);
  }
  async function start() {
    await page.click("#newGame");
    await page.locator(".study-confirm-dialog").waitFor({ state: "detached" });
    await page.waitForFunction(() => !document.getElementById("newGame").disabled);
    assert.equal(await page.getAttribute("#notice", "data-error"), "false", await page.textContent("#notice"));
  }
  async function scan() {
    const ids = await page.locator("[data-card]").evaluateAll((cards) => cards.map((card) => Number(card.dataset.card)));
    const pairs = new Map();
    for (const id of ids) {
      if (!(await card(id).getAttribute("class")).includes("matched")) await card(id).click();
      const text = await card(id).locator(".study-japanese").evaluate((label) => {
        const copy = label.cloneNode(true); copy.querySelectorAll("rt").forEach((node) => node.remove()); return copy.textContent;
      });
      const key = toHiragana(text);
      pairs.set(key, [...(pairs.get(key) || []), id]);
      if (await page.locator(".mismatch").count()) await page.waitForFunction(() => !document.querySelector(".mismatch"));
    }
    return [...pairs.values()];
  }
  async function solve(pairs) {
    for (const pair of pairs) for (const id of pair) {
      if (!(await card(id).getAttribute("class")).includes("matched")) await card(id).click();
    }
    await page.locator("#results").waitFor({ state: "visible" });
  }
  await page.goto(url);
  assert.equal(await page.locator("[data-card]").count(), 0);
  await page.click("#helpButton");
  assert.match(await page.textContent("#helpDialog"), /Flip two cards/);
  await page.keyboard.press("Escape");
  await configure({ examples: false, content: "kana", pairing: "ht", grid: "custom", count: 2, players: 2 });
  assert.equal(await page.locator('#setting-pairing option[value="kh"]').count(), 0);
  assert.equal(await page.locator("#setting-level").isVisible(), false);
  assert.deepEqual(await page.locator("#setting-shuffle option").allTextContents(), ["Never", "After match", "After mismatch", "All"]);
  assert.equal(await page.locator("#setting-shuffle").evaluate((input) =>
    input.closest("label").nextElementSibling === document.getElementById("setting-disappear").closest(".setting")), true);
  for (const shuffle of ["match", "mismatch", "all", "never"]) {
    await configure({ shuffle });
    await page.reload();
    assert.equal(await page.inputValue("#setting-shuffle"), shuffle);
    assert.equal((await saved()).settings.shuffle, shuffle);
  }
  for (const [legacy, expected] of [[true, "mismatch"], [false, "never"]]) {
    const progress = (await saved()).progress;
    await page.evaluate((shuffle) => {
      const data = JSON.parse(localStorage.getItem("nihon:memory-v1"));
      data.settings.shuffle = shuffle;
      localStorage.setItem("nihon:memory-v1", JSON.stringify(data));
    }, legacy);
    await page.reload();
    assert.equal(await page.inputValue("#setting-shuffle"), expected);
    assert.deepEqual((await saved()).progress, progress, "Shuffle migration preserves progress");
    await configure({ shuffle: expected });
    assert.equal((await saved()).settings.shuffle, expected);
  }
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [group, examples] of [
      ["voiced", ["が / ガ (ga)", "ぱ / パ (pa)"]],
      ["yoon", ["きゃ / キャ (kya)", "しゅ / シュ (shu)"]],
      ["special", ["かあ / カー (kaa)", "きって / キッテ (kitte)", "しんよう / シンヨウ (shin'you)"]]
    ]) {
      const input = page.locator(`#setting-groups ~ .chips [data-value="${group}"] input`);
      const checked = await input.isChecked();
      await page.locator(`#setting-groups ~ .chips [data-value="${group}"]`).hover();
      const tooltip = page.locator("#studySettingTooltip");
      assert.equal(await tooltip.isVisible(), true);
      for (const example of examples) assert.ok((await tooltip.textContent()).includes(example));
      assert.equal(await input.isChecked(), checked, "Tooltip examples do not toggle the kana group chip");
      assert.equal(await tooltip.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth;
      }), true);
      await page.keyboard.press("Escape");
    }
    const alignment = await page.locator(".setting:has(#setting-correction)").evaluate((label) => {
      const input = label.querySelector("input").getBoundingClientRect();
      const title = label.querySelector(".setting-name");
      const bounds = title.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(title);
      return { textAlign: getComputedStyle(title).textAlign, gap: bounds.left - input.right,
        lineOffsets: [...range.getClientRects()].map((line) => line.left - bounds.left) };
    });
    assert.equal(alignment.textAlign, "start");
    assert.ok(alignment.gap >= 6 && alignment.gap <= 16, "Correction label stays beside its checkbox");
    assert.ok(alignment.lineOffsets.every((offset) => Math.abs(offset) <= 1), "Wrapped lines stay left-aligned");
  }
  await start();
  assert.equal(await page.locator("[data-card]").count(), 4);
  assert.equal(await page.locator("#board .study-japanese").count(), 0, "Hidden answers are absent from the DOM");
  const pairs = await scan();
  assert.equal(pairs.length, 2);
  assert.ok(pairs.every((pair) => pair.length === 2));
  const initialCompleted = (await saved()).progress.completed;
  await confirmedClick("#restartButton");
  assert.match(await page.textContent("#progressText"), /0 of 2/);
  await card(pairs[0][0]).focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator(".selected").count(), 1);
  assert.equal(await page.locator("#hintButton").isDisabled(), true);
  await card(pairs[1][0]).click();
  await card(pairs[0][1]).click();
  assert.equal(await page.locator(".selected").count(), 2, "Third flip ignored during mismatch");
  await page.waitForFunction(() => !document.querySelector(".mismatch"));
  assert.match(await page.textContent("#turnText"), /Player 2/);
  assert.equal((await saved()).progress.review.length >= 2, true);
  await solve(pairs);
  assert.match(await page.textContent("#results"), /Player 2 wins/);
  assert.equal((await saved()).progress.completed, initialCompleted + 1);
  assert.equal(await page.locator("#matches button").count(), 2);
  await page.locator("#matches button").first().click();
  assert.match(await page.textContent("#details"), /Hiragana|Katakana|Romaji/);
  await page.click("#saveItem");
  assert.equal(await page.textContent("#saveItem"), "Saved to notebook");

  const order = () => page.locator("[data-card]").evaluateAll((cards) => cards.map((card) => Number(card.dataset.card)));
  for (const shuffle of ["never", "match", "mismatch", "all"]) {
    await configure({ shuffle, count: 3 });
    await start();
    const shuffledPairs = await scan();
    await confirmedClick("#restartButton");
    await page.evaluate(() => { window.__originalRandom = Math.random; Math.random = () => 0; });
    const before = await order();
    for (const id of shuffledPairs[0]) await card(id).click();
    const afterMatch = await order();
    if (["match", "all"].includes(shuffle)) assert.notDeepEqual(afterMatch, before, `${shuffle}: matching shuffles the board`);
    else assert.deepEqual(afterMatch, before, `${shuffle}: matching keeps the board in place`);
    await card(shuffledPairs[1][0]).click();
    await card(shuffledPairs[2][0]).click();
    assert.deepEqual(await order(), afterMatch, "Mismatches remain visible before shuffling");
    await page.waitForFunction(() => !document.querySelector(".mismatch"));
    const afterMismatch = await order();
    if (["mismatch", "all"].includes(shuffle)) assert.notDeepEqual(afterMismatch, afterMatch, `${shuffle}: mismatching shuffles the board`);
    else assert.deepEqual(afterMismatch, afterMatch, `${shuffle}: mismatching keeps the board in place`);
    for (const id of shuffledPairs[0]) assert.equal(afterMismatch.indexOf(id), before.indexOf(id), "Matched cards stay in their slots");
    assert.deepEqual([...afterMismatch].sort(), [...before].sort());
    await page.evaluate(() => { Math.random = window.__originalRandom; delete window.__originalRandom; });
  }

  await configure({ shuffle: "never", count: 2, players: 1, hints: "limited", hintLimit: 1, reveals: "limited", revealLimit: 1, disappear: true });
  await start();
  await page.click("#hintButton");
  assert.equal(await page.locator(".hinted").count(), 2);
  assert.equal(await page.locator("#revealButton").isDisabled(), true);
  await page.waitForFunction(() => !document.querySelector(".hinted"));
  assert.equal(await page.locator("#hintButton").isDisabled(), true);
  await page.click("#revealButton");
  assert.equal(await page.locator(".removed").count(), 2);
  assert.equal(await page.locator("#revealButton").isDisabled(), true);
  assert.match(await page.textContent("#progressText"), /1 of 2/);
  assert.match(await page.textContent("#stats"), /0%/);
  await confirmedClick("#endButton");
  assert.match(await page.textContent("#results"), /Round ended/);

  await configure({ disappear: false, shuffle: "all", mode: "daily" });
  assert.equal(await page.locator("#setting-shuffle").isDisabled(), true);
  await start();
  let daily = (await saved()).progress.daily;
  assert.equal(daily.game.rules.shuffle, "never");
  assert.equal((await saved()).settings.shuffle, "all");
  assert.equal(daily.game.deck.cards.length, 16);
  const first = daily.game.deck.cards.filter((card) => card.key === daily.game.deck.pairs[0].key);
  await card(first[0].id).click();
  await page.reload(); await start();
  assert.equal(await page.locator(".selected").count(), 1);
  await card(first[1].id).click();
  assert.match(await page.textContent("#progressText"), /1 of 8/);
  await start();
  assert.match(await page.textContent("#progressText"), /1 of 8/, "Opening the active daily round does not end it");
  await page.reload(); await start();
  assert.match(await page.textContent("#progressText"), /1 of 8/);
  assert.equal(await page.locator("#restartButton").isDisabled(), true);
  daily = (await saved()).progress.daily;
  const dailyPairs = daily.game.deck.pairs.map((pair) => daily.game.deck.cards.filter((card) => card.key === pair.key).map((card) => card.id));
  await solve(dailyPairs);
  assert.equal((await saved()).progress.days.length, 1);
  const completed = (await saved()).progress.completed;
  await page.reload(); await start();
  assert.equal(await page.locator("#results").isVisible(), true);
  assert.equal((await saved()).progress.completed, completed);

  await configure({ mode: "moves", shuffle: "never", flips: 2, count: 2 });
  await start();
  await page.locator("[data-card]").nth(0).click();
  await page.locator("[data-card]").nth(1).click();
  assert.match(await page.textContent("#results"), /Flip limit reached/);
  await configure({ mode: "timed", seconds: 10 });
  await page.clock.install();
  await start();
  await page.clock.fastForward(11000);
  assert.match(await page.textContent("#results"), /Time is up/);
  await page.clock.resume();
  await configure({ mode: "marathon", count: 1, rounds: 2, reveals: "unlimited" });
  await start();
  await page.click("#revealButton");
  await page.click("#nextRound");
  await page.waitForFunction(() => !document.getElementById("newGame").disabled);
  assert.equal(await page.locator("[data-card]").count(), 6);
  assert.match(await page.textContent("#roundLabel"), /2 \/ 2/);
  for (let i = 0; i < 3; i++) await page.click("#revealButton");
  assert.match(await page.textContent("#results"), /Marathon complete/);

  await configure({ mode: "review", count: 2 });
  await start();
  assert.equal(await page.locator("[data-card]").count(), 4);
  await configure({ mode: "listening", count: 3, correction: true, hints: "unlimited" });
  await page.click("#newGame");
  await page.locator(".study-confirm-dialog").waitFor({ state: "detached" });
  await page.waitForFunction(() => !document.getElementById("newGame").disabled);
  assert.match(await page.textContent("#startError"), /Audio On/);
  await page.click("#audioQuickToggle");
  await start();
  const audioPairs = new Map();
  for (const id of await order()) {
    const before = await page.evaluate(() => window.__spoken.length);
    await card(id).click();
    const audio = await card(id).locator(".audio-face").count() > 0;
    const spoken = await page.evaluate(() => window.__spoken);
    if (audio) assert.equal(spoken.length, before + 1, "Every newly flipped audio card plays exactly once");
    const text = audio ? spoken.at(-1) : await card(id).locator(".study-japanese").evaluate((node) => {
      const copy = node.cloneNode(true); copy.querySelectorAll("rt").forEach((ruby) => ruby.remove()); return copy.textContent;
    });
    const pair = audioPairs.get(text) || { text };
    pair[audio ? "audio" : "written"] = id;
    audioPairs.set(text, pair);
    if (await page.locator(".mismatch").count()) await page.waitForFunction(() => !document.querySelector(".mismatch"));
  }
  assert.equal(audioPairs.size, 3);
  assert.ok([...audioPairs.values()].every((pair) => Number.isInteger(pair.audio) && Number.isInteger(pair.written)));
  const [a, b, c] = [...audioPairs.values()];
  await confirmedClick("#restartButton");
  await page.evaluate(() => { window.__spoken = []; });
  const expectedSpeech = [];
  async function hear(pair) {
    await card(pair.audio).click();
    expectedSpeech.push(pair.text);
    assert.deepEqual(await page.evaluate(() => window.__spoken), expectedSpeech);
  }
  await hear(a); await hear(b);
  await hear(a); await hear(b);
  await card(c.audio).click();
  assert.deepEqual(await page.evaluate(() => window.__spoken), expectedSpeech, "A locked hidden third card never leaks its sound");
  assert.equal(await page.locator(".selected").count(), 2);
  await page.waitForFunction(() => !document.querySelector(".mismatch"));
  await hear(b); await hear(a);
  await page.waitForFunction(() => !document.querySelector(".mismatch"));
  await card(a.written).click(); await hear(a);
  await hear(a);
  await hear(b); await card(b.written).click();
  expectedSpeech.push(b.text);
  assert.deepEqual(await page.evaluate(() => window.__spoken), expectedSpeech, "Written matches still pronounce the matched item");
  await page.click("#audioQuickToggle");
  await card(a.audio).click();
  assert.deepEqual(await page.evaluate(() => window.__spoken), expectedSpeech, "Replays respect Audio Off");
  await page.click("#audioQuickToggle");
  await card(c.written).click(); await hear(c);
  await hear(a);
  assert.equal(await page.locator("#results").isVisible(), true);

  await confirmedClick("#restartButton");
  await card(a.written).click(); await card(b.written).click();
  await hear(a); await hear(b);
  assert.equal(await page.locator(".selected").count(), 2, "Correction previews replay without becoming extra flips");
  await page.waitForFunction(() => !document.querySelector(".mismatch"));
  await page.selectOption("#hintType", "pair");
  await page.click("#hintButton");
  const hinted = Number(await page.locator(".hinted:has(.audio-face)").getAttribute("data-card"));
  await hear([...audioPairs.values()].find((pair) => pair.audio === hinted));
  assert.equal(await page.locator(".selected").count(), 0, "Hint previews replay without starting a turn");

  await configure({ mode: "classic", correction: false, content: "words", pairing: "kh", display: "text", count: 6, examples: true, reveals: "unlimited" });
  await start();
  assert.equal(await page.locator("[data-card]").count(), 12, "Real dictionary word round");
  await page.click("#revealButton");
  await page.locator("#wordExamples .sentence-next:not(:disabled)").waitFor();
  assert.match(await page.textContent("#details"), /In context/);
  assert.equal(await page.locator(".detail-word .study-japanese").count(), 1);
  await page.click("#furiganaQuickToggle");
  assert.equal(await page.getAttribute("html", "data-study-furigana"), "true");
  await page.click("#romajiQuickToggle");
  assert.equal(await page.getAttribute("html", "data-study-romaji"), "true");
  await configure({ contrast: true, fontSize: 40, grid: "6x6" });
  if (await page.getAttribute("html", "data-theme") !== "light") await page.click("#themeButton");
  assert.equal(await page.getAttribute("html", "data-contrast"), "false", "Display settings wait for a new puzzle");
  assert.equal(await page.getAttribute("html", "data-theme"), "light");
  await start();
  assert.equal(await page.getAttribute("html", "data-contrast"), "true");
  assert.equal(await page.locator("[data-card]").count(), 36);
  await page.setViewportSize({ width: 375, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.ok(await page.locator("#board").evaluate((board) => board.parentElement.scrollWidth > board.parentElement.clientWidth), "Board scrolls instead of shrinking Japanese characters");
  if (process.env.MEMORY_SCREENSHOT) await page.screenshot({ path: process.env.MEMORY_SCREENSHOT, fullPage: true });
  await page.click("#reviewButton");
  const before = (await saved()).progress.review.length;
  await page.locator("#reviewFile").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"tool":"bad"}') });
  await page.waitForFunction(() => document.getElementById("reviewNotice").textContent.includes("Memory review export"));
  assert.equal((await saved()).progress.review.length, before);
  const payload = { tool: "nihon-memory", version: 1, items: [{ kind: "word", word: "猫", reading: "ねこ", meaning: "<script>alert(1)</script>", partOfSpeech: "noun", level: 5 }] };
  await page.locator("#reviewFile").setInputFiles({ name: "review.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(payload)) });
  await page.waitForFunction(() => document.getElementById("reviewNotice").textContent.includes("merged"));
  assert.equal(await page.locator("#reviewList script").count(), 0);
  const download = page.waitForEvent("download");
  await page.click("#exportReview");
  assert.match((await download).suggestedFilename(), /nihon-memory-review/);
  await confirmedClick("#resetProgress");
  assert.equal((await saved()).progress.review.length, 0);
  assert.equal((await saved()).progress.completed, 0);
  assert.equal(await page.locator("[data-card]").count(), 0);
  await page.keyboard.press("Escape");
  for (const [pairing, content] of [
    ["same-katakana", "kana"], ["same-hiragana", "kana"],
    ["same-katakana", "words"], ["same-hiragana", "words"], ["same-kanji", "words"]
  ]) {
    await configure({ examples: false, content, pairing, mode: "classic", grid: "custom", count: 2, display: "text" });
    assert.equal(await page.locator('#setting-pairing option[value="same-kanji"]').count(), content === "words" ? 1 : 0);
    await start();
    assert.equal(await page.locator("[data-card]").count(), 4);
    const pairs = await scan();
    assert.equal(pairs.length, 2);
    assert.ok(pairs.every((pair) => pair.length === 2));
    await solve(pairs);
    await page.reload();
    assert.equal(await page.locator("#setting-pairing").inputValue(), pairing);
  }
  await page.goto(`${base}/index.html`);
  await page.click("#menuButton");
  await page.click('[data-file="絵合わせ.html"]');
  await page.frameLocator("#helperFrame").locator("#startButton").waitFor();
  assert.equal(await page.getAttribute("#helperFrame", "src"), "絵合わせ.html");
  assert.deepEqual(errors, []);
  console.log("Memory browser checks passed: matching, keyboard, turn locking, assistance, persistence, daily, challenges, audio, dictionary, mobile, notebook, shared controls, launcher.");
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}
