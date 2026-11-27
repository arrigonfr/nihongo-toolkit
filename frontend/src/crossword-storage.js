// @ts-check

export const STORAGE_KEYS = {
  settings: "nihon:crossword-settings-v1",
  stats: "nihon:crossword-stats-v1",
};

export const GAME_MODES = {
  classic: { label: "Classic Mode", desc: "Standard crossword with clues and a timer." },
  relaxed: { label: "Relaxed Mode", desc: "No timer, unlimited hints, and no pressure." },
  timed: { label: "Timed Challenge", desc: "Complete the puzzle before the countdown runs out." },
  suddenDeath: {
    label: "Sudden Death",
    desc: "Any incorrect character or submitted answer ends the round immediately.",
  },
  kanjiChallenge: {
    label: "Kanji Challenge",
    desc: "Use words containing kanji, including their kana endings, rather than kana-only answers.",
  },
  kanaChallenge: { label: "Kana Challenge", desc: "Answers are entered in kana, one character per square." },
  reverse: { label: "Reverse Mode", desc: "Clues show Japanese words; enter English meanings in the grid." },
};

export const LEVEL_OPTIONS = [
  { value: "5", label: "N5 (Beginner)" },
  { value: "4", label: "N4 (Elementary)" },
  { value: "3", label: "N3 (Intermediate)" },
  { value: "2", label: "N2 (Pre-Advanced)" },
  { value: "1", label: "N1 (Advanced)" },
  { value: "5-4", label: "N5–N4 Range" },
  { value: "4-3", label: "N4–N3 Range" },
  { value: "3-2", label: "N3–N2 Range" },
  { value: "3-1", label: "N3–N1 Range" },
  { value: "all", label: "All JLPT (N5–N1)" },
];

export const defaultSettings = () => ({
  gameMode: "classic",
  answerMode: "kana", // "kana" | "kanji" | "both"
  level: "5",
  size: "medium", // "small" | "medium" | "large" | "custom"
  customGridSize: 11,
  customWords: 10,
  fontScale: "medium", // "small" | "medium" | "large" | "xlarge"
  furigana: true,
  romanization: false,
  audio: true,
  kanjiFocus: false,
  checkAvailability: "unlimited", // "unlimited" | "limited" | "disabled"
  revealAvailability: "unlimited", // "unlimited" | "limited" | "disabled"
  hintLimit: 5,
  timedLimitMinutes: 5,
  layoutDirection: "ltr", // "ltr" | "rtl"
  inputStyle: "popup", // "popup" | "cell" | "clues"
});

export const defaultStats = () => ({
  puzzlesCompleted: 0,
  wordsCorrect: 0,
  wordsRevealed: 0,
  /** @type {string[]} */
  recentWordIds: [],
});

/**
 * @template {Record<string, any>} T
 * @param {string} key
 * @param {() => T} fallbackFn
 * @param {(message: string, error: unknown) => void} onError
 * @returns {T}
 */
export function loadCrosswordJSON(key, fallbackFn, onError) {
  try {
    const raw = localStorage.getItem(key);
    const merged = raw ? { ...fallbackFn(), ...JSON.parse(raw) } : fallbackFn();
    if (merged.inputStyle && !["popup", "cell", "clues"].includes(merged.inputStyle)) {
      merged.inputStyle = "popup";
    }
    if (merged.gameMode && !(merged.gameMode in GAME_MODES)) {
      merged.gameMode = "classic";
    }
    return merged;
  } catch (error) {
    onError("Saved crossword settings or progress could not be restored. Defaults are in use.", error);
    return fallbackFn();
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {(message: string, error: unknown) => void} onError
 */
export function saveCrosswordJSON(key, value, onError) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    onError("Your browser could not save crossword settings or progress. Changes may be lost when you leave.", error);
  }
}

/**
 * @param {{ gameMode: string, answerMode: string }} settings
 * @returns {string}
 */
export function effectiveAnswerMode(settings) {
  const gm = settings.gameMode;
  if (gm === "kanjiChallenge") return "kanji";
  if (gm === "kanaChallenge") return "kana";
  if (gm === "reverse") return "reverse";
  return settings.answerMode;
}

/**
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mins = String(Math.floor(s / 60)).padStart(2, "0");
  const secs = String(s % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}
