import { distinct, requireDeck } from "./content.js";

export const frame = ({ spelling, gap }) => spelling.slice(0, gap) + "□" + spelling.slice(gap + 1);
export function validatePuzzle(p) {
  requireDeck(p.compounds.length === 3 && distinct(p.compounds.map(frame)), p.id);
  requireDeck(
    p.accepted.length &&
      p.accepted.every((c) => p.bank.includes(c)) &&
      distinct(p.bank) &&
      p.bank.every((c) => /^\p{Script=Han}$/u.test(c)),
    `${p.id}: bank`,
  );
  requireDeck(
    p.theme.trim() &&
      p.compounds.every((c) => c.meaning && /^[ぁ-ゖー]+$/u.test(c.reading) && p.accepted.includes(c.spelling[c.gap])),
    `${p.id}: incomplete frame`,
  );
}

export function crossResult(item, guess, hints) {
  const correct = item.accepted.includes(guess);
  return {
    correct,
    points: correct ? Math.max(1, 3 - hints) : 0,
    prompt: `${item.compounds.map(frame).join("・")} — ${item.theme}`,
    answer: item.accepted.join(" / "),
    response: guess || "Revealed",
    explanation: item.compounds.map((c) => `${c.spelling}（${c.reading}）: ${c.meaning}`).join("; "),
  };
}
