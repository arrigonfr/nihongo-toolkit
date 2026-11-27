// @ts-check

/** @param {string[]} meanings */
export const practiceMeanings = (meanings) =>
  meanings.filter(
    (meaning) => !/\bradical\b.*(?:no\.?|number|#)\s*\d|\b(?:left|right)[ -]side radical\b/i.test(meaning),
  );

/**
 * @param {string} character
 * @param {string[]} onReadings
 * @param {string[]} kunReadings
 * @param {string[]} meanings
 */
export function isPracticeKanji(character, onReadings, kunReadings, meanings) {
  return (
    /^\p{Unified_Ideograph}$/u.test(character) &&
    [...onReadings, ...kunReadings].some((reading) =>
      /^[\p{Script=Hiragana}\p{Script=Katakana}ー.-]+$/u.test(reading),
    ) &&
    practiceMeanings(meanings).some((meaning) => !/\bradical\b/i.test(meaning))
  );
}
