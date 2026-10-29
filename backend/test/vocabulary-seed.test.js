import test from "node:test";
import assert from "node:assert/strict";
import {
  parseLevels, parseCsv, parseJlptCsv, extractSentences, sentenceRow, buildWordIndex,
  matchWord, jlptFromTags, vocabularyRow
} from "../scripts/vocabulary-seed-lib.js";

test("parseLevels validates and defaults", () => {
  assert.deepEqual(parseLevels("n5, N4,n5"), ["N5", "N4"]);
  assert.equal(parseLevels().length, 5);
  assert.throws(() => parseLevels("N6"));
});

test("parseCsv handles quotes, commas and newlines", () => {
  assert.deepEqual(parseCsv('a,"b, ""c""",d\r\n"x\ny",,z\n'), [["a", 'b, "c"', "d"], ["x\ny", "", "z"]]);
});

test("parseJlptCsv maps rows and tags", () => {
  const rows = parseJlptCsv('expression,reading,meaning,tags,guid\n会う,あう,"to meet, to see",JLPT JLPT_3 JLPT_N5,x\n', "N5");
  assert.deepEqual(rows[0], { expression: "会う", reading: "あう", meaning: "to meet, to see",
    tags: ["JLPT", "JLPT_3", "JLPT_N5"], level: "N5" });
  assert.equal(jlptFromTags(rows[0].tags), 5);
  assert.equal(jlptFromTags(["JLPT_3"]), null);
  assert.throws(() => parseJlptCsv("a,b\n1,2", "N5"));
});

test("extractSentences keeps only complete tatoeba pairs", () => {
  const entry = { sense: [{ examples: [
    { source: { type: "tatoeba", value: "7" }, text: "会う", sentences: [{ lang: "jpn", text: "ja" }, { lang: "eng", text: "en" }] },
    { source: { type: "tatoeba", value: "8" }, text: "x", sentences: [{ lang: "jpn", text: "ja" }] },
    { source: { type: "other", value: "9" }, text: "x", sentences: [{ lang: "jpn", text: "a" }, { lang: "eng", text: "b" }] }
  ] }, {}] };
  const out = extractSentences(entry);
  assert.deepEqual(out, [{ sourceId: "7", ja: "ja", en: "en", matched: "会う" }]);
  assert.equal(sentenceRow(out[0]).id, "tatoeba:7");
  assert.match(sentenceRow(out[0]).license, /CC BY/);
});

test("matchWord prefers matching reading, then common entries", () => {
  const index = buildWordIndex([
    { id: 2, is_common: 0, kanji_forms: '[{"text":"生"}]', kana_forms: '[{"text":"なま"}]' },
    { id: 1, is_common: 1, kanji_forms: '[{"text":"生"}]', kana_forms: '[{"text":"せい"}]' },
    { id: 3, is_common: 1, kanji_forms: "[]", kana_forms: '[{"text":"ああ"}]' }
  ]);
  assert.equal(matchWord(index, { expression: "生", reading: "なま" }).id, 2);
  assert.equal(matchWord(index, { expression: "生", reading: "?" }).id, 1);
  assert.equal(matchWord(index, { expression: "ああ", reading: "ああ" }).id, 3);
  assert.equal(matchWord(index, { expression: "無", reading: "む" }), null);
});

test("vocabularyRow flattens senses", () => {
  const row = vocabularyRow({ id: 5, word: "会う", reading: "あう", is_common: 1,
    meanings: '["to meet","to see","x","y"]', senses: '[{"partOfSpeech":["v5u","vi"],"misc":["uk"]}]' },
  { jlpt: 5, meaning: "", source: "s", license: "l", tags: ["JLPT_N5"], word: "逢う", reading: "あう" });
  assert.equal(row.word, "逢う");
  assert.equal(row.meaning, "to meet; to see; x");
  assert.deepEqual(JSON.parse(row.parts_of_speech), ["v5u", "vi"]);
  assert.deepEqual(JSON.parse(row.tags), ["JLPT_N5", "uk"]);
});
