import { createSeededRandom, matchesTheme, THEMES } from "./crossword-engine.js";
import { isFontSetting } from "./japanese-fonts.js";
import { selectedLevels, matchesLevel } from "./jlpt-levels.js";

export const CATEGORIES = {
  ...Object.fromEntries(Object.entries(THEMES).filter(([key]) => key !== "expressions").map(([key, value]) => [key, value.label])),
  animals: "Animals"
};
export const MODES = {
  classic: "Classic", timed: "Timed", quick: "Quick Puzzle", daily: "Daily Challenge",
  marathon: "Marathon", sudden: "Sudden Death", clue: "Clue Mode", kanji: "Kanji Challenge",
  kana: "Kana Challenge", reverse: "Reverse Challenge", memory: "No List Challenge", review: "Mixed Review"
};
export const DIRECTIONS = {
  forward: [[0, 1], [1, 0]],
  vertical: [[0, 1], [1, 0], [-1, 0]],
  all: [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]],
  reverse: [[0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]
};
export const DEFAULTS = {
  mode: "classic", script: "kana", level: "5", category: "all", size: 10, count: 8,
  directions: "all", overlap: true, list: "japanese", meanings: true,
  hints: "limited", hintLimit: 5, reveals: "limited", revealLimit: 2,
  timer: false, seconds: 300, mistakes: 3, rounds: 3, fontSize: 26, font: "Noto Sans JP", contrast: false, animation: true
};
export const LISTS = {
  japanese: "Japanese word", english: "English word",
  icon: "Category icon", clue: "English clue", japaneseClue: "Japanese clue",
  first: "First kana only", hidden: "Hidden"
};
// A clue list is one or more comma-joined styles; "hidden" (no list) can only stand alone.
export function listStyles(value) {
  if (typeof value !== "string" || !value) throw new Error("Invalid list setting.");
  if (value === "hidden") return ["hidden"];
  // "furigana" is the legacy name of the merged Japanese clue style.
  const styles = [...new Set(value.split(",").map((style) => style === "furigana" ? "japanese" : style))];
  if (styles.some((style) => style === "hidden" || !(style in LISTS))) throw new Error("Invalid list setting.");
  return Object.keys(LISTS).filter((style) => styles.includes(style));
}
const hasKanji = (text) => /\p{Script=Han}/u.test(text);
const kanaOnly = (text) => /^[ぁ-ゖァ-ヺー]+$/u.test(text);
const japaneseOnly = (text) => /^[\p{Script=Han}ぁ-ゖァ-ヺー々]+$/u.test(text);
export const readingOf = (item) => item.furigana || item.reading || item.word;
export const wordKey = (item) => `${item.word}|${readingOf(item)}`;

export function validateSettings(settings) {
  const font = settings.font ?? DEFAULTS.font;
  if (!isFontSetting(font)) throw new Error("Choose an available Japanese font.");
  const enums = { mode: Object.keys(MODES), script: ["kana", "kanji", "both"],
    category: Object.keys(CATEGORIES), directions: ["forward", "vertical", "all"],
    hints: ["limited", "unlimited", "disabled"], reveals: ["limited", "unlimited", "disabled"] };
  for (const [key, values] of Object.entries(enums)) if (!values.includes(settings[key])) throw new Error(`Invalid ${key} setting.`);
  const list = listStyles(settings.list).join(",");
  selectedLevels(settings.level);
  for (const [key, min, max] of [
    ["size", 5, 20], ["count", 1, 20], ["hintLimit", 0, 100], ["revealLimit", 0, 20],
    ["seconds", 10, 3600], ["mistakes", 1, 20], ["rounds", 2, 10], ["fontSize", 20, 40]
  ]) if (!Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max) {
    throw new Error(`${key} must be a whole number from ${min} to ${max}.`);
  }
  for (const key of ["overlap", "meanings", "timer", "contrast", "animation"]) {
    if (typeof settings[key] !== "boolean") throw new Error(`Invalid ${key} setting.`);
  }
  return { ...settings, font, list };
}

export function effectiveSettings(settings, round = 1) {
  const result = { ...validateSettings(settings) };
  result.count = Math.max(5, Math.min(20, Math.round(result.size * 0.8)));
  result.directions = "all";
  if (result.mode === "daily") Object.assign(result, {
    script: "kana", level: "5", category: "all", size: 10, count: 8, directions: "all",
    overlap: true, timer: false, list: "japanese", hints: "limited", hintLimit: 3, reveals: "disabled"
  });
  if (result.mode === "quick") Object.assign(result, { size: 8, count: 5 });
  if (result.mode === "timed") result.timer = true;
  if (result.mode === "kana" || result.mode === "kanji") result.script = result.mode;
  if (result.mode === "clue") result.list = "english";
  if (result.mode === "memory") result.list = "hidden";
  if (result.mode === "reverse") result.directions = "reverse";
  if (result.mode === "marathon") Object.assign(result, {
    size: Math.min(20, result.size + round - 1),
    count: Math.min(20, result.count + (round - 1) * 2),
    directions: round === 1 || result.directions === "all" ? result.directions : round === 2 ? "vertical" : "all"
  });
  return result;
}

export function matchesCategory(item, category) {
  if (category === "animals") return /\b(animal|dog|cat|bird|fish|horse|cow|pig|sheep|monkey|insect|lion|tiger|bear|rabbit|elephant|deer|fox|wolf|mouse|rat|butterfly|bee|snake|turtle)\b/i.test(item.meaning);
  return matchesTheme(item, category);
}
export function categoryOf(item) {
  return Object.keys(CATEGORIES).find((key) => !["all", "verbs", "adjectives", "katakana"].includes(key) && matchesCategory(item, key))
    || (matchesCategory(item, "verbs") ? "verbs" : matchesCategory(item, "adjectives") ? "adjectives" : "all");
}
export function filterVocabulary(items, settings) {
  return items.filter((item) => matchesLevel(item.level, settings.level)
    && matchesCategory(item, settings.category)
    && kanaOnly(readingOf(item)) && japaneseOnly(item.word)
    && (settings.script !== "kanji" || hasKanji(item.word)));
}
function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function straightPath(start, end, size) {
  if (![start, end].every((index) => Number.isInteger(index) && index >= 0 && index < size * size)) return [];
  const row = Math.floor(start / size), col = start % size;
  const dr = Math.floor(end / size) - row, dc = end % size - col;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return [];
  return Array.from({ length: Math.max(Math.abs(dr), Math.abs(dc)) + 1 },
    (_, i) => (row + Math.sign(dr) * i) * size + col + Math.sign(dc) * i);
}
export function generateWordSearch(items, settings, { seed = `${Date.now()}-${Math.random()}`, recent = [] } = {}) {
  const random = createSeededRandom(seed);
  const directions = DIRECTIONS[settings.directions];
  if (!directions) throw new Error("Unknown word directions.");
  const size = settings.size;
  if (!Number.isInteger(size) || size < 5 || size > 20 || !Number.isInteger(settings.count) || settings.count < 1 || settings.count > 20) {
    throw new Error("Choose a grid from 5–20 and 1–20 words.");
  }
  const candidates = filterVocabulary(items, settings).map((item) => {
    const kana = /^[ァ-ヺー]+$/u.test(item.word) ? item.word : readingOf(item);
    const answer = settings.script === "kanji" || (settings.script === "both" && hasKanji(item.word) && random() < 0.5)
      ? item.word : kana;
    return { ...item, answer, key: wordKey(item) };
  }).filter((item) => [...item.answer].length <= size);
  const unique = [...new Map(candidates.map((item) => [item.answer, item])).values()];
  if (unique.length < settings.count) throw new Error(`Only ${unique.length} distinct words fit these filters. Choose fewer words, a larger grid, or a wider level/category.`);
  const recentSet = new Set(recent);
  for (let attempt = 0; attempt < 32; attempt++) {
    const grid = Array(size * size).fill("");
    const entries = [];
    const ordered = shuffle(unique, random).sort((a, b) => Number(recentSet.has(a.key)) - Number(recentSet.has(b.key)));
    for (const item of ordered) {
      const chars = [...item.answer];
      let placed = false;
      for (const start of shuffle(Array.from({ length: size * size }, (_, i) => i), random)) {
        const row = Math.floor(start / size), col = start % size;
        for (const [dr, dc] of shuffle(directions, random)) {
          const endRow = row + dr * (chars.length - 1), endCol = col + dc * (chars.length - 1);
          if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
          const cells = chars.map((_, i) => (row + dr * i) * size + col + dc * i);
          if (!cells.every((cell, i) => !grid[cell] || (settings.overlap && grid[cell] === chars[i]))) continue;
          cells.forEach((cell, i) => { grid[cell] = chars[i]; });
          entries.push({ ...item, cells, direction: [dr, dc] });
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (entries.length === settings.count) {
        const alphabet = [...new Set(entries.flatMap((entry) => [...entry.answer]))];
        for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = alphabet[Math.floor(random() * alphabet.length)];
        return { size, grid, entries, directions: settings.directions, seed };
      }
    }
  }
  throw new Error("These words cannot fit with the selected overlap and grid rules. Increase the grid size or reduce the word count.");
}

export function matchSelection(puzzle, start, end, found = []) {
  const path = straightPath(start, end, puzzle.size);
  if (!path.length) return { error: "Choose a straight horizontal, vertical, or diagonal line." };
  if (path.length > 1) {
    const direction = [Math.sign(Math.floor(end / puzzle.size) - Math.floor(start / puzzle.size)), Math.sign(end % puzzle.size - start % puzzle.size)];
    if (!DIRECTIONS[puzzle.directions].some(([dr, dc]) => dr === direction[0] && dc === direction[1])) {
      return { error: "That direction is not enabled for this puzzle." };
    }
  }
  const text = path.map((index) => puzzle.grid[index]).join("");
  const entry = puzzle.entries.find((item) => item.answer === text);
  if (!entry) return { error: "That selection is not a complete target word. Check its length and reading." };
  if (found.includes(entry.key)) return { duplicate: true, error: "You have already found this word." };
  return { entry, path };
}

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dailyStreak(days, date = new Date()) {
  const cursor = new Date(date);
  if (!days.includes(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.includes(localDay(cursor))) { count++; cursor.setDate(cursor.getDate() - 1); }
  return count;
}
export function reviewImport(value) {
  if (value?.version !== 1 || value?.tool !== "nihon-word-search" || !Array.isArray(value.words) || value.words.length > 5000) {
    throw new Error("Choose a Word Search review export (up to 5,000 words).");
  }
  return value.words.map((item) => {
    if (!item || !["word", "reading", "meaning", "partOfSpeech"].every((key) => typeof item[key] === "string" && item[key].length <= 2000)
      || !japaneseOnly(item.word) || !kanaOnly(item.reading)
      || !Number.isInteger(item.level) || item.level < 1 || item.level > 5) throw new Error("The review file contains an invalid word.");
    return { word: item.word, reading: item.reading, meaning: item.meaning, partOfSpeech: item.partOfSpeech, level: item.level };
  });
}
