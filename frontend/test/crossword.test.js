import test from "node:test";
import assert from "node:assert/strict";
import {
  generateCrossword,
  matchesTheme,
  resolveEntryAnswer,
  buildClue,
  formatFuriganaHTML,
  hasKanji
} from "../src/crossword-engine.js";
import { convertTypedRomaji, romajiToKana } from "../src/kana-input.js";

test("editable romaji drafts preserve nasal syllables in typed and pasted readings", () => {
  for (const [romaji, reading] of [
    ["shinnen", "しんねん"], ["shinnnen", "しんねん"], ["konnichiha", "こんにちは"],
    ["nihon", "にほん"], ["hon'ya", "ほんや"], ["nn", "ん"], ["nnna", "んな"]
  ]) {
    assert.equal(convertTypedRomaji(romaji, { final: true }), reading);
    let draft = "";
    for (const letter of romaji) draft = convertTypedRomaji(draft + letter);
    assert.equal(convertTypedRomaji(draft, { final: true }), reading);
  }
  assert.deepEqual(romajiToKana("shinn"), { kana: "し", rest: "nn" });
  assert.deepEqual(romajiToKana("k"), { kana: "", rest: "k" });
});

const samplePool = [
  {
    id: "w1", word: "日本", furigana: "にほん", romaji: "nihon",
    meaning: "Japan", level: 5, partOfSpeech: "noun", posTags: ["n"],
    example: "日本へ行きます。", exampleFurigana: "{日本|にほん}へ{行|い}きます。",
    exampleMeaning: "I am going to Japan.",
    kanjiDetails: [{ kanji: "日", meanings: ["day", "sun"], on_readings: ["ニチ"], kun_readings: ["ひ"] }]
  },
  {
    id: "w2", word: "本屋", furigana: "ほんや", romaji: "honya",
    meaning: "bookstore", level: 5, partOfSpeech: "noun", posTags: ["n"],
    example: "本屋で本を買う。", exampleMeaning: "Buy a book at the bookstore."
  },
  {
    id: "w3", word: "毎日", furigana: "まいにち", romaji: "mainichi",
    meaning: "every day", level: 5, partOfSpeech: "noun", posTags: ["n"],
    example: "毎日勉強します。", exampleMeaning: "I study every day."
  },
  {
    id: "w4", word: "食べる", furigana: "たべる", romaji: "taberu",
    meaning: "to eat", level: 5, partOfSpeech: "verb", posTags: ["v1"],
    example: "ご飯を食べる。", exampleMeaning: "Eat a meal."
  },
  {
    id: "w5", word: "食べ物", furigana: "たべもの", romaji: "tabemono",
    meaning: "food", level: 5, partOfSpeech: "noun", posTags: ["n"],
    example: "おいしい食べ物。", exampleMeaning: "Delicious food."
  },
  {
    id: "w6", word: "飲み物", furigana: "のみもの", romaji: "nomimono",
    meaning: "drink; beverage", level: 5, partOfSpeech: "noun", posTags: ["n"],
    example: "冷たい飲み物。", exampleMeaning: "Cold drink."
  }
];

const loanwords = [
  ["テーブル", "table"], ["テープ", "tape"], ["スープ", "soup"],
  ["スプーン", "spoon"], ["ベッド", "bed"], ["ペット", "pet"],
  ["ボート", "boat"], ["コート", "coat"], ["ノート", "notebook"],
  ["レコード", "record"]
].map(([word, meaning], index) => ({ id: `loan-${index}`, word, furigana: word, meaning }));

function assertConnected(puzzle) {
  assert.ok(puzzle.entries.length > 0);
  const reached = new Set([puzzle.entries[0].id]);
  const cells = new Set(puzzle.entries[0].cells.map(({ row, col }) => `${row},${col}`));
  let previousSize;
  do {
    previousSize = reached.size;
    for (const entry of puzzle.entries) {
      if (reached.has(entry.id) || !entry.cells.some(({ row, col }) => cells.has(`${row},${col}`))) continue;
      reached.add(entry.id);
      for (const { row, col } of entry.cells) cells.add(`${row},${col}`);
    }
  } while (reached.size > previousSize);
  assert.equal(reached.size, puzzle.entries.length, "Every word must connect through shared crossword cells");
  assert.equal(cells.size, puzzle.grid.flat().filter(Boolean).length, "Every grid cell belongs to the connected crossword");
}

test("resolveEntryAnswer supports kana, kanji, both, and reverse modes", () => {
  const item = samplePool[0];
  assert.deepEqual(resolveEntryAnswer(item, "kana"), {
    answer: "にほん", chars: ["に", "ほ", "ん"], script: "kana"
  });
  assert.deepEqual(resolveEntryAnswer(item, "kanji"), {
    answer: "日本", chars: ["日", "本"], script: "kanji"
  });
  assert.deepEqual(resolveEntryAnswer(item, "reverse"), {
    answer: "JAPAN", chars: ["J", "A", "P", "A", "N"], script: "english"
  });
  assert.deepEqual(resolveEntryAnswer(item, "both", () => 0), resolveEntryAnswer(item, "kanji"));
  assert.deepEqual(resolveEntryAnswer(item, "both", () => 1), resolveEntryAnswer(item, "kana"));
});

test("kanji answers exclude kana-only words and preserve kanji spellings with okurigana", () => {
  for (const item of [...loanwords, { word: "ありがとう", meaning: "thank you" }]) {
    assert.equal(resolveEntryAnswer(item, "kanji"), null);
    assert.equal(resolveEntryAnswer(item, "kana").script, "kana");
    assert.equal(resolveEntryAnswer(item, "both").script, "kana");
  }
  assert.deepEqual(resolveEntryAnswer(samplePool[3], "kanji"), {
    answer: "食べる", chars: ["食", "べ", "る"], script: "kanji"
  });
  assert.equal(resolveEntryAnswer({ word: "女", furigana: "おんな", meaning: "woman" }, "kanji"), null,
    "Single-character words cannot form crossword entries; do not substitute their kana readings");
});

test("matchesTheme classifies food, verbs, katakana, and expressions accurately", () => {
  assert.equal(matchesTheme(samplePool[3], "verbs"), true);
  assert.equal(matchesTheme(samplePool[4], "food"), true);
  assert.equal(matchesTheme(samplePool[0], "food"), false);
  assert.equal(matchesTheme({ word: "ホテル", furigana: "ホテル", meaning: "hotel" }, "katakana"), true);
});

test("buildClue supports Kanji Focus, Reverse Mode, furigana formatting, and never leaks answers in furiganaHTML", () => {
  const kfClue = buildClue(samplePool[0], { script: "kanji", kanjiFocus: true });
  assert.equal(kfClue.type, "kanji-focus");
  assert.ok(kfClue.text.includes("(day/sun)"));
  assert.ok(!kfClue.text.includes("日"), "Kanji Focus clue in kanji mode must not reveal the kanji itself");

  const kfKanaClue = buildClue(samplePool[0], { script: "kana", kanjiFocus: true });
  assert.ok(kfKanaClue.text.includes("日 (day/sun)"));
  assert.ok(!kfKanaClue.text.includes("ニチ") && !kfKanaClue.text.includes("ひ"), "Kanji Focus clue must not leak readings");

  const revClue = buildClue(samplePool[0], { answerMode: "reverse" });
  assert.equal(revClue.type, "reverse");
  assert.ok(revClue.furiganaHTML.includes("<ruby>日本<rt>にほん</rt></ruby>"));

  assert.equal(
    formatFuriganaHTML("{日本|にほん}へ{行|い}きます。"),
    "<ruby>日本<rt>にほん</rt></ruby>へ<ruby>行<rt>い</rt></ruby>きます。"
  );

  // Ensure conjugated verb or split-kanji example sentences with furigana never leak the word or reading
  const verbItem = {
    id: "v1",
    word: "食べる",
    furigana: "たべる",
    meaning: "to eat",
    level: 5,
    partOfSpeech: "verb",
    example: "毎日ご飯を食べる。",
    exampleFurigana: "{毎日|まいにち}ご{飯|はん}を{食|た}べる。",
    exampleMeaning: "I eat rice every day."
  };
  const clozeClue = buildClue(verbItem, { script: "kana", rng: () => 0.1 });
  assert.equal(clozeClue.type, "cloze");
  assert.ok(clozeClue.text.includes("［＿＿］"));
  assert.ok(!clozeClue.text.includes("食べる") && !clozeClue.text.includes("たべる"));
  assert.ok(!clozeClue.furiganaHTML.includes("食") && !clozeClue.furiganaHTML.includes("たべる"));
});

test("generateCrossword penalizes recentIds to avoid repeating words across puzzles", () => {
  const firstPuzzle = generateCrossword(samplePool, {
    gridSize: 10,
    targetWords: 3,
    answerMode: "kana",
    seed: 101
  });
  const usedIds = firstPuzzle.entries.map((e) => e.item.id);
  const secondPuzzle = generateCrossword(samplePool, {
    gridSize: 10,
    targetWords: 3,
    answerMode: "kana",
    recentIds: usedIds,
    seed: 202
  });
  const secondIds = secondPuzzle.entries.map((e) => e.item.id);
  assert.notDeepEqual(secondIds, usedIds, "Subsequent puzzle with recentIds should prioritize unused words");
});

test("generateCrossword creates coherent grids with both Across and Down entries and valid intersections", () => {
  for (const mode of ["kana", "kanji", "both", "reverse"]) {
    for (const [gridSize, targetWords] of [[8, 6], [11, 10], [14, 14], [16, 18]]) {
      for (let seed = 0; seed < 20; seed++) {
        const puzzle = generateCrossword(samplePool, { gridSize, targetWords, answerMode: mode, seed });
        assert.ok(puzzle.entries.length >= 2, `Expected entries in ${mode}`);
        assert.ok(puzzle.entries.length <= targetWords);
        assert.ok(puzzle.across.length >= 1, `Expected across entries in ${mode}`);
        assert.ok(puzzle.down.length >= 1, `Expected down entries in ${mode}`);
        assertConnected(puzzle);

        for (const entry of puzzle.entries) {
          entry.cells.forEach(({ row, col }, idx) => {
            assert.equal(puzzle.grid[row][col].solution, entry.chars[idx]);
            assert.equal(puzzle.grid[row][col][`${entry.dir}Id`], entry.id);
          });
        }
      }
    }
  }
});

test("crosswords never add separate words or word clusters to reach the target count", () => {
  const puzzle = generateCrossword(samplePool, { answerMode: "kanji", targetWords: 6, seed: 1 });
  assert.equal(puzzle.entries.length, 3, "Keep one connected cluster instead of combining disconnected clusters");
  assertConnected(puzzle);

  const isolated = generateCrossword([
    { word: "日本", meaning: "Japan" },
    { word: "学校", meaning: "school" },
    { word: "飲む", meaning: "drink" }
  ], { answerMode: "kanji", targetWords: 3, seed: 1 });
  assert.equal(isolated.entries.length, 1);
  assertConnected(isolated);
});

test("starter attempts prefer intersectable words even when isolated words have priority", () => {
  const isolated = [..."あいうえおかきく"].map((char, index) => ({
    id: `isolated-${index}`, word: char.repeat(2), meaning: "isolated fixture"
  }));
  const pool = [...isolated, { word: "さし", meaning: "connected fixture" }, { word: "しす", meaning: "connected fixture" }];
  const puzzle = generateCrossword(pool, {
    targetWords: 2, priorityIds: isolated.map((item) => item.id), seed: 1
  });
  assert.equal(puzzle.entries.length, 2);
  assertConnected(puzzle);
});

test("kanji crosswords stay in kanji even when a kana-only cluster is easier to place", () => {
  const pool = [...loanwords, ...samplePool];
  for (let seed = 0; seed < 20; seed++) {
    const options = { answerMode: "kanji", targetWords: 10, seed };
    const puzzle = generateCrossword(pool, options);
    assertConnected(puzzle);
    assert.ok(puzzle.entries.length >= 2);
    for (const entry of puzzle.entries) {
      assert.equal(entry.script, "kanji");
      assert.ok(hasKanji(entry.answer));
      assert.equal(entry.answer, entry.item.word);
      assert.notEqual(entry.answer, entry.item.furigana);
    }
    assert.deepEqual(generateCrossword(pool, options), puzzle, "Seeded generation remains deterministic");
  }
  assert.deepEqual(generateCrossword(loanwords, { answerMode: "kanji" }), {
    rows: 0, cols: 0, grid: [], entries: [], across: [], down: []
  });
});
