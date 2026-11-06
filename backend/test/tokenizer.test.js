import test from "node:test";
import assert from "node:assert/strict";
import { segmentText } from "../src/tokenizer.js";
import { analyzeSentence } from "../src/analyze.js";
import { openDatabase } from "../src/database.js";
import { createHandler } from "../src/app.js";
import { createServer } from "node:http";
import { once } from "node:events";

test("analysis API includes distinct source kanji and database JLPT ratings", async () => {
  const db = openDatabase();
  const server = createServer(createHandler({
    database: db, translateSentence: async () => "",
    sentenceFallback: async () => [], wordFallback: async () => []
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    for (const text of ["本を読んでいます。本。", "ひらがな"]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analyze?text=${encodeURIComponent(text)}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      const expected = db.prepare("SELECT character, jlpt FROM kanjis WHERE character IN (SELECT value FROM json_each(?))")
        .all(JSON.stringify([...new Set([...text].filter((character) => /\p{Script=Han}/u.test(character)))]));
      assert.deepEqual(payload.kanji, expected.map((row) => ({ ...row })));
      assert.equal(payload.tokens.map((token) => token.text).join(""), text);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

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
