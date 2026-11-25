import { alignFuriganaRuby } from "../furigana.js";

const han = /[\p{Script=Han}々ヶヵ]/u;
const normalize = text => text.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 96));
const escape = text => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const common = new Map([
  ["昨日", "きのう"], ["今日", "きょう"], ["明日", "あした"],
  ["毎日", "まいにち"], ["毎朝", "まいあさ"], ["友達", "ともだち"]
]);

export function particleReadings(items) {
  const readings = new Map(common);
  const conflicts = new Set();
  for (const item of items) {
    if (!item.id.startsWith("expanded-")) continue;
    const word = item.sentence.split("|")[0], reading = item.pronunciation.split("|")[0];
    if (!word || !reading || conflicts.has(word)) continue;
    if (readings.has(word) && normalize(readings.get(word)) !== normalize(reading)) {
      readings.delete(word);
      conflicts.add(word);
    } else readings.set(word, reading);
  }
  return readings;
}

export function particleFurigana(text, reading, known = common) {
  if (!text || !reading || typeof Intl.Segmenter !== "function") return escape(text);
  const tokens = [...new Intl.Segmenter("ja", { granularity: "word" }).segment(text)].map(part => part.segment);
  const sound = normalize(reading);
  const memo = new Map();
  function resolve(index, offset) {
    const key = `${index}:${offset}`;
    if (memo.has(key)) return memo.get(key);
    if (index === tokens.length) return offset === sound.length ? [] : null;
    const token = tokens[index], hasKanji = han.test(token), fixed = known.get(token);
    const candidates = hasKanji && !fixed
      ? Array.from({ length: sound.length - offset }, (_, i) => sound.slice(offset, offset + i + 1))
      : [normalize(fixed || token)];
    let result = null;
    for (const candidate of candidates) {
      if (!sound.startsWith(candidate, offset)) continue;
      if (hasKanji && alignFuriganaRuby(token, candidate) === escape(token)) continue;
      const suffix = resolve(index + 1, offset + candidate.length);
      if (!suffix) continue;
      if (!result) result = [new Set(), ...suffix.map(values => new Set(values))];
      else suffix.forEach((values, i) => values.forEach(value => result[i + 1].add(value)));
      result[0].add(candidate);
    }
    memo.set(key, result);
    return result;
  }
  const readings = resolve(0, 0);
  if (!readings) return escape(text);
  return tokens.map((token, index) => {
    const values = readings[index];
    if (!han.test(token) || values.size !== 1 || (token.match(/[\p{Script=Han}々ヶヵ]+/gu) || []).length !== 1) return escape(token);
    return alignFuriganaRuby(token, [...values][0]);
  }).join("");
}
