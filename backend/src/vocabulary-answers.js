// @ts-check
import { kana } from "./shiritori-rules.js";

/**
 * @typedef {{ text: string, appliesToKanji?: string[] }} WordForm
 * @typedef {{ appliesToKanji?: string[], appliesToKana?: string[], gloss: Array<{ lang: string, text: string }> }} WordSense
 * @typedef {{ word: string, reading: string, meanings: string, word_senses?: string | null, word_kanji_forms?: string | null, word_kana_forms?: string | null }} VocabularyRow
 */

/** @param {VocabularyRow} row */
export function vocabularyAnswers(row) {
  /** @type {WordSense[]} */
  const senses = JSON.parse(row.word_senses || "[]");
  /** @type {WordForm[]} */
  const spellings = JSON.parse(row.word_kanji_forms || "[]");
  /** @type {WordForm[]} */
  const readings = JSON.parse(row.word_kana_forms || "[]");
  /**
   * @param {string[] | undefined} restrictions
   * @param {string} text
   */
  const supports = (restrictions, text) => Boolean(restrictions?.includes("*") || restrictions?.includes(text));
  const kanaOnly = !/\p{Script=Han}/u.test(row.word) && kana(row.word) === kana(row.reading);
  const matchingReadings = readings.filter((reading) => kana(reading.text) === kana(row.reading));
  const writtenForms = spellings.filter((form) =>
    matchingReadings.some((reading) => supports(reading.appliesToKanji, form.text)),
  );
  const applicable = senses.filter(
    (sense) =>
      (supports(sense.appliesToKana, row.reading) ||
        matchingReadings.some((reading) => supports(sense.appliesToKana, reading.text))) &&
      (supports(sense.appliesToKanji, row.word) ||
        (kanaOnly && writtenForms.some((form) => supports(sense.appliesToKanji, form.text)))),
  );
  return {
    acceptedMeanings: [
      ...new Set([
        .../** @type {string[]} */ (JSON.parse(row.meanings)),
        ...applicable.flatMap((sense) =>
          sense.gloss.filter((gloss) => gloss.lang === "eng").map((gloss) => gloss.text),
        ),
      ]),
    ],
    writtenForms: kanaOnly
      ? writtenForms
          .filter(
            (form) =>
              /\p{Script=Han}/u.test(form.text) &&
              applicable.some((sense) => supports(sense.appliesToKanji, form.text)),
          )
          .map((form) => form.text)
      : [],
  };
}
