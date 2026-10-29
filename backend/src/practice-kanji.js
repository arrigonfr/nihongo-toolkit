// Component-only glyphs can have KANJIDIC readings but are not standalone quiz terms.
const components = new Set([..."丨丶丿亅亠儿冂冖冫凵勹匚匸卩厂厶囗夂夊宀尢屮巛幺广廴廾彐彑彡彳忄扌攴攵氵氺灬爫丬牜犭疒癶罒罓礻糹纟耂肀艹虍衤覀訁讠辶阝釒钅飠饣髟鬥鬯鬲龠⺅"]);
export const practiceMeanings = (meanings) => meanings.filter((meaning) =>
  !/\bradical\b.*(?:no\.?|number|#)\s*\d|\b(?:left|right)[ -]side radical\b/i.test(meaning));

export function isPracticeKanji(character, onReadings, kunReadings, meanings) {
  return /^\p{Unified_Ideograph}$/u.test(character)
    && !components.has(character)
    && [...onReadings, ...kunReadings].some((reading) => /^[\p{Script=Hiragana}\p{Script=Katakana}ー.\-]+$/u.test(reading))
    && practiceMeanings(meanings).some((meaning) => !/\bradical\b/i.test(meaning));
}
