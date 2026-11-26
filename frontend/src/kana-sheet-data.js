// Free Kana cheatsheet data and shared cell text helpers.

export const cellText = (item) => item.parts.map(([text]) => text).join("");
export const cellLabel = (item) => (item.sub ? `${cellText(item)} (${item.sub})` : cellText(item));

const KANA_ROWS = [
  ["", "あ", "a", "い", "i", "う", "u", "え", "e", "お", "o"],
  ["k", "か", "ka", "き", "ki", "く", "ku", "け", "ke", "こ", "ko"],
  ["s", "さ", "sa", "し", "shi", "す", "su", "せ", "se", "そ", "so"],
  ["t", "た", "ta", "ち", "chi", "つ", "tsu", "て", "te", "と", "to"],
  ["n", "な", "na", "に", "ni", "ぬ", "nu", "ね", "ne", "の", "no"],
  ["h", "は", "ha", "ひ", "hi", "ふ", "fu", "へ", "he", "ほ", "ho"],
  ["m", "ま", "ma", "み", "mi", "む", "mu", "め", "me", "も", "mo"],
  ["y", "や", "ya", null, null, "ゆ", "yu", null, null, "よ", "yo"],
  ["r", "ら", "ra", "り", "ri", "る", "ru", "れ", "re", "ろ", "ro"],
  ["w", "わ", "wa", "ゐ", "wi*", null, null, "ゑ", "we*", "を", "wo"],
  ["", "ん", "n", null, null, null, null, null, null, null, null]
];
const KANA_VOICED = [
  ["g", "が", "ga", "ぎ", "gi", "ぐ", "gu", "げ", "ge", "ご", "go"],
  ["z", "ざ", "za", "じ", "ji", "ず", "zu", "ぜ", "ze", "ぞ", "zo"],
  ["d", "だ", "da", "ぢ", "ji", "づ", "zu", "で", "de", "ど", "do"],
  ["b", "ば", "ba", "び", "bi", "ぶ", "bu", "べ", "be", "ぼ", "bo"],
  ["p", "ぱ", "pa", "ぴ", "pi", "ぷ", "pu", "ぺ", "pe", "ぽ", "po"]
];
const KANA_COMBO = [
  ["ky", "きゃ", "kya", "きゅ", "kyu", "きょ", "kyo"],
  ["sh", "しゃ", "sha", "しゅ", "shu", "しょ", "sho"],
  ["ch", "ちゃ", "cha", "ちゅ", "chu", "ちょ", "cho"],
  ["ny", "にゃ", "nya", "にゅ", "nyu", "にょ", "nyo"],
  ["hy", "ひゃ", "hya", "ひゅ", "hyu", "ひょ", "hyo"],
  ["my", "みゃ", "mya", "みゅ", "myu", "みょ", "myo"],
  ["ry", "りゃ", "rya", "りゅ", "ryu", "りょ", "ryo"],
  ["gy", "ぎゃ", "gya", "ぎゅ", "gyu", "ぎょ", "gyo"],
  ["j", "じゃ", "ja", "じゅ", "ju", "じょ", "jo"],
  ["by", "びゃ", "bya", "びゅ", "byu", "びょ", "byo"],
  ["py", "ぴゃ", "pya", "ぴゅ", "pyu", "ぴょ", "pyo"]
];

export const toKatakana = (text) => text.replace(/[\u3041-\u3096]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));

function kanaTable(id, title, script, source, columns) {
  const convert = script === "katakana" ? toKatakana : (text) => text;
  return {
    id, title, columns, rowLabels: source.map((row) => (row[0] || "·")),
    rows: source.map((row) => {
      const cells = [];
      for (let i = 1; i < row.length; i += 2) cells.push(row[i] ? { parts: [[convert(row[i]), false]], sub: row[i + 1] } : null);
      while (cells.length < columns.length) cells.push(null);
      return cells;
    })
  };
}

const VOWELS = ["a", "i", "u", "e", "o"];
const COMBO_COLUMNS = ["ya", "yu", "yo"];

export function kanaScript(script) {
  const name = script === "katakana" ? "Katakana" : "Hiragana";
  return [
    kanaTable(`${script}-basic`, `${name} · ${script === "katakana" ? "カタカナ" : "ひらがな"} gojūon`, script, KANA_ROWS, VOWELS),
    kanaTable(`${script}-voiced`, `${name} dakuten ゛ and handakuten ゜`, script, KANA_VOICED, VOWELS),
    kanaTable(`${script}-combo`, `${name} combinations (yōon)`, script, KANA_COMBO, COMBO_COLUMNS)
  ];
}

export const kanaNotes = {
  hiragana: [
    "っ (small tsu) doubles the next consonant: きって kitte",
    "Long vowels: おう / おお → ō",
    "Long vowels: えい → ē; ああ → ā",
    "Particle は is pronounced wa",
    "Particle へ is pronounced e",
    "Particle を is pronounced o",
    "ぢ づ are rare; use じ ず",
    "Irregular pronunciations: し shi · ち chi · つ tsu · ふ fu",
    "Historical kana: ゐ wi and ゑ we are not used in standard modern Japanese."
  ],
  katakana: [
    "ー lengthens a vowel: コーヒー kōhī",
    "ッ (small tsu) doubles a consonant: ベッド beddo",
    "Foreign sounds: ファ fa · フィ fi · フェ fe · フォ fo",
    "Foreign sounds: ティ ti · ディ di · ウィ wi",
    "Foreign sounds: シェ she · チェ che · ジェ je · ヴ vu",
    "Irregular pronunciations: シ shi · チ chi · ツ tsu · フ fu",
    "Historical kana: ヰ wi and ヱ we are not used in standard modern Japanese."
  ]
};

export function kanaSheet() {
  return {
    id: "kana", title: "Hiragana & Katakana", jp: "ひらがな・カタカナ", subtitle: "Kana cheatsheet · gojūon, dakuten, handakuten and combinations",
    hue: 340, hue2: 215,
    tables: [...kanaScript("hiragana"), ...kanaScript("katakana")],
    notes: [
      { title: "Hiragana", lines: kanaNotes.hiragana },
      { title: "Katakana", lines: kanaNotes.katakana }
    ],
    footer: ""
  };
}
