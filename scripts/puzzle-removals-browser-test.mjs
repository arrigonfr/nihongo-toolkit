import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { DEFAULTS as memoryDefaults } from "../frontend/src/memory-engine.js";
import { DEFAULTS as searchDefaults } from "../frontend/src/word-search-engine.js";

const words = [
  ["日本", "にほん", "Japan"], ["本屋", "ほんや", "bookstore"],
  ["毎日", "まいにち", "every day"], ["休日", "きゅうじつ", "holiday"],
  ["休む", "やすむ", "rest"], ["楽しむ", "たのしむ", "enjoy"],
  ["楽しい", "たのしい", "fun"], ["新しい", "あたらしい", "new"],
  ["新年", "しんねん", "new year"], ["来年", "らいねん", "next year"],
  ["食べる", "たべる", "eat"], ["飲み物", "のみもの", "drink"]
].map(([word, reading, meaning], id) => ({ id, word, reading, furigana: reading, meaning, level: 5, partOfSpeech: "noun" }));
const profiles = [
  {
    file: "eawase.html", key: "nihon:memory-v1", start: "#startButton", board: "[data-card]",
    saved: { settings: { ...memoryDefaults, content: "kana", pairing: "ht", mode: "daily", category: "animals" },
      progress: { review: [], recent: ["preserved"], completed: 7, daily: { broken: true }, days: ["obsolete"] } }
  },
  {
    file: "kotoba-sagashi.html", key: "nihon:word-search-v1", start: "#startButton", board: "[data-cell]",
    saved: { settings: { ...searchDefaults, mode: "daily", category: "animals", list: "icon,japanese" },
      progress: { known: [], review: [], recent: ["preserved"], completed: 7, daily: { broken: true }, days: ["obsolete"] } }
  },
  {
    file: "pazuru.html", key: "nihon:crossword-settings-v1", start: "#newPuzzleBtn", board: ".cw-cell:not(.block)",
    saved: { gameMode: "daily", themeCategory: "food", answerMode: "kana", level: "5", size: "small", timerEnabled: false }
  }
];
let vite, browser;
try {
  vite = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 0 } });
  await vite.listen();
  browser = await chromium.launch();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  for (const profile of profiles) {
    const context = await browser.newContext();
    await context.addInitScript(({ key, saved }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(saved));
      localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false }));
    }, profile);
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/word-search/vocabulary" || url.pathname === "/api/words/batch") return route.fulfill({ json: { items: words } });
      return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/${profile.file}`);
    await page.locator(profile.start).waitFor();
    const restored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), profile.key);
    const settings = restored.settings || restored;
    assert.equal(settings.mode || settings.gameMode, "classic");
    assert.equal("category" in settings || "themeCategory" in settings, false);
    if (restored.progress) {
      assert.equal(restored.progress.completed, 7);
      assert.deepEqual(restored.progress.recent, ["preserved"]);
      assert.equal("daily" in restored.progress || "days" in restored.progress, false);
    }
    if (profile.file === "kotoba-sagashi.html") assert.equal(settings.list, "japanese");
    assert.equal(await page.locator('option[value="daily"], #setting-category, #themeSelect, #setting-list option[value="icon"]').count(), 0);
    await page.click(profile.start);
    await page.locator(profile.board).first().waitFor();
    await page.reload();
    await page.locator(profile.start).waitFor();
    assert.deepEqual(errors, [], profile.file);
    await context.close();
  }
  console.log("Puzzle removals browser checks passed: legacy migration, preserved progress, removed controls, playable rounds, reloads.");
} finally {
  await browser?.close();
  await vite?.close();
}
