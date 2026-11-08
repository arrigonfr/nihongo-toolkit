import { kana } from "./shiritori-rules.js";

export function vocabularyAnswers(row) {
  const senses = JSON.parse(row.word_senses || "[]");
  const spellings = JSON.parse(row.word_kanji_forms || "[]");
  const readings = JSON.parse(row.word_kana_forms || "[]");
  const supports = (restrictions, text) => restrictions?.includes("*") || restrictions?.includes(text);
  const kanaOnly = !/\p{Script=Han}/u.test(row.word) && kana(row.word) === kana(row.reading);
  const matchingReadings = readings.filter((reading) => kana(reading.text) === kana(row.reading));
  const writtenForms = spellings.filter((form) => matchingReadings.some((reading) =>
    supports(reading.appliesToKanji, form.text)));
  const applicable = senses.filter((sense) =>
    (supports(sense.appliesToKana, row.reading) || matchingReadings.some((reading) => supports(sense.appliesToKana, reading.text)))
    && (supports(sense.appliesToKanji, row.word)
      || kanaOnly && writtenForms.some((form) => supports(sense.appliesToKanji, form.text))));
  return {
    acceptedMeanings: [...new Set([...JSON.parse(row.meanings), ...applicable.flatMap((sense) =>
      sense.gloss.filter((gloss) => gloss.lang === "eng").map((gloss) => gloss.text))])],
    writtenForms: kanaOnly ? writtenForms.filter((form) => /\p{Script=Han}/u.test(form.text)
      && applicable.some((sense) => supports(sense.appliesToKanji, form.text))).map((form) => form.text) : []
  };
}
