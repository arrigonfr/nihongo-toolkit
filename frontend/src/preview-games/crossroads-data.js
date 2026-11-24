import { draft, requireDeck, distinct } from "./content.js";

// The free sense cue is part of the question, never a paid hint.
function puzzle(id, accepted, theme, bank, triples, alternatives = [], difficulty = "Everyday") {
  return {
    ...draft, source: "NihongoToolkit clues; spellings checked against EDRDG JMdict",
    license: "CC BY-SA 4.0", id, accepted: [accepted], theme, difficulty, bank: [...bank], alternatives,
    compounds: triples.map(([spelling, reading, meaning]) => ({
      spelling, gap: spelling.indexOf(accepted), reading, meaning
    }))
  };
}

export const puzzles = [
  puzzle("weekdays", "曜", "Abbreviated days of the week", "星曜光色",
    [["火曜","かよう","Tuesday"],["水曜","すいよう","Wednesday"],["木曜","もくよう","Thursday"]], [..."口星木桶綿船魚"]),
  puzzle("school", "校", "A day at elementary school", "室校庭学",
    [["校長","こうちょう","school principal"],["校庭","こうてい","schoolyard"],["登校","とうこう","going to school"]], ["園"]),
  puzzle("rain", "雨", "Preparing for wet weather", "風雪雨水",
    [["雨季","うき","rainy season"],["雨具","あまぐ","rain gear"],["大雨","おおあめ","heavy rain"]], ["猟"]),
  puzzle("book", "書", "The written word", "文書本紙",
    [["書店","しょてん","bookshop"],["書簡","しょかん","letter; written correspondence"],["読書","どくしょ","reading books"]], [], "Intermediate"),
  puzzle("sea", "海", "A sailor’s surroundings", "浜川港海",
    [["海岸","かいがん","seashore"],["海底","かいてい","seabed"],["航海","こうかい","sea voyage"]]),
  puzzle("electric", "電", "Power in the home", "電力気水",
    [["電流","でんりゅう","electric current"],["停電","ていでん","power cut"],["充電","じゅうでん","charging a battery"]]),
  puzzle("snow", "雪", "Winter weather", "白雪花霜",
    [["雪景色","ゆきげしき","snowy scenery"],["積雪","せきせつ","snow accumulated on the ground"],["初雪","はつゆき","first snow"]]),
  puzzle("sound", "音", "What reaches your ears", "音楽声耳",
    [["音程","おんてい","musical interval"],["録音","ろくおん","sound recording"],["足音","あしおと","sound of footsteps"]], [], "Intermediate")
];

export const frame = ({ spelling, gap }) => spelling.slice(0,gap) + "□" + spelling.slice(gap + 1);
export function validatePuzzle(p) {
  requireDeck(p.compounds.length === 3 && distinct(p.compounds.map(frame)), p.id);
  requireDeck(p.accepted.length && p.accepted.every(c => p.bank.includes(c)) &&
    distinct(p.bank) && p.bank.every(c => /^\p{Script=Han}$/u.test(c)), `${p.id}: bank`);
  requireDeck(p.theme.trim() && p.compounds.every(c => c.meaning && /^[ぁ-ゖー]+$/u.test(c.reading)
    && p.accepted.includes(c.spelling[c.gap])), `${p.id}: incomplete frame`);
}

export function crossResult(item, guess, hints) {
  const correct = item.accepted.includes(guess);
  return { correct, points: correct ? Math.max(1, 3 - hints) : 0,
    prompt: `${item.compounds.map(frame).join("・")} — ${item.theme}`, answer: item.accepted.join(" / "),
    response: guess || "Revealed", explanation: item.compounds.map(c =>
      `${c.spelling}（${c.reading}）: ${c.meaning}`).join("; ") };
}
