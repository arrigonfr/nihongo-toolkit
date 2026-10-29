import test from "node:test";
import assert from "node:assert/strict";
import { selectedLevels, matchesLevel } from "../src/jlpt-levels.js";
import { conjugate } from "../src/conjugation.js";
import { createPool, defaults, exampleFor, familyOf, supportsExample } from "../src/conjugation-practice-engine.js";
import { practiceWords } from "../src/conjugation-practice-data.js";
import { japaneseDescriptions } from "../src/japanese-descriptions.js";
import { DEFAULTS, filterVocabulary, generateWordSearch } from "../src/word-search-engine.js";

test("JLPT selections support disjoint levels, legacy ranges, unrated and empty selections", () => {
  assert.deepEqual(selectedLevels("N5,N3"), [5, 3]);
  assert.deepEqual(selectedLevels("5-3"), [5, 4, 3]);
  assert.equal(matchesLevel(4, "5,3"), false);
  assert.equal(matchesLevel(3, "5,3"), true);
  assert.equal(matchesLevel(null, "unrated"), true);
  assert.equal(matchesLevel(5, "none"), false);
  for (const invalid of ["", "6", "5,x", null, "N0"]) assert.throws(() => selectedLevels(invalid));
});

test("desire and without-doing glosses read naturally; voice examples disambiguate identical forms", () => {
  const entry = practiceWords.find((word) => word.word === "食べる");
  const rows = conjugate(entry);
  assert.equal(rows.find((r) => r.id === "naide").gloss, "without eating");
  assert.equal(rows.find((r) => r.id === "desire-past-plain").gloss, "wanted to eat");
  assert.equal(rows.find((r) => r.id === "desire-pastNegative-polite").gloss, "did not want to eat");
  const potential = rows.find((r) => r.id === "potential-plain");
  const passive = rows.find((r) => r.id === "passive-plain");
  assert.equal(potential.word, passive.word);
  const examples = [potential, passive].map((row) => exampleFor({ entry, row, family: familyOf(row) }));
  assert.notEqual(examples[0].japanese, examples[1].japanese);
  assert.equal(examples[0].english, "I can eat rice.");
  assert.equal(examples[1].english, "Rice is eaten.");
  for (const row of rows.filter((r) => r.id.startsWith("passive-") || r.id.startsWith("potential-"))) {
    const example = exampleFor({ entry, row, family: familyOf(row) });
    assert.ok(example.japanese.includes(row.word));
    if (row.polarity === "negative") assert.match(example.english, /not|cannot/);
    if (row.tense === "past") assert.match(example.english, /was|could/);
  }
});

test("weak focus draws only missed or saved unfinished pairs without inventing scores", () => {
  const question = createPool(defaults)[0];
  assert.equal(createPool({ ...defaults, mode: "weak" }).length, 0);
  const progress = { [question.key]: { attempts: 0, correct: 0, wrong: 0, review: true, last: 1 } };
  assert.deepEqual(createPool({ ...defaults, mode: "weak" }, progress).map((q) => q.key), [question.key]);
  assert.equal(progress[question.key].attempts, 0);
});

test("exact-form examples respect the teaching bank's supported contexts", () => {
  for (const entry of practiceWords) {
    for (const row of conjugate(entry)) {
      const family = familyOf(row);
      if (!supportsExample(entry, family)) continue;
      const example = exampleFor({ entry, row, family });
      assert.ok(example.japanese.includes(row.word));
      assert.ok(example.english && !example.english.includes("undefined"), `${entry.word}: ${row.id}`);
    }
  }
  const humble = practiceWords.find((entry) => entry.word === "申す");
  assert.equal(supportsExample(humble, "passive"), false);
  const entry = practiceWords.find((entry) => entry.word === "覚える");
  const row = conjugate(entry).find((row) => row.id === "passive-plain");
  assert.equal(exampleFor({ entry, row, family: "passive" }).english, "Words are memorized.");
});

