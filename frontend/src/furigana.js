const escape = (value) => String(value ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kanji = /[\p{Script=Han}々ヶヵ]/u;
const hira = (text) => text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 96));

export function alignFuriganaRuby(word, reading = "", base = word) {
  word = String(word ?? "");
  if (!reading || !kanji.test(word)) return escape(word);
  const parts = String(base).match(/[\p{Script=Han}々ヶヵ]+|[^\p{Script=Han}々ヶヵ]+/gu) || [];
  const pattern = parts.map((part) => kanji.test(part) ? "(.+?)" : hira(part).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
  const match = hira(reading).match(new RegExp(`^${pattern}$`, "u"));
  if (!match) return escape(word);
  let index = 1;
  const readings = parts.filter((part) => kanji.test(part)).map((part) => [part, match[index++]]);
  const surface = word.match(/[\p{Script=Han}々ヶヵ]+|[^\p{Script=Han}々ヶヵ]+/gu) || [];
  index = 0;
  return surface.map((part) => {
    if (!kanji.test(part)) return escape(part);
    const pair = readings[index++];
    return pair?.[0] === part ? `<ruby>${escape(part)}<rt>${escape(pair[1])}</rt></ruby>` : escape(part);
  }).join("");
}

export function formatFurigana(text) {
  return String(text ?? "").split(/(\{[^{}|]+\|[^{}]+\})/g).map((part) => {
    const match = part.match(/^\{([^{}|]+)\|([^{}]+)\}$/);
    return match ? alignFuriganaRuby(match[1], match[2]) : escape(part);
  }).join("");
}
