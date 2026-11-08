import test from "node:test";
import assert from "node:assert/strict";
import { makeQuestion, readings } from "../src/imposters-engine.js";

const pool = [
  { kanji: "日", on_readings: ["ニチ", "ジツ"], meanings: ["day"] },
  { kanji: "二", on_readings: ["ニ"], kun_readings: ["ふた"], meanings: ["two"] },
  { kanji: "仁", on_readings: ["ニ", "ジン"], meanings: ["benevolence"] },
  { kanji: "人", on_readings: ["ジン", "ニン"], meanings: ["person"] },
  { kanji: "山", on_readings: ["サン"], meanings: ["mountain"] },
  { kanji: "水", on_readings: ["スイ"], meanings: ["water"] }
];

test("kanji question choices and readings come only from the supplied dictionary pool", () => {
  for (const [target, variant] of [[pool[0], "kanji-reading"], [pool[1], "reading-kanji"]]) {
    const question = makeQuestion(target, pool, variant, () => .5);
    assert.ok(question);
    assert.equal(question.choices.length, 5);
    assert.equal(new Set(question.choices.map(({ value }) => value)).size, 5);
    for (const choice of question.choices) {
      if (variant === "reading-kanji") {
        assert.ok(pool.includes(choice.item));
        assert.equal(choice.correct, readings(choice.item).includes(question.prompt));
      } else {
        assert.ok(pool.flatMap(readings).includes(choice.value));
        assert.equal(choice.correct, readings(target).includes(choice.value));
      }
    }
  }
});

test("insufficient dictionary data yields no question, not replacement kanji", () => {
  assert.equal(makeQuestion(pool[0], [pool[0]], "kanji-reading"), null);
  assert.equal(makeQuestion(pool[1], [pool[1]], "reading-kanji"), null);
  assert.equal(makeQuestion({ kanji: "空" }, pool, "kanji-reading"), null);
});
