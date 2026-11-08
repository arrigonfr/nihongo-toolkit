export const practiceMeanings = (meanings) => meanings.filter((meaning) =>
  !/\bradical\b.*(?:no\.?|number|#)\s*\d|\b(?:left|right)[ -]side radical\b/i.test(meaning));

export function isPracticeKanji(character, onReadings, kunReadings, meanings) {
  return /^\p{Unified_Ideograph}$/u.test(character)
    && [...onReadings, ...kunReadings].some((reading) => /^[\p{Script=Hiragana}\p{Script=Katakana}ー.\-]+$/u.test(reading))
    && practiceMeanings(meanings).some((meaning) => !/\bradical\b/i.test(meaning));
}
