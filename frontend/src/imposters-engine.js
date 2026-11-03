import { lookalikeSheet, cellText } from "./cheatsheet-data.js";
import { toHiragana } from "wanakana";

const groups = lookalikeSheet().tables.flatMap((table) => table.rows.map((row) => cellText(row[0]).split(/\s*\/\s*/).filter((value) => /^\p{Unified_Ideograph}$/u.test(value))));
const character = (item) => item.kanji || item.character;
const normalize = (value) => toHiragana(String(value).replace(/[.\-]/g, "")).toLowerCase().trim();
export const readings = (item) => [...new Set([...(item.on_readings || []), ...(item.kun_readings || [])].map(normalize).filter(Boolean))];
export const meanings = (item) => (item.meanings || []).filter(Boolean);
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
export function makeQuestion(target, pool, variant, random = Math.random) {
  const targetChar = character(target), targetReadings = readings(target);
  if (!targetChar || !targetReadings.length) return null;
  const uniquePool = [...new Map(pool.filter((item) => character(item)).map((item) => [character(item), item])).values()];
  const targetReadingSet = new Set(targetReadings);
  if (variant === "kanji-reading") {
    if (targetReadings.length < 2) return null;
    const correct = shuffle(targetReadings, random).slice(0, Math.min(3, targetReadings.length));
    const wrong = shuffle([...new Set(uniquePool.flatMap(readings).filter((value) => !targetReadingSet.has(value)))], random).slice(0, 5 - correct.length);
    if (correct.length + wrong.length !== 5) return null;
    return { target, variant, prompt: targetChar, choices: shuffle([...correct.map((value) => ({ value, correct: true })), ...wrong.map((value) => ({ value, correct: false }))], random) };
  }
  if (variant !== "reading-kanji") return null;
  const eligible = targetReadings.filter((reading) => uniquePool.filter((item) => readings(item).includes(reading)).length >= 2);
  for (const prompt of shuffle(eligible, random)) {
    const matches = shuffle(uniquePool.filter((item) => character(item) !== targetChar && readings(item).includes(prompt)), random);
    const group = groups.filter((members) => members.includes(targetChar)).flat();
    const distractors = shuffle(uniquePool.filter((item) => !readings(item).includes(prompt) && readings(item).length), random)
      .sort((left, right) => Number(group.includes(character(right))) - Number(group.includes(character(left))));
    const correct = [target, ...matches.slice(0, 2)];
    const wrong = distractors.slice(0, 5 - correct.length);
    if (correct.length + wrong.length !== 5) continue;
    return { target, variant, prompt, choices: shuffle([...correct.map((item) => ({ item, value: character(item), correct: true })), ...wrong.map((item) => ({ item, value: character(item), correct: false }))], random) };
  }
  return null;
}