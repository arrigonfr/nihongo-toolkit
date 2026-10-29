const rows = [
  ["あいうえお", "a i u e o"], ["かきくけこ", "ka ki ku ke ko"], ["さしすせそ", "sa shi su se so"],
  ["たちつてと", "ta chi tsu te to"], ["なにぬねの", "na ni nu ne no"], ["はひふへほ", "ha hi fu he ho"],
  ["まみむめも", "ma mi mu me mo"], ["やゆよ", "ya yu yo"], ["らりるれろ", "ra ri ru re ro"],
  ["わをん", "wa wo n"], ["がぎぐげご", "ga gi gu ge go"], ["ざじずぜぞ", "za ji zu ze zo"],
  ["だぢづでど", "da ji zu de do"], ["ばびぶべぼ", "ba bi bu be bo"], ["ぱぴぷぺぽ", "pa pi pu pe po"],
  ["ぁぃぅぇぉ", "a i u e o"], ["ゃゅょ", "ya yu yo"], ["ゔ", "vu"]
];
const syllables = new Map(rows.flatMap(([kana, romaji]) =>
  [...kana].map((character, index) => [character, romaji.split(" ")[index]])));
const digraphs = new Map([
  ["きゃ", "kya"], ["きゅ", "kyu"], ["きょ", "kyo"], ["しゃ", "sha"], ["しゅ", "shu"], ["しょ", "sho"],
  ["ちゃ", "cha"], ["ちゅ", "chu"], ["ちょ", "cho"], ["にゃ", "nya"], ["にゅ", "nyu"], ["にょ", "nyo"],
  ["ひゃ", "hya"], ["ひゅ", "hyu"], ["ひょ", "hyo"], ["みゃ", "mya"], ["みゅ", "myu"], ["みょ", "myo"],
  ["りゃ", "rya"], ["りゅ", "ryu"], ["りょ", "ryo"], ["ぎゃ", "gya"], ["ぎゅ", "gyu"], ["ぎょ", "gyo"],
  ["じゃ", "ja"], ["じゅ", "ju"], ["じょ", "jo"], ["びゃ", "bya"], ["びゅ", "byu"], ["びょ", "byo"],
  ["ぴゃ", "pya"], ["ぴゅ", "pyu"], ["ぴょ", "pyo"]
]);

export function romanizeKana(reading) {
  let kana = [...String(reading || "")].map((character) => {
    const code = character.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
  }).join("").replace(/[\s・]/g, "");
  let output = "";
  while (kana) {
    if (kana.startsWith("っ")) {
      const next = digraphs.get(kana.slice(1, 3)) || syllables.get(kana[1]) || "";
      if (next && !/^[aeiou]/.test(next)) output += next[0];
      kana = kana.slice(1);
      continue;
    }
    if (kana[0] === "ー") {
      output += output.match(/[aeiou](?!.*[aeiou])/i)?.[0] || "";
      kana = kana.slice(1);
      continue;
    }
    const syllable = digraphs.get(kana.slice(0, 2));
    if (syllable) {
      output += syllable;
      kana = kana.slice(2);
      continue;
    }
    output += syllables.get(kana[0]) || kana[0];
    kana = kana.slice(1);
  }
  return output;
}
