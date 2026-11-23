import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 0, strictPort: false } });
let browser;
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch();
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false }));
      localStorage.setItem("nihon:crossword-settings-v1", JSON.stringify({ answerMode: "kana", inputStyle: "popup", size: "small", gameMode: "relaxed" }));
      Math.random = () => .1;
    });
    const kanji = ["日", "白", "目", "自", "木", "本", "人", "入", "大", "犬"].map((character, index) => ({
      id: index, kanji: character, jlpt: 5, meanings: ["day", "sun", "Japan"], on_readings: ["ニチ", "ジツ"], kun_readings: ["ひ", "か", `た${"あいうえおかきくけこ"[index]}`], examples: []
    }));
    const words = [
      ["かさ", "umbrella"], ["サル", "monkey"], ["るす", "absence"], ["スシ", "sushi"], ["しま", "island"], ["マメ", "beans"]
    ].map(([word, meaning], index) => ({ id: index, word, reading: word, furigana: word, meaning, level: 5 }));
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/kanji/batch") return route.fulfill({ json: { items: kanji } });
      if (url.pathname === "/api/words/batch") return route.fulfill({ json: { items: words } });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { items: [], data: [] } });
      return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const change = (id, value) => page.locator(`#${id}`).evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); }, value);
    await page.goto(`${base}/kana.html`);
    assert.equal(await page.locator("#answerCandidates").count(), 0);
    assert.equal(await page.locator(".direction-chips .chip-option").count(), 4);
    await page.locator('.direction-chips [data-value="romaji-hiragana"]').click();
    assert.equal(await page.inputValue("#kanaDirection"), "romaji-hiragana");
    await page.locator('.direction-chips [data-value="romaji-katakana"]').click();
    assert.equal(await page.inputValue("#kanaDirection"), "romaji-hiragana,romaji-katakana");
    assert.equal(await page.locator(".direction-field .study-settings-note").isVisible(), true);
    await page.locator('.direction-chips [data-value="hiragana-romaji"]').click();
    assert.equal(await page.inputValue("#kanaDirection"), "hiragana-romaji");
    assert.equal(await page.locator(".direction-field .study-settings-note").isVisible(), false);
    assert.equal(await page.locator(".settings-body > :first-child").getAttribute("class"), "study-settings-note");
    assert.ok(!/On|Off/.test(await page.locator("#audioQuickToggle").textContent()));
    const theme = await page.locator("#themeButton").boundingBox();
    assert.equal(theme.width, theme.height);
    await page.click(".study-palette > summary");
    await page.click('[data-palette="sakura"]');
    assert.equal(await page.locator("html").getAttribute("data-color-theme"), "sakura");
    assert.equal(await page.locator(".study-palette").getAttribute("open"), null);
    assert.equal(await page.locator(".dashboard-back").count(), 0);
    const menu = await page.locator("#menuButton").boundingBox();
    assert.ok(Math.abs(menu.y + menu.height / 2 - theme.y - theme.height / 2) < 2);
    await page.click("#menuButton");
    assert.equal(await page.locator("#helperMenu > a .helper-name").first().textContent(), "Home");
    assert.equal(await page.locator(".home-link .helper-icon img").getAttribute("src"), "/logo-mark.webp");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: `/tmp/nihon-header-${width}.png` });
    await page.click("#startSessionButton");
    assert.equal(await page.locator("#answerInput").evaluate((node) => document.activeElement === node), true);
    assert.ok(await page.locator(".answer-feedback-slot").evaluate((node) => node.getBoundingClientRect().height <= 36));
    for (const tool of ["yomi", "imi"]) {
      await page.goto(`${base}/${tool}.html`);
      if (tool === "yomi") await change("readingDirection", "reading-katakana");
      else assert.equal(await page.locator("#meaningDirection option").count(), 2);
      await page.click("#startSessionButton");
      await page.waitForFunction(() => document.querySelector("#questionCount").textContent.startsWith("Question "));
      await page.fill("#answerInput", tool === "yomi" ? "にち" : "day");
      await page.press("#answerInput", "Enter");
      const alternatives = await page.locator(".accepted-alternatives").textContent();
      assert.ok(tool === "yomi" ? alternatives.includes("ジツ") && !alternatives.includes("ひ") : alternatives.includes("sun") && alternatives.includes("Japan"));
      await page.waitForFunction(() => document.querySelector("#questionCount").textContent === "Question 2");
      await page.waitForFunction(() => !document.querySelector(".request-loading-panel"));
      assert.equal(await page.locator("#answerInput").evaluate((node) => document.activeElement === node), true);
      await page.screenshot({ path: `/tmp/nihon-${tool}-${width}.png` });
    }
    await page.goto(`${base}/goi.html`);
    assert.equal(await page.locator("#modeSelect option").count(), 4);
    await change("modeSelect", "typing-ej");
    await change("kanaDirection", "to-kana");
    assert.equal(await page.locator("#keyboardNote").isVisible(), true);
    assert.equal(await page.locator("#levelSelect").evaluate((node) => node.closest(".chips-field").contains(document.querySelector(".level-note"))), true);
    assert.ok(await page.locator(".level-note").evaluate((node) => {
      const buttons = [...node.parentElement.querySelectorAll("button")].filter((button) => button.getClientRects().length);
      return buttons.every((button) => button.getBoundingClientRect().bottom <= node.getBoundingClientRect().top);
    }));
    await page.screenshot({ path: `/tmp/nihon-goi-settings-${width}.png` });
    await page.click("#startButton");
    await page.locator("#answerInput").waitFor();
    await page.waitForFunction(() => !document.querySelector(".request-loading-panel"));
    assert.ok(await page.locator(".stats-breakdowns").evaluate((node) => node.getBoundingClientRect().height < 100));
    assert.equal(await page.locator("#answerInput").evaluate((node) => document.activeElement === node), true);
    await page.screenshot({ path: `/tmp/nihon-goi-${width}.png` });
    await page.goto(`${base}/kanji-kuizu.html`);
    await change("variants", "kanji-reading");
    await page.click("#start");
    await page.locator("#choices button").first().waitFor();
    await page.waitForFunction(() => !document.querySelector(".request-loading-panel"));
    assert.equal(await page.locator("#choices .imposters-shortcut").first().isVisible(), width > 760);
    await page.keyboard.press("1");
    assert.equal(await page.locator('#choices [data-choice="0"]').getAttribute("aria-pressed"), width > 760 ? "true" : "false");
    if (width > 760) {
      await page.keyboard.press("c");
      assert.equal(await page.locator("#next").isVisible(), true);
      await page.keyboard.press("n");
      assert.match(await page.locator("#progress").textContent(), /Question 2/);
    }
    await page.screenshot({ path: `/tmp/nihon-kuizu-${width}.png` });
    await page.goto(`${base}/pazuru.html`);
    await page.click("#newPuzzleBtn");
    await page.locator(".cw-clue-item").first().waitFor();
    await page.locator(".cw-clue-item").first().click();
    await page.locator("#popoverAnswerInput").waitFor();
    const clue = await page.locator(".cw-popover-clue").textContent();
    const answer = words.find((word) => clue.includes(word.meaning));
    assert.ok(answer, clue);
    await page.fill("#popoverAnswerInput", answer.word);
    await page.press("#popoverAnswerInput", "Enter");
    await page.locator("#popoverAnswerInput").waitFor({ state: "detached" });
    assert.ok(await page.locator(".cw-cell-split").count() > 0);
    await page.screenshot({ path: `/tmp/nihon-pazuru-${width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const file of readdirSync(new URL("../frontend", import.meta.url)).filter((name) => name.endsWith(".html") && name !== "文字.html")) {
      const path = file === "index.html" ? "" : file.replace(/\.html$/, "");
      await page.goto(`${base}/${path}`);
      await page.locator("header.study-header > .study-appearance").waitFor();
      const header = page.locator("header.study-header");
      const navigation = await header.locator("#menuButton").boundingBox();
      const appearance = await header.locator(".study-appearance").boundingBox();
      const brand = await header.locator(".brand, .cw-brand").boundingBox();
      assert.ok(navigation.x + navigation.width <= brand.x, `${file}: menu overlaps brand`);
      assert.ok(brand.x + brand.width <= appearance.x, `${file}: brand overlaps appearance`);
      assert.ok(Math.abs(navigation.y + navigation.height / 2 - appearance.y - appearance.height / 2) < 2, `${file}: controls wrap`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${file}: overflow`);
      await page.click("#menuButton");
      assert.equal(await page.locator(".home-link").isVisible(), true);
      assert.equal(await page.locator(".home-link .helper-icon").isVisible(), true);
      if (file !== "index.html" && file !== "data-sources.html") {
        assert.equal(await page.locator(`.helper-link[data-file="${file}"]`).getAttribute("aria-current"), "page");
      }
      await page.keyboard.press("Escape");
      await header.screenshot({ path: `/tmp/nihon-header-${path || "home"}-${width}.png` });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("Requested direction, notices, focus, header alignment, JLPT spacing and mixed-script popup regressions passed at 320px, 390px and 1280px.");
} finally { await browser?.close(); await server.close(); }