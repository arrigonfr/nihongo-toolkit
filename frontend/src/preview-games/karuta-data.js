import { shuffle } from "../imposters-engine.js";
import { distinct, requireDeck } from "./content.js";

export const KARUTA_GROUPS = {
  everyday: [
    "umbrella",
    "clock",
    "cup",
    "scissors",
    "key",
    "book",
    "pencil",
    "toothbrush",
    "mirror",
    "candle",
    "envelope",
    "calendar",
  ],
  animals: ["dog", "cat", "bird", "turtle", "butterfly", "elephant"],
  nature: [
    "fish",
    "rabbit",
    "banana",
    "carrot",
    "tent",
    "piano",
    "tree",
    "flower",
    "leaf",
    "mushroom",
    "mountain",
    "moon",
  ],
  places: [
    "library",
    "station",
    "post",
    "swimming",
    "skiing",
    "fishing",
    "hospital",
    "school",
    "bridge",
    "park",
    "bakery",
    "lighthouse",
  ],
  vehicles: ["bike", "bus", "plane", "sailboat", "helicopter", "tractor"],
  food: [
    "apple",
    "cherry",
    "lemon",
    "egg",
    "bread",
    "cheese",
    "strawberry",
    "watermelon",
    "cake",
    "ramen",
    "icecream",
    "milk",
  ],
  kitchen: ["spoon", "fork", "chopsticks", "pot", "kettle", "riceball"],
  home: ["bed", "chair", "table", "door", "window", "bathtub"],
  tech: ["camera", "printer", "mouse", "keyboard", "bulb", "phone"],
  weather: ["sun", "cloud", "snowman", "lightning", "rainbow", "wind"],
  clothing: ["hat", "glasses", "shoe", "bag", "shirt", "watch"],
  music: ["guitar", "drum", "violin", "paintbrush", "trophy", "kite"],
  sports: ["soccer", "baseball", "backpack", "compass", "ticket", "suitcase"],
};

const groupByPicture = Object.fromEntries(
  Object.entries(KARUTA_GROUPS).flatMap(([group, ids]) => ids.map((id) => [id, group])),
);

export function karutaCategory(item) {
  return groupByPicture[item.pictureId ?? item.id] || "other";
}

export function validateKaruta(item) {
  requireDeck(
    item?.id &&
      item.description &&
      item.word &&
      item.kana &&
      item.clue &&
      item.reading &&
      item.translation &&
      Array.isArray(item.distractors) &&
      item.distractors.length === 5,
    `${item?.id || "karuta"}: invalid karuta item`,
  );
}

export function deal(item, pictures, random = Math.random) {
  const cards = [item.pictureId ?? item.id, ...item.distractors].map((id) => pictures.find((pic) => pic.id === id));
  requireDeck(
    cards.length === 6 &&
      cards.every(Boolean) &&
      distinct(cards.map((pic) => pic.description)) &&
      distinct(cards.map((pic) => pic.id)),
    `${item.id}: invalid picture deal`,
  );
  return shuffle(cards, random);
}
export function karutaResult(item, card, mode) {
  const chosenId = card.pictureId ?? card.id;
  const targetId = item.pictureId ?? item.id;
  return {
    correct: chosenId === targetId,
    mode,
    chosenId,
    prompt: item.clue,
    answer: `${item.word}（${item.kana}）`,
    response: card.description,
    explanation: `${item.translation} This describes ${item.description.toLowerCase()}.`,
  };
}
