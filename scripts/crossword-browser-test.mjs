import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { hasKanji } from "../frontend/src/crossword-engine.js";
import { romanizeKana } from "../frontend/src/romanize.js";

const vocabulary = [
  ["日本", "にほん", "Japan"], ["本屋", "ほんや", "bookstore"],
  ["毎日", "まいにち", "every day"], ["休日", "きゅうじつ", "holiday"],
  ["休む", "やすむ", "rest"], ["楽しむ", "たのしむ", "enjoy"],
  ["楽しい", "たのしい", "fun"], ["新しい", "あたらしい", "new"],
  ["新年", "しんねん", "new year"], ["来年", "らいねん", "next year"],
  ["来る", "くる", "come"], ["食べる", "たべる", "eat"],
  ["食べ物", "たべもの", "food"], ["飲み物", "のみもの", "drink"],
  ["飲む", "のむ", "drink"], ["テーブル", "テーブル", "table"],
  ["テープ", "テープ", "tape"], ["スープ", "スープ", "soup"],
  ["スプーン", "スプーン", "spoon"], ["コート", "コート", "coat"],
  ["ノート", "ノート", "notebook"], ["レコード", "レコード", "record"]
].map(([word, furigana, meaning], index) => ({ id: `fixture-${index}`, word, furigana, meaning, level: 5 }));
const kanaOnly = vocabulary.filter((item) => !hasKanji(item.word));
const isolated = [
  { id: "isolated-1", word: "日本", furigana: "にほん", meaning: "Japan", level: 2 },
  { id: "isolated-2", word: "学校", furigana: "がっこう", meaning: "school", level: 2 },
  { id: "isolated-3", word: "飲む", furigana: "のむ", meaning: "drink", level: 2 }
];
const crossingWords = [
  { id: "crossing-down", word: "渡る", furigana: "わたる", meaning: "go across", level: 5 },
  { id: "crossing-across", word: "渡す", furigana: "わたす", meaning: "hand over", level: 5 }
];

process.env.VITE_API_BASE_URL = "http://127.0.0.1:5199";
let vite, browser;
try {
  vite = await createServer({
    root: fileURLToPath(new URL("../frontend", import.meta.url)),
    server: { host: "127.0.0.1", port: 0, strictPort: false }
  });
  await vite.listen();
  browser = await chromium.launch();
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    await context.addInitScript(() => {
      Math.random = () => Number(localStorage.getItem("test:crossword-random") || 0.04);
      Date.now = () => 1760000000000;
      if (!localStorage.getItem("nihon:crossword-settings-v1")) {
        localStorage.setItem("nihon:crossword-settings-v1", JSON.stringify({
          answerMode: "kana", gameMode: "classic", level: "5", size: "small", timerEnabled: false
        }));
      }
      localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false, furigana: false, romaji: false }));
    });
    const errors = [];
    let crossingFixture = false;
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/words/batch") {
        const level = url.searchParams.get("level");
        return route.fulfill({ json: {
          items: crossingFixture ? crossingWords : level === "1" ? kanaOnly : level === "2" ? isolated : vocabulary
        } });
      }
      if (url.pathname === "/api/sentences") return route.fulfill({ json: { data: [] } });
      if (url.pathname.startsWith("/api/kanji/")) {
        const kanji = decodeURIComponent(url.pathname.slice("/api/kanji/".length));
        return route.fulfill({ json: { kanji, meanings: [], on_readings: [], kun_readings: [] } });
      }
      if (url.pathname.startsWith("/api/")) {
        errors.push(`Unexpected request: ${url.pathname}`);
        return route.abort();
      }
      return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    page.on("dialog", (dialog) => dialog.accept());
    const snapshot = () => page.evaluate(() => ({
      cells: [...document.querySelectorAll("#crosswordGrid .cw-cell:not(.block)")].map((cell) => ({
        row: Number(cell.dataset.row), col: Number(cell.dataset.col), value: cell.dataset.char,
        number: Number(cell.querySelector(".cw-cell-num")?.textContent)
      })),
      entries: [...document.querySelectorAll(".cw-clue-item")].map((clue) => ({
        id: clue.dataset.entryId,
        length: Number(clue.querySelector(".cw-clue-meta").textContent.match(/Length:\s*(\d+)/)[1]),
        badge: clue.querySelector(".cw-badge").textContent,
        meaning: clue.querySelector(".cw-clue-body > div:nth-child(2)").textContent.trim()
      }))
    }));
    async function newPuzzle() {
      await page.click("#newPuzzleBtn");
      await page.waitForFunction(() => !document.getElementById("feedbackBanner").textContent.startsWith("Generating"));
    }
    async function revealAndCheck(mode) {
      assert.equal(await page.locator("#feedbackBanner").isVisible(), false, await page.textContent("#feedbackBanner"));
      await page.click("#revealPuzzleBtn");
      const { cells, entries } = await snapshot();
      assert.ok(entries.length >= 2);
      const byCoordinate = new Map(cells.map((cell) => [`${cell.row},${cell.col}`, cell]));
      const reached = new Set();
      const queue = [cells[0]];
      for (const cell of queue) {
        const key = `${cell.row},${cell.col}`;
        if (reached.has(key)) continue;
        reached.add(key);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const neighbor = byCoordinate.get(`${cell.row + dr},${cell.col + dc}`);
          if (neighbor && !reached.has(`${neighbor.row},${neighbor.col}`)) queue.push(neighbor);
        }
      }
      assert.equal(reached.size, cells.length, "Rendered grid has no detached cells");
      assert.ok(cells.every((cell) => [...cell.value].length === 1), "Reveal fills every square");
      for (const entry of entries) {
        const [number, direction] = entry.id.split("-");
        const start = cells.find((cell) => cell.number === Number(number));
        const answer = Array.from({ length: entry.length }, (_, i) =>
          byCoordinate.get(`${start.row + (direction === "down" ? i : 0)},${start.col + (direction === "across" ? i : 0)}`).value
        ).join("");
        if (mode === "kanji") {
          assert.ok(hasKanji(answer), `Kanji answer must contain kanji: ${answer}`);
          assert.ok(vocabulary.some((item) => item.word === answer));
          assert.match(entry.badge, /漢字/);
        } else {
          assert.ok(vocabulary.some((item) => item.furigana === answer));
          assert.equal(hasKanji(answer), false);
          assert.match(entry.badge, /かな/);
        }
      }
      assert.equal(await page.textContent("#progressMetric"), `${entries.length} / ${entries.length}`);
    }

    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/${encodeURIComponent("パズル")}.html`);
    assert.equal(await page.locator("#crosswordGrid .cw-cell").count(), 0, "Opening the tool does not generate a puzzle");
    await page.click("#newPuzzleBtn");
    await page.waitForFunction(() => document.querySelector("#crosswordGrid .cw-cell:not(.block)"));
    await page.click("#settingsDrawer summary");
    for (const [id, text] of [["kanjiFocusToggle", "Use Kanji meanings & readings as clues"]]) {
      assert.equal(await page.locator(`#${id}`).evaluate((input) => input.labels[0].textContent.trim()), text);
      assert.equal(await page.locator(`#${id}`).evaluate((input) => input.labels[0].querySelectorAll("small").length), 0);
      const fits = await page.locator(`#${id}`).evaluate((input) => {
        const label = input.labels[0].getBoundingClientRect();
        const text = input.labels[0].querySelector("span").getBoundingClientRect();
        return text.left >= input.getBoundingClientRect().right + 8 && text.right <= label.right
          && label.left >= 0 && label.right <= innerWidth;
      });
      assert.ok(fits, `${text} fits its setting card at ${width}px`);
    }
    await page.locator("#kanjiFocusToggle").check();
    const initial = await snapshot();
    await page.click('[data-mode="suddenDeath"]');
    await page.selectOption("#answerModeSelect", "kanji", { force: true });
    assert.deepEqual(await snapshot(), initial, "Answer-mode changes wait for New puzzle");
    await newPuzzle();
    await revealAndCheck("kanji");

    await page.click('[data-mode="classic"]');
    await page.selectOption("#answerModeSelect", "kana", { force: true });
    await newPuzzle();
    const kanaPuzzle = await snapshot();
    await page.click('[data-mode="kanjiChallenge"]');
    assert.equal(await page.locator("#answerModeSelect").isDisabled(), true);
    assert.equal(await page.inputValue("#answerModeSelect"), "kanji");
    assert.deepEqual(await snapshot(), kanaPuzzle, "Challenge changes preserve the active puzzle until New puzzle");
    await newPuzzle();
    await revealAndCheck("kanji");

    const previous = await snapshot();
    for (const level of ["1", "2"]) {
      await page.selectOption("#levelSelect", level, { force: true });
      await newPuzzle();
      assert.match(await page.textContent("#startError"), /Could not find enough connected kanji words/);
      assert.deepEqual(await snapshot(), previous, "An impossible selection preserves the previous puzzle");
    }
    await page.reload();
    await page.click("#newPuzzleBtn");
    await page.waitForFunction(() => !document.getElementById("startError")?.hidden);
    assert.equal(await page.locator("#crosswordGrid .cw-cell").count(), 0);
    assert.equal(await page.locator("#revealPuzzleBtn").isDisabled(), true);
    assert.equal(await page.textContent("#activeClueText"), "No crossword available.");
    await page.selectOption("#levelSelect", "5", { force: true });
    await page.click('[data-mode="kanaChallenge"]');
    await newPuzzle();
    await revealAndCheck("kana");

    async function inputPuzzle(answerMode, gameMode = "classic") {
      await page.evaluate(({ answerMode, gameMode }) => {
        localStorage.setItem("nihon:crossword-settings-v1", JSON.stringify({
          answerMode, gameMode, inputStyle: "cell", level: "5", size: "small", timerEnabled: false
        }));
        localStorage.removeItem("nihon:crossword-stats-v1");
      }, { answerMode, gameMode });
      await page.reload();
      await page.click("#newPuzzleBtn");
      await page.waitForFunction(() => document.querySelector("#crosswordGrid .cw-cell:not(.block)")
        || document.getElementById("feedbackBanner")?.classList.contains("bad"));
      assert.ok(await page.locator("#crosswordGrid .cw-cell:not(.block)").count(),
        `${answerMode}/${gameMode}: ${await page.textContent("#feedbackBanner")}`);
    }
    async function selectTypedEntry(kanji) {
      const board = await snapshot();
      const entry = board.entries.find((entry) => /漢字/.test(entry.badge) === kanji);
      assert.ok(entry, `Fixture includes a ${kanji ? "Kanji" : "kana"} answer`);
      const item = vocabulary.find((item) => item.meaning === entry.meaning
        && [...(kanji ? item.word : item.furigana)].length === entry.length);
      assert.ok(item, entry.meaning);
      await page.locator(`.cw-clue-item[data-entry-id="${entry.id}"]`).click();
      const [number, direction] = entry.id.split("-");
      const start = board.cells.find((cell) => cell.number === Number(number));
      const cells = Array.from({ length: entry.length }, (_, i) => ({
        row: start.row + (direction === "down" ? i : 0), col: start.col + (direction === "across" ? i : 0)
      }));
      return { ...entry, item, cells };
    }
    const input = page.locator(".cw-cell.is-active .cw-cell-input");
    const cellAt = ({ row, col }) => page.locator(`.cw-cell[data-row="${row}"][data-col="${col}"]`);
    const assertEmpty = async () => assert.ok((await snapshot()).cells.every((cell) => !cell.value));
    const typedReading = (reading) => romanizeKana(reading.replaceAll("ー", "-").replace(/ん(?=[あいうえおやゆよ])/g, "ん'"));

    for (const mode of ["kanji", "both"]) {
      await inputPuzzle(mode);
      const entry = await selectTypedEntry(true);
      await input.focus();
      await page.keyboard.type("k");
      assert.equal(await input.inputValue(), "k");
      assert.match(await page.textContent(".cw-square-draft"), /Typing reading: k/);
      assert.notEqual(await input.evaluate((input) => getComputedStyle(input).color), "rgba(0, 0, 0, 0)");
      await input.press("Backspace");
      assert.equal(await input.inputValue(), "");
      await page.keyboard.type("kax");
      assert.equal(await input.inputValue(), "かx");
      await input.press("Backspace");
      assert.equal(await input.inputValue(), "か");
      await input.press("Backspace");
      assert.equal(await input.inputValue(), "");
      await assertEmpty();

      await input.fill("あ".repeat(24) + "x");
      assert.equal(await input.inputValue(), "あ".repeat(24) + "x", "Long drafts are not silently discarded");
      await input.selectText();
      await input.press("Delete");
      assert.equal(await input.inputValue(), "");
      await input.fill("x");
      await input.press("Enter");
      assert.match(await page.textContent(".cw-square-draft"), /Answer not long enough/);
      await page.click('[data-popover-action="check"]');
      assert.match(await page.textContent(".cw-square-draft"), /Answer not long enough/);
      await input.press("Escape");
      assert.equal(await input.inputValue(), "");

      await input.fill("猫");
      assert.equal(await cellAt(entry.cells[0]).getAttribute("data-char"), "猫");
      await input.press("Backspace");
      await assertEmpty();
      await input.fill("猫");
      await input.evaluate((input) => input.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true, cancelable: true, inputType: "deleteContentBackward"
      })));
      await assertEmpty();

      await input.fill("kax");
      await input.evaluate((input) => {
        input.value = "か";
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      });
      assert.equal(await input.inputValue(), "か", "Mobile deletion updates the actual draft");
      await input.press("Escape");
      await input.fill("k");
      await page.click('[data-popover-action="close"]');
      await cellAt(entry.cells[1]).click();
      assert.equal(await input.inputValue(), "", "Moving cells clears pending text");
      await page.locator(`.cw-clue-item[data-entry-id="${entry.id}"]`).click();
      assert.equal(await input.inputValue(), "");
      await input.fill("kax");
      await page.click("#furiganaQuickToggle");
      assert.equal(await input.inputValue(), "かx", "Study-control rerenders preserve the draft");
      await input.press("Escape");
      await input.focus();
      await page.keyboard.type(typedReading(entry.item.furigana));
      if (await input.count() && await input.inputValue()) await input.press("Enter");
      for (const [i, pos] of entry.cells.entries()) {
        assert.equal(await cellAt(pos).getAttribute("data-char"), [...entry.item.word][i], `${mode}: reading fills the written answer`);
      }
      await cellAt(entry.cells[0]).press("Backspace");
      assert.equal(await cellAt(entry.cells[0]).getAttribute("data-char"), [...entry.item.word][0], "Solved characters stay protected");

      await inputPuzzle(mode);
      const imeEntry = await selectTypedEntry(true);
      const duringComposition = await input.evaluate((input, word) => {
        input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
        input.value = word;
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: word, isComposing: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 229 }));
        const untouched = [...document.querySelectorAll(".cw-cell[data-char]")].every((cell) => !cell.dataset.char);
        input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: word }));
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: word, inputType: "insertCompositionText" }));
        return untouched;
      }, imeEntry.item.word);
      assert.equal(duringComposition, true, "IME text is committed only after composition ends");
      for (const [i, pos] of imeEntry.cells.entries()) {
        assert.equal(await cellAt(pos).getAttribute("data-char"), [...imeEntry.item.word][i]);
      }
      assert.equal(await page.textContent("#statWordsCorrect"), "1", "IME final input does not submit twice");
      if (mode === "both") {
        await inputPuzzle(mode);
        const partial = await selectTypedEntry(true);
        assert.match(partial.item.word, /^\p{Script=Han}[ぁ-ゖ]+$/u);
        await input.fill(partial.item.word[0]);
        await page.keyboard.type(typedReading(partial.item.word.slice(1)));
        for (const [i, pos] of partial.cells.entries()) {
          assert.equal(await cellAt(pos).getAttribute("data-char"), [...partial.item.word][i], "Romaji fills kana endings after a native Kanji commit");
        }
      }
    }

    await inputPuzzle("kana");
    const kanaEntry = await selectTypedEntry(false);
    await input.focus();
    await page.keyboard.type(typedReading(kanaEntry.item.furigana));
    if (await input.count() && await input.inputValue()) await input.press("Enter");
    for (const [i, pos] of kanaEntry.cells.entries()) {
      assert.equal(await cellAt(pos).getAttribute("data-char"), [...kanaEntry.item.furigana][i], "Kana still advances one square at a time");
    }
    await inputPuzzle("kana", "reverse");
    await page.locator(".cw-cell.is-active").click();
    await input.focus();
    await page.keyboard.type("x");
    assert.equal((await snapshot()).cells.filter((cell) => cell.value === "X").length, 1);
    await input.press("Backspace");
    await assertEmpty();

    crossingFixture = true;
    for (const [mode, selection, answer, ime] of [
      ["kanji", "direction", "wataru"],
      ["kanji", "popup-direction", "ru"],
      ["kanji", "cell", "渡る", true],
      ["kanji", "clue", "wataru"],
      ["kanji", "clue", "わたる", true],
      ["kanji", "direction", "る"],
      ["kanji", "cell", "る"],
      ["kanji", "clue-correction", "wataru"],
      ["both", "cell", "wataru"],
      ["both", "clue", "ru"]
    ]) {
      await page.evaluate((mode) => {
        localStorage.setItem("test:crossword-random", mode === "both" ? "0.01" : "0.04");
      }, mode);
      await inputPuzzle(mode, selection === "clue-correction" ? "classic" : "suddenDeath");
      const board = await snapshot();
      const across = board.entries.find((entry) => entry.id.endsWith("-across"));
      const down = board.entries.find((entry) => entry.id.endsWith("-down"));
      assert.equal(across?.meaning, "hand over");
      assert.equal(down?.meaning, "go across");
      assert.match(down.badge, /漢字/, "The down answer uses Kanji even in mixed mode");
      const crossing = board.cells.find((cell) => cell.number === Number(across.id.split("-")[0]));
      const ending = { row: crossing.row + 1, col: crossing.col };
      const acrossEnding = { row: crossing.row, col: crossing.col + 1 };
      await page.locator(`.cw-clue-item[data-entry-id="${across.id}"]`).click();
      await input.fill("渡す");
      assert.equal(await page.textContent("#statWordsCorrect"), "1");
      assert.equal(await cellAt(crossing).getAttribute("data-char"), "渡");

      if (selection === "direction") {
        if (!await page.locator("#flipDirBtn").isVisible()) await page.click('[data-popover-action="close"]');
        await page.click("#flipDirBtn");
      } else if (selection === "popup-direction") {
        await page.click('[data-popover-action="flip"]');
      } else if (selection === "cell") {
        await cellAt(crossing).click();
      } else {
        await page.locator(`.cw-clue-item[data-entry-id="${down.id}"]`).click();
      }
      if (selection === "clue-correction") {
        await input.fill("渡す");
        assert.equal(await cellAt(crossing).getAttribute("data-char"), "渡");
        assert.equal(await cellAt(ending).getAttribute("data-char"), "す", "Full written answers align around locked characters");
        await page.locator(`.cw-clue-item[data-entry-id="${down.id}"]`).click();
      }
      assert.equal(await page.locator(".cw-clue-item.active").getAttribute("data-entry-id"), down.id);
      assert.equal(await input.count(), 1, `${selection}: the unfinished down word has a real input`);
      assert.ok(await input.evaluate((input) => input === document.activeElement), `${selection}: typing reaches the down word`);
      assert.ok(await page.evaluate(() => {
        const grid = document.getElementById("crosswordGrid").getBoundingClientRect();
        const card = document.getElementById("gridCluePopover").getBoundingClientRect();
        return card.top >= grid.bottom;
      }), "The clue card cannot cover the remaining down cell");
      await input.press("Backspace");
      assert.ok(await input.evaluate((input) => input === document.activeElement), "Backspace never strands focus on a locked cell");
      assert.equal(await cellAt(crossing).getAttribute("data-char"), "渡", "Backspace preserves the solved crossing");

      if (selection === "direction") {
        await page.keyboard.type("kax");
        await input.press("Backspace");
        assert.equal(await input.inputValue(), "か", "Drafts at locked crossings remain editable");
        await input.press("Escape");
        assert.equal(await cellAt(ending).getAttribute("data-char"), "");
        if (answer === "る") await cellAt(ending).click();
      }
      if (ime) {
        const beforeCommit = await input.evaluate((input, text) => {
          input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
          input.value = text;
          input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, isComposing: true }));
          const completed = document.getElementById("statWordsCorrect").textContent;
          input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: text }));
          input.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertCompositionText" }));
          return completed;
        }, answer);
        assert.equal(beforeCommit, "1", "The crossing's IME draft is not submitted before composition ends");
      } else if (/^[a-z]+$/.test(answer)) {
        await page.keyboard.type(answer);
      } else {
        await input.fill(answer);
      }
      assert.equal(await cellAt(crossing).getAttribute("data-char"), "渡");
      assert.equal(await cellAt(acrossEnding).getAttribute("data-char"), "す");
      assert.equal(await cellAt(ending).getAttribute("data-char"), "る", `${selection}: ${answer} fills only the unfinished word`);
      assert.equal(await page.textContent("#statWordsCorrect"), "2", "Both intersecting words finish without a false Sudden Death loss");
    }
    await page.click("#settingsDrawer summary");
    for (const style of ["popup", "cell"]) {
      await page.selectOption("#inputStyleSelect", style, { force: true });
      await newPuzzle();
      await page.locator(".cw-clue-item").first().click();
      assert.equal(await page.locator("#gridCluePopover").count(), 1, "Changing input style reuses the existing clue card");
      assert.equal(await page.locator("#gridCluePopover").evaluate((card) => card.parentElement.id === "gridStage"),
        style === "popup", "Only popup mode overlays the grid");
      if (style === "popup") {
        assert.ok(await page.locator("#popoverAnswerInput").isVisible());
      } else {
        await input.fill("kax");
        assert.equal(await input.inputValue(), "かx", "In-square typing still works after moving the clue card");
        await input.press("Escape");
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("Crossword checks passed: connected grids, Kanji/mixed/kana input, editable drafts, mobile deletion, IME, locked crossings, unobstructed cells, settings and sparse-pool recovery.");
} finally {
  await browser?.close();
  await vite?.close();
}
