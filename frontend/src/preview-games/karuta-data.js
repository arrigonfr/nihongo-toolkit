import { distinct, requireDeck } from "./content.js";
import { shuffle } from "../imposters-engine.js";

export function deal(item, pictures, random = Math.random) {
  const cards = [item.id, ...item.distractors].map(id => pictures.find(pic => pic.id === id));
  requireDeck(cards.length === 6 && cards.every(Boolean) && distinct(cards.map(pic => pic.description)) &&
    distinct(cards.map(pic => pic.id)), `${item.id}: invalid picture deal`);
  return shuffle(cards, random);
}
export function karutaResult(item, card, mode) {
  return { correct: card.id === item.id, mode, prompt: item.clue, answer: `${item.word}（${item.kana}）`,
    response: card.description, explanation: `${item.translation} This describes ${item.description.toLowerCase()}.` };
}
