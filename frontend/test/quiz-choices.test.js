import test from "node:test";
import assert from "node:assert/strict";
import { meaningChoices } from "../src/quiz-choices.js";

const words = Array.from({ length: 20 }, (_, i) => ({ word: `word-${i}`, meaning: `meaning-${i}` }));

test("choices contain one correct meaning and three distinct, newly sampled distractors", () => {
  let previous = [];
  for (const current of words) {
    const result = meaningChoices(current, words, previous, () => 0.25);
    assert.equal(result.choices.length, 4);
    assert.equal(new Set(result.choices).size, 4);
    assert.ok(result.choices.includes(current.meaning));
    assert.ok(result.distractors.every((meaning) => !previous.includes(meaning)));
    previous = result.distractors;
  }
  assert.notDeepEqual(meaningChoices(words[0], words, [], () => 0).distractors,
    meaningChoices(words[0], words, [], () => 0.99).distractors);
});

test("small pools reuse only available unique meanings without duplicating the answer", () => {
  const pool = [...words.slice(0, 4), words[1], { word: "synonym", meaning: words[0].meaning }];
  const result = meaningChoices(words[0], pool, words.slice(1, 4).map((item) => item.meaning));
  assert.equal(result.choices.length, 4);
  assert.equal(new Set(result.choices).size, 4);
  assert.deepEqual(meaningChoices(words[0], [words[0]]).choices, [words[0].meaning]);
});

test("large pools avoid every option shown in the last thirty questions", () => {
  const pool = Array.from({ length: 150 }, (_, i) => ({ word: `word-${i}`, meaning: `meaning-${i}` }));
  let history = [];
  for (let index = 0; index < 90; index++) {
    const current = pool[index];
    const { choices, distractors } = meaningChoices(current, pool, history);
    assert.equal(new Set(choices).size, 4);
    assert.ok(distractors.every((meaning) => !history.includes(meaning)));
    history = [...history, current.meaning, ...distractors].slice(-120);
  }
});

test("exhausted pools reuse the least recently displayed meanings first", () => {
  const history = ["meaning-1", "meaning-2", "meaning-3", "meaning-4", "meaning-5", "meaning-1"];
  const result = meaningChoices(words[0], words.slice(0, 6), history);
  assert.deepEqual(new Set(result.distractors), new Set(["meaning-2", "meaning-3", "meaning-4"]));
});
