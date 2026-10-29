import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, DIRECTIONS, effectiveSettings, validateSettings, filterVocabulary,
  generateWordSearch, listStyles, straightPath, matchSelection, reviewImport, dailyStreak
} from "../src/word-search-engine.js";

const pairs = [
  ["学校", "がっこう", "school"], ["先生", "せんせい", "teacher"], ["学生", "がくせい", "student"],
  ["友達", "ともだち", "friend"], ["新聞", "しんぶん", "newspaper"], ["電車", "でんしゃ", "train"],
  ["自転車", "じてんしゃ", "bicycle"], ["飛行機", "ひこうき", "airplane"], ["図書館", "としょかん", "library"],
  ["食べる", "たべる", "to eat"], ["飲む", "のむ", "to drink"], ["電話", "でんわ", "telephone"],
  ["猫", "ねこ", "cat"], ["犬", "いぬ", "dog"], ["鳥", "とり", "bird"], ["魚", "さかな", "fish"],
  ["山", "やま", "mountain"], ["川", "かわ", "river"], ["空", "そら", "sky"], ["花", "はな", "flower"],
  ["水", "みず", "water"], ["雨", "あめ", "rain"], ["雪", "ゆき", "snow"], ["風", "かぜ", "wind"],
  ["牛乳", "ぎゅうにゅう", "milk"], ["時間", "じかん", "time"], ["今日", "きょう", "today"],
  ["明日", "あした", "tomorrow"], ["昨日", "きのう", "yesterday"], ["毎日", "まいにち", "every day"],
  ["コーヒー", "コーヒー", "coffee"], ["パン", "パン", "bread"]
];
const pool = pairs.map(([word, reading, meaning], index) => ({ id: String(index), word, reading, meaning, level: 5, partOfSpeech: "noun" }));

test("new puzzles default to all eight directions without overriding saved preferences", () => {
  assert.equal(DEFAULTS.directions, "all");
  assert.equal(DIRECTIONS[DEFAULTS.directions].length, 8);
  assert.equal(validateSettings({ ...DEFAULTS, directions: "forward" }).directions, "forward");
});

test("exact target counts, straight lines, directions and overlap across seeds, scripts, and sizes", () => {
  for (const script of ["kana", "kanji", "both"]) for (const directions of Object.keys(DIRECTIONS)) {
    for (const size of [8, 10, 12, 15]) for (const overlap of [false, true]) for (let seed = 0; seed < 10; seed++) {
      const count = size === 8 ? 8 : 20;
      const settings = { ...DEFAULTS, script, directions, size, overlap, count };
      const puzzle = generateWordSearch(pool, settings, { seed });
      assert.equal(puzzle.entries.length, count);
      assert.equal(puzzle.grid.length, size * size);
      assert.equal(new Set(puzzle.entries.map((entry) => entry.answer)).size, count);
      assert.ok(puzzle.grid.every((cell) => [...cell].length === 1));
      const occupied = [];
      for (const entry of puzzle.entries) {
        assert.equal(entry.cells.map((cell) => puzzle.grid[cell]).join(""), entry.answer);
        assert.deepEqual(straightPath(entry.cells[0], entry.cells.at(-1), size), entry.cells);
        assert.ok(DIRECTIONS[directions].some((direction) => direction.join() === entry.direction.join()));
        assert.equal(matchSelection(puzzle, entry.cells[0], entry.cells.at(-1)).entry.key, entry.key);
        if (script === "kana") assert.match(entry.answer, /^[ぁ-ゖァ-ヺー]+$/u);
        if (script === "kanji") assert.match(entry.answer, /\p{Script=Han}/u);
        occupied.push(...entry.cells);
      }
      if (!overlap) assert.equal(new Set(occupied).size, occupied.length);
    }
  }
});

test("seeds are deterministic and recent words are avoided when possible", () => {
  const settings = { ...DEFAULTS, count: 8 };
  const first = generateWordSearch(pool, settings, { seed: "2026-10-24" });
  assert.deepEqual(generateWordSearch(pool, settings, { seed: "2026-10-24" }), first);
  const recent = first.entries.map((entry) => entry.key);
  const next = generateWordSearch(pool, settings, { seed: "next", recent });
  assert.ok(next.entries.every((entry) => !recent.includes(entry.key)));
  assert.notDeepEqual(first.grid, next.grid);
  const narrow = pool.slice(0, 8);
  assert.equal(generateWordSearch(narrow, settings, { recent: narrow.map((item) => `${item.word}|${item.reading}`) }).entries.length, 8);
});

test("invalid paths, wrong direction, duplicate words, and single kanji", () => {
  const puzzle = { size: 5, grid: Array(25).fill("あ"), directions: "forward", entries: [
    { key: "a", answer: "あああ", cells: [0, 1, 2] }, { key: "b", answer: "あ", cells: [3] }
  ] };
  assert.equal(matchSelection(puzzle, 0, 2).entry.key, "a");
  assert.equal(matchSelection(puzzle, 2, 0).entry, undefined);
  assert.equal(matchSelection(puzzle, 0, 2, ["a"]).duplicate, true);
  assert.equal(matchSelection(puzzle, 3, 3).entry.key, "b");
  assert.match(matchSelection(puzzle, 0, 7).error, /straight/);
  assert.deepEqual(straightPath(-1, 4, 5), []);
  assert.deepEqual(straightPath(0, 25, 5), []);
  assert.match(matchSelection(puzzle, 0, 1).error, /complete target/);
  assert.equal(matchSelection(puzzle, 5, 7).entry.key, "a", "Incidental valid occurrences remain selectable");
});

test("level and category filters never silently broaden; impossible puzzles fail explicitly", () => {
  const vocabulary = [...pool, { ...pool[0], level: 1 }, { ...pool[1], level: 3 }];
  assert.deepEqual(filterVocabulary(vocabulary, { ...DEFAULTS, level: "3-1" }).map((item) => item.level), [1, 3]);
  assert.ok(filterVocabulary(pool, { ...DEFAULTS, category: "animals" }).every((item) => /cat|dog|bird|fish/.test(item.meaning)));
  assert.throws(() => generateWordSearch(pool, { ...DEFAULTS, category: "animals", count: 20 }), /Only/);
  assert.throws(() => generateWordSearch(pool.slice(0, 1), { ...DEFAULTS, count: 8 }), /Only 1/);
  assert.throws(() => generateWordSearch(pool, { ...DEFAULTS, size: 0 }), /grid/);
  const longWords = Array.from({ length: 20 }, (_, i) => ({ ...pool[0], word: `ああああ${String.fromCodePoint(0x304b + i)}`, reading: `ああああ${String.fromCodePoint(0x304b + i)}` }));
  assert.throws(() => generateWordSearch(longWords, { ...DEFAULTS, size: 5, count: 20, overlap: false }), /cannot fit/);
  const loan = generateWordSearch([{ ...pool.at(-2), reading: "こーひー" }], { ...DEFAULTS, count: 1 });
  assert.equal(loan.entries[0].answer, "コーヒー");
});

test("mode overrides, validation, import safety, and streaks", () => {
  assert.equal(effectiveSettings({ ...DEFAULTS, mode: "quick", count: 20 }).count, 5);
  const daily = effectiveSettings({ ...DEFAULTS, mode: "daily", level: "1", timer: true, count: 20 });
  assert.equal(daily.level, "5"); assert.equal(daily.timer, false); assert.equal(daily.reveals, "disabled");
  assert.equal(effectiveSettings({ ...DEFAULTS, mode: "kanji" }).script, "kanji");
  assert.equal(effectiveSettings({ ...DEFAULTS, mode: "reverse" }).directions, "reverse");
  assert.equal(effectiveSettings({ ...DEFAULTS, mode: "memory" }).list, "hidden");
  assert.equal(effectiveSettings({ ...DEFAULTS, mode: "timed" }).timer, true);
  assert.equal(effectiveSettings({ ...DEFAULTS, mode: "marathon" }, 3).count, 12);
  assert.equal(effectiveSettings({ ...DEFAULTS, mode: "marathon", directions: "all" }, 2).directions, "all");
  for (const change of [{ size: 4 }, { count: 1.5 }, { directions: "bad" }, { overlap: "yes" }, { level: "N8" }]) {
    assert.throws(() => validateSettings({ ...DEFAULTS, ...change }));
  }
  const words = pool.map(({ word, reading, meaning, partOfSpeech, level }) => ({ word, reading, meaning, partOfSpeech, level }));
  assert.deepEqual(reviewImport({ version: 1, tool: "nihon-word-search", words }), words);
  assert.throws(() => reviewImport({ version: 1, tool: "nihon-word-search", words: [{ ...words[0], word: "<script>" }] }));
  assert.throws(() => reviewImport({ version: 2, words }));
  assert.equal(dailyStreak(["2026-10-22", "2026-10-23"], new Date(2026, 9, 24)), 2);
  assert.equal(dailyStreak(["2026-10-22", "2026-10-23"], new Date(2026, 9, 25)), 0);
  assert.equal(dailyStreak(["2026-10-22", "2026-10-23", "2026-10-24"], new Date(2026, 9, 24)), 3);
});

test("clue-list display accepts legacy singles and combinations, hidden is exclusive", () => {
  assert.deepEqual(listStyles("japanese"), ["japanese"]);
  assert.deepEqual(listStyles("english,furigana,japaneseClue"), ["japanese", "english", "japaneseClue"]);
  assert.deepEqual(listStyles("hidden"), ["hidden"]);
  for (const bad of ["", "hidden,english", "nope", "english,nope"]) assert.throws(() => listStyles(bad));
  assert.equal(validateSettings({ ...DEFAULTS, list: "furigana,english" }).list, "japanese,english");
  assert.equal(validateSettings({ ...DEFAULTS, list: "furigana" }).list, "japanese");
  assert.equal(validateSettings({ ...DEFAULTS, list: "japanese,furigana" }).list, "japanese");
  assert.equal(DEFAULTS.font, "Noto Sans JP");
  assert.equal(DEFAULTS.level, "5");
  assert.throws(() => validateSettings({ ...DEFAULTS, list: "hidden,english" }));
  assert.equal(effectiveSettings({ ...DEFAULTS, mode: "clue", list: "japanese,icon" }).list, "english");
  assert.equal(effectiveSettings({ ...DEFAULTS, mode: "daily", list: "icon,clue" }).list, "japanese");
});
