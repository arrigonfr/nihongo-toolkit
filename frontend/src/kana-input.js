const BASE = {
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  sa: "さ", si: "し", shi: "し", su: "す", se: "せ", so: "そ",
  ta: "た", ti: "ち", chi: "ち", tu: "つ", tsu: "つ", te: "て", to: "と",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", hu: "ふ", fu: "ふ", he: "へ", ho: "ほ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wi: "うぃ", we: "うぇ", wo: "を",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  za: "ざ", zi: "じ", ji: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  ja: "じゃ", ju: "じゅ", jo: "じょ",
  fa: "ふぁ", fi: "ふぃ", fe: "ふぇ", fo: "ふぉ",
  xa: "ぁ", xi: "ぃ", xu: "ぅ", xe: "ぇ", xo: "ぉ",
  la: "ぁ", li: "ぃ", lu: "ぅ", le: "ぇ", lo: "ぉ",
  xya: "ゃ", xyu: "ゅ", xyo: "ょ", lya: "ゃ", lyu: "ゅ", lyo: "ょ",
  xtu: "っ", xtsu: "っ", ltu: "っ", ltsu: "っ", xwa: "ゎ",
  sha: "しゃ", shu: "しゅ", sho: "しょ", she: "しぇ",
  cha: "ちゃ", chu: "ちゅ", cho: "ちょ", che: "ちぇ",
  tsa: "つぁ", tha: "てゃ", thi: "てぃ", thu: "てゅ", tho: "てょ",
  dha: "でゃ", dhi: "でぃ", dhu: "でゅ", dho: "でょ",
  ca: "か", ci: "し", cu: "く", ce: "せ", co: "こ",
  qa: "くぁ", va: "ゔぁ", vi: "ゔぃ", vu: "ゔ", ve: "ゔぇ", vo: "ゔぉ",
  "-": "ー"
};
for (const [c, k] of Object.entries({
  k: "き", s: "し", t: "ち", n: "に", h: "ひ", m: "み", r: "り", g: "ぎ", z: "じ", d: "ぢ", b: "び", p: "ぴ"
})) {
  BASE[`${c}ya`] = k + "ゃ";
  BASE[`${c}yu`] = k + "ゅ";
  BASE[`${c}yo`] = k + "ょ";
}
BASE.jya = "じゃ"; BASE.jyu = "じゅ"; BASE.jyo = "じょ";
BASE.cya = "ちゃ"; BASE.cyu = "ちゅ"; BASE.cyo = "ちょ";
BASE.zya = "じゃ"; BASE.zyu = "じゅ"; BASE.zyo = "じょ";
BASE.dya = "ぢゃ"; BASE.dyu = "ぢゅ"; BASE.dyo = "ぢょ";

const MAX_LEN = 4;
const VOWELS = "aiueo";

export function toHiragana(text) {
  return [...String(text || "")].map((ch) => {
    const code = ch.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch;
  }).join("");
}

export function toKatakana(text) {
  return [...String(text || "")].map((ch) => {
    const code = ch.codePointAt(0);
    return code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : ch;
  }).join("");
}

export function isKana(ch) {
  return /[\u3041-\u3096\u30a1-\u30f6ー]/u.test(ch || "");
}

/**
 * Converts romaji to hiragana. Returns { kana, rest } where rest is an
 * incomplete trailing sequence (e.g. a lone "n" or "k"). With final=true the
 * rest is flushed ("n" becomes ん, other leftovers are kept as typed).
 */
export function romajiToKana(input, { final = false } = {}) {
  const src = String(input || "").toLowerCase();
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (!/[a-z-]/.test(ch)) {
      out += src[i++];
      continue;
    }
    if (ch === "n" && src[i + 1] === "'") { out += "ん"; i += 2; continue; }
    let matched = false;
    for (let len = Math.min(MAX_LEN, src.length - i); len >= 1; len--) {
      const k = BASE[src.slice(i, i + len)];
      if (k) { out += k; i += len; matched = true; break; }
    }
    if (matched) continue;
    const next = src[i + 1];
    if (ch === "n" && next === "n") {
      // A following vowel can still make んな・んに, so do not consume both n's yet.
      if (!final && i + 2 === src.length) return { kana: out, rest: "nn" };
      out += "ん";
      i += /[aiueoy]/.test(src[i + 2] || "") ? 1 : 2;
      continue;
    }
    if (ch === "n" && next !== undefined && !/[aiueoy]/.test(next)) {
      out += "ん";
      i++;
      continue;
    }
    if (next === ch && !VOWELS.includes(ch) && ch !== "n") { out += "っ"; i++; continue; }
    const tail = src.slice(i);
    const couldExtend = tail.length < MAX_LEN && Object.keys(BASE).some((k) => k.startsWith(tail));
    if (!final && (couldExtend || next === undefined)) {
      return { kana: out, rest: tail };
    }
    if (final && ch === "n" && i === src.length - 1) { out += "ん"; i++; continue; }
    out += src[i++];
  }
  return { kana: out, rest: "" };
}

export function hasLatin(text) {
  return /[A-Za-z]/.test(String(text || ""));
}

/** Converts a text field's romaji to kana, leaving non-Latin characters alone. */
export function convertTypedRomaji(text, { final = false } = {}) {
  const { kana, rest } = romajiToKana(text, { final });
  return kana + rest;
}

const isKanjiChar = (c) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(c);

/**
 * Maps typed text to the expected answer characters when it is an equivalent
 * spelling (kana type difference, or the reading of a kanji answer).
 * Returns an array of characters, or null when no equivalence applies.
 */
export function matchExpectedAnswer(typed, expectedChars, reading) {
  const t = toHiragana(String(typed || "").replace(/\s+/g, ""));
  if (!t) return null;
  const expected = expectedChars.join("");
  if (toHiragana(expected) === t) return expectedChars;
  if (expectedChars.some(isKanjiChar) && reading && toHiragana(reading.replace(/[\s・]/g, "")) === t) {
    return expectedChars;
  }
  return null;
}
