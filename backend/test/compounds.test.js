import test from "node:test";
import assert from "node:assert/strict";
import { selectCompounds } from "../src/compounds.js";

const kanji = { character: "本", on_readings: '["ホン"]', kun_readings: '["もと"]' };
const word = (id, spelling, reading, appliesToKanji = ["*"]) => ({
  id, kanji_forms: JSON.stringify([{ text: spelling }]),
  kana_forms: JSON.stringify([{ text: reading, appliesToKanji }])
});

test("compound selection reserves space for different readings before filling popular entries", () => {
  const rows = [
    word(1, "本気", "ほんき"), word(2, "本屋", "ほんや"),
    word(3, "本木", "もとき"), word(4, "本", "もと")
  ];
  assert.deepEqual(selectCompounds(rows, kanji, 2).map((row) => row.id), [1, 3]);
  assert.equal(selectCompounds(rows, kanji, 1).length, 1);
  assert.equal(selectCompounds(rows, kanji, 20).length, 4);
});

test("compound diversity respects spelling restrictions and does not invent a missing reading", () => {
  const rows = [
    word(1, "本気", "ほんき"), word(2, "本木", "もとき", ["別"]),
    word(3, "本屋", "ほんや"), word(4, "別", "もと")
  ];
  assert.deepEqual(selectCompounds(rows, kanji, 20).map((row) => row.id), [1, 3]);
  assert.deepEqual(selectCompounds([], kanji, 20), []);
});
