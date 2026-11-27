// @ts-check

import { romanizeKana } from "./romanize.js";
import { meaningAnswers } from "./vocabulary-answers.js";

export const STORAGE = {
  showStats: "goi-show-stats-v1",
  showExample: "goi-show-example-v1",
  kanaDirection: "goi-kana-direction-v1",
  font: "goi-font-v1"
};

export const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

export const MODES = {
  "multiple-ej": "Multiple choice (E→J)",
  "typing-ej": "Typing (E→J)",
  "multiple-je": "Multiple choice (J→E)",
  "typing-je": "Typing (J→E)"
};

/** @param {unknown} value */
export function parseMode(value) {
  const [mode, dir] = String(value).split("-");
  return { mode: ["multiple", "typing"].includes(mode) ? mode : "multiple", dir: dir === "je" ? "je" : "ej" };
}

/**
 * @param {string} key
 * @param {boolean} [fallback]
 */
export function readBoolean(key, fallback = false) {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : saved === "true";
  } catch (error) {
    console.warn("Could not read saved preference.", error);
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {string} fallback
 */
export function readString(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (error) {
    console.warn("Could not read saved preference.", error);
    return fallback;
  }
}

/** @param {any} item */
export function normalizeWord(item) {
  if (!item || typeof item.word !== "string" || !item.word.trim() || typeof item.meaning !== "string" || !item.meaning.trim()) return null;
  const levelNum = Number(item.level);
  return {
    id: item.id,
    word: item.word.trim(),
    furigana: typeof item.furigana === "string" ? item.furigana.trim() : (typeof item.reading === "string" ? item.reading.trim() : ""),
    meaning: item.meaning.trim(),
    acceptedMeanings: [...new Set([item.meaning, ...(item.meanings || []), ...(item.acceptedMeanings || [])])],
    writtenForms: (item.writtenForms || []).filter((/** @type {unknown} */ word) => typeof word === "string" && /\p{Script=Han}/u.test(word)),
    level: Number.isInteger(levelNum) && levelNum >= 1 && levelNum <= 5
      ? `N${levelNum}`
      : (LEVELS.includes(item.level) ? item.level : "Unrated"),
    romaji: typeof item.romaji === "string" ? item.romaji.trim() : "",
    exampleSourceId: item.exampleSourceId,
    examples: (item.examples || []).map((/** @type {any} */ example) => ({
      ...example,
      id: example.tatoeba_id || example.id,
      japanese: example.ja,
      furigana: example.furigana,
      english: example.en,
      license: example.license || "CC BY 2.0 FR"
    })),
    pos: item.partOfSpeech || item.part_of_speech || item.pos || "",
    example: typeof item.example === "string"
      ? item.example
      : (typeof item.sentence === "string" ? item.sentence : (typeof item.examples?.[0] === "string" ? item.examples[0] : "")),
    exampleMeaning: typeof item.exampleMeaning === "string"
      ? item.exampleMeaning
      : (typeof item.sentenceMeaning === "string" ? item.sentenceMeaning : "")
  };
}

/** @param {unknown} value */
export function normalizedAnswer(value) {
  return String(value).normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/[\s。、，,.!?！？・「」『』'’\-]/g, "");
}

/** @param {string} value */
export function romajiVariants(value) {
  if (!value) return [];
  /** @type {Record<string, string[]>} */
  const alternatives = {
    "ā": ["ā", "aa", "a"], "aa": ["ā", "aa", "a"],
    "ē": ["ē", "ei", "ee", "e"], "ei": ["ē", "ei", "ee", "e"], "ee": ["ē", "ei", "ee", "e"],
    "ī": ["ī", "ii", "i"], "ii": ["ī", "ii", "i"],
    "ō": ["ō", "ou", "oo", "o"], "ou": ["ō", "ou", "oo", "o"], "oo": ["ō", "ou", "oo", "o"],
    "ū": ["ū", "uu", "u"], "uu": ["ū", "uu", "u"]
  };
  const tokens = value.toLowerCase().match(/ō|ou|oo|ā|aa|ē|ei|ee|ī|ii|ū|uu|[^ōouāaēeiīūu]+|[ōouāaēeiīūu]/gu) || [];
  let variants = [""];
  for (const token of tokens) {
    const choices = alternatives[token] || [token];
    variants = variants.flatMap((prefix) => choices.map((choice) => prefix + choice)).slice(0, 64);
  }
  const seen = new Set();
  return variants.filter((answer) => {
    const normalized = normalizedAnswer(answer);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/**
 * @param {{ word: string, furigana: string, romaji: string, acceptedMeanings: string[] }} item
 * @param {string | null} [direction]
 */
export function acceptedAnswers(item, direction = null) {
  if (direction === "to-romaji") return romajiVariants(item.romaji || romanizeKana(item.furigana || item.word));
  if (direction === "to-kana") return [...new Set([item.word, item.furigana].filter(Boolean))];
  if (direction === "meaning") return meaningAnswers(item.acceptedMeanings);
  return [...new Set([item.word, item.furigana, ...romajiVariants(item.romaji || romanizeKana(item.furigana))])];
}

/** @param {number} milliseconds */
export function formatClock(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor(total % 60000 / 1000);
  const millis = total % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/** @param {number} milliseconds */
export function formatDuration(milliseconds) {
  const seconds = milliseconds / 1000;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}
