import test from "node:test";
import assert from "node:assert/strict";
import { segmentText } from "../src/tokenizer.js";
import { analyzeSentence } from "../src/analyze.js";
import { openDatabase } from "../src/database.js";

test("morphological analysis preserves Japanese words, suffixes, particles and conjugations", async () => {
  for (const [text, expected] of [
    ["私は昨日学校に行きました。", ["私", "は", "昨日", "学校", "に", "行きました", "。"]],
    ["本を読んでいます。", ["本", "を", "読んでいます", "。"]],
    ["寿司を食べませんでした。", ["寿司", "を", "食べませんでした", "。"]],
    ["これは高くなかった。", ["これ", "は", "高くなかった", "。"]],
    ["すもももももももものうち", ["すもも", "も", "もも", "も", "もも", "の", "うち"]],
    ["ドイツ語はやさしい言語ではありません。", ["ドイツ語", "は", "やさしい", "言語", "で", "は", "ありません", "。"]]
  ]) {
    const tokens = await segmentText(text);
    assert.deepEqual(tokens.map((token) => token.text), expected, text);
    assert.equal(tokens.map((token) => token.text).join(""), text);
  }
  const [verb] = await segmentText("行きました");
  assert.equal(verb.base, "行く");
  assert.equal(verb.reading, "いきました");
  const spaced = " 猫 は\n元気です。🙂";
  assert.equal((await segmentText(spaced)).map((token) => token.text).join(""), spaced);
});

test("dictionary enrichment keeps inflected surface readings rather than lemma readings", async () => {
  const db = openDatabase();
  try {
    const result = await analyzeSentence(db, "本を読んでいます。", {
      toWord: (row) => ({ japanese: [{ word: row.word, reading: row.reading }] }),
      translateSentence: async () => ""
    });
    const verb = result.tokens.find((token) => token.text === "読んでいます");
    assert.equal(verb.base, "読む");
    assert.equal(verb.reading, "よんでいます");
    assert.ok(verb.result);
  } finally { db.close(); }
});
