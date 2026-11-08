import test from "node:test";
import assert from "node:assert/strict";
import { dictionaryForms } from "../src/shiritori.js";
import { eligibility, parseRules } from "../src/shiritori-rules.js";

test("proper-noun metadata comes from dictionary tags, never spelling or gloss guesses", () => {
  for (const [word, reading, meaning] of [["日本", "にほん", "Japan"], ["中国", "ちゅうごく", "China"], ["アメリカ", "あめりか", "America"]]) {
    const row = {
      id: 1, kanji_forms: JSON.stringify([{ text: word }]),
      kana_forms: JSON.stringify([{ text: reading, appliesToKanji: ["*"] }]),
      senses: JSON.stringify([{ appliesToKanji: ["*"], appliesToKana: ["*"], partOfSpeech: ["n"], misc: [], gloss: [{ lang: "eng", text: meaning }] }])
    };
    const [entry] = dictionaryForms(row, { n: "noun" });
    assert.equal(entry.proper, false);
    if (word === "日本") assert.notEqual(eligibility(entry, parseRules()), "");
    else assert.equal(eligibility(entry, parseRules({ proper: false, wordType: "nouns" })), "");
  }
});

test("dictionary proper-noun and name tags are preserved for any spelling", () => {
  for (const [partOfSpeech, misc] of [[["n-pr"], []], [["n"], ["place"]], [["n"], ["person"]]]) {
    const [entry] = dictionaryForms({
      id: 2, kanji_forms: "[]",
      kana_forms: JSON.stringify([{ text: "てすと", appliesToKanji: ["*"] }]),
      senses: JSON.stringify([{ appliesToKanji: ["*"], appliesToKana: ["*"], partOfSpeech, misc,
        gloss: [{ lang: "eng", text: "test entry" }] }])
    }, {});
    assert.equal(entry.proper, true);
    assert.equal(entry.nameAllowed, true);
  }
});
