import test from "node:test";
import assert from "node:assert/strict";
import { matchesReading, selectedReadings, readingType } from "../src/reading-answers.js";

const kanji = { on_readings: ["ショク"], kun_readings: ["た.べる"] };
test("reading options restrict the reading type, not the input script", () => {
  for (const answer of ["しょく", "ショク", "shoku"]) {
    assert.equal(matchesReading(answer, kanji, "reading-katakana"), true);
    assert.equal(matchesReading(answer, kanji, "reading-hiragana"), false);
  }
  for (const answer of ["たべる", "タベル", "taberu"]) {
    assert.equal(matchesReading(answer, kanji, "reading-hiragana"), true);
    assert.equal(matchesReading(answer, kanji, "reading-katakana"), false);
  }
  for (const answer of ["ショク", "たべる"]) assert.equal(matchesReading(answer, kanji, "reading-any-kana"), true);
  assert.equal(matchesReading("食", kanji, "reading-any-kana"), false);
  assert.deepEqual(selectedReadings(kanji, "reading-hiragana"), ["たべる"]);
  assert.deepEqual(selectedReadings({ on_readings: ["ニチ"] }, "reading-hiragana"), []);
  assert.equal(readingType("reading-katakana"), "on");
});
