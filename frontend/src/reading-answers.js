// @ts-check
import { toHiragana } from "wanakana";

/** @param {string} direction */
export function readingType(direction) {
  return direction === "reading-katakana" ? "on" : direction === "reading-hiragana" ? "kun" : "both";
}

/**
 * @param {{ on_readings?: string[], kun_readings?: string[] }} data
 * @param {string} direction
 */
export function selectedReadings(data, direction) {
  const type = readingType(direction);
  return [...(type !== "kun" ? data.on_readings || [] : []), ...(type !== "on" ? data.kun_readings || [] : [])].map(
    (reading) => reading.replace(/[.-]/g, ""),
  );
}

/**
 * @param {string} input
 * @param {{ on_readings?: string[], kun_readings?: string[] }} data
 * @param {string} direction
 */
export function matchesReading(input, data, direction) {
  const answers = selectedReadings(data, direction).map((reading) => toHiragana(reading));
  return input.split(/[,，;；、/|]+/).some((value) => answers.includes(toHiragana(value.trim())));
}
