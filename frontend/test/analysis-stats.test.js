import test from "node:test";
import assert from "node:assert/strict";
import { analysisStats } from "../src/analysis-stats.js";
import { canonicalPage, PAGE_PATHS } from "../src/page-paths.js";

test("analysis counts dictionary identities, source kanji and exhaustive levels", () => {
  const tokens = [
    { text: "食べた", base: "食べる", type: "word", result: { id: 1, jlpt: ["jlpt-n5", "jlpt-n4"] } },
    { text: "食べる", base: "食べる", type: "word", result: { id: 1, jlpt: ["jlpt-n5"] } },
    { text: "は", type: "particle", result: { id: 2, jlpt: ["jlpt-n5"] } },
    { text: "未知", base: "未知", type: "word" },
    { text: "未知", base: "未知", type: "word" },
    { text: "𠮷", type: "word", result: { id: 3, jlpt: [] } },
    { text: " ", type: "space" }, { text: "。", type: "punctuation" }
  ];
  const stats = analysisStats(tokens, [{ character: "食", jlpt: 5 }, { character: "未", jlpt: 3 }]);
  assert.equal(stats.words.total, 4);
  assert.equal(stats.kanji.total, 4);
  assert.equal(stats.words.levels[0].count, 2);
  assert.equal(stats.kanji.levels.at(-1).count, 2);
  for (const data of Object.values(stats)) {
    assert.equal(data.levels.reduce((n, row) => n + row.count, 0), data.total);
    assert.equal(data.levels.reduce((n, row) => n + Math.round(row.percentage * 10), 0), 1000);
  }
});

test("empty and repeating thirds; homonyms with distinct IDs remain distinct", () => {
  assert.equal(analysisStats([]).words.levels.every((row) => row.percentage === 0), true);
  const stats = analysisStats([1, 2, 3].map((id) => ({ text: "同", type: "word", result: { id, jlpt: [`jlpt-n${id}`] } })));
  assert.equal(stats.words.total, 3);
  assert.equal(stats.kanji.total, 1);
  assert.equal(stats.words.levels.reduce((n, row) => n + Math.round(row.percentage * 10), 0), 1000);
});

test("canonical counter pages exclude query strings, traversal and unknown pages", () => {
  assert.equal(canonicalPage("/index.html"), "/");
  assert.equal(canonicalPage("/fumitoki"), "/fumitoki.html");
  assert.equal(canonicalPage("/fumitoki.html?q=private"), null);
  assert.equal(canonicalPage("/../fumitoki.html"), null);
  assert.equal(canonicalPage("/not-a-tool"), null);
  assert.equal(new Set(PAGE_PATHS).size, PAGE_PATHS.length);
});
