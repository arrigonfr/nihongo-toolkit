import test from "node:test";
import assert from "node:assert/strict";
import { isPlaceName } from "../src/proper-nouns.js";
import { dictionaryForms } from "../src/shiritori.js";
import { eligibility, parseRules } from "../src/shiritori-rules.js";

test("ordinary noun tags do not let countries bypass the no-proper-nouns rule", () => {
  for (const [word, reading, meaning] of [["日本", "にほん", "Japan"], ["中国", "ちゅうごく", "China"], ["アメリカ", "あめりか", "America"]]) {
    const row = {
      id: 1, kanji_forms: JSON.stringify([{ text: word }]),
      kana_forms: JSON.stringify([{ text: reading, appliesToKanji: ["*"] }]),
      senses: JSON.stringify([{ appliesToKanji: ["*"], appliesToKana: ["*"], partOfSpeech: ["n"], misc: [], gloss: [{ lang: "eng", text: meaning }] }])
    };
    const [entry] = dictionaryForms(row, { n: "noun" });
    assert.equal(entry.proper, true);
    // 日本 ends in ん and is independently forbidden, so check the proper-noun flag too.
    if (word !== "日本") assert.match(eligibility(entry, parseRules()), /Proper nouns/);
  }
  assert.equal(isPlaceName("猫", ["cat"]), false);
  assert.equal(isPlaceName("チリ", ["Chile"]), true);
  assert.equal(isPlaceName("Chile"), false);
  assert.equal(isPlaceName("別表記", ["Chile"]), true);
});
