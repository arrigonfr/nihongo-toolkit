// @ts-check

export const KANA_DIRECTIONS = ["hiragana-romaji", "katakana-romaji", "romaji-hiragana", "romaji-katakana"];

/**
 * Saved values from the old single-choice select map onto the multi-select;
 * "random" is the exclusive Randomize chip.
 * @param {unknown} value
 * @returns {string[]}
 */
export function kanaDirections(value) {
  if (value === "to-romaji") return ["hiragana-romaji", "katakana-romaji"];
  if (value === "to-kana") return ["romaji-hiragana", "romaji-katakana"];
  if (value === "romaji-any") return ["romaji-hiragana", "romaji-katakana"];
  const list = String(value ?? "").split(",").filter((item) => KANA_DIRECTIONS.includes(item));
  const last = list.at(-1);
  return last ? list.filter((item) => item.startsWith("romaji-") === last.startsWith("romaji-")) : ["hiragana-romaji", "katakana-romaji"];
}

/** @type {Array<{ type: "hiragana" | "katakana", display: string, answer: string }>} */
export const kanaEntries = [];

/**
 * @param {string} hira
 * @param {string} kata
 * @param {string[]} sounds
 */
const addKanaRow = (hira, kata, sounds) => {
  [...hira].forEach((char, index) => kanaEntries.push({ type: "hiragana", display: char, answer: sounds[index] }));
  [...kata].forEach((char, index) => kanaEntries.push({ type: "katakana", display: char, answer: sounds[index] }));
};

addKanaRow("あいうえお", "アイウエオ", ["a", "i", "u", "e", "o"]);
addKanaRow("かきくけこ", "カキクケコ", ["ka", "ki", "ku", "ke", "ko"]);
addKanaRow("さしすせそ", "サシスセソ", ["sa", "shi", "su", "se", "so"]);
addKanaRow("たちつてと", "タチツテト", ["ta", "chi", "tsu", "te", "to"]);
addKanaRow("なにぬねの", "ナニヌネノ", ["na", "ni", "nu", "ne", "no"]);
addKanaRow("はひふへほ", "ハヒフヘホ", ["ha", "hi", "fu", "he", "ho"]);
addKanaRow("まみむめも", "マミムメモ", ["ma", "mi", "mu", "me", "mo"]);
addKanaRow("やゆよ", "ヤユヨ", ["ya", "yu", "yo"]);
addKanaRow("らりるれろ", "ラリルレロ", ["ra", "ri", "ru", "re", "ro"]);
addKanaRow("わを", "ワヲ", ["wa", "wo"]);
kanaEntries.push({ type: "hiragana", display: "ん", answer: "n" }, { type: "katakana", display: "ン", answer: "n" });
addKanaRow("がぎぐげご", "ガギグゲゴ", ["ga", "gi", "gu", "ge", "go"]);
addKanaRow("ざじずぜぞ", "ザジズゼゾ", ["za", "ji", "zu", "ze", "zo"]);
addKanaRow("だぢづでど", "ダヂヅデド", ["da", "ji", "zu", "de", "do"]);
addKanaRow("ばびぶべぼ", "バビブベボ", ["ba", "bi", "bu", "be", "bo"]);
addKanaRow("ぱぴぷぺぽ", "パピプペポ", ["pa", "pi", "pu", "pe", "po"]);

/** @type {Array<[string, string, string, string[], string[]]>} */
const yoonRows = [
  ["き", "キ", "ky", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]],
  ["し", "シ", "sh", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]],
  ["ち", "チ", "ch", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]],
  ["に", "ニ", "ny", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]],
  ["ひ", "ヒ", "hy", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]],
  ["み", "ミ", "my", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]],
  ["り", "リ", "ry", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]],
  ["ぎ", "ギ", "gy", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]],
  ["じ", "ジ", "j", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]],
  ["び", "ビ", "by", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]],
  ["ぴ", "ピ", "py", ["ゃ", "ゅ", "ょ"], ["ャ", "ュ", "ョ"]]
];
yoonRows.forEach(([hira, kata, consonant, smallH, smallK]) => {
  ["a", "u", "o"].forEach((vowel, index) => {
    kanaEntries.push({ type: "hiragana", display: hira + smallH[index], answer: consonant + vowel });
    kanaEntries.push({ type: "katakana", display: kata + smallK[index], answer: consonant + vowel });
  });
});

/** @param {unknown} text */
export function normalizeMojiText(text) {
  return String(text ?? "").normalize("NFKC").toLocaleLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "").replace(/[.,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ").trim();
}

/** @param {string} text */
export function katakanaToHiragana(text) {
  return [...text].map((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
  }).join("");
}

const romajiMap = new Map(kanaEntries.map((entry) => [entry.display, entry.answer]));
const sortedRomajiKeys = [...romajiMap.keys()].sort((a, b) => b.length - a.length);

/** @param {unknown} reading */
export function romanizeReading(reading) {
  let input = katakanaToHiragana(String(reading ?? "")).replace(/[\s・.\-]/g, "");
  let output = "";
  while (input) {
    if (input[0] === "っ") {
      const next = sortedRomajiKeys.find((key) => input.slice(1).startsWith(key));
      output += next ? (romajiMap.get(next)?.[0] || "") : "";
      input = input.slice(1);
      continue;
    }
    if (input[0] === "ー") {
      output += output.match(/[aeiou](?!.*[aeiou])/i)?.[0] || "";
      input = input.slice(1);
      continue;
    }
    const key = sortedRomajiKeys.find((candidate) => input.startsWith(candidate));
    if (key) {
      output += romajiMap.get(key) || "";
      input = input.slice(key.length);
    } else {
      output += input[0];
      input = input.slice(1);
    }
  }
  return output;
}

/** @param {number} milliseconds */
export function formatElapsed(milliseconds) {
  const elapsed = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor(elapsed / 60000) % 60;
  const seconds = Math.floor(elapsed / 1000) % 60;
  const millis = String(elapsed % 1000).padStart(3, "0");
  const mm = String(hours ? minutes : Math.floor(elapsed / 60000)).padStart(2, "0");
  return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${mm}:${String(seconds).padStart(2, "0")}.${millis}`;
}
