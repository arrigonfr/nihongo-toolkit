import { toHiragana } from "wanakana";

export function readingType(direction) {
  return direction === "reading-katakana" ? "on" : direction === "reading-hiragana" ? "kun" : "both";
}

export function selectedReadings(data, direction) {
  const type = readingType(direction);
  return [...(type !== "kun" ? data.on_readings || [] : []), ...(type !== "on" ? data.kun_readings || [] : [])]
    .map((reading) => reading.replace(/[.\-]/g, ""));
}

export function matchesReading(input, data, direction) {
  const answers = selectedReadings(data, direction).map((reading) => toHiragana(reading));
  return input.split(/[,，;；、/|]+/).some((value) => answers.includes(toHiragana(value.trim())));
}
