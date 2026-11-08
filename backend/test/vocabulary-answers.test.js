import test from "node:test";
import assert from "node:assert/strict";
import { vocabularyAnswers } from "../src/vocabulary-answers.js";

const sense = (text, kanji = ["*"], reading = ["*"]) => ({
  appliesToKanji: kanji, appliesToKana: reading, gloss: [{ lang: "eng", text }]
});
test("study answers retain all applicable dictionary glosses without mixing homographs or readings", () => {
  const row = { word: "プール", reading: "プール", meanings: '["swimming pool"]',
    word_senses: JSON.stringify([sense("(swimming) pool"), sense("pool (cue sport)"), sense("unrelated", ["別"]), sense("wrong reading", ["*"], ["べつ"])]) };
  assert.deepEqual(vocabularyAnswers(row).acceptedMeanings, ["swimming pool", "(swimming) pool", "pool (cue sport)"]);
});
test("kana hints use only spellings permitted for this entry's reading and senses", () => {
  const row = { word: "かける", reading: "かける", meanings: '["to hang"]',
    word_kanji_forms: JSON.stringify([{ text: "掛ける" }, { text: "別" }, { text: "欠ける" }]),
    word_kana_forms: JSON.stringify([{ text: "かける", appliesToKanji: ["掛ける", "欠ける"] }, { text: "べつ", appliesToKanji: ["別"] }]),
    word_senses: JSON.stringify([sense("to hang", ["掛ける"], ["かける"]), sense("unrelated", ["別"], ["べつ"])]) };
  assert.deepEqual(vocabularyAnswers(row), { acceptedMeanings: ["to hang"], writtenForms: ["掛ける"] });
  assert.deepEqual(vocabularyAnswers({ ...row, word: "掛ける" }).writtenForms, []);
  assert.deepEqual(vocabularyAnswers({ word: "かな", reading: "かな", meanings: '["kana"]' }),
    { acceptedMeanings: ["kana"], writtenForms: [] });
});
