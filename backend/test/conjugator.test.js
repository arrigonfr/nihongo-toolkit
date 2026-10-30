import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { conjugationType, conjugationEntries, findConjugationEntries } from "../src/conjugator.js";
const sense = (pos, meanings, kanji = ["*"], kana = ["*"]) => ({
  partOfSpeech: pos, gloss: meanings.map((text) => ({ lang: "eng", text })), appliesToKanji: kanji,
  appliesToKana: kana, misc: [], related: [], info: []
});
const row = (word, reading, senses, id = 1) => ({
  id, word, reading, is_common: 1,
  kanji_forms: JSON.stringify([{ text: word }]),
  kana_forms: JSON.stringify([{ text: reading, appliesToKanji: ["*"] }]),
  senses: JSON.stringify(senses)
});
test("classification uses explicit modern JMdict tags rather than suffix guesses", () => {
  assert.equal(conjugationType("v1"), "ichidan");
  assert.equal(conjugationType("v5r"), "godan");
  assert.equal(conjugationType("adj-na"), "na-adjective");
  for (const tag of ["n", "v2r-k", "v5uru", "adj-t", "vs-c"]) assert.equal(conjugationType(tag), null);
});
test("spelling and sense restrictions, inherited POS, and JLPT pairings are preserved", () => {
  const data = row("生きる", "いきる", [sense(["v1"], ["to live"]), sense([], ["to exist"]), sense(["n"], ["excluded"], ["別"])]);
  const entries = conjugationEntries(data, [{ word: "別", reading: "いきる", jlpt: 5 }]);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].meanings, ["to live", "to exist"]);
  assert.equal(entries[0].level, null);
  assert.equal(conjugationEntries(data, [{ word: "生きる", reading: "いきる", jlpt: 3 }])[0].level, 3);
});
test("suru nouns attach する but nouns alone are not conjugatable", () => {
  assert.equal(conjugationEntries(row("勉強", "べんきょう", [sense(["n", "vs"], ["study"])]))[0].word, "勉強する");
  assert.equal(conjugationEntries(row("猫", "ねこ", [sense(["n"], ["cat"])] )).length, 0);
  assert.equal(conjugationEntries(row("為る", "する", [sense(["vs-i"], ["to do"])]))[0].word, "為る");
});
test("lookup offers ambiguous classes, treats wildcard input literally, and random avoids recent readings", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE words (id INTEGER, word TEXT, reading TEXT, is_common INTEGER, kanji_forms TEXT, kana_forms TEXT, senses TEXT);
    CREATE TABLE vocabulary (word_id INTEGER, word TEXT, reading TEXT, jlpt INTEGER);`);
  const insert = db.prepare("INSERT INTO words VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const data of [
    row("切る", "きる", [sense(["v5r"], ["cut"])], 1),
    row("着る", "きる", [sense(["v1"], ["wear"])], 2),
    row("食べる", "たべる", [sense(["v1"], ["eat"])], 3),
    row("ハンサム", "ハンサム", [sense(["adj-na"], ["handsome"])], 4)
  ]) { insert.run(data.id, data.word, data.reading, data.is_common, data.kanji_forms, data.kana_forms, data.senses); db.prepare("INSERT INTO vocabulary VALUES (?, ?, ?, 5)").run(data.id, data.word, data.reading); }
  assert.equal((await findConjugationEntries(db, { query: "きる" })).length, 2);
  assert.equal((await findConjugationEntries(db, { query: "%" })).length, 0);
  assert.equal((await findConjugationEntries(db, { random: true, exclude: ["きる"], level: "5", category: "verb" }))[0].word, "食べる");
  assert.equal((await findConjugationEntries(db, { query: "はんさむ" }))[0].word, "ハンサム");
  assert.equal((await findConjugationEntries(db, { random: true, category: "adjective" }))[0].word, "ハンサム");
  await assert.rejects(findConjugationEntries(db, { random: true, level: "0" }), /JLPT/);
  db.close();
});
