import test from "node:test";
import assert from "node:assert/strict";
import { selectedLevels, matchesLevel } from "../src/jlpt-levels.js";
import { conjugate } from "../src/conjugation.js";
import { createPool, defaults, familyOf, loadPracticeEntries, PracticeSession } from "../src/conjugation-practice-engine.js";
import { conjugationEntries } from "../../backend/src/conjugator.js";

const [entry] = conjugationEntries({
  id: 1, is_common: 1,
  kanji_forms: JSON.stringify([{ text: "食べる" }]),
  kana_forms: JSON.stringify([{ text: "たべる", appliesToKanji: ["*"] }]),
  senses: JSON.stringify([{ partOfSpeech: ["v1"], appliesToKanji: ["*"], appliesToKana: ["*"],
    gloss: [{ lang: "eng", text: "to eat" }] }])
}, [{ word: "食べる", reading: "たべる", jlpt: 5 }]);
loadPracticeEntries([entry]);

test("JLPT selections support disjoint levels, legacy ranges, unrated and empty selections", () => {
  assert.deepEqual(selectedLevels("N5,N3"), [5, 3]);
  assert.deepEqual(selectedLevels("5-3"), [5, 4, 3]);
  assert.equal(matchesLevel(4, "5,3"), false);
  assert.equal(matchesLevel(3, "5,3"), true);
  assert.equal(matchesLevel(null, "unrated"), true);
  assert.equal(matchesLevel(5, "none"), false);
  for (const invalid of ["", "6", "5,x", null, "N0"]) assert.throws(() => selectedLevels(invalid));
});

test("dictionary-backed desire and without-doing glosses read naturally; ambiguous voices retain distinct grammar", () => {
  const rows = conjugate(entry);
  assert.equal(rows.find((r) => r.id === "naide").gloss, "without eating");
  assert.equal(rows.find((r) => r.id === "desire-past-plain").gloss, "wanted to eat");
  assert.equal(rows.find((r) => r.id === "desire-pastNegative-polite").gloss, "did not want to eat");
  const potential = rows.find((r) => r.id === "potential-plain");
  const passive = rows.find((r) => r.id === "passive-plain");
  assert.equal(potential.word, passive.word);
  assert.equal(familyOf(potential), "potential");
  assert.equal(familyOf(passive), "passive");
  const session = new PracticeSession({ ...defaults, mode: "comparison", levels: [4], forms: ["potential"] });
  assert.deepEqual(new Set(session.identifications().map((q) => q.family)), new Set(["potential", "passive"]));
});

test("weak focus draws only missed or saved unfinished pairs without inventing scores", () => {
  const question = createPool(defaults)[0];
  assert.equal(createPool({ ...defaults, mode: "weak" }).length, 0);
  const progress = { [question.key]: { attempts: 0, correct: 0, wrong: 0, review: true, last: 1 } };
  assert.deepEqual(createPool({ ...defaults, mode: "weak" }, progress).map((q) => q.key), [question.key]);
  assert.equal(progress[question.key].attempts, 0);
});
